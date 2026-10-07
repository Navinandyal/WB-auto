import { createHash } from 'node:crypto';

const base='https://generativelanguage.googleapis.com/v1beta/';
const modelsCache=new Map<string,{expires:number;model:string}>();
async function googleRequest(path:string,key:string,signal:AbortSignal,body?:any):Promise<any>{
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'x-goog-api-key':key,...(body?{'Content-Type':'application/json'}:{})},signal,...(body?{body:JSON.stringify(body)}:{})});
  let data:any;try{data=await response.json();}catch{throw Object.assign(new Error('Google returned an unreadable AI response.'),{status:response.status>=400?response.status:502});}
  if(!response.ok||data.error)throw Object.assign(new Error(String(data.error?.message||'Google AI request failed.')),{status:response.status,error:data.error});
  return data;
}

async function resolveModel(key:string,configured:string,signal:AbortSignal):Promise<string>{
  if(configured!=='auto')return configured;
  const cacheKey=createHash('sha256').update(key).digest('hex');
  const cached=modelsCache.get(cacheKey);if(cached&&cached.expires>Date.now())return cached.model;
  const available=new Set<string>();let page='';const seen=new Set<string>();
  for(let count=0;count<5;count++){
    const result=await googleRequest('models?pageSize=1000'+(page?'&pageToken='+encodeURIComponent(page):''),key,signal);
    for(const model of result.models||[])if(model.supportedGenerationMethods?.includes('generateContent'))available.add(String(model.name||'').replace(/^models\//,''));
    page=String(result.nextPageToken||'');if(!page||seen.has(page))break;seen.add(page);
  }
  const preference=['gemini-3.5-flash-lite','gemini-3.8-flash','gemini-3.7-flash','gemini-flash-latest','gemini-2.5-flash','gemini-2.5-flash-lite'];
  const model=preference.find(name=>available.has(name))||[...available].filter(name=>/^gemini-\d+(?:\.\d+)?-flash(?:-lite)?$/.test(name)).sort().reverse()[0];
  if(!model)throw Object.assign(new Error('No supported text-generation Flash model is available. Set GEMINI_TEMPLATE_MODEL to a supported model for this Google project.'),{status:404});
  for(const [id,item] of modelsCache)if(item.expires<Date.now())modelsCache.delete(id);
  if(modelsCache.size>=128)modelsCache.delete(modelsCache.keys().next().value!);
  modelsCache.set(cacheKey,{expires:Date.now()+300000,model});return model;
}

export async function checkGeminiConnection(settings:{apiKey:string;model:string}){
  const signal=AbortSignal.timeout(20000);
  const model=await resolveModel(settings.apiKey,settings.model,signal);
  const info=await googleRequest('models/'+encodeURIComponent(model),settings.apiKey,signal);
  if(!info.supportedGenerationMethods?.includes('generateContent'))throw Object.assign(new Error('This model does not support template text generation.'),{status:404});
  return {model,message:'AI key and text model are reachable. Template generation also requires available Google project quota.'};
}

export async function generateGeminiTemplate(settings:{apiKey:string;model:string},request:any){
  const signal=AbortSignal.timeout(45000);
  const model=await resolveModel(settings.apiKey,settings.model,signal);
  const data=await googleRequest('models/'+encodeURIComponent(model)+':generateContent',settings.apiKey,signal,{
    contents:[{role:'user',parts:[{text:request.contents}]}],
    systemInstruction:{parts:[{text:request.config.systemInstruction}]},
    generationConfig:{responseMimeType:'application/json',responseJsonSchema:request.config.responseJsonSchema,maxOutputTokens:4096},
  });
  const candidate=data.candidates?.[0];
  if(data.promptFeedback?.blockReason||['SAFETY','RECITATION','PROHIBITED_CONTENT'].includes(candidate?.finishReason))throw Object.assign(new Error('AI_CONTENT_BLOCKED'),{status:422});
  if(candidate?.finishReason==='MAX_TOKENS')throw Object.assign(new Error('AI_OUTPUT_LIMIT'),{status:422});
  const text=(candidate?.content?.parts||[]).filter((part:any)=>part.thought!==true&&typeof part.text==='string').map((part:any)=>part.text).join('');
  if(!text)throw Object.assign(new Error('AI_EMPTY_RESPONSE'),{status:502});
  return {text,model};
}
