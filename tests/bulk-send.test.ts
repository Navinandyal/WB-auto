import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {and, eq} from 'drizzle-orm';
import * as schema from '../src/db/schema.ts';
import {enqueueSendNowBatch} from '../src/server/bulk-send.ts';
import {AutomationWorker} from '../src/server/worker.ts';
import {contactName} from '../src/server/contact-name.ts';
import {attachImportedGroup, importGroupName} from '../src/server/contact-import-group.ts';
import {marketingRetryAfter, marketingLimitMessage, metaErrorText} from '../src/server/marketing-limits.ts';
import {explainDelivery} from '../src/server/delivery-explanation.ts';

async function fixture(count = 200) {
  const pg = new PGlite();
  const source = await readFile(new URL('../src/db/index.ts', import.meta.url), 'utf8');
  await pg.exec(source.match(/await client.query\(`([\s\S]*?)`\);/)![1]);
  const db = drizzle(pg, {schema});
  await db.insert(schema.users).values([
    {id:1,uid:'owner',name:'Owner',email:'owner@example.test',isActive:true,approvalStatus:'ACTIVE'},
    {id:2,uid:'other',name:'Other',email:'other@example.test',isActive:true,approvalStatus:'ACTIVE'},
  ]);
  const contacts = await db.insert(schema.contacts).values(Array.from({length:count}, (_,i)=>({
    ownerUserId:1,name:contactName(`CUSTOMER ${i+1}`),phone:`+9198${String(i).padStart(8,'0')}`,optIn:true,
  }))).returning();
  const [template] = await db.insert(schema.messageTemplates).values({ownerUserId:1,name:'offers',language:'en_US',category:'MARKETING',status:'APPROVED',
    components:[{type:'BODY',text:'Hello {{1}}, see our offers.'}]}).returning();
  const recipients = contacts.map(contact=>({contact,vars:{'1':contact.name,__send_now:'true'}}));
  return {pg,db,template,recipients};
}

test('200 recipients commit promptly, replay safely, and drain across worker restarts despite individual failures', async()=>{
  const f=await fixture();
  try {
    let reserved=0;
    const results=await enqueueSendNowBatch(f.db,1,'bulk_request_200',f.template,f.recipients,async count=>{reserved+=count;});
    assert.equal(results.length,200);assert.equal(reserved,200);
    assert.ok(results.every((r:any)=>r.status==='SCHEDULED'));
    let replay=await enqueueSendNowBatch(f.db,1,'bulk_request_200',f.template,f.recipients,async()=>{assert.fail('replay reserves no more quota');});
    assert.ok(replay.every((r:any)=>r.replayed));
    const attempts=new Map<number,number>();
    let delays=0;
    const worker=()=>{
      const instance:any=new AutomationWorker(f.db as any,async ms=>{assert.equal(ms,250);delays++;});
      instance.executeJob=async(job:any)=>{
        attempts.set(job.id,(attempts.get(job.id)||0)+1);
        if(job.contactId===18)throw new Error('Interrupted after an uncertain send');
        const status=job.contactId%17===0?'FAILED':'ACCEPTED';
        await f.db.update(schema.automations).set({status}).where(eq(schema.automations.id,job.id));
        return {status};
      };
      return instance;
    };
    // A fresh worker after each tick reads only durable state, no in-memory audience.
    for(let i=0;i<8;i++)await worker().processDatabaseAutomations(new Date());
    const rows=await f.db.select().from(schema.automations);
    assert.equal(attempts.size,200);assert.ok([...attempts.values()].every(n=>n===1));assert.equal(delays,200);
    assert.equal(rows.filter(r=>r.status==='FAILED').length,11);
    assert.equal(rows.filter(r=>r.status==='ACCEPTED').length,189);
    assert.equal(rows.find(r=>r.contactId===18)!.variables!.__meta_message_status,'unknown');
    await worker().processDatabaseAutomations(new Date());assert.equal(delays,200);
    replay=await enqueueSendNowBatch(f.db,1,'bulk_request_200',f.template,f.recipients,async()=>assert.fail('completed replay must not reserve'));
    assert.equal(replay.length,200);assert.equal(replay.filter((r:any)=>r.status==='FAILED').length,11);
    assert.ok(rows[0].templateSnapshot);assert.equal((rows[0].templateSnapshot as any).name,'offers');
  }finally{await f.pg.close();}
});

