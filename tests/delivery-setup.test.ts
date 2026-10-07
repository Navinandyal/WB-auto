import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { matchesWebhookSignature, authorizeAccountWebhook } from '../src/server/webhook-auth.ts';
import { ensureDeliverySubscription } from '../src/server/delivery-setup.ts';

const event=(waba='waba1',phone='phone1')=>({id:waba,changes:[{field:'messages',value:{metadata:{phone_number_id:phone},statuses:[{id:'wamid.test',status:'delivered'}]}}]});
const accounts=[{business_account_id:'waba1',phone_number_id:'phone1',secret:'app-one-secret'},{business_account_id:'waba2',phone_number_id:'phone2',secret:'app-two-secret'}];
const signed=(payload:any,secret=accounts[0].secret)=>{const raw=Buffer.from(JSON.stringify(payload));return {raw,sig:'sha256='+createHmac('sha256',secret).update(raw).digest('hex')};};
test('delivery signatures reject changed bodies, missing headers and malformed hashes',()=>{
  const payload={entry:[event()]};const {raw,sig}=signed(payload);
  assert.equal(matchesWebhookSignature(raw,sig,accounts[0].secret),true);
  assert.equal(matchesWebhookSignature(Buffer.from('changed'),sig,accounts[0].secret),false);
  assert.equal(matchesWebhookSignature(raw,'',accounts[0].secret),false);
  assert.equal(matchesWebhookSignature(raw,'sha256=invalid',accounts[0].secret),false);
  assert.equal(matchesWebhookSignature(raw,sig,''),false);
});
test('manual app signatures authorize only that business and phone, including mixed payload rejection',()=>{
  for(const [payload,expected] of [
    [{entry:[event()]},true],
    [{entry:[event('waba2','phone2')]},false],
    [{entry:[event('waba1','phone2')]},false],
    [{entry:[event(),event('waba2','phone2')]},false],
    [{entry:[]},false],
  ] as const){const {raw,sig}=signed(payload);assert.equal(authorizeAccountWebhook(raw,sig,payload,accounts),expected);}
});
test('WABA-wide events require a matching secret for every affected account',()=>{
  const payload={entry:[{id:'waba1',changes:[{field:'account_update',value:{event:'ACCOUNT_DISCONNECTED'}}]}]};
  const {raw,sig}=signed(payload);
  assert.equal(authorizeAccountWebhook(raw,sig,payload,[accounts[0]]),true);
  assert.equal(authorizeAccountWebhook(raw,sig,payload,[accounts[0],{...accounts[1],business_account_id:'waba1'}]),false);
});

const creds={businessAccountId:'waba1',phoneNumberId:'phone1',accessToken:'test-token',apiVersion:'v26.0',metaAppId:'app1'};
const response=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('manual verification checks phone ownership, subscribes WABA and confirms the configured app',async()=>{
  const original=globalThis.fetch;const calls:any[]=[];
  globalThis.fetch=async(url,init)=>{
    calls.push({url:String(url),method:init?.method,auth:(init?.headers as any).Authorization});
    return calls.length===1?response({data:[{id:'phone1'}]}):calls.length===2?response({success:true}):response({data:[{whatsapp_business_api_data:{id:'app1'}}]});
  };
  try{await ensureDeliverySubscription(creds);assert.equal(calls.length,3);assert.match(calls[1].url,/\/waba1\/subscribed_apps$/);assert.equal(calls[1].method,'POST');assert.equal(calls[1].auth,'Bearer test-token');assert.equal(calls[2].method,'GET');}
  finally{globalThis.fetch=original;}
});
test('wrong WABA cannot be subscribed, missing WABA fails before any network request',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return response({data:[{id:'other-phone'}]});};
  try{await assert.rejects(()=>ensureDeliverySubscription({...creds,businessAccountId:''}),/WABA ID is required/);assert.equal(calls,0);await assert.rejects(()=>ensureDeliverySubscription(creds),/does not belong/);assert.equal(calls,1);}
  finally{globalThis.fetch=original;}
});
test('phone membership pagination uses safe cursors rather than provider next URLs',async()=>{
  const original=globalThis.fetch;const calls:string[]=[];
  globalThis.fetch=async(url,init)=>{
    calls.push(String(url));
    if(init?.method==='POST')return response({success:true});
    return calls.length===1?response({data:[],paging:{next:'https://untrusted.invalid',cursors:{after:'cursor one'}}}):response({data:[{id:'phone1'}]});
  };
  try{await ensureDeliverySubscription({...creds,metaAppId:''});assert.equal(calls.length,3);assert.match(calls[1],/graph.facebook.com/);assert.match(calls[1],/after=cursor%20one/);}
  finally{globalThis.fetch=original;}
});
test('expired WhatsApp token gets an actionable error without leaking provider details',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>response({error:{code:190,message:'secret token test-token'}},401);
  try{await assert.rejects(()=>ensureDeliverySubscription(creds),error=>{assert.match((error as Error).message,/expired or invalid/);assert.doesNotMatch((error as Error).message,/test-token/);return true;});}
  finally{globalThis.fetch=original;}
});
test('a token from a different Meta app cannot claim delivery setup is ready',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>++calls===1?response({data:[{id:'phone1'}]}):calls===2?response({success:true}):response({data:[{whatsapp_business_api_data:{id:'wrong-app'}}]});
  try{await assert.rejects(()=>ensureDeliverySubscription(creds),/Meta app is not subscribed/);}
  finally{globalThis.fetch=original;}
});

test('delivery repair explicitly binds the WABA to this HTTPS callback and verification token',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_url,init)=>{
    calls++;
    if(calls===1)return response({data:[{id:'phone1'}]});
    if(init?.method==='POST'){
      assert.deepEqual(JSON.parse(String(init?.body)),{override_callback_uri:'https://backend.example/webhooks/whatsapp',verify_token:'verify-own-backend'});
      assert.ok(init?.signal);return response({success:true});
    }
    return response({data:[{override_callback_uri:'https://backend.example/webhooks/whatsapp',whatsapp_business_api_data:{id:'app1'}}]});
  };
  try{
    await assert.rejects(()=>ensureDeliverySubscription(creds,{url:'http://backend.example/webhooks/whatsapp',verifyToken:'test'}),/HTTPS/);assert.equal(calls,0);
    await assert.rejects(()=>ensureDeliverySubscription(creds,{url:'https://',verifyToken:'test'}),/HTTPS/);assert.equal(calls,0);
    await ensureDeliverySubscription({...creds,metaAppId:''},{url:'https://backend.example/webhooks/whatsapp',verifyToken:'verify-own-backend'});assert.equal(calls,3);
  }finally{globalThis.fetch=original;}
});

test('successful subscription cannot hide a missing or stale callback override',async()=>{
 const original=globalThis.fetch;
 try{for(const override of ['', 'https://old-server.example/webhooks/whatsapp']){
  globalThis.fetch=async(url,init)=>String(url).includes('/phone_numbers')?response({data:[{id:'phone1'}]}):init?.method==='POST'?response({success:true}):response({data:[{override_callback_uri:override,whatsapp_business_api_data:{id:'app1'}}]});
  await assert.rejects(()=>ensureDeliverySubscription(creds,{url:'https://backend.example/webhooks/whatsapp',verifyToken:'own-token'}),/did not confirm this backend callback/);
 }}finally{globalThis.fetch=original;}
});
