import {createHmac} from 'node:crypto';
import {origin} from './deploy-config.mjs';
import {pgClient} from './database-transfer.mjs';

export function schedulerSettings(state){
 const url=origin(state.config.backendUrl)+'/api/internal/scheduler/wake';
 if(!/^srv-[A-Za-z0-9]+$/.test(state.config.serviceId))throw new Error('Invalid Render service ID for scheduler.');
 const key=state.secrets.AUTH_TOKEN_SECRET;
 if(!key||key.length<24)throw new Error('Original authentication key is required for scheduler setup.');
 const name='greetsync-wake-'+state.config.serviceId;
 const token=createHmac('sha256',key).update('greetsync:supabase-wake:v1').digest('hex');
 const literal=value=>"'"+value.replaceAll("'","''")+"'";
 // Cron contains only a Vault lookup, never the actual secret. Deliberately
 // 20 minutes so an idle Render instance can sleep after its 15-minute window.
 const command=`SELECT net.http_post(url := ${literal(url)}, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=${literal(name)})), body := '{}'::jsonb, timeout_milliseconds := 120000);`;
 return {name,token,command,schedule:'*/20 * * * *',url};
}
export async function installScheduler(state,{client=pgClient,log=console.log}={}){
 const settings=schedulerSettings(state),connection=client(state.target);
 await connection.connect();
 try{
  await connection.query('BEGIN');
  await connection.query('SELECT pg_advisory_xact_lock(187654, 2301)');
  await connection.query('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog');
  await connection.query('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions');
  await connection.query('CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault');
  const existing=await connection.query('SELECT id FROM vault.secrets WHERE name=$1',[settings.name]);
  if(existing.rows.length)await connection.query('SELECT vault.update_secret($1::uuid,$2::text)',[existing.rows[0].id,settings.token]);
  else await connection.query('SELECT vault.create_secret($1::text,$2::text,$3::text)',[settings.token,settings.name,'GreetSync Render scheduler authorization']);
  await connection.query('SELECT cron.schedule($1::text,$2::text,$3::text)',[settings.name,settings.schedule,settings.command]);
  const job=await connection.query('SELECT jobid,active,schedule,command FROM cron.job WHERE jobname=$1 AND username=current_user',[settings.name]);
  if(job.rows.length!==1||!job.rows[0].active||job.rows[0].schedule!==settings.schedule||job.rows[0].command!==settings.command)throw new Error('Scheduler job verification failed.');
  await connection.query('COMMIT');
  log('[OK] Supabase scheduler installed: every 20 minutes. Free Render may sleep after 15 idle minutes; delivery can be delayed by 20 minutes plus startup/queue time.');
 }catch(error){
  await connection.query('ROLLBACK').catch(()=>{});
  throw new Error('Supabase scheduler setup failed. Enable Cron (pg_cron), pg_net and Vault in the Supabase dashboard and use the owning postgres connection, then rerun. APK was not rebuilt. Database data was not replaced.');
 }finally{await connection.end();}
}
