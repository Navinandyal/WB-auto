import {installScheduler} from './supabase-scheduler.mjs';
import {spawn} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadConfiguration,serverEnvironment,RELEASE,atomicWrite,serverSecretKeys} from './deploy-config.mjs';
import {renderApi,updateServerVariables,waitForDeploy,verifyHealth} from './render-api.mjs';
import {publishBackend} from './publish-backend.mjs';
import {restoreBackup,pgClient,migrationState} from './database-transfer.mjs';

export async function runCommand(file,args,{cwd=process.cwd(),env=process.env,quiet=false,allowCodes=[0]}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(file,args,{cwd,env,shell:false,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stdout='';
  child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(!quiet)process.stdout.write(chunk);});
  child.stderr.on('data',chunk=>{if(!quiet)process.stderr.write(chunk);});
  child.on('error',()=>reject(new Error(`Could not start ${path.basename(file)}. Install the required tool and check PATH.`)));
  child.on('close',code=>allowCodes.includes(code)?resolve({code,stdout}):reject(new Error(`${path.basename(file)} failed with exit code ${code}. ${quiet?'Output hidden to protect database/secret values.':'Read the output above.'}`)));
 });
}
export async function findPostgres(configured){
 const candidates=[];
 if(configured)candidates.push(configured);
 if(process.platform==='win32'){
  const root=path.join(process.env.ProgramFiles||'C:\\Program Files','PostgreSQL');
  try{const versions=(await readdir(root)).filter(x=>/^\d+$/.test(x)).sort((a,b)=>Number(b)-Number(a));for(const version of versions)candidates.push(path.join(root,version,'bin'));}catch{}
 }
 candidates.push('');
 for(const directory of candidates){
  const tool=name=>directory?path.join(directory,name+(process.platform==='win32'?'.exe':'')):name;
  try{await runCommand(tool('psql'),['--version'],{quiet:true});await runCommand(tool('pg_restore'),['--version'],{quiet:true});return {psql:tool('psql'),pg_restore:tool('pg_restore')};}catch{}
 }
 throw new Error('Install PostgreSQL client tools (psql and pg_restore), or set POSTGRES_BIN to their bin directory. Windows PostgreSQL 18 is detected automatically.');
}
export async function executeWorkflow(state,options,deps){
 const {api,native,publish,restore,verify,save,log=console.log}=deps;
 if(options.skipDeploy){
  const client=deps.client(state.target);await client.connect();try{const marker=await migrationState(client);if(!marker||marker.target_fingerprint!==state.target.fingerprint)throw new Error('Supabase migration has not completed for this target. Run the full setup first.');}finally{await client.end();}
  const {validateService}=await import('./deploy-config.mjs');
  validateService(await api('GET',`services/${state.config.serviceId}`),state.config);
  const commit=state.config.lastCommit;
  if(!commit)throw new Error('No saved successful Render commit exists. Run full setup first.');
  await verify(state.config.backendUrl,{build:RELEASE,commit,fingerprint:state.target.fingerprint});
 }else{
  const {validateService}=await import('./deploy-config.mjs');
  const service=validateService(await api('GET',`services/${state.config.serviceId}`),state.config);
  await native('Backend');
  await native('Schema');
  await restore(state);
  await native('Migrate');
  // Disable automatic Git deploys before publishing so variables/commit are verified together.
  await api('PATCH',`services/${service.id}`,{autoDeployTrigger:'off'});
  const commit=await publish(state,service);
  await updateServerVariables(api,service.id,serverEnvironment(state,commit));
  const result=await api('POST',`services/${service.id}/deploys`,{commitId:commit,clearCache:'do_not_clear'});
  await deps.wait(api,service.id,result.id);
  await verify(state.config.backendUrl,{build:RELEASE,commit,fingerprint:state.target.fingerprint});
  state.config.lastCommit=commit;
 }
 if(deps.scheduler)await deps.scheduler(state);
 await save(state);
 if(!options.skipApk)await native('Apk',state.config.backendUrl);
 log(`[OK] Backend: ${state.config.backendUrl}`);
 log(`[OK] Meta webhook: ${state.config.backendUrl}/api/webhooks/whatsapp`);
 log(`[OK] Meta signup callback: ${state.config.backendUrl}/meta/embedded-signup/callback`);
 log(options.skipApk?'[INFO] APK skipped by explicit option.':'[OK] GreetSync-production.apk built and verified.');
}
export async function main(root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),args=process.argv.slice(2)){
 const state=await loadConfiguration(root);
 const {target}=state;
 const env={...process.env,...serverEnvironment(state,'pending')};
 const native=async(action,url)=>{
  if(process.platform==='win32')return runCommand('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'tools','production-native.ps1'),'-Action',action,...(url?['-BackendUrl',url]:[])],{cwd:root,env});
  if(action==='Apk')throw new Error('Use RUN_PRODUCTION_SETUP.cmd on Windows for the Android build. The macOS/iOS build commands remain available.');
  const tasks={Backend:['lint','build'],Schema:['db:prepare-supabase'],Migrate:['db:migrate']}[action];
  for(const task of tasks)await runCommand('npm',['run',task],{cwd:root,env});
 };
 const save=async s=>{
  await atomicWrite(path.join(root,'GREETSYNC_DEPLOYMENT.json'),JSON.stringify(s.config,null,2)+'\n');
  await atomicWrite(path.join(root,'mobile/lib/core/backend_defaults.dart'),`// Updated only after the exact Render release and Supabase target are verified.\nconst defaultApiBaseUrl = '${s.config.backendUrl}';\n`);
  const secretFile=path.join(root,'.env');let text='';try{text=await readFile(secretFile,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  const changes=serverEnvironment(s,s.config.lastCommit);
  for(const key of [...serverSecretKeys,'DATABASE_URL','DATABASE_SSL','DATABASE_PROVIDER','DATABASE_TARGET_HOST','DATABASE_TARGET_PORT','DATABASE_TARGET_NAME','DATABASE_TARGET_USER','DATABASE_TARGET_FINGERPRINT','PUBLIC_BASE_URL','META_PUBLIC_BASE_URL','APP_URL']){
   if(changes[key]===undefined)continue;
   const line=`${key}=${JSON.stringify(changes[key])}`;const pattern=new RegExp('^\\s*'+key+'\\s*=.*$','gm');text=pattern.test(text)?text.replace(pattern,()=>line):text+'\n'+line;
  }
  await atomicWrite(secretFile,text+'\n');
  await atomicWrite(path.join(root,'PRODUCTION_DEPLOYMENT_INFO.txt'),`Backend: ${s.config.backendUrl}\nMeta webhook: ${s.config.backendUrl}/api/webhooks/whatsapp\nMeta callback: ${s.config.backendUrl}/meta/embedded-signup/callback\nUpdate the Meta app allowed domains and OAuth redirect URI to these new addresses. Existing Railway URLs are not forwarded by this project.\n`);
 };
 await executeWorkflow(state,{skipDeploy:args.includes('--skip-render-deploy'),skipApk:args.includes('--skip-apk')},{api:renderApi(state.local.RENDER_API_KEY),native,publish:(s,service)=>publishBackend(s,service,runCommand),restore:s=>restoreBackup(s,runCommand,findPostgres),verify:verifyHealth,wait:waitForDeploy,client:pgClient,scheduler:installScheduler,save});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){main().catch(error=>{console.error('[ERROR]',error.message);process.exitCode=1;});}
