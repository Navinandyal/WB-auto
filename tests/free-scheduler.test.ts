import test from 'node:test';
import assert from 'node:assert/strict';
import {schedulerToken,schedulerAuthorized} from '../src/server/scheduler-auth.ts';
import {schedulerSettings,installScheduler} from '../tools/supabase-scheduler.mjs';
const state:any={config:{serviceId:'srv-fixture',backendUrl:'https://fixture.onrender.com'},secrets:{AUTH_TOKEN_SECRET:'fixture-auth-secret-at-least-24-characters'},target:{}};
test('wake authentication rejects absent, malformed, wrong and login tokens; purpose token matches scheduler',()=>{
 const token=schedulerToken(state.secrets.AUTH_TOKEN_SECRET);
 assert.equal(token,schedulerSettings(state).token);
 assert.equal(schedulerAuthorized('Bearer '+token,state.secrets.AUTH_TOKEN_SECRET),true);
 for(const value of [undefined,'Bearer '+state.secrets.AUTH_TOKEN_SECRET,'Bearer '+token+'x','Bearer '+'0'.repeat(64),['Bearer '+token]])assert.equal(schedulerAuthorized(value,state.secrets.AUTH_TOKEN_SECRET),false);
 assert.equal(schedulerAuthorized('Bearer '+token,undefined),false);
 assert.notEqual(token,schedulerToken(state.secrets.AUTH_TOKEN_SECRET+'changed'));
});
test('wake command uses Vault lookup and cold-start timeout, permits idle sleep and prevents secret/URL injection',()=>{
 const settings=schedulerSettings(state);
 assert.equal(settings.schedule,'*/20 * * * *');assert.match(settings.command,/timeout_milliseconds := 120000/);
 assert.ok(!settings.command.includes(settings.token));assert.ok(!settings.command.includes(state.secrets.AUTH_TOKEN_SECRET));
 assert.match(settings.command,/vault.decrypted_secrets/);
 assert.throws(()=>schedulerSettings({...state,config:{...state.config,backendUrl:'https://fixture.onrender.com/path'}}));
 assert.throws(()=>schedulerSettings({...state,config:{...state.config,serviceId:"srv-x';DROP"}}));
});
test('scheduler setup updates its existing Vault secret and named job, with rollback and redacted failure',async()=>{
 const calls:any[]=[];const settings=schedulerSettings(state);
 const client={connect:async()=>{},end:async()=>{},query:async(sql:string,args?:any[])=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT id FROM vault'))return {rows:[{id:'fixture-id'}]};
  if(sql.startsWith('SELECT jobid'))return {rows:[{jobid:1,active:true,schedule:settings.schedule,command:settings.command}]};
  return {rows:[]};
 }};
 await installScheduler(state,{client:(()=>client) as any,log:()=>{}});
 assert.ok(calls.some(c=>c.sql.startsWith('SELECT vault.update_secret')));
 assert.equal(calls.filter(c=>c.sql.startsWith('SELECT cron.schedule')).length,1);
 assert.equal(calls.at(-1).sql,'COMMIT');
 const failures:string[]=[];
 await assert.rejects(installScheduler(state,{client:(()=>({...client,query:async(sql:string)=>{failures.push(sql);if(sql.startsWith('CREATE EXTENSION'))throw new Error('private-password');return {rows:[]};}})) as any,log:()=>{}}),error=>String(error).includes('Enable Cron')&&!String(error).includes('private-password'));
 assert.equal(failures.at(-1),'ROLLBACK');
});
