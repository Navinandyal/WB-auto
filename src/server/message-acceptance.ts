export function acceptanceVariables(variables:Record<string,string>,response:any,trackingWarning?:string):Record<string,string>{
  const state=String(response?.messages?.[0]?.message_status||'accepted');
  const note=state==='held_for_quality_assessment'?'Meta is holding this message for quality assessment. Delivery has not happened yet.':state==='paused'?'Meta paused delivery of this message. Check the template and account status in WhatsApp Manager.':'';
  return {...variables,__meta_message_status:state,...(note?{__delivery_note:note}:{}),...(trackingWarning?{__delivery_tracking_warning:trackingWarning}:{})};
}
export function sameSendVariables(first:Record<string,string>,second:Record<string,string>):boolean{
  const ignored=new Set(['__meta_message_status','__delivery_note','__delivery_tracking_warning','__marketing_retry_after','__send_retry_count','__send_retry_reason']);
  const canonical=(values:Record<string,string>)=>JSON.stringify(Object.entries(values||{}).filter(([key])=>!ignored.has(key)).sort(([a],[b])=>a.localeCompare(b)));
  return canonical(first)===canonical(second);
}
