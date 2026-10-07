import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAppWebhook} from '../src/server/app-webhook-check.ts';
const creds={metaAppId:'app1',metaAppSecret:'private-app-secret',apiVersion:'v26.0'};
test('app check reads messages field without sending a message or changing shared app settings',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  assert.equal(String(url),'https://graph.facebook.com/v26.0/app1/subscriptions');
  assert.equal(init?.method,undefined);assert.equal(init?.body,undefined);
  assert.equal((init?.headers as any).Authorization,'Bearer app1|private-app-secret');
  return new Response(JSON.stringify({data:[{object:'whatsapp_business_account',active:true,fields:[{name:'messages',version:'v26.0'}],callback_url:'https://backend.example/webhooks/whatsapp'}]}));
 };
 try{const result=await checkAppWebhook(creds);assert.equal(result.state,'READY');assert.equal(result.messagesSubscribed,true);assert.doesNotMatch(JSON.stringify(result),/private-app-secret/);}finally{globalThis.fetch=original;}
});
test('missing or inactive messages field is actionable even when a WABA is subscribed',async()=>{
 const original=globalThis.fetch;
 try{for(const data of [[],[{object:'page',active:true,fields:['messages']}],[{object:'whatsapp_business_account',active:true,fields:['message_template_status_update']}],[{object:'whatsapp_business_account',active:false,fields:['messages']}]] ){
  globalThis.fetch=async()=>new Response(JSON.stringify({data}));
  const result=await checkAppWebhook(creds);assert.equal(result.state,'ACTION_REQUIRED');assert.equal(result.messagesSubscribed,false);assert.match(result.warning||'',/subscribe to messages/);
 }}finally{globalThis.fetch=original;}
});
test('unreadable app settings remain unverified rather than falsely ready or known missing',async()=>{
 const original=globalThis.fetch;
 try{
  let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:100,message:'private-app-secret'}}),{status:400});};
  assert.equal((await checkAppWebhook({...creds,metaAppId:''})).state,'UNVERIFIED');assert.equal(calls,0);
  const result=await checkAppWebhook(creds);assert.equal(result.state,'UNVERIFIED');assert.equal(result.messagesSubscribed,null);assert.doesNotMatch(JSON.stringify(result),/private-app-secret/);
  globalThis.fetch=async()=>new Response(JSON.stringify({data:[{object:'whatsapp_business_account',active:true}]}));assert.equal((await checkAppWebhook(creds)).state,'UNVERIFIED');
  globalThis.fetch=async()=>{throw new Error('private-app-secret');};assert.equal((await checkAppWebhook(creds)).state,'UNVERIFIED');
 }finally{globalThis.fetch=original;}
});

test('rejected app credentials are actionable and cannot claim signature setup is verified',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:190,message:'Invalid private-app-secret'}}),{status:401});
 try{const result=await checkAppWebhook(creds);assert.equal(result.state,'ACTION_REQUIRED');assert.equal(result.messagesSubscribed,null);assert.match(result.warning||'',/App ID \/ App Secret/);assert.doesNotMatch(JSON.stringify(result),/private-app-secret/);}finally{globalThis.fetch=original;}
});