test('quota failure rolls back the whole batch; conflicting replay cannot partially queue new recipients',async()=>{
  const f=await fixture(5);
  try{
    await assert.rejects(enqueueSendNowBatch(f.db,1,'quota_request',f.template,f.recipients,async()=>{throw new Error('Message quota exceeded');}),/quota/);
    assert.equal((await f.db.select().from(schema.automations)).length,0);
    await enqueueSendNowBatch(f.db,1,'request_conflict',f.template,f.recipients.slice(0,2),async()=>{});
    const changed=f.recipients.map(r=>({...r,vars:{...r.vars,'1':'Different'}}));
    await assert.rejects(enqueueSendNowBatch(f.db,1,'request_conflict',f.template,changed,async()=>{}),/different content/);
    assert.equal((await f.db.select().from(schema.automations)).length,2);
  }finally{await f.pg.close();}
});

test('overlapping workers claim each queued recipient once',async()=>{
  const f=await fixture(25);
  try{
    await enqueueSendNowBatch(f.db,1,'overlapping_workers',f.template,f.recipients,async()=>{});
    const attempts:number[]=[];
    const make=()=>{const w:any=new AutomationWorker(f.db as any,async()=>{});w.executeJob=async(job:any)=>{
      attempts.push(job.id);
      await f.db.update(schema.automations).set({status:'ACCEPTED'}).where(eq(schema.automations.id,job.id));return {status:'ACCEPTED'};
    };return w;};
    await Promise.all([make().processDatabaseAutomations(new Date()),make().processDatabaseAutomations(new Date())]);
    assert.equal(attempts.length,25);assert.equal(new Set(attempts).size,25);
  }finally{await f.pg.close();}
});

test('import group includes valid and duplicate contacts once, reuses only the owner group and rolls back on import failure',async()=>{
  const f=await fixture(4);
  try{
    await f.db.insert(schema.contactGroups).values({ownerUserId:2,name:'Customers'});
    let group:any=await f.db.transaction(async tx=>attachImportedGroup(tx,1,importGroupName(' Customers '),[1,2,2]));
    assert.equal(group.created,true);assert.equal(group.memberCount,2);
    const first=group.id;
    group=await f.db.transaction(async tx=>attachImportedGroup(tx,1,'customers',[2,3]));
    assert.equal(group.id,first);assert.equal(group.created,false);assert.equal(group.added,1);assert.equal(group.memberCount,3);
    assert.equal((await f.db.select().from(schema.contactGroupMembers)).length,3);
    await assert.rejects(f.db.transaction(async tx=>{
      await attachImportedGroup(tx,1,'Rollback group',[4]);throw new Error('import transaction failed');
    }),/import transaction/);
    assert.equal((await f.db.select().from(schema.contactGroups).where(and(eq(schema.contactGroups.ownerUserId,1),eq(schema.contactGroups.name,'Rollback group')))).length,0);
    assert.equal(await f.db.transaction(async tx=>attachImportedGroup(tx,1,'Empty group',[])),null);
  }finally{await f.pg.close();}
});

test('contact names use one capital followed by lowercase; group names are validated independently',()=>{
  for(const [input,expected] of [[' RAHUL SHARMA ','Rahul sharma'],["O’NEIL",'O’neil'],['ÉLODIE DUPONT','Élodie dupont'],['अमित पाटील','अमित पाटील'],['','']])assert.equal(contactName(input),expected);
  assert.equal(importGroupName(null),null);assert.equal(importGroupName(' My Customers '),'My Customers');
  assert.throws(()=>importGroupName(' '),/2–80/);assert.throws(()=>importGroupName('x'.repeat(81)),/2–80/);
});

