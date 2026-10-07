import { createHmac, timingSafeEqual } from 'node:crypto';

export function matchesWebhookSignature(raw:Buffer, signature:string, secret:string):boolean {
  if(!secret || !/^sha256=[a-f0-9]{64}$/.test(signature))return false;
  const expected='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  return timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}

// A manually connected app may have its own secret. A valid signature for
// that app must never authorize a payload belonging to another business/app.
export function authorizeAccountWebhook(raw:Buffer,signature:string,payload:any,accounts:Array<{business_account_id:string;phone_number_id:string;secret:string}>):boolean {
  const signed=accounts.filter(a=>matchesWebhookSignature(raw,signature,a.secret));
  const entries=payload?.entry;
  return signed.length>0 && Array.isArray(entries) && entries.length>0 && entries.every((entry:any)=>
    Array.isArray(entry.changes) && entry.changes.length>0 && entry.changes.every((change:any)=>{
      const phone=String(change.value?.metadata?.phone_number_id||'');
      const scoped=signed.filter(a=>a.business_account_id===String(entry.id)&&(!phone||a.phone_number_id===phone));
      if(!scoped.length)return false;
      // Every affected account must be authorized, even when owners share a phone.
      return accounts.filter(a=>a.business_account_id===String(entry.id)&&(!phone||a.phone_number_id===phone)).every(a=>scoped.includes(a));
    }));
}
