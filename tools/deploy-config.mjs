import {createHash,createDecipheriv} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'dotenv';

export const RELEASE='render-supabase-free-20261023';
export const backendFiles=['package.json','package-lock.json','server.ts','tsconfig.json','vite.config.ts','index.html','Dockerfile','.dockerignore','render.yaml','src','public'];
export const serverSecretKeys=['AUTH_TOKEN_SECRET','CREDENTIAL_ENCRYPTION_KEY','META_PLATFORM_APP_ID','META_PLATFORM_APP_SECRET','META_EMBEDDED_SIGNUP_CONFIG_ID','META_GRAPH_API_VERSION','META_WEBHOOK_VERIFY_TOKEN','GEMINI_API_KEY','GOOGLE_API_KEY','GEMINI_TEMPLATE_MODEL','FIREBASE_SERVICE_ACCOUNT_JSON'];
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function origin(value){
 let u;try{u=new URL(value);}catch{throw new Error('Set the permanent Render HTTPS backend URL in GREETSYNC_DEPLOYMENT.json.');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!/^[A-Za-z0-9.-]+$/.test(u.hostname)||/\.railway\.app$/i.test(u.hostname))throw new Error('Use a Render/custom HTTPS origin without credentials, path, query or fragment.');
 return u.origin;
}
export function supabaseTarget(value){
 let u;try{u=new URL(value);}catch{throw new Error('Set SUPABASE_DATABASE_URL to the Supabase Session pooler connection string (port 5432).');}
 const port=Number(u.port||5432);
 if(!['postgres:','postgresql:'].includes(u.protocol)||!u.username||!u.password||!u.pathname.slice(1)||!/(?:\.pooler\.supabase\.com|\.supabase\.co)$/.test(u.hostname)||port!==5432)throw new Error('Use the Supabase Session pooler on port 5432 (or a reachable direct connection). Transaction pooler port 6543 and Railway URLs are not accepted.');
 for(const key of u.searchParams.keys())if(!['sslmode','application_name'].includes(key))throw new Error('Remove connection routing overrides from the Supabase URL.');
 if(u.searchParams.has('sslmode')&&!['require','verify-ca','verify-full'].includes(u.searchParams.get('sslmode')))throw new Error('Supabase connections must use SSL.');
 const user=decodeURIComponent(u.username),database=decodeURIComponent(u.pathname.slice(1));
 const fingerprint=hash(`${user}@${u.hostname}:${port}/${database}`);
 // Let node-postgres receive SSL explicitly rather than URL sslmode overriding it.
 u.searchParams.delete('sslmode');
 return {url:u.toString(),host:u.hostname,port,user,password:decodeURIComponent(u.password),database,fingerprint};
}
export function validateService(service,config){
 if(service.id!==config.serviceId||service.type!=='web_service'||(service.suspended==='suspended'||service.suspended===true))throw new Error('Render service must be the configured, active web service.');
 const details=service.serviceDetails||{};
 if(!details.plan)throw new Error('Render did not report this service instance plan. Check the configured service.');
 if(details.env!=='docker')throw new Error('Configure this Render service with Docker runtime and the supplied Dockerfile.');
 if(service.rootDir)throw new Error('Use a dedicated backend repository with an empty Render Root Directory.');
 if(!service.repo||!service.branch)throw new Error('Connect the Render service to a Git repository and branch first.');
 if(origin(details.url)!==origin(config.backendUrl)&&config.customDomainVerified!==true)throw new Error('Configured backend URL differs from Render service URL. Verify the custom domain and set customDomainVerified only if intended.');
 if(!/^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[^\s?#]+$/i.test(service.repo))throw new Error('Render must use a credential-free HTTPS Git repository URL. Git authentication is handled by your credential manager.');
 if(!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(service.branch)||service.branch.includes('..')||service.branch.includes('//'))throw new Error('Render repository branch name is not supported by this setup.');
 return service;
}
export function preservedSecrets(local){
 const secrets=Object.fromEntries(serverSecretKeys.filter(key=>String(local[key]||'').trim()).map(key=>[key,local[key]]));
 if(!secrets.AUTH_TOKEN_SECRET||!secrets.CREDENTIAL_ENCRYPTION_KEY)throw new Error('Copy the EXISTING AUTH_TOKEN_SECRET and CREDENTIAL_ENCRYPTION_KEY from the old backend into your private configuration. Do not generate replacements for imported encrypted data.');
 if(secrets.AUTH_TOKEN_SECRET.length<24||secrets.CREDENTIAL_ENCRYPTION_KEY.length<24)throw new Error('The existing authentication/encryption keys are unexpectedly short. Check the copied values.');
 return secrets;
}
export function verifyBackupEncryption(sql,secret){
 const values=new Set(sql.match(/enc:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+/g)||[]);
 for(const value of values){
  try{
   const [, ,iv,tag,data]=value.split(':');
   const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),Buffer.from(iv,'base64url'));
   decipher.setAuthTag(Buffer.from(tag,'base64url'));Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]);
  }catch{throw new Error('The existing encryption key cannot decrypt this backup. Import stopped before writing contact/account data. Copy the original effective encryption key.');}
 }
 return values.size;
}
export async function atomicWrite(file,content){
 await mkdir(path.dirname(file),{recursive:true});const temporary=file+'.tmp';await writeFile(temporary,content,{mode:0o600});await rename(temporary,file);
}
export async function loadConfiguration(root,environment=process.env){
 const readEnv=async name=>{try{return parse(await readFile(path.join(root,name)));}catch(e){if(e.code==='ENOENT')return {};throw e;}};
 const old=await readEnv('.env'),current=await readEnv('GREETSYNC_RENDER.local.env');
 const local={...old,...current};
 // Explicit deployment credentials only; never reuse old DATABASE_URL or SQL_*.
 for(const key of ['RENDER_API_KEY','SUPABASE_DATABASE_URL','DATABASE_RESTORE_FILE','POSTGRES_BIN','MIGRATION_SOURCE_STOPPED'])if(environment[key])local[key]=environment[key];
 const config=JSON.parse(await readFile(path.join(root,'GREETSYNC_DEPLOYMENT.json'),'utf8'));
 if(config.provider!=='render'||config.databaseProvider!=='supabase'||!/^srv-[A-Za-z0-9]+$/.test(config.serviceId||''))throw new Error('Configure Render serviceId and backendUrl in GREETSYNC_DEPLOYMENT.json once. See RENDER_SUPABASE_START_HERE.md.');
 config.backendUrl=origin(config.backendUrl);
 if(!String(local.RENDER_API_KEY||'').trim())throw new Error('Set RENDER_API_KEY in GREETSYNC_RENDER.local.env once.');
 const target=supabaseTarget(local.SUPABASE_DATABASE_URL);
 return {root,config,local,target,secrets:preservedSecrets(local)};
}
export function serverEnvironment(state,commit){
 const {target,config,secrets}=state;
 return {...secrets,NODE_ENV:'production',DATABASE_PROVIDER:'supabase',DATABASE_URL:target.url,DATABASE_SSL:'true',
 DATABASE_TARGET_HOST:target.host,DATABASE_TARGET_PORT:String(target.port),DATABASE_TARGET_NAME:target.database,DATABASE_TARGET_USER:target.user,
 DATABASE_TARGET_FINGERPRINT:target.fingerprint,PUBLIC_BASE_URL:config.backendUrl,META_PUBLIC_BASE_URL:config.backendUrl,APP_URL:config.backendUrl,
 DEPLOY_COMMIT:commit};
}
export function postgresEnvironment(target,environment=process.env){
 const result=Object.fromEntries(Object.entries(environment).filter(([key])=>!key.startsWith('PG')));
 return {...result,PGHOST:target.host,PGPORT:String(target.port),PGUSER:target.user,PGPASSWORD:target.password,PGDATABASE:target.database,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20'};
}
