export type AppWebhookCheck = {
  state: 'READY' | 'ACTION_REQUIRED' | 'UNVERIFIED';
  messagesSubscribed: boolean | null;
  appCallbackUrl: string | null;
  warning?: string;
};

/** Read-only. Never rewrites a shared Meta app's webhook settings. */
export async function checkAppWebhook(creds:{metaAppId?:string;metaAppSecret?:string;apiVersion:string}):Promise<AppWebhookCheck>{
  const unknown=(warning:string):AppWebhookCheck=>({state:'UNVERIFIED',messagesSubscribed:null,appCallbackUrl:null,warning});
  if(!creds.metaAppId||!creds.metaAppSecret)return unknown('Add the matching Meta App ID and App Secret to check the messages webhook field, or verify that field in Meta App Dashboard.');
  try{
    const response=await fetch(`https://graph.facebook.com/${encodeURIComponent(creds.apiVersion)}/${encodeURIComponent(creds.metaAppId)}/subscriptions`,{
      headers:{Authorization:`Bearer ${creds.metaAppId}|${creds.metaAppSecret}`},signal:AbortSignal.timeout(10000),
    });
    const body:any=await response.json();
    if(Number(body.error?.code)===190)return {state:'ACTION_REQUIRED',messagesSubscribed:null,appCallbackUrl:null,warning:'Meta rejected the App ID / App Secret used to check delivery callbacks. Copy the matching credentials from the same Meta app that issued the WhatsApp token, save them, then run Test connection again.'};
    if(!response.ok||body.error||!Array.isArray(body.data))return unknown('Meta did not allow reading the app webhook settings. In Meta App Dashboard, check WhatsApp Business Account → messages. The WABA subscription alone does not confirm this field.');
    const subscription=body.data.find((s:any)=>s.object==='whatsapp_business_account');
    if(subscription&&!Array.isArray(subscription.fields))return unknown('Meta returned incomplete app webhook settings. Verify the active messages field in Meta App Dashboard.');
    const fields=Array.isArray(subscription?.fields)?subscription.fields.map((f:any)=>typeof f==='string'?f:f.name):[];
    const subscribed=subscription?.active!==false&&fields.includes('messages');
    return {state:subscribed?'READY':'ACTION_REQUIRED',messagesSubscribed:subscribed,appCallbackUrl:subscription?.callback_url||null,
      ...(!subscribed?{warning:'The Meta app has no active messages webhook field for WhatsApp Business Account. In Meta App Dashboard, verify the callback URL and subscribe to messages, then run Test connection again.'}:{})};
  }catch{return unknown('The app webhook field check could not finish. Verify messages in Meta App Dashboard, then run Test connection again.');}
}
