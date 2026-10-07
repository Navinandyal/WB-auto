import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGeminiConnection, generateGeminiTemplate } from '../src/server/gemini-rest.ts';
import { aiProviderError } from '../src/server/ai-template.ts';
const response=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const request={contents:'A business greeting',config:{systemInstruction:'Return a greeting',responseJsonSchema:{type:'object'}}};

test('automatic AI model selection uses models accessible to this key, skips image models and uses safe pagination',async()=>{
  const original=globalThis.fetch;const calls:any[]=[];
  globalThis.fetch=async(url,init)=>{
    const parsed=new URL(String(url));calls.push(parsed);
    assert.equal(parsed.hostname,'generativelanguage.googleapis.com');
    assert.equal(parsed.searchParams.get('key'),null);assert.equal((init?.headers as any)['x-goog-api-key'],'test-auto-model-key');
    assert.ok(init?.signal);
    if(calls.length===1)return response({models:[{name:'models/gemini-image',supportedGenerationMethods:['generateContent']}],nextPageToken:'cursor & two'});
    if(calls.length===2){assert.equal(parsed.searchParams.get('pageToken'),'cursor & two');return response({models:[{name:'models/gemini-3.5-flash-lite',supportedGenerationMethods:['generateContent']}]});}
    assert.equal(parsed.pathname,'/v1beta/models/gemini-3.5-flash-lite:generateContent');
    assert.equal(init?.method,'POST');assert.equal(JSON.parse(String(init?.body)).generationConfig.responseMimeType,'application/json');
    return response({candidates:[{content:{parts:[{thought:true,text:'hidden'},{text:'{"body":"Hello"}'}]},finishReason:'STOP'}]});
  };
  try{
    const result=await generateGeminiTemplate({apiKey:'test-auto-model-key',model:'auto'},request);assert.equal(result.model,'gemini-3.5-flash-lite');assert.equal(result.text,'{"body":"Hello"}');
    await generateGeminiTemplate({apiKey:'test-auto-model-key',model:'auto'},request);assert.equal(calls.length,4);
  }finally{globalThis.fetch=original;}
});
test('AI connection check reads model metadata without generating content or claiming quota is usable',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,init)=>{calls++;assert.equal(init?.method,'GET');assert.doesNotMatch(String(url),/generateContent/);return response({supportedGenerationMethods:['generateContent']});};
  try{const result=await checkGeminiConnection({apiKey:'check-key',model:'gemini-3.5-flash-lite'});assert.match(result.message,/requires available.*quota/);assert.equal(calls,1);}
  finally{globalThis.fetch=original;}
});
test('AI blocked prompts and truncated output have distinct errors and never produce a fake draft',async()=>{
  const original=globalThis.fetch;
  try{
    for(const [body,code] of [[{promptFeedback:{blockReason:'SAFETY'}},'AI_CONTENT_BLOCKED'],[{candidates:[{finishReason:'MAX_TOKENS'}]},'AI_OUTPUT_LIMIT'],[{candidates:[]},'AI_EMPTY_RESPONSE']] as const){
      globalThis.fetch=async()=>response(body);
      await assert.rejects(()=>generateGeminiTemplate({apiKey:'key',model:'explicit-model'},request),(error:any)=>aiProviderError(error).code===code);
    }
  }finally{globalThis.fetch=original;}
});
test('AI DNS, TLS and timeout failures show safe diagnostics rather than generic key errors',()=>{
  for(const [cause,code] of [['ENOTFOUND','AI_NETWORK_ERROR'],['CERT_HAS_EXPIRED','AI_TLS_ERROR'],['UND_ERR_CONNECT_TIMEOUT','AI_TIMEOUT']]){
    const error:any=aiProviderError(new TypeError('fetch failed',{cause:{code:cause}}));
    assert.equal(error.code,code);assert.equal(error.networkCode,cause);assert.doesNotMatch(error.message,/private-key/);
  }
});
