import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {hash,verifyBackupEncryption,postgresEnvironment} from './deploy-config.mjs';

export const tables=['users','password_reset_requests','refresh_sessions','biometric_credentials','whatsapp_accounts','platform_meta_settings','meta_embedded_signup_sessions','contacts','contact_groups','contact_group_members','message_templates','automations','message_media','meta_webhook_inbox','push_devices','messages','automation_executions','notifications','subscription_packages','user_subscriptions','template_suggestions','audit_logs'];
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const literal=s=>"'"+s.replaceAll("'","''")+"'";
export const pgClient=target=>new pg.Client({connectionString:target.url,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:20000});

/** Extract pg_dump COPY blocks and numeric sequence state, never execute dumped
 * role/schema/ownership/DDL or psql commands. Current app migrations own the schema. */
export function extractDumpData(text){
 if(text.includes('\u0000'))throw new Error('Backup must be UTF-8 SQL or a custom pg_dump archive, not UTF-16 text.');
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/),blocks=[],counts={},sequences=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  const copy=line.match(/^COPY\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s+\(([^)]+)\)\s+FROM stdin;\s*$/);
  if(copy){
   const name=copy[1];
   if(!tables.includes(name))throw new Error(`Backup contains an unrecognised table (${name}); review it before migrating.`);
   if(!/^\s*"?[a-z_][a-z0-9_]*"?(?:\s*,\s*"?[a-z_][a-z0-9_]*"?)*\s*$/.test(copy[2]))throw new Error('Unsupported COPY column list in backup.');
   if(name in counts)throw new Error(`Backup repeats table ${name}.`);
   const block=[`COPY public.${quote(name)} (${copy[2]}) FROM stdin;`];let rows=0,closed=false;
   while(++i<lines.length){block.push(lines[i]);if(lines[i]==='\\.'){closed=true;break;}rows++;}
   if(!closed)throw new Error(`Incomplete COPY block for ${name}.`);
   blocks.push(block.join('\n'));counts[name]=rows;
  }else if(/^COPY\s/i.test(line)||/^INSERT\s+INTO\s/i.test(line)){
   throw new Error('Use a standard pg_dump COPY-format SQL file or a custom-format archive. INSERT-format/non-public dumps require conversion first.');
  }else{
   const sequence=line.match(/^SELECT pg_catalog\.setval\('(?:public\.)?([a-z_][a-z0-9_]*)', (\d+), (true|false)\);\s*$/);
   if(sequence)sequences.push({name:sequence[1],value:sequence[2],called:sequence[3]});
  }
 }
 if(!/^-- PostgreSQL database dump complete\s*$/m.test(text))throw new Error('Backup has no pg_dump completion footer; it may be incomplete.');
 if(!blocks.length||!['users','contacts','message_templates','automations'].every(name=>name in counts))throw new Error('Required GreetSync COPY blocks were not found. Supply a complete UTF-8 pg_dump backup.');
 return {blocks,counts,sequences};
}
export function createRestoreSql(data,foreignKeys,serials,target,checksum){
 const names=tables.map(literal).join(',');
 const begin=`BEGIN;\nSELECT pg_advisory_xact_lock(68751,1);\nDO $guard$ DECLARE name text; n bigint; BEGIN FOR name IN SELECT unnest(ARRAY[${names}]) LOOP EXECUTE format('SELECT count(*) FROM public.%I',name) INTO n; IF n>0 THEN RAISE EXCEPTION 'GreetSync target has rows; restore refused'; END IF; END LOOP; END $guard$;`;
 const defer=foreignKeys.map(f=>`ALTER TABLE public.${quote(f.table_name)} ALTER CONSTRAINT ${quote(f.constraint_name)} DEFERRABLE INITIALLY DEFERRED;`).join('\n');
 const restoreFk=foreignKeys.map(f=>`ALTER TABLE public.${quote(f.table_name)} ALTER CONSTRAINT ${quote(f.constraint_name)} ${f.condeferrable?'DEFERRABLE INITIALLY '+(f.condeferred?'DEFERRED':'IMMEDIATE'):'NOT DEFERRABLE'};`).join('\n');
 const known=new Set(serials.map(s=>s.sequence_name));
 const sequences=data.sequences.filter(s=>known.has(s.name)).map(s=>`SELECT pg_catalog.setval(${literal('public.'+s.name)}, ${s.value}, ${s.called});`).join('\n');
 const ensureSequences=serials.map(s=>`SELECT setval(${literal('public.'+s.sequence_name)}::regclass, GREATEST(COALESCE((SELECT MAX(${quote(s.column_name)}) FROM public.${quote(s.table_name)}),1),(SELECT last_value FROM public.${quote(s.sequence_name)})), (SELECT is_called FROM public.${quote(s.sequence_name)}) OR EXISTS(SELECT 1 FROM public.${quote(s.table_name)}));`).join('\n');
 const verify=data.counts&&Object.entries(data.counts).map(([name,count])=>`IF (SELECT count(*) FROM public.${quote(name)}) <> ${count} THEN RAISE EXCEPTION 'Row count mismatch for ${name}'; END IF;`).join('\n');
 return [begin,defer,'SET CONSTRAINTS ALL DEFERRED;',...data.blocks,sequences,ensureSequences,
  `DO $verify$ BEGIN ${verify} END $verify$;`,'SET CONSTRAINTS ALL IMMEDIATE;',restoreFk,
  // Old in-flight attempts must not be blindly replayed on the new provider.
  `UPDATE public.automations SET status='ACCEPTED',variables=COALESCE(variables,'{}'::jsonb)||jsonb_build_object('__meta_message_status','unknown','__delivery_note','In-flight at database cutover. Check the recipient and delivery updates before another attempt.'),error_message='In-flight at database cutover; delivery needs reconciliation.' WHERE status='PROCESSING';`,
  `UPDATE public.platform_meta_settings SET public_base_url=${literal(target.backendUrl)} WHERE id=1;`,
  `INSERT INTO public.greetsync_deployment_migrations(id,backup_sha256,target_fingerprint,row_counts) VALUES('railway_to_supabase',${literal(checksum)},${literal(target.fingerprint)},${literal(JSON.stringify(data.counts))}::jsonb);`,
  'COMMIT;'].join('\n')+'\n';
}
export async function migrationState(client){
 const exists=await client.query("SELECT to_regclass('public.greetsync_deployment_migrations') AS name");
 if(!exists.rows[0]?.name)return null;
 return (await client.query("SELECT * FROM public.greetsync_deployment_migrations WHERE id='railway_to_supabase'")).rows[0]||null;
}
export async function restoreBackup(state,run,findPostgres,log=console.log){
 const client=pgClient(state.target);await client.connect();
 let temporary;
 try{
  const done=await migrationState(client);
  if(done){
   if(done.target_fingerprint!==state.target.fingerprint)throw new Error('Migration target identity does not match this Supabase project.');
   if(state.local.DATABASE_RESTORE_FILE){
    try{const file=await readFile(path.resolve(state.root,state.local.DATABASE_RESTORE_FILE));if(hash(file)!==done.backup_sha256)throw new Error('A different backup is configured after migration. Existing data will not be replaced.');}catch(e){if(e.code!=='ENOENT')throw e;}
   }
   log('[OK] Supabase import already completed; existing data retained.');return;
  }
  if(state.local.MIGRATION_SOURCE_STOPPED!=='true')throw new Error('Before the first restore, stop the old Railway backend/worker and take the final backup. Then set MIGRATION_SOURCE_STOPPED=true in your private configuration to prevent duplicate sends.');
  const file=state.local.DATABASE_RESTORE_FILE;
  if(!file)throw new Error('Set DATABASE_RESTORE_FILE to your Railway PostgreSQL backup path. No empty replacement database will be deployed.');
  const bytes=await readFile(path.resolve(state.root,file));const checksum=hash(bytes);
  temporary=await mkdtemp(path.join(os.tmpdir(),'greetsync-restore-'));
  const postgres=await findPostgres(state.local.POSTGRES_BIN);
  let text;
  if(bytes.subarray(0,5).toString()==='PGDMP'){
   const decoded=path.join(temporary,'data.sql');
   await run(postgres.pg_restore,['--data-only','--no-owner','--no-privileges','--no-comments','--schema=public','--file='+decoded,path.resolve(state.root,file)],{quiet:true});
   text=await readFile(decoded,'utf8');
  }else{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  const data=extractDumpData(text);verifyBackupEncryption(text,state.secrets.CREDENTIAL_ENCRYPTION_KEY);
  for(const [table,count] of Object.entries(data.counts)){
   const columns=await client.query('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1',[table]);
   if(!columns.rows.length)throw new Error(`Initialize the current GreetSync schema before restoring ${table}.`);
  }
  const foreignKeys=(await client.query(`SELECT c.conname AS constraint_name,t.relname AS table_name,c.condeferrable,c.condeferred FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE c.contype='f' AND n.nspname='public' AND t.relname=ANY($1)`,[tables])).rows;
  const serials=(await client.query(`SELECT t.relname AS table_name,a.attname AS column_name,s.relname AS sequence_name FROM pg_class s JOIN pg_namespace ns ON ns.oid=s.relnamespace JOIN pg_depend d ON d.objid=s.oid AND d.deptype='a' JOIN pg_class t ON t.oid=d.refobjid JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid WHERE s.relkind='S' AND ns.nspname='public' AND t.relname=ANY($1)`,[tables])).rows;
  const script=path.join(temporary,'restore.sql');
  await writeFile(script,createRestoreSql(data,foreignKeys,serials,{...state.target,backendUrl:state.config.backendUrl},checksum),{mode:0o600});
  await run(postgres.psql,['-X','--set=ON_ERROR_STOP=1','--file='+script],{env:postgresEnvironment(state.target),quiet:true});
  const marker=await migrationState(client);if(marker?.backup_sha256!==checksum)throw new Error('Restore completion could not be verified. Deployment stopped.');
  log(`[OK] Backup restored transactionally; ${Object.values(data.counts).reduce((a,b)=>a+b,0)} rows across ${Object.keys(data.counts).length} tables verified.`);
 }finally{await client.end();if(temporary)await rm(temporary,{recursive:true,force:true});}
}
