import test from 'node:test';
import assert from 'node:assert/strict';
import {explainDelivery} from '../src/server/delivery-explanation.ts';
const activity={status:'ACCEPTED',variables:{}};
const records=[{id:1,status:'ACCEPTED',whatsappMessageId:'wamid.owned',variables:{}}];
test('missing receipt gives a precise evidence gap without inventing a Meta failure or delivery',()=>{
  const diagnosis=explainDelivery(activity,records);
  assert.equal(diagnosis.code,'NO_DELIVERY_RECEIPT');assert.equal(diagnosis.messageId,'wamid.owned');assert.match(diagnosis.message,/No specific Meta delivery error/);assert.equal(diagnosis.metaErrorCode,undefined);
});
test('actual Meta code and full error details are shown for failed sends or received failures',()=>{
  const failure=explainDelivery({status:'FAILED'},[{errorCode:'131053',errorMessage:'PDF could not be processed'}]);assert.equal(failure.metaErrorCode,'131053');assert.match(failure.message,/PDF/);
  const received=explainDelivery(activity,records,{status:'failed',errors:[{code:131049,title:'Delivery restricted',error_data:{details:'Meta restricted this delivery'}}]});
  assert.equal(received.code,'META_FAILURE_RECEIVED');assert.equal(received.metaErrorCode,'131049');assert.match(received.message,/restricted/);
  assert.equal(explainDelivery(activity,records,{status:'failed',errors:[]}).code,'META_FAILURE_RECEIVED');
});
test('held, paused, timeout and setup warning remain distinct reasons rather than fabricated rejections',()=>{
  for(const [vars,code] of [[{__meta_message_status:'held_for_quality_assessment'},'META_QUALITY_HOLD'],[{__meta_message_status:'paused'},'META_PAUSED'],[{__meta_message_status:'unknown'},'SEND_OUTCOME_UNKNOWN'],[{__delivery_tracking_warning:'Wrong WABA'},'CALLBACK_SETUP_WARNING']] as const){assert.equal(explainDelivery({...activity,variables:vars},records).code,code);}
});
test('processing and inconsistent callbacks expose a reference; confirmed delivery takes priority over stale metadata',()=>{
  assert.equal(explainDelivery(activity,records,{id:9,status:'delivered',processedAt:null}).receiptReference,'webhook_9');
  assert.equal(explainDelivery(activity,records,{id:9,status:'delivered',processedAt:new Date()}).code,'STATUS_UPDATE_PENDING');
  assert.equal(explainDelivery({...activity,status:'READ',variables:{__delivery_tracking_warning:'old warning'}},records).code,'DELIVERY_CONFIRMED');
  assert.equal(explainDelivery({...activity,status:'SENT'},records).code,'DEVICE_RECEIPT_PENDING');
});
