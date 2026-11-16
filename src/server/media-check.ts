import {createHash} from 'node:crypto';

type Input={phoneNumberId:string;accessToken:string;apiVersion:string;mediaId:string;format:string};
type Result={success:true}|{success:false;error:string;errorCode:string;rawResponse?:any};
/** Cache only successful metadata checks, never send outcomes or failed requests.
 * Credential fingerprint and phone ID isolate businesses and token changes.
 * Bounded, five-minute process memory; restarts safely force revalidation. */
export function createMediaVerifier(request:typeof fetch=(input,init)=>fetch(input,init),clock:()=>number=Date.now){
 const checked=new Map<string,number>();
 const pending=new Map<string,Promise<Result>>();
 return async function verify(input:Input):Promise<Result>{
  const key=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const now=clock();
  for(const [id,until] of checked)if(until<=now)checked.delete(id);
  if((checked.get(key)||0)>now)return {success:true};
  const running=pending.get(key);if(running)return running;
  const job=(async():Promise<Result>=>{
   try{
    const url=new URL(`https://graph.facebook.com/${input.apiVersion}/${encodeURIComponent(input.mediaId)}`);
    url.searchParams.set('phone_number_id',input.phoneNumberId);
    const response=await request(url,{headers:{Authorization:`Bearer ${input.accessToken}`},signal:AbortSignal.timeout(15000)});
    let media:any;try{media=await response.json();}catch{media=null;}
    if(response.status===429||response.status>=500)return temporary();
    if(!response.ok||media?.error||String(media?.id||'')!==input.mediaId)return {success:false,error:'The uploaded attachment is expired or unavailable for this WhatsApp number. Select and upload the file again.',errorCode:'MEDIA_UNAVAILABLE'};
    const allowed=input.format==='DOCUMENT'?['application/pdf']:['video/mp4','video/3gpp'];
    if(!allowed.includes(media.mime_type))return {success:false,error:'The uploaded attachment does not match this template. Upload a compatible video or PDF.',errorCode:'MEDIA_TYPE_MISMATCH'};
    if(checked.size>=256)checked.delete(checked.keys().next().value!);
    checked.set(key,clock()+300000);
    return {success:true};
   }catch{return temporary();}
  })();
  pending.set(key,job);
  try{return await job;}finally{pending.delete(key);}
 };
}
function temporary():Result{return {success:false,error:'WhatsApp attachment verification is temporarily unavailable. No message was sent during this check.',errorCode:'MEDIA_CHECK_TEMPORARY',rawResponse:{error:{code:'MEDIA_CHECK_TEMPORARY'}}};}
export const verifyMessageMedia=createMediaVerifier();
