import { createHash } from 'node:crypto';
import {checkAppWebhook, type AppWebhookCheck} from './app-webhook-check.ts';
type Credentials={businessAccountId:string;phoneNumberId:string;accessToken:string;apiVersion:string;metaAppId?:string;metaAppSecret?:string;webhookVerifyToken?:string};
export async function ensureDeliverySubscription(creds:Credentials,callback?:{url:string;verifyToken:string}):Promise<{callbackUrlVerified:boolean;appWebhook:AppWebhookCheck}> {
  if(!creds.businessAccountId)throw new Error('WABA ID is required to receive WhatsApp delivery updates. Save the correct WhatsApp Business Account ID and test again.');
  let callbackValid=false;try{const parsed=new URL(callback?.url||'');callbackValid=parsed.protocol==='https:'&&!!parsed.hostname&&!parsed.username&&!parsed.password;}catch{}
  if(callback && (!callback.verifyToken||!callbackValid))throw new Error('A permanent HTTPS backend URL and Webhook Verify Token are required for delivery callbacks.');
  const base=`https://graph.facebook.com/${encodeURIComponent(creds.apiVersion)}/${encodeURIComponent(creds.businessAccountId)}`;
  const setupSignal=AbortSignal.timeout(10000);
  const request=async(path:string,method='GET',requestBody?:any)=>{
    const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${creds.accessToken}`,...(requestBody?{'Content-Type':'application/json'}:{})},...(requestBody?{body:JSON.stringify(requestBody)}:{}),signal:setupSignal});
    const body:any=await response.json();
    if(!response.ok||body.error){
      const code=Number(body.error?.code);
      throw new Error(code===190?'WhatsApp access token is expired or invalid. Update the token and test again.':`WhatsApp delivery setup failed${code?` (Meta code ${code})`:''}. Verify WABA ID and whatsapp_business_management permission, then test again.`);
    }
    return body;
  };
  // Never subscribe a WABA that does not contain this business's phone number.
  let page='/phone_numbers?fields=id&limit=100',found=false;
  const cursors=new Set<string>();
  for(let i=0;i<20;i++){
    const result=await request(page);
    if((result.data||[]).some((p:any)=>String(p.id)===creds.phoneNumberId)){found=true;break;}
    const cursor=String(result.paging?.cursors?.after||'');
    if(!result.paging?.next||!cursor||cursors.has(cursor))break;
    cursors.add(cursor);page='/phone_numbers?fields=id&limit=100&after='+encodeURIComponent(cursor);
  }
  if(!found)throw new Error('Phone Number ID does not belong to the saved WABA ID. Correct the connection details before enabling delivery updates.');
  // Subscribe this WABA to this backend, rather than leaving a stale/default
  // app callback pointing at another server. Meta verifies it with our token.
  const subscribed=await request('/subscribed_apps','POST',callback?{override_callback_uri:callback.url,verify_token:callback.verifyToken}:undefined);
  if(subscribed.success!==true)throw new Error('Meta did not confirm the webhook subscription. Test the WhatsApp connection again.');
  // A successful POST does not prove the saved override points to this server.
  if(creds.metaAppId||callback){
    const result=await request('/subscribed_apps');
    const subscriptions=Array.isArray(result.data)?result.data:[];
    const matching=creds.metaAppId?subscriptions.filter((a:any)=>String(a.whatsapp_business_api_data?.id||a.id)===creds.metaAppId):subscriptions;
    if(creds.metaAppId&&!matching.length)throw new Error('The configured Meta app is not subscribed to this WABA. Check that your token comes from the saved Meta App ID and test again.');
    if(callback&&!matching.some((a:any)=>String(a.override_callback_uri||'')===callback.url))throw new Error('Meta did not confirm this backend callback URL. Verify the permanent HTTPS callback and matching Webhook Verify Token, then run Test connection again.');
  }
  const appWebhook=await checkAppWebhook(creds);
  return {callbackUrlVerified:Boolean(callback),appWebhook};
}

export type DeliverySetup={ready:boolean;warning?:string;callbackUrlVerified?:boolean;appWebhook?:AppWebhookCheck};
const setupCache=new Map<string,{expires:number;result:DeliverySetup}>();
const setupInFlight=new Map<string,Promise<DeliverySetup>>();
export async function prepareDeliveryTracking(creds:Credentials):Promise<DeliverySetup>{
  const {metaPlatformConfig}=await import('./meta-config.ts');
  const cfg=await metaPlatformConfig();
  const callback={url:cfg.publicBaseUrl+'/webhooks/whatsapp',verifyToken:creds.webhookVerifyToken||cfg.webhookVerifyToken};
  const key=createHash('sha256').update(JSON.stringify([creds.businessAccountId,creds.phoneNumberId,creds.accessToken,creds.metaAppId,creds.metaAppSecret,cfg.appSecret,callback])).digest('hex');
  const cached=setupCache.get(key);if(cached&&cached.expires>Date.now())return cached.result;
  if(setupInFlight.has(key))return setupInFlight.get(key)!;
  const job=(async()=>{
    let result:DeliverySetup;
    try{
      if(!creds.metaAppSecret&&!(creds.metaAppId===cfg.appId&&cfg.appSecret))throw new Error('Add the matching Meta App Secret in WhatsApp connection settings to verify delivery callbacks.');
      if(!cfg.publicBaseUrl)throw new Error('Set PUBLIC_BASE_URL to this deployed backend HTTPS URL so Meta can return delivery updates.');
      const setup=await ensureDeliverySubscription({...creds,metaAppSecret:creds.metaAppSecret||(creds.metaAppId===cfg.appId?cfg.appSecret:'')},callback);
      result={...setup,ready:setup.appWebhook.state==='READY',...(setup.appWebhook.warning?{warning:setup.appWebhook.warning}:{})};
    }catch(e:any){result={ready:false,warning:e.message||'Delivery callback setup could not be repaired. Verify the WhatsApp connection.'};}
    for(const [id,entry] of setupCache)if(entry.expires<Date.now())setupCache.delete(id);
    if(setupCache.size>=500)setupCache.delete(setupCache.keys().next().value!);
    setupCache.set(key,{expires:Date.now()+(result.ready?300000:30000),result});
    return result;
  })();
  setupInFlight.set(key,job);
  try{return await job;}finally{setupInFlight.delete(key);}
}
