import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {origin,supabaseTarget,validateService,serverEnvironment,postgresEnvironment,preservedSecrets,verifyBackupEncryption,RELEASE} from '../tools/deploy-config.mjs';
import {renderApi,waitForDeploy,verifyHealth,updateServerVariables} from '../tools/render-api.mjs';
import {executeWorkflow} from '../tools/deploy-production.mjs';
import {extractDumpData,createRestoreSql,tables} from '../tools/database-transfer.mjs';
import {applicationTables} from '../src/server/application-tables.ts';
import {assertDatabaseTarget} from '../src/server/database-target.ts';
import {encryptSecret} from '../src/server/credential-crypto.ts';

const target=supabaseTarget('postgresql://postgres.fixture:fixture-password@aws-0-region.pooler.supabase.com:5432/postgres');
const state:any={root:'/fixture',config:{provider:'render',databaseProvider:'supabase',serviceId:'srv-fixture',backendUrl:'https://greetsync-fixture.onrender.com'},
 local:{RENDER_API_KEY:'fixture-render-private'},target,secrets:{AUTH_TOKEN_SECRET:'fixture-auth-secret-that-is-long',CREDENTIAL_ENCRYPTION_KEY:'fixture-encryption-secret-long'}};
const service={id:'srv-fixture',type:'web_service',repo:'https://github.com/fixture/backend',branch:'main',serviceDetails:{url:state.config.backendUrl,env:'docker',plan:'starter'}};
const response=(value:any,status=200)=>new Response(JSON.stringify(value),{status});

test('Supabase session target rejects old Railway, transaction pooling, routing tricks, and includes project username identity',()=>{
 assert.equal(target.port,5432);assert.equal(target.user,'postgres.fixture');
 for(const url of ['postgresql://postgres:private@old.proxy.rlwy.net:48009/railway','postgresql://postgres.fixture:private@aws-0-region.pooler.supabase.com:6543/postgres','postgresql://postgres.fixture:private@aws-0-region.pooler.supabase.com:5432/postgres?host=other.invalid','postgresql://postgres.fixture:private@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=disable'])assert.throws(()=>supabaseTarget(url));
 const other=supabaseTarget('postgresql://postgres.other:fixture-password@aws-0-region.pooler.supabase.com:5432/postgres');assert.notEqual(target.fingerprint,other.fingerprint);
 assert.throws(()=>assertDatabaseTarget(other.url,{DATABASE_TARGET_HOST:target.host,DATABASE_TARGET_PORT:'5432',DATABASE_TARGET_NAME:target.database,DATABASE_TARGET_USER:target.user}));
 const env:any=postgresEnvironment(target,{PGSERVICE:'old',PGPASSWORD:'old',PGOPTIONS:'-c role=other',CUSTOM:'keep'} as any);assert.equal(env.PGPASSWORD,'fixture-password');assert.equal(env.PGSERVICE,undefined);assert.equal(env.PGOPTIONS,undefined);assert.equal(env.CUSTOM,'keep');
});

test('Render origins and free or paid dedicated Docker services are validated',()=>{
 assert.equal(origin(state.config.backendUrl+'/'),state.config.backendUrl);assert.equal(validateService(service,state.config),service);
 for(const url of ['https://old.up.railway.app','http://localhost:3000','https://user:password@host.invalid','https://host.invalid/path','https://host.invalid?query=1','https://host&bad.invalid'])assert.throws(()=>origin(url));
 assert.equal(validateService({...service,serviceDetails:{...service.serviceDetails,plan:'free'}},state.config).serviceDetails.plan,'free');
 for(const details of [{plan:''},{env:'node'}])assert.throws(()=>validateService({...service,serviceDetails:{...service.serviceDetails,...details}},state.config));
 assert.throws(()=>validateService({...service,id:'srv-other'},state.config));assert.throws(()=>validateService({...service,rootDir:'other-app'},state.config));
});

test('server environment never includes Render API key, old database or backup path and preserves crypto keys',()=>{
 const env=serverEnvironment(state,'a'.repeat(40));assert.equal(env.CREDENTIAL_ENCRYPTION_KEY,state.secrets.CREDENTIAL_ENCRYPTION_KEY);assert.equal(env.DATABASE_TARGET_USER,'postgres.fixture');assert.equal(env.PUBLIC_BASE_URL,state.config.backendUrl);
 assert.equal((env as any).RENDER_API_KEY,undefined);assert.ok(!JSON.stringify(env).includes('fixture-render-private'));
 assert.throws(()=>preservedSecrets({AUTH_TOKEN_SECRET:'long-auth-secret-for-fixture'}),/EXISTING/);
});

test('backup encryption key is verified without printing or replacing encrypted values',()=>{
 const old=process.env.CREDENTIAL_ENCRYPTION_KEY;process.env.CREDENTIAL_ENCRYPTION_KEY=state.secrets.CREDENTIAL_ENCRYPTION_KEY;
 try{const cipher=encryptSecret('owned-whatsapp-token');assert.equal(verifyBackupEncryption(cipher,state.secrets.CREDENTIAL_ENCRYPTION_KEY),1);assert.throws(()=>verifyBackupEncryption(cipher,'different-key'),/cannot decrypt/);}
 finally{if(old===undefined)delete process.env.CREDENTIAL_ENCRYPTION_KEY;else process.env.CREDENTIAL_ENCRYPTION_KEY=old;}
});

const dump=`-- PostgreSQL database dump
DROP SCHEMA public CASCADE;
ALTER ROLE postgres SUPERUSER;
COPY public.users (id, name) FROM stdin;
7\tRAHUL\\tSHARMA
\\.
COPY public.contacts (id, owner_user_id, name) FROM stdin;
9\t7\tCustomer
\\.
COPY public.message_templates (id) FROM stdin;
\\.
COPY public.automations (id) FROM stdin;
\\.
SELECT pg_catalog.setval('public.users_id_seq', 20, true);
-- PostgreSQL database dump complete
`;

