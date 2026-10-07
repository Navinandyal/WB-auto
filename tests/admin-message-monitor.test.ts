import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { savedMediaPreview } from '../src/server/saved-media-preview.ts';
import { messageMonitor, monitorOptions } from '../src/server/admin-message-monitor.ts';
const db=new PGlite();
before(async()=>{
 const source=await readFile(new URL('../src/db/index.ts',import.meta.url),'utf8');
 await db.exec(source.match(/await client.query\(`([\s\S]*?)`\);/)![1]);
 await db.exec(`INSERT INTO users(id,uid,email,name,business_name,is_active,approval_status) VALUES(1,'monitor1','m1@test.com','First Owner','First Business',TRUE,'ACTIVE'),(2,'monitor2','m2@test.com','Other Owner','Other Business',TRUE,'ACTIVE');
 INSERT INTO contacts(id,owner_user_id,name,phone,opt_in) VALUES(1,1,'Asha','+919999999991',TRUE),(2,2,'Other','+919999999992',TRUE);
 INSERT INTO message_templates(id,owner_user_id,name,language,category,status,components) VALUES(1,1,'hello','en_US','MARKETING','APPROVED','[{"type":"BODY","text":"Current body"}]'),(2,2,'other','en_US','UTILITY','APPROVED','[]');
 INSERT INTO automations(id,owner_user_id,contact_id,template_id,template_snapshot,variables,scheduled_at,executed_at,status) VALUES
 (1,1,1,1,'{"name":"original_name","language":"hi","components":[{"type":"BODY","text":"Original body"}]}','{"1":"Asha"}','2026-10-06 18:00:00','2026-10-06 18:45:00','ACCEPTED'),
 (2,1,1,1,NULL,'{}','2026-10-07 08:00:00',NULL,'SCHEDULED'),
 (3,1,1,1,NULL,'{"__meta_message_status":"unknown"}','2026-10-07 09:00:00','2026-10-07 09:00:00','ACCEPTED'),
 (4,1,1,1,NULL,'{}','2026-10-07 10:00:00','2026-10-07 10:00:00','FAILED'),
 (5,2,2,2,NULL,'{}','2026-10-07 10:00:00','2026-10-07 10:00:00','READ');
 INSERT INTO messages(id,owner_user_id,automation_id,contact_id,direction,status,variables,sent_at,created_at,whatsapp_message_id) VALUES
 (1,1,1,1,'OUTBOUND','FAILED','{}',NULL,'2026-10-06 18:00:00',NULL),
 (2,1,1,1,'OUTBOUND','ACCEPTED','{"1":"Asha"}',NULL,'2026-10-06 18:45:00','wamid.accepted'),
 (3,1,NULL,1,'OUTBOUND','DELIVERED','{}','2026-10-07 11:00:00','2026-10-07 11:00:00','wamid.standalone'),
 (4,1,NULL,1,'INBOUND','SENT','{}','2026-10-07 11:00:00','2026-10-07 11:00:00','wamid.inbound');`);
});
after(async()=>db.close());
test('admin totals count activities once, include Send Now/standalone outbound and exclude inbound',async()=>{
 const r=await messageMonitor({},db);
 assert.equal(r.summary.total,6);assert.equal(r.summary.sent,3);assert.equal(r.summary.failed,1);assert.equal(r.summary.processing,1);assert.equal(r.summary.scheduled,1);assert.equal(r.items.length,6);
 assert.equal(r.items.find((m:any)=>m.automationId===1).status,'SENT');
 assert.equal(r.items.find((m:any)=>m.automationId===3).status,'PROCESSING');
});
test('business filter, search and status totals cover all pages',async()=>{
 const r=await messageMonitor({businessId:1,status:'SENT',limit:1,page:1},db);
 assert.equal(r.summary.total,5);assert.equal(r.total,2);assert.equal(r.items.length,1);
 const second=await messageMonitor({businessId:1,status:'SENT',limit:1,page:2},db);
 assert.notEqual(second.items[0].key,r.items[0].key);assert.equal(second.summary.total,5);
 assert.equal((await messageMonitor({search:'Other Owner'},db)).total,1);
 assert.equal((await messageMonitor({search:'%'},db)).total,0);
});
test('daily counters use IST independently of database session timezone and include end date',async()=>{
 const r=await messageMonitor({start:'2026-10-07',end:'2026-10-07'},db);
 assert.equal(r.total,6);assert.equal(r.daily.length,1);assert.equal(r.daily[0].day,'2026-10-07');assert.equal(r.daily[0].total,6);
 assert.equal((await messageMonitor({start:'2026-10-06',end:'2026-10-06'},db)).total,0);
 await db.exec("SET TIME ZONE 'Etc/GMT-8'");
 assert.deepEqual((await messageMonitor({start:'2026-10-07',end:'2026-10-07'},db)).daily,r.daily);
 await db.exec("SET TIME ZONE 'UTC'");
});
test('admin details use original template snapshot and actual latest send variables',async()=>{
 const r=await messageMonitor({search:'original_name'},db);assert.equal(r.total,1);
 assert.equal(r.items[0].templateName,'original_name');assert.equal(r.items[0].language,'hi');assert.equal(r.items[0].components[0].text,'Original body');assert.equal(r.items[0].variables['1'],'Asha');assert.equal(r.items[0].whatsappMessageId,'wamid.accepted');
});
test('input validation rejects invalid dates, inverted ranges, unsafe IDs and pages',()=>{
 for(const q of [{start:'2026-02-30'},{start:'2026-10-08',end:'2026-10-07'},{businessId:'1 OR 1=1'},{businessId:-2},{page:0},{limit:101},{status:'DELIVERED'}]) assert.throws(()=>monitorOptions(q));
 assert.equal(monitorOptions({start:'2024-02-29'}).start,'2024-02-29');
});
test('all history summary and pagination include more than the old 250-row UI cap',async()=>{
 await db.query("SELECT setval('automations_id_seq', (SELECT MAX(id) FROM automations))");
 await db.exec(`INSERT INTO automations(owner_user_id,contact_id,template_id,variables,scheduled_at,status) SELECT 1,1,1,'{}','2025-01-01','SCHEDULED' FROM generate_series(1,260)`);
 const r=await messageMonitor({businessId:1,limit:40},db);assert.equal(r.summary.total,265);assert.equal(r.total,265);assert.equal(r.items.length,40);
 const last=await messageMonitor({businessId:1,limit:40,page:7},db);assert.equal(last.items.length,25);
 assert.equal((await messageMonitor({businessId:1,start:'2026-10-07',end:'2026-10-07'},db)).summary.total,5);
});

test('saved media previews remain owner scoped while authenticated admins can preview business media',async()=>{
 await db.query("INSERT INTO message_media(media_id,owner_user_id,mime_type,file_name,data_base64) VALUES('preview-1',1,'application/pdf','sample.pdf','data:application/pdf;base64,dGVzdA==')");
 assert.equal((await savedMediaPreview('preview-1',{ownerUserId:1},db))?.fileName,'sample.pdf');
 assert.equal(await savedMediaPreview('preview-1',{ownerUserId:2},db),null);
 assert.equal((await savedMediaPreview('preview-1',{admin:true},db))?.mimeType,'application/pdf');
 assert.equal(await savedMediaPreview('missing',{admin:true},db),null);
});
