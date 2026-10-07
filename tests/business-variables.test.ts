import { assertRetrySource } from '../src/server/retry-rules.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { businessVariableValue } from '../src/server/business-variables.ts';

test('shop and business variables use the given owner profile, never contact data or examples', () => {
  const first={businessName:'Brain Consultancy',businessAddress:'Solapur',phone:'+919876543210',email:'owner@example.com'};
  const second={businessName:'Another Shop',businessAddress:'Pune'};
  assert.equal(businessVariableValue('BUSINESS_NAME',first),'Brain Consultancy');
  assert.equal(businessVariableValue('BUSINESS_NAME',second),'Another Shop');
  assert.equal(businessVariableValue('BUSINESS_DETAILS',first),'Brain Consultancy, Solapur');
  assert.equal(businessVariableValue('BUSINESS_ADDRESS',first),'Solapur');
  assert.equal(businessVariableValue('BUSINESS_PHONE',first),'+919876543210');
  assert.equal(businessVariableValue('BUSINESS_EMAIL',first),'owner@example.com');
  assert.equal(businessVariableValue('CONTACT_NAME',first),null);
  assert.equal(businessVariableValue('BUSINESS_NAME',{}),null);
});

test('pending send-again requires five minutes, explicit duplicate acknowledgement, and original recipient',()=>{
  const now=new Date('2026-10-06T08:00:00Z');
  const source={ownerUserId:1,contactId:10,status:'ACCEPTED',executedAt:'2026-10-06T07:50:00Z',variables:{}};
  assert.throws(()=>assertRetrySource(source,1,[10],false,now),/may already have arrived/);
  assert.doesNotThrow(()=>assertRetrySource(source,1,[10],true,now));
  assert.doesNotThrow(()=>assertRetrySource({...source,status:'SENT'},1,[10],true,now));
  assert.throws(()=>assertRetrySource({...source,executedAt:'2026-10-06T07:59:00Z'},1,[10],true,now),/five minutes/);
  assert.throws(()=>assertRetrySource(source,1,[11],true,now),/original recipient/);
  for(const state of ['held_for_quality_assessment','paused'])assert.throws(()=>assertRetrySource({...source,variables:{__meta_message_status:state}},1,[10],true,now),/holding or pausing/);
  assert.throws(()=>assertRetrySource({...source,status:'DELIVERED'},1,[10],true,now),/current status/);
});


test('resend permits only an owned failed source and its original recipient', () => {
  const source={ownerUserId:1,contactId:10,status:'FAILED'};
  assert.doesNotThrow(()=>assertRetrySource(source,1,[10]));
  assert.throws(()=>assertRetrySource(undefined,1,[10]),/unavailable/);
  assert.throws(()=>assertRetrySource(source,2,[10]),/business/);
  for(const status of ['DELIVERED','READ','PROCESSING','SCHEDULED'])
    assert.throws(()=>assertRetrySource({...source,status},1,[10]),/current status/);
  assert.throws(()=>assertRetrySource(source,1,[11]),/original recipient/);
  assert.throws(()=>assertRetrySource(source,1,[10,11]),/original recipient/);
});
