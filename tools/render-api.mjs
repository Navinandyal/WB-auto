import {sleep} from './deploy-config.mjs';
export function renderApi(key,transport=fetch){
 return async(method,resource,body)=>{
  let response;
  try{response=await transport('https://api.render.com/v1/'+resource,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});}catch{throw new Error('Render API connection ended without confirmation. Check the Render Deployments page before rerunning; no deploy POST was repeated.');}
  if(!response.ok)throw new Error(`Render API returned HTTP ${response.status}. Check the configured service, API-key permissions and Render dashboard; secret request/response data is hidden.`);
  return response.status===204?null:response.json();
 };
}
export async function updateServerVariables(api,serviceId,variables){
 for(const [key,value] of Object.entries(variables))await api('PUT',`services/${serviceId}/env-vars/${encodeURIComponent(key)}`,{value:String(value)});
}
export async function waitForDeploy(api,serviceId,deployId,{pause=sleep,attempts=120,log=console.log}={}){
 if(!/^dep-[A-Za-z0-9]+$/.test(deployId||''))throw new Error('Render did not return a deploy ID. Check the dashboard; the deployment request will not be repeated automatically.');
 for(let attempt=0;attempt<attempts;attempt++){
  const deploy=await api('GET',`services/${serviceId}/deploys/${deployId}`);
  if(deploy.status==='live')return deploy;
  if(['build_failed','update_failed','pre_deploy_failed','canceled','deactivated'].includes(deploy.status))throw new Error(`Render deployment ${deploy.status}. Open its build logs. APK build was not started.`);
  if(attempt%6===0)log(`[INFO] Render deployment: ${deploy.status||'pending'}`);
  await pause(10000);
 }
 throw new Error('Render deployment is still pending. Check its dashboard before triggering another deployment.');
}
export async function verifyHealth(url,expected,{transport=fetch,pause=sleep,attempts=40}={}){
 for(let i=0;i<attempts;i++){
  try{
   const response=await transport(url+'/api/health',{signal:AbortSignal.timeout(15000),redirect:'error',headers:{'Cache-Control':'no-cache'}});
   if(response.ok){const body=await response.json();if(body.status==='ok'&&body.build===expected.build&&body.deploymentCommit===expected.commit&&body.databaseTarget===expected.fingerprint&&body.databaseProvider==='supabase')return body;}
  }catch{}
  await pause(5000);
 }
 throw new Error('The configured Render URL did not serve the expected commit, release and Supabase database. APK build stopped; an old backend is not accepted.');
}
