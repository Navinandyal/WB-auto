import test from 'node:test';import assert from 'node:assert/strict';
import {Script,createContext} from 'node:vm';import {readFileSync} from 'node:fs';import ts from 'typescript';import express from 'express';
import {renderMetaSignupBridge} from '../src/server/meta-signup-bridge.ts';
const cfg={sessionId:'fixture',appId:'100',configId:'200',apiVersion:'v26.0'};
const page=renderMetaSignupBridge(cfg,'nonce-fixture');
const code=page.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1];
function browser(hash='#token=secure-launch',stored='',scriptCode=code,responseBody?:any){
 const elements=new Map<string,any>(),timers=new Map<number,any>(),storage=new Map<string,string>(),requests:any[]=[],sdk:any[]=[];let next=0,message:any;
 if(stored)storage.set('greetsync-meta-fixture',stored);
 function element(id:string){return {id,hidden:false,disabled:false,textContent:'',className:'',children:[] as any[],appendChild(node:any){this.children.push(node);},events:{} as any,addEventListener(n:string,f:any){this.events[n]=f;},remove(){elements.delete(this.id);}};}
 for(const id of ['connectBtn','retryBtn','status','heading','intro','steps','details','accountChoices','businessName','phone','waba','phoneId'])elements.set(id,element(id));
 const c:any={URL,URLSearchParams,JSON,Error,location:{hash,pathname:'/meta/embedded-signup/start',search:'?session=fixture'},history:{replaceState(){c.location.hash='';}},
 sessionStorage:{setItem:(k:string,v:string)=>storage.set(k,v),getItem:(k:string)=>storage.get(k),removeItem:(k:string)=>storage.delete(k)},
 document:{getElementById:(id:string)=>elements.get(id)||null,createElement:()=>element(''),head:{appendChild(n:any){sdk.push(n);elements.set(n.id,n);}}},
 setTimeout:(f:any,ms:number)=>{const id=++next;timers.set(id,{f,ms});return id;},clearTimeout:(id:number)=>timers.delete(id),addEventListener:(_n:string,f:any)=>message=f,
 fetch:async(url:string,init:any)=>{requests.push({url,body:JSON.parse(init.body)});return {ok:true,json:async()=>responseBody?responseBody(url):({success:true,wabaId:'300',phoneNumberId:'400',verifiedName:'Fixture Business',displayPhoneNumber:'+919876543210'})};}};
 c.window=c;new Script(scriptCode).runInContext(createContext(c));
 return {c,elements,requests,sdk,storage,ready(){c.FB={init(o:any){assert.equal(o.appId,'100');},login(f:any,o:any){c.callback=f;c.options=o;}};c.fbAsyncInit();},click(){elements.get('connectBtn').events.click();},
 event(event='FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',origin='https://www.facebook.com'){message({origin,data:JSON.stringify({type:'WA_EMBEDDED_SIGNUP',event,data:{waba_id:'300'}})});},timer(ms:number){for(const [id,t]of timers)if(t.ms===ms){timers.delete(id);t.f();}}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('SDK-compatible CSP, script/style nonces, safe bootstrap and GreetSync-only branding',()=>{
 assert.match(page.headers['Content-Security-Policy'],/script-src[^;]+https:\/\/connect.facebook.net/);assert.match(page.headers['Content-Security-Policy'],/frame-src[^;]+www.facebook.com/);
 assert.match(page.headers['Content-Security-Policy'],/connect-src[^;]+graph.facebook.com/);assert.doesNotMatch(page.headers['Content-Security-Policy'],/unsafe-inline|unsafe-eval/);
 assert.match(page.headers['Content-Security-Policy'],/frame-src[^;]+staticxx.facebook.com/);
 assert.match(page.html,/<style nonce="nonce-fixture">/);assert.doesNotMatch(page.html,/TTwapi|appSecret|accessToken/);new Script(code);
 const dangerous=renderMetaSignupBridge({...cfg,appId:'</script><script>alert(1)</script>'},'n').html;assert.doesNotMatch(dangerous,/<script>alert/);
 new Script(dangerous.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1]);
});
test('SDK failure and timeout provide retry; successful retry enables login',()=>{
 const b=browser();assert.equal(b.elements.get('connectBtn').disabled,true);b.sdk[0].onerror();assert.equal(b.elements.get('retryBtn').hidden,false);
 b.elements.get('retryBtn').events.click();assert.equal(b.sdk.length,2);b.ready();assert.equal(b.elements.get('connectBtn').disabled,false);
 const slow=browser();slow.timer(20000);assert.match(slow.elements.get('status').textContent,/too long/);
});
for(const order of ['event-first','code-first'])test(`${order} sends code and asset hint once, then displays fetched details`,async()=>{
 const b=browser();b.ready();b.click();assert.equal(b.c.options.config_id,'200');assert.equal(b.c.options.extras.featureType,'whatsapp_business_app_onboarding');
 if(order==='event-first')b.event();b.c.callback({authResponse:{code:'auth-code'}});if(order==='code-first')b.event();await settle();b.event();
 assert.equal(b.requests.length,1);assert.equal(b.requests[0].body.launchToken,'secure-launch');assert.equal(b.requests[0].body.wabaId,'300');assert.equal(b.requests[0].body.code,'auth-code');
 assert.equal(b.elements.get('phoneId').textContent,'400');assert.equal(b.storage.size,0);
});
test('missing event delegates to safe server discovery; no invented identifiers',async()=>{
 const b=browser();b.ready();b.click();b.c.callback({authResponse:{code:'auth-code'}});b.timer(8000);await settle();assert.equal(b.requests.length,1);assert.equal(b.requests[0].body.wabaId,undefined);
});
test('foreign origin and cancellation cannot complete a signup',async()=>{
 const b=browser();b.ready();b.click();b.event('FINISH','https://facebook.com.attacker.invalid');b.c.callback({authResponse:{code:'auth-code'}});assert.equal(b.requests.length,0);
 b.event('CANCEL');b.timer(8000);await settle();assert.equal(b.requests.length,0);
});
for(const origin of ['https://evilfacebook.com','http://www.facebook.com','https://www.facebook.com:8443'])test(`untrusted lookalike origin is rejected: ${origin}`,async()=>{
 const b=browser();b.ready();b.click();b.event('FINISH',origin);b.c.callback({authResponse:{code:'code'}});await settle();assert.equal(b.requests.length,0);
});
test('Meta SDK arbiter origin is accepted with a verified callback code',async()=>{
 const b=browser();b.ready();b.click();b.event('FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING','https://staticxx.facebook.com');b.c.callback({authResponse:{code:'code'}});await settle();assert.equal(b.requests.length,1);
});
test('refresh restores per-tab token; missing token blocks SDK/login',()=>{
 const b=browser('','saved');assert.equal(b.sdk.length,1);assert.equal(b.c.location.hash,'');const missing=browser('');assert.equal(missing.sdk.length,0);assert.match(missing.elements.get('status').textContent,/missing or expired/);
});
test('cancelled login and blocked popup can retry without a second session',()=>{
 const b=browser();b.ready();b.click();b.c.callback({});assert.equal(b.elements.get('connectBtn').disabled,false);b.c.FB.login=()=>{throw new Error('blocked');};b.click();assert.match(b.elements.get('status').textContent,/popup/);
});

test('authorized-number chooser completes a second step without another Facebook login',async()=>{
 const b=browser();b.c.fetch=async(_url:string,init:any)=>{b.requests.push(JSON.parse(init.body));return {ok:true,json:async()=>b.requests.length===1?{selectionRequired:true,choices:[{wabaId:'300',phoneNumberId:'400',verifiedName:'Chosen',displayPhoneNumber:'+919876543210'}]}:{success:true,wabaId:'300',phoneNumberId:'400'}};};
 b.ready();b.click();b.c.callback({authResponse:{code:'code'}});b.event();await settle();
 const choices=b.elements.get('accountChoices');assert.equal(choices.hidden,false);assert.equal(choices.children.length,1);
 choices.children[0].events.click();await settle();assert.equal(b.requests.length,2);assert.equal(b.requests[1].phoneNumberId,'400');assert.equal(b.elements.get('heading').textContent,'Your WhatsApp is connected');
});

test('refresh resumes protected number selection without SDK or a second OAuth code',async()=>{
 const resume=renderMetaSignupBridge({...cfg,resumeSelection:true},'nonce').html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1];
 const b=browser('', 'secure-launch', resume,(url:string)=>url.endsWith('/selection')?{choices:[{wabaId:'300',phoneNumberId:'400'}]}:{success:true,wabaId:'300',phoneNumberId:'400'});
 await settle();assert.equal(b.sdk.length,0);assert.equal(b.requests[0].body.launchToken,'secure-launch');
 b.elements.get('accountChoices').children[0].events.click();await settle();assert.equal(b.requests.length,2);assert.equal(b.requests[1].body.code,'');assert.equal(b.requests[1].body.phoneNumberId,'400');
});
test('production signup route sends working SDK CSP over actual HTTP',async()=>{
 const source=ts.createSourceFile('server.ts',readFileSync(new URL('../server.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);let handler='';
 for(const n of source.statements)if(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.arguments[0]?.getText(source)==="'/meta/embedded-signup/start'")handler=n.expression.arguments[1].getText(source);
 assert.ok(handler);const output=ts.transpileModule(`(${handler})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const context=createContext({renderMetaSignupBridge,metaPlatformConfig:async()=>({...cfg,configId:'200'}),escapeHtml:String,pool:{query:async()=>({rows:[{status:'PENDING',expires_at:new Date(Date.now()+60000)}]})},Date,console});
 const app=express();app.get('/meta/embedded-signup/start',new Script(output).runInContext(context));const server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));
 try{const address=server.address() as any;const response=await fetch(`http://127.0.0.1:${address.port}/meta/embedded-signup/start?session=fixture`);assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy')!,/script-src[^;]+connect.facebook.net/);assert.match(await response.text(),/Continue with Facebook/);}
 finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
