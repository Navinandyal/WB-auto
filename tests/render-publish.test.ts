import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {publishBackend} from '../tools/publish-backend.mjs';
import {backendFiles} from '../tools/deploy-config.mjs';
import {runCommand} from '../tools/deploy-production.mjs';

test('automatic Git publish sends only backend files, retains existing history and blocks embedded private credentials',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'greetsync-publish-test-'));
 try{
  const bare=path.join(root,'remote.git'),seed=path.join(root,'seed'),source=path.join(root,'source');
  const run=(file:string,args:string[],opts:any={})=>runCommand(file,args,{...opts,quiet:true});
  await run('git',['init','--bare',bare]);await run('git',['clone',bare,seed]);
  await run('git',['checkout','-b','main'],{cwd:seed});await writeFile(path.join(seed,'README.md'),'Existing repository history');
  await run('git',['add','README.md'],{cwd:seed});await run('git',['-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-m','Initial'],{cwd:seed});await run('git',['push','origin','main'],{cwd:seed});
  await mkdir(source);for(const name of backendFiles){
   const file=path.join(source,name);
   if(['src','public'].includes(name)){await mkdir(file);await writeFile(path.join(file,'source.txt'),'Backend fixture');}
   else await writeFile(file,'Backend fixture');
  }
  await mkdir(path.join(source,'mobile'));await writeFile(path.join(source,'mobile','private.txt'),'Not deployed');
  await writeFile(path.join(source,'.env'),'PASSWORD=fixture-secret');await writeFile(path.join(source,'GREETSYNC_RENDER.local.env'),'RENDER_API_KEY=fixture-render-secret');
  const state:any={root:source,secrets:{AUTH_TOKEN_SECRET:'fixture-auth-value'},local:{RENDER_API_KEY:'fixture-render-secret'},target:{password:'fixture-db-password'}};
  const service={repo:'https://github.com/fixture/only-backend',branch:'main'};
  const localGit=(file:string,args:string[],opts:any={})=>run(file,args.map(a=>a===service.repo?bare:a),opts);
  const commit=await publishBackend(state,service,localGit);
  assert.match(commit,/^[0-9a-f]{40}$/);
  const files=(await run('git',['--git-dir='+bare,'ls-tree','--name-only','-r','main'])).stdout;
  assert.ok(files.includes('README.md'));assert.ok(files.includes('server.ts'));assert.ok(!files.includes('mobile/'));assert.ok(!files.includes('.env'));assert.ok(!files.includes('GREETSYNC_RENDER.local.env'));
  const before=(await run('git',['--git-dir='+bare,'rev-parse','main'])).stdout.trim();
  await writeFile(path.join(source,'src','accidental-key.txt'),'fixture-render-secret');
  await assert.rejects(publishBackend(state,service,localGit),/private credential/i);
  assert.equal((await run('git',['--git-dir='+bare,'rev-parse','main'])).stdout.trim(),before);
 }finally{await rm(root,{recursive:true,force:true});}
});
