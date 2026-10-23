// Bump this version whenever schema or table-access protection changes.
export const preparedSchemaVersion='greetsync-auth-data-20261023-v1';
export async function hasPreparedSchema(client:{query:(...args:any[])=>Promise<any>},env=process.env):Promise<boolean>{
 if(env.NODE_ENV!=='production'||env.DATABASE_PROVIDER!=='supabase'||!env.DEPLOY_COMMIT||env.DEPLOY_COMMIT==='pending'||!env.DATABASE_TARGET_FINGERPRINT)return false;
 try{
  const result=await client.query("SELECT schema_version,target_fingerprint FROM public.greetsync_deployment_migrations WHERE id='railway_to_supabase'");
  return result.rows[0]?.schema_version===preparedSchemaVersion && result.rows[0]?.target_fingerprint===env.DATABASE_TARGET_FINGERPRINT;
 }catch{return false;}
}
export async function markPreparedSchema(client:{query:(...args:any[])=>Promise<any>},env=process.env){
 if(env.DATABASE_PROVIDER!=='supabase')return;
 const result=await client.query("UPDATE public.greetsync_deployment_migrations SET schema_version=$1 WHERE id='railway_to_supabase' AND target_fingerprint=$2 RETURNING id",[preparedSchemaVersion,env.DATABASE_TARGET_FINGERPRINT]);
 if(result.rows.length!==1)throw new Error('Completed migration marker for this Supabase target is required before marking schema ready.');
}
