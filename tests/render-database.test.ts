import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {extractDumpData,createRestoreSql} from '../tools/database-transfer.mjs';
import {protectSupabaseTables} from '../src/server/supabase-access.ts';

async function fixture(){
 const db=new PGlite();
 const source=await readFile(new URL('../src/db/index.ts',import.meta.url),'utf8');
 await db.exec(source.match(/await client.query\(`([\s\S]*?)`\);/)![1]);
 await db.exec("CREATE TABLE greetsync_deployment_migrations(id text primary key,backup_sha256 text,target_fingerprint text,row_counts jsonb,completed_at timestamptz default now()); CREATE ROLE anon; CREATE ROLE authenticated;");
 return db;
}
async function apply(db:PGlite,sql:string){
 // Real PostgreSQL COPY through PGlite's Blob device, inside the generated transaction.
 const copy=/COPY public\."[a-z_]+" \([^)]+\) FROM stdin;\n[\s\S]*?\n\\\.(?:\n|$)/g;
 let last=0;try{
  for(const block of sql.matchAll(copy)){
   await db.exec(sql.slice(last,block.index));
   const newline=block[0].indexOf('\n'),header=block[0].slice(0,newline).replace('FROM stdin','FROM \'/dev/blob\'');
   const body=block[0].slice(newline+1).replace(/\\\.\n?$/,'');
   await db.query(header,[],{blob:new Blob([body])});last=block.index!+block[0].length;
  }
  await db.exec(sql.slice(last));
 }catch(e){await db.exec('ROLLBACK');throw e;}
}
function backup(owner=7){return `-- PostgreSQL database dump
COPY public.contacts (id,owner_user_id,name,phone,opt_in) FROM stdin;
9\t${owner}\tSaved customer\t+919876543210\tt
\\.
COPY public.users (id,uid,email,name,role,is_active,approval_status) FROM stdin;
7\tuid-seven\towner@example.test\tSaved owner\tbusiness_user\tt\tACTIVE
\\.
COPY public.message_templates (id,owner_user_id,name,language,category,status,components) FROM stdin;
5\t7\toffer\ten_US\tMARKETING\tAPPROVED\t[]
\\.
COPY public.automations (id,owner_user_id,contact_id,template_id,variables,scheduled_at,timezone,status) FROM stdin;
8\t7\t9\t5\t{}\t2026-10-23 10:00:00\tAsia/Kolkata\tPROCESSING
\\.
SELECT pg_catalog.setval('public.users_id_seq', 20, true);
-- PostgreSQL database dump complete
`;}
async function metadata(db:PGlite){
 const fk=(await db.query<any>("SELECT c.conname constraint_name,t.relname table_name,c.condeferrable,c.condeferred FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE c.contype='f' AND t.relnamespace='public'::regnamespace")).rows;
 const seq=(await db.query<any>("SELECT t.relname table_name,a.attname column_name,s.relname sequence_name FROM pg_class s JOIN pg_depend d ON d.objid=s.oid AND d.deptype='a' JOIN pg_class t ON t.oid=d.refobjid JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid WHERE s.relkind='S' AND s.relnamespace='public'::regnamespace")).rows;
 return {fk,seq};
}
const target={backendUrl:'https://fixture.onrender.com',fingerprint:'f'.repeat(64)};

test('real PostgreSQL import preserves IDs/links/sequence state, verifies counts and marks uncertain cutover sends without replay',async()=>{
 const db=await fixture();
 try{
  const {fk,seq}=await metadata(db),data=extractDumpData(backup());
  await apply(db,createRestoreSql(data,fk,seq,target,'a'.repeat(64)));
  assert.equal((await db.query<any>('select id from users')).rows[0].id,7);
  assert.equal((await db.query<any>('select owner_user_id from contacts')).rows[0].owner_user_id,7);
  const automation=(await db.query<any>('select status,variables from automations')).rows[0];assert.equal(automation.status,'ACCEPTED');assert.equal(automation.variables.__meta_message_status,'unknown');
  assert.equal(Number((await db.query<any>("select nextval('users_id_seq') n")).rows[0].n),21);
  assert.equal((await db.query<any>('select row_counts from greetsync_deployment_migrations')).rows[0].row_counts.contacts,1);
  assert.equal(Number((await db.query<any>("select count(*) n from pg_constraint where contype='f' and condeferrable and conrelid::regclass::text='contacts'")).rows[0].n),0);
  await assert.rejects(apply(db,createRestoreSql(data,fk,seq,target,'a'.repeat(64))),/target has rows/);
  assert.equal((await db.query('select * from users')).rows.length,1);
 }finally{await db.close();}
});

test('an invalid restored relationship rolls back all application rows and migration marker',async()=>{
 const db=await fixture();try{
  const {fk,seq}=await metadata(db);
  await assert.rejects(apply(db,createRestoreSql(extractDumpData(backup(999)),fk,seq,target,'b'.repeat(64))),/foreign key|violates/i);
  assert.equal((await db.query('select * from users')).rows.length,0);assert.equal((await db.query('select * from contacts')).rows.length,0);assert.equal((await db.query('select * from greetsync_deployment_migrations')).rows.length,0);
 }finally{await db.close();}
});

test('Supabase public API roles cannot read app data while the owning backend role still can',async()=>{
 const db=await fixture();try{
  await db.exec("CREATE TABLE public.unrelated_public_table(id int); GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon,authenticated;");
  await protectSupabaseTables(db as any);
  await db.exec("INSERT INTO users(uid,email,name) VALUES('secret-owner','owner@example.test','Owner'); SET ROLE anon");
  await assert.rejects(db.query('SELECT * FROM public.users'),/permission denied/);await assert.rejects(db.query('SELECT * FROM public.whatsapp_accounts'),/permission denied/);
  await db.query('SELECT * FROM unrelated_public_table');await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT * FROM users')).rows.length,1);
  const rows=(await db.query<any>("SELECT relrowsecurity FROM pg_class WHERE relname='users' AND relnamespace='public'::regnamespace")).rows;assert.equal(rows[0].relrowsecurity,true);
 }finally{await db.close();}
});
