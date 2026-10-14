import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';import {createHash} from 'node:crypto';import ts from 'typescript';import express from 'express';
import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';import {eq} from 'drizzle-orm';
import {users} from '../src/db/schema.ts';import {encryptSecret,decryptSecret} from '../src/server/credential-crypto.ts';
function handler(path:string){
 const source=ts.createSourceFile('server.ts',readFileSync(new URL('../server.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
 for(const n of source.statements)if(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.arguments[0]?.getText(source)===`'${path}'`){
  return ts.transpileModule(`(${n.expression.arguments[n.expression.arguments.length-1].getText(source)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 }throw new Error('Route missing');
}
// Match the production UTC database/session clock when constructing SQL fixtures.
process.env.TZ='UTC';
test('real session DB protects encrypted account selection, owner binding, replay and expiry',async()=>{
 const pg=new PGlite();const migration=readFileSync(new URL('../src/db/index.ts',import.meta.url),'utf8').match(/await client.query\(`([\s\S]*?)`\);/)![1];
 await pg.exec(migration);await pg.exec(migration);
 await pg.exec("INSERT INTO users(id,uid,email,name,is_active,approval_status) VALUES(1,'one','one@fixture.invalid','One',true,'ACTIVE'),(2,'two','two@fixture.invalid','Two',true,'ACTIVE')");
 const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 await pg.query("INSERT INTO meta_embedded_signup_sessions(session_id,user_id,state_hash,status,redirect_uri,expires_at) VALUES('one',1,$1,'PENDING','https://fixture.invalid',NOW()+INTERVAL '15 minutes'),('two',2,$2,'PENDING','https://fixture.invalid',NOW()+INTERVAL '15 minutes')",[hash('secret-one'),hash('secret-two')]);
 const pool={query:async(sql:string,params:any[])=>{const result:any=await pg.query(sql,params);return {...result,rowCount:result.affectedRows??result.rows.length};}};
 let calls=0;let connectedOwner=0;
 const finish=async(user:any,_code:string,_cfg:any,options:any)=>{
  calls++;assert.equal(user.id,1);
  if(!options.pendingAccessToken)throw Object.assign(new Error('Choose number'),{code:'META_ASSET_SELECTION_REQUIRED',signupAccessToken:'private-token-fixture',choices:[{wabaId:'300',phoneNumberId:'400',verifiedName:'Fixture',displayPhoneNumber:'+919876543210'}]});
  assert.equal(options.pendingAccessToken,'private-token-fixture');assert.equal(options.phoneNumberId,'400');connectedOwner=user.id;
  return {success:true,wabaId:'300',phoneNumberId:'400',displayPhoneNumber:'+919876543210',verifiedName:'Fixture'};
 };
 const context=createContext({pool,db:drizzle(pg),users,eq,hashMetaSignupState:hash,metaPlatformConfig:async()=>({appId:'100',configId:'200'}),finishMetaEmbeddedSignup:finish,encryptSecret,decryptSecret,Date,console});
 const app=express();app.use(express.json());app.post('/meta/embedded-signup/complete',new Script(handler('/meta/embedded-signup/complete')).runInContext(context));
 app.post('/meta/embedded-signup/selection',new Script(handler('/meta/embedded-signup/selection')).runInContext(context));
 const server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));const address=server.address() as any;
 const send=async(body:any)=>{const r=await fetch(`http://127.0.0.1:${address.port}/meta/embedded-signup/complete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json() as any};};
 try{
  const bad=await send({sessionId:'two',launchToken:'secret-one',code:'code'});assert.equal(bad.status,401);assert.equal(calls,0);
  const first=await send({sessionId:'one',launchToken:'secret-one',code:'code'});assert.equal(first.body.selectionRequired,true,JSON.stringify(first));assert.ok(!JSON.stringify(first.body).includes('private-token-fixture'));
  let row:any=(await pg.query("SELECT * FROM meta_embedded_signup_sessions WHERE session_id='one'")).rows[0];assert.equal(row.status,'SELECT_ACCOUNT');assert.match(row.pending_access_token,/^enc:v1:/);assert.equal(decryptSecret(row.pending_access_token),'private-token-fixture');
  for(const [sessionId,launchToken,expected]of [['one','secret-one',200],['two','secret-one',410]]) {
   const response=await fetch(`http://127.0.0.1:${address.port}/meta/embedded-signup/selection`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,launchToken})});
   assert.equal(response.status,expected);const body=await response.text();assert.ok(!body.includes('private-token-fixture'));if(expected===200)assert.ok(body.includes('400'));
  }
  const spoof=await send({sessionId:'one',launchToken:'secret-one',wabaId:'999',phoneNumberId:'999'});assert.equal(spoof.status,400);assert.equal(calls,1);
  const selected=await send({sessionId:'one',launchToken:'secret-one',wabaId:'300',phoneNumberId:'400'});assert.equal(selected.body.success,true);assert.equal(calls,2);assert.equal(connectedOwner,1);
  row=(await pg.query("SELECT * FROM meta_embedded_signup_sessions WHERE session_id='one'")).rows[0];assert.equal(row.status,'CONNECTED');assert.equal(row.pending_access_token,null);assert.equal(row.selection_options,null);
  const replay=await send({sessionId:'one',launchToken:'secret-one',code:'same-code'});assert.equal(replay.body.alreadyConnected,true);assert.equal(calls,2);
  assert.equal(((await pg.query("SELECT status FROM meta_embedded_signup_sessions WHERE session_id='two'")).rows[0] as any).status,'PENDING');
  await pg.query("UPDATE meta_embedded_signup_sessions SET expires_at=NOW()-INTERVAL '1 minute',pending_access_token=$1 WHERE session_id='two'",[encryptSecret('ephemeral')]);
  const expired=await send({sessionId:'two',launchToken:'secret-two',code:'code'});assert.equal(expired.status,410);
  assert.equal(((await pg.query("SELECT pending_access_token FROM meta_embedded_signup_sessions WHERE session_id='two'")).rows[0] as any).pending_access_token,null);
  // Business metadata survives additive/repeat migrations without leaking owners.
  await pg.query("INSERT INTO whatsapp_accounts(owner_user_id,business_account_id,phone_number_id,waba_name,meta_business_name,business_profile) VALUES(1,'300','400','Fixture WABA','Fixture Business',$1)",[JSON.stringify({address:'Fixture address'})]);
  await pg.exec(migration);const metadata:any=(await pg.query('SELECT waba_name,business_profile FROM whatsapp_accounts WHERE owner_user_id=1')).rows[0];assert.equal(metadata.waba_name,'Fixture WABA');assert.equal(metadata.business_profile.address,'Fixture address');
  assert.equal(((await pg.query('SELECT COUNT(*)::int AS n FROM whatsapp_accounts WHERE owner_user_id=2')).rows[0] as any).n,0);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await pg.close();}
});
