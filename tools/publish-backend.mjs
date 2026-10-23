import {mkdtemp,rm,cp,readFile,readdir,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {backendFiles} from './deploy-config.mjs';

async function scan(directory,secrets){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  if(entry.name==='.git')continue;
  const file=path.join(directory,entry.name);
  if(entry.isSymbolicLink())throw new Error('A symbolic link was found in deployment source.');
  if(entry.isDirectory()){await scan(file,secrets);continue;}
  const bytes=await readFile(file);
  if(secrets.some(secret=>secret?.length>=8&&bytes.includes(Buffer.from(secret))))throw new Error('A private credential was found in deployment source. Publishing stopped.');
 }
}
export async function publishBackend(state,service,run){
 const parent=await mkdtemp(path.join(os.tmpdir(),'greetsync-deploy-'));const repository=path.join(parent,'repo');
 try{
  // Isolated clone: user's checkout, branches and history are never reset/force-pushed.
  await run('git',['clone','--depth=1','--single-branch','--branch',service.branch,'--',service.repo,repository]);
  const copied=[];
  for(const name of backendFiles){
   const source=path.join(state.root,name);
   try{await stat(source);}catch(e){if(e.code==='ENOENT'&&['public'].includes(name))continue;throw e;}
   const destination=path.join(repository,name);
   await rm(destination,{recursive:true,force:true});
   await cp(source,destination,{recursive:true,dereference:false});copied.push(name);
  }
  for(const name of copied){
   const p=path.join(repository,name),s=await stat(p);
   if(s.isDirectory())await scan(p,[...Object.values(state.secrets),state.local.RENDER_API_KEY,state.target.password]);
   else{const b=await readFile(p);if([...Object.values(state.secrets),state.local.RENDER_API_KEY,state.target.password].some(v=>v?.length>=8&&b.includes(Buffer.from(v))))throw new Error('Private credential detected in deployment source.');}
  }
  await run('git',['add','--',...copied],{cwd:repository});
  const status=await run('git',['diff','--cached','--quiet'],{cwd:repository,allowCodes:[0,1],quiet:true});
  if(status.code===1)await run('git',['-c','user.name=GreetSync deployment','-c','user.email=deployment@localhost','commit','-m','Deploy GreetSync backend'],{cwd:repository});
  const commit=(await run('git',['rev-parse','HEAD'],{cwd:repository,quiet:true})).stdout.trim();
  if(!/^[0-9a-f]{40,64}$/.test(commit))throw new Error('Git did not return a valid commit.');
  await run('git',['push','origin',`HEAD:refs/heads/${service.branch}`],{cwd:repository});
  return commit;
 }finally{await rm(parent,{recursive:true,force:true});}
}
