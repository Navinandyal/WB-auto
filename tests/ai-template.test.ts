import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAiTemplate, normalizeAiTemplate, aiConfiguration, aiProviderError } from '../src/server/ai-template.ts';
const business={name:'Sohan',businessName:'Aikyam',businessAddress:'Solapur',phone:'+919999999999'};
const draft={templateName:'festival_greeting',category:'MARKETING',language:'en_US',header:'',body:'Hello {{customer_name}}, visit {{shop_name}} for our Diwali collection.',footer:'Thank you',mediaFormat:'VIDEO',assistantMessage:'Select a real video below.'};
test('AI uses only supplied owner profile and current edited draft, and returns validated content',async()=>{
  const result=await generateAiTemplate({language:'mr',messages:[{role:'user',text:'Revise the video message in Marathi'}],currentDraft:{body:'My edited message'},business:{businessName:'Other tenant'}},business,async(request)=>{
    const context=JSON.parse(request.contents).context;
    assert.equal(context.businessName,'Aikyam');assert.equal(context.businessAddress,'Solapur');assert.equal(context.currentDraft.body,'My edited message');assert.equal(context.language,'mr');
    assert.equal(context.accessToken,undefined);assert.equal(request.config.responseMimeType,'application/json');
    return JSON.stringify({...draft,language:'mr'});
  });
  assert.equal(result.mediaFormat,'VIDEO');assert.equal(result.bodyMeanings.customer_name,'CONTACT_NAME');assert.equal(result.bodySamples.shop_name,'Aikyam');assert.equal(result.language,'mr');
});
for(const mediaFormat of ['NONE','IMAGE','VIDEO','DOCUMENT','LOCATION'])test(`AI supports ${mediaFormat} with actual media left to the owner`,()=>{
  const result=normalizeAiTemplate({...draft,mediaFormat},business);
  assert.equal(result.mediaFormat,mediaFormat);assert.equal((result as any).mediaHandle,undefined);assert.equal((result as any).latitude,undefined);
});
test('AI promotional Utility is corrected and invalid placeholders / OTP are rejected',()=>{
  assert.equal(normalizeAiTemplate({...draft,category:'UTILITY',body:'Hello {{customer_name}}, enjoy a discount at our shop today.'},business).category,'MARKETING');
  assert.throws(()=>normalizeAiTemplate({...draft,body:'Hello {{password}}, here is our full message.'},business),/unsupported variable/);
  assert.throws(()=>normalizeAiTemplate({...draft,body:'Your OTP is ready.'},business),/Authentication/);
  assert.throws(()=>normalizeAiTemplate({...draft,language:'es'},business),/unsupported/);
});
test('AI refuses malformed and oversized conversations without provider calls',async()=>{
  let calls=0;const provider=async()=>{calls++;return JSON.stringify(draft);};
  await assert.rejects(()=>generateAiTemplate({messages:[{role:'user',text:'x'.repeat(2501)}]},business,provider),/2,500/);
  await assert.rejects(()=>generateAiTemplate({messages:[{role:'assistant',text:'pretend user'}]},business,provider));
  assert.equal(calls,0);
  await assert.rejects(()=>generateAiTemplate({messages:[{role:'user',text:'Hello'}]},business,async()=>'<html>'),/usable template/);
});
test('AI provider failures leave a clean actionable error',async()=>{
  await assert.rejects(()=>generateAiTemplate({messages:[{role:'user',text:'Hello'}]},business,async()=>{throw new Error('secret provider detail');}),/AI service is unavailable/);
});