test('restore extracts only app COPY data and numeric sequence values; dumped destructive/role DDL is never executed',()=>{
 const parsed=extractDumpData(dump);assert.equal(parsed.counts.users,1);assert.equal(parsed.counts.contacts,1);
 const sql=createRestoreSql(parsed,[],[{table_name:'users',column_name:'id',sequence_name:'users_id_seq'}],{...target,backendUrl:state.config.backendUrl},'a'.repeat(64));
 assert.ok(!sql.includes('DROP SCHEMA'));assert.ok(!sql.includes('ALTER ROLE'));assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);assert.match(sql,/Row count mismatch/);assert.match(sql,/20, true/);assert.match(sql,/GREATEST/);
 assert.throws(()=>extractDumpData(dump.replace('COPY public.users','COPY public.storage')),/unrecognised/);
 assert.throws(()=>extractDumpData(dump.replace('-- PostgreSQL database dump complete','')),/incomplete/);
 assert.throws(()=>extractDumpData(dump.replace('COPY public.contacts (id, owner_user_id, name) FROM stdin;','INSERT INTO public.contacts VALUES(9);')),/INSERT-format/);
 assert.throws(()=>extractDumpData(dump.replace('COPY public.contacts','COPY public.users')),/repeats/);
});

test('restore allowlist covers every production application table and protects Supabase-managed schemas',async()=>{
 const source=await readFile(new URL('../src/db/index.ts',import.meta.url),'utf8');
 const names=[...source.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m=>m[1]).filter(n=>n!=='greetsync_deployment_migrations');
 assert.deepEqual([...applicationTables],names);assert.deepEqual(tables,names);assert.ok(!tables.includes('auth.users'));
});

test('Render updates individual environment variables, preserving unrelated service configuration',async()=>{
 const calls:any[]=[];await updateServerVariables(async(method:string,url:string,body:any)=>{calls.push({method,url,body});},'srv-fixture',{DATABASE_URL:'fixture-private-url',PUBLIC_BASE_URL:state.config.backendUrl});
 assert.deepEqual(calls.map(c=>c.method),['PUT','PUT']);assert.ok(calls.every(c=>/env-vars\//.test(c.url)));assert.equal(calls[0].body.value,'fixture-private-url');
});

test('Render transport never repeats an uncertain deployment POST and hides secret error responses',async()=>{
 let calls=0;const api=renderApi('private-render-key',async()=>{calls++;throw new Error('private details');});
 await assert.rejects(api('POST','services/srv-fixture/deploys',{}),/without confirmation/);assert.equal(calls,1);
 const fail=renderApi('private-render-key',async()=>response({error:'private-key-leak'},401));await assert.rejects(fail('GET','services/srv-fixture'),e=>!String(e).includes('private-key-leak'));
});

test('deployment polling handles live/failure/timeout; health requires exact commit, release and database identity',async()=>{
 let i=0;await waitForDeploy(async()=>({status:++i===2?'live':'build_in_progress'}),'srv-fixture','dep-fixture',{pause:async()=>{},log:()=>{}});assert.equal(i,2);
 await assert.rejects(waitForDeploy(async()=>({status:'build_failed'}),'srv-fixture','dep-fixture',{pause:async()=>{},log:()=>{}}),/build_failed/);
 await assert.rejects(waitForDeploy(async()=>({status:'queued'}),'srv-fixture','dep-fixture',{pause:async()=>{},attempts:2,log:()=>{}}),/pending/);
 const expected={build:RELEASE,commit:'a'.repeat(40),fingerprint:target.fingerprint};
 const good={status:'ok',build:expected.build,deploymentCommit:expected.commit,databaseTarget:expected.fingerprint,databaseProvider:'supabase'};
 await verifyHealth(state.config.backendUrl,expected,{transport:async()=>response(good),pause:async()=>{}});
 for(const altered of [{build:'old'},{deploymentCommit:'b'.repeat(40)},{databaseTarget:'other'},{databaseProvider:'postgresql'}])await assert.rejects(verifyHealth(state.config.backendUrl,expected,{transport:async()=>response({...good,...altered}),pause:async()=>{},attempts:2}),/expected commit/);
});

test('one-command workflow orders restore, migrate, push, deploy and exact health before saving defaults and building APK',async()=>{
 const events:string[]=[];
 const api=async(method:string,url:string)=>{events.push(method+':'+url);return method==='GET'?service:method==='POST'?{id:'dep-fixture'}:{};};
 const deps:any={api,native:async(action:string)=>events.push(action),publish:async()=>{events.push('push');return 'a'.repeat(40);},restore:async()=>events.push('restore'),verify:async()=>events.push('health'),wait:async()=>events.push('live'),scheduler:async()=>events.push('scheduler'),save:async()=>events.push('save'),log:()=>{}};
 await executeWorkflow(structuredClone(state),{},deps);
 for(const [a,b] of [['Schema','restore'],['restore','Migrate'],['Migrate','push'],['push','POST:services/srv-fixture/deploys'],['live','health'],['health','scheduler'],['scheduler','save'],['save','Apk']])assert.ok(events.indexOf(a)<events.indexOf(b));
 const broken:string[]=[];await assert.rejects(executeWorkflow(structuredClone(state),{},{...deps,native:async(a:string)=>broken.push(a),verify:async()=>{throw new Error('Wrong backend');},save:async()=>broken.push('save')}),/Wrong backend/);
 assert.ok(!broken.includes('save'));assert.ok(!broken.includes('Apk'));
});