test('Meta 131049 has a real 24-hour recipient cooldown and no invented delivery guarantee',()=>{
  const now=new Date('2026-10-22T12:00:00Z');
  assert.equal(marketingRetryAfter({errorCode:'131049',failedAt:'2026-10-22T11:00:00Z'},now)!.toISOString(),'2026-10-23T11:00:00.000Z');
  assert.equal(marketingRetryAfter({errorCode:'131049',failedAt:'2026-10-21T11:00:00Z'},now),null);
  assert.equal(marketingRetryAfter({errorCode:'131026',failedAt:now},now),null);
  assert.equal(marketingRetryAfter({errorCode:'131049',failedAt:'bad'},now),null);
  assert.equal(metaErrorText({code:131049,title:'Repeated',message:'Repeated'}),marketingLimitMessage);
  assert.equal(metaErrorText({title:'Same',message:'Same',error_data:{details:'Same'}}),'Same');
  assert.equal(metaErrorText({title:'Media error',message:'Bad media',error_data:{details:'Bad media: use H.264'}}),'Media error: Bad media: use H.264');
  const diagnostic=explainDelivery({status:'FAILED'},[{errorCode:'131049',failedAt:new Date(),errorMessage:'old repeated text'}]);
  assert.equal(diagnostic.canRetry,false);assert.equal(diagnostic.metaErrorCode,'131049');assert.ok(diagnostic.retryAfter);
});

test('only definite throughput/pair rate rejections receive bounded automatic retries',async()=>{
  const {sendRetryPlan}=await import('../src/server/send-retry.ts');
  const now=new Date('2026-10-22T12:00:00Z');
  let variables:any={__send_now:'true','1':'Customer'};
  for(const seconds of [30,60,120]){
    const retry=sendRetryPlan('130429',variables,now)!;
    assert.equal((retry.scheduledAt.getTime()-now.getTime())/1000,seconds);
    assert.equal(retry.variables['1'],'Customer');variables=retry.variables;
  }
  assert.equal(sendRetryPlan('130429',variables,now),null);
  assert.ok(sendRetryPlan('131056',{},now));assert.ok(sendRetryPlan('429',{},now));
  for(const code of ['131049','SEND_OUTCOME_UNKNOWN','190','131026','MISSING_MESSAGE_ID'])assert.equal(sendRetryPlan(code,{},now),null);
});

test('real package checks share the queue/import transaction and account for reservations exactly once',async()=>{
  const {assertMessageCapacity,assertContactCapacity,getPackageAccessSummary}=await import('../src/server/subscriptions.ts');
  const f=await fixture(5);
  try{
    const [pkg]=await f.db.insert(schema.subscriptionPackages).values({name:'Fixture',packageType:'BASE',messageLimit:5,contactLimit:5,automationLimit:10}).returning();
    await f.db.insert(schema.userSubscriptions).values({userId:1,packageId:pkg.id,status:'ACTIVE',startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()+86400000),messageLimitSnapshot:5});
    await enqueueSendNowBatch(f.db,1,'real_quota_check',f.template,f.recipients,(count,tx)=>assertMessageCapacity(1,count,{reserveScheduled:true},tx));
    const summary=await getPackageAccessSummary(1,f.db as any);
    assert.equal(summary.scheduledReserved,5);assert.equal(summary.messagesRemaining,0);
    await assert.rejects(enqueueSendNowBatch(f.db,1,'another_quota_request',f.template,f.recipients.slice(0,1),(count,tx)=>assertMessageCapacity(1,count,{reserveScheduled:true},tx)),/Message limit exceeded/);
    assert.equal((await f.db.select().from(schema.automations)).length,5);
    await assert.rejects(f.db.transaction(async tx=>{
      const [added]=await tx.insert(schema.contacts).values({ownerUserId:1,name:'New contact',phone:'+919999111111',optIn:true}).returning();
      await attachImportedGroup(tx,1,'Over quota group',[added.id]);
      await assertContactCapacity(1,0,tx as any);
    }),/Contact limit exceeded/);
    assert.equal((await f.db.select().from(schema.contacts)).length,5);
    assert.equal((await f.db.select().from(schema.contactGroups)).length,0);
  }finally{await f.pg.close();}
});