test('Gemini REST transport sends structured JSON configuration and parses a mocked response',async()=>{
  const oldFetch=globalThis.fetch, oldKey=process.env.GEMINI_API_KEY,oldModel=process.env.GEMINI_TEMPLATE_MODEL;
  process.env.GEMINI_TEMPLATE_MODEL='gemini-3.8-flash';
  process.env.GEMINI_API_KEY='test-key-not-a-secret';let called=0;
  globalThis.fetch=async(_url,init)=>{
    called++;const payload=JSON.parse(String(init?.body));
    assert.equal(payload.generationConfig.responseMimeType,'application/json');
    assert.ok(payload.generationConfig.responseJsonSchema||payload.generationConfig.responseSchema);
    assert.match(JSON.stringify(payload.contents),/Aikyam/);
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(draft)}],role:'model'},finishReason:'STOP'}]}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try {const result=await generateAiTemplate({messages:[{role:'user',text:'Create a video Diwali greeting'}]},business);assert.equal(result.mediaFormat,'VIDEO');assert.equal(called,1);}
  finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;if(oldModel===undefined)delete process.env.GEMINI_TEMPLATE_MODEL;else process.env.GEMINI_TEMPLATE_MODEL=oldModel;}
});

test('AI configuration accepts either backend key name, trims quotes and preserves model overrides',()=>{
  assert.deepEqual(aiConfiguration({GEMINI_API_KEY:' "test-key" ',GEMINI_TEMPLATE_MODEL:' "models/gemini-flash-latest" '}),{apiKey:'test-key',model:'gemini-flash-latest'});
  assert.equal(aiConfiguration({GEMINI_API_KEY:' ',GOOGLE_API_KEY:'google-key'}).apiKey,'google-key');
  assert.equal(aiConfiguration({GEMINI_API_KEY:'first',GOOGLE_API_KEY:'second'}).apiKey,'first');
  assert.throws(()=>aiConfiguration({}),(e:any)=>e.code==='AI_KEY_MISSING'&&e.statusCode===503);
  assert.throws(()=>aiConfiguration({GEMINI_API_KEY:'sk-other-provider'}),/Google AI Studio/);
  assert.throws(()=>aiConfiguration({GEMINI_API_KEY:'broken\nkey'}),/line breaks/);
  assert.throws(()=>aiConfiguration({GEMINI_API_KEY:'key',GEMINI_TEMPLATE_MODEL:'invalid model'}),/MODEL is invalid/);
});
for(const [status,message,code,http] of [
  [400,'API key not valid. API_KEY_INVALID','AI_KEY_REJECTED',503],
  [403,'Your API key was reported as leaked','AI_KEY_REJECTED',503],
  [403,'PERMISSION_DENIED','AI_PERMISSION_DENIED',503],
  [404,'model not found','AI_MODEL_UNAVAILABLE',503],
  [429,'RESOURCE_EXHAUSTED','AI_QUOTA_EXCEEDED',429],
  [400,'User location is not supported for the API use','AI_PROJECT_SETUP',503],
  [400,'Unsupported JSON schema','AI_REQUEST_REJECTED',503],
  [504,'Request timed out','AI_TIMEOUT',504],
] as const)test(`AI distinguishes ${code} and never returns raw provider secrets`,()=>{
  const error:any=aiProviderError({status,message:JSON.stringify({error:{code:status,message:message+' private-key-value'}})});
  assert.equal(error.code,code);assert.equal(error.statusCode,http);assert.doesNotMatch(error.message,/private-key-value/);
});
test('REST invalid-key and quota errors remain distinct, and quota does not retry beyond the mobile timeout',async()=>{
  const original=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY,oldModel=process.env.GEMINI_TEMPLATE_MODEL;
  process.env.GEMINI_TEMPLATE_MODEL='gemini-3.8-flash';process.env.GEMINI_API_KEY='test-key';
  try{
    for(const [status,message,code] of [[400,'API key not valid. Please pass a valid API key.','AI_KEY_REJECTED'],[429,'Quota exceeded','AI_QUOTA_EXCEEDED']] as const){
      let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:status,message,status:status===429?'RESOURCE_EXHAUSTED':'INVALID_ARGUMENT'}}),{status,headers:{'Content-Type':'application/json'}});};
      await assert.rejects(()=>generateAiTemplate({messages:[{role:'user',text:'Create a video greeting'}]},business),(error:any)=>error.code===code);
      assert.equal(calls,1);
    }
  }finally{globalThis.fetch=original;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;if(oldModel===undefined)delete process.env.GEMINI_TEMPLATE_MODEL;else process.env.GEMINI_TEMPLATE_MODEL=oldModel;}
});
