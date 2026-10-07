/** A retry creates a new attempt and never resets the old activity. */
export function assertRetrySource(source: any, ownerUserId: number, recipientIds: number[],duplicateAcknowledged=false,now=new Date()): void {
  const fail=(message: string,statusCode: number)=>{throw Object.assign(new Error(message),{statusCode});};
  if(!source) fail('The original message is unavailable.',404);
  if(source.ownerUserId!==ownerUserId) fail('The original message does not belong to your business.',403);
  if(['ACCEPTED','SENT'].includes(source.status)){
    if(['held_for_quality_assessment','paused'].includes(source.variables?.__meta_message_status))fail('Meta is holding or pausing this delivery. Check WhatsApp Manager before creating another attempt.',409);
    const started=new Date(source.executedAt||source.createdAt);
    if(!Number.isFinite(started.getTime())||now.getTime()-started.getTime()<300000)fail('Wait five minutes for delivery updates before creating another attempt.',409);
    if(!duplicateAcknowledged)fail('The original message may already have arrived. Confirm you checked the recipient and accept the risk of a duplicate before sending again.',409);
  }else if(source.status!=='FAILED')fail('This message cannot be sent again from its current status. Refresh delivery activity first.',409);
  if(recipientIds.length!==1||recipientIds[0]!==source.contactId) fail('Resend must use the original recipient. Start a new message to change the audience.',400);
}
