import {randomBytes} from 'node:crypto';
function js(value:unknown){return JSON.stringify(String(value||'')).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
export function metaSignupBridgeHeaders(nonce:string){
  return {
    'Cache-Control':'no-store, no-cache, must-revalidate, private',
    'Pragma':'no-cache','Referrer-Policy':'strict-origin-when-cross-origin','X-Content-Type-Options':'nosniff',
    'Cross-Origin-Opener-Policy':'same-origin-allow-popups',
    'Content-Security-Policy':`default-src 'self'; script-src 'self' 'nonce-${nonce}' https://connect.facebook.net https://staticxx.facebook.com https://*.fbcdn.net; connect-src 'self' https://connect.facebook.net https://www.facebook.com https://web.facebook.com https://graph.facebook.com https://staticxx.facebook.com; frame-src https://www.facebook.com https://web.facebook.com https://m.facebook.com https://business.facebook.com https://staticxx.facebook.com; img-src 'self' data: https://*.facebook.com https://*.fbcdn.net; style-src 'self' 'nonce-${nonce}'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://www.facebook.com https://web.facebook.com;`,
  };
}
export function renderMetaSignupBridge(config:{sessionId:string;appId:string;configId:string;apiVersion:string;resumeSelection?:boolean},nonce=randomBytes(18).toString('base64')){
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect your WhatsApp — GreetSync</title>
<style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#f3f8f6;color:#142e23;font-family:system-ui,-apple-system,Arial,sans-serif}.wrap{max-width:570px;margin:0 auto;padding:30px 18px}.card{padding:28px;background:#fff;border:1px solid #e0ebe4;border-radius:22px;box-shadow:0 12px 35px #142e2309}.brand{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:800}.mark{background:#128252;color:white;border-radius:12px;padding:8px 12px}h1{font-size:28px;line-height:1.2;margin:25px 0 10px}p{line-height:1.6;color:#617568;font-size:15px}.steps{padding:0;list-style:none;margin:22px 0}.steps li{display:flex;gap:12px;margin:18px 0;font-size:15px;line-height:1.5}.step{border-radius:50%;background:#e8f6ee;color:#128252;font-weight:800;width:30px;height:30px;flex:0 0 30px;text-align:center;padding-top:3px}.steps b{display:block}.button{display:block;width:100%;padding:15px;border-radius:12px;border:0;background:#0866ff;color:#fff;font-weight:750;font-size:16px;cursor:pointer;text-decoration:none;text-align:center}.button:disabled{opacity:.55;cursor:wait}.secondary{background:#f0f5f2;color:#16412c;margin-top:12px}.status{padding:13px 14px;border-radius:12px;background:#eef5ff;color:#254d79;margin-top:16px;line-height:1.5;font-size:14px}.error{background:#fff0ef;color:#a52d23}.success{background:#e9f8ef;color:#126441}.note{font-size:12px;color:#718177;border-top:1px solid #e9eeeb;padding-top:17px;margin-top:20px}dl{margin:20px 0}dt{font-size:12px;color:#718177}dd{margin:3px 0 13px;word-break:break-word;font-weight:650}[hidden]{display:none!important}
</style></head><body><div class="wrap"><main class="card"><div class="brand"><span class="mark">G</span>GreetSync</div><h1 id="heading">Connect your WhatsApp Business</h1><p id="intro">Sign in securely with Facebook, choose your business and approve access. Your WhatsApp Business app stays available alongside GreetSync automation.</p>
<ol class="steps" id="steps"><li><span class="step">1</span><div><b>Sign in with Facebook</b>Use the account that manages your business.</div></li><li><span class="step">2</span><div><b>Choose your business and number</b>Select your existing WhatsApp Business app number and confirm its connection in the Business app.</div></li><li><span class="step">3</span><div><b>Approve GreetSync access</b>Your authorized account details and templates are fetched automatically.</div></li></ol>
<button id="connectBtn" class="button" type="button" disabled>Continue with Facebook</button><button id="retryBtn" class="button secondary" type="button" hidden>Retry Facebook connection</button><div id="status" class="status" role="status" aria-live="polite">Preparing secure Facebook sign-in…</div><div id="accountChoices" hidden></div>
<dl id="details" hidden><dt>WhatsApp business</dt><dd id="businessName"></dd><dt>Business number</dt><dd id="phone"></dd><dt>WhatsApp account ID</dt><dd id="waba"></dd><dt>Phone Number ID</dt><dd id="phoneId"></dd></dl><a id="returnBtn" class="button secondary" href="greetsync://meta-connected">Return to GreetSync</a><p class="note">Facebook handles your password. GreetSync securely saves access to the WhatsApp account you authorize so it can manage templates and send your messages. Shared contacts/history are synchronized only as permitted by Meta and your onboarding choices.</p></main></div>
<div id="fb-root"></div><script nonce="${nonce}">
(() => {
  const APP_ID=${js(config.appId)},CONFIG_ID=${js(config.configId)},API_VERSION=${js(config.apiVersion)},SESSION_ID=${js(config.sessionId)};
  const RESUME_SELECTION=${config.resumeSelection===true};
  const btn=document.getElementById('connectBtn'),retry=document.getElementById('retryBtn'),status=document.getElementById('status');
  const key='greetsync-meta-'+SESSION_ID;
  let launchToken=new URLSearchParams(location.hash.slice(1)).get('token')||'';
  try{if(launchToken)sessionStorage.setItem(key,launchToken);else launchToken=sessionStorage.getItem(key)||'';}catch(_){}
  history.replaceState(null,'',location.pathname+location.search);
  let sdkReady=false,loadingSdk=false,loadAttempt=0,sdkTimer=null,codeTimer=null,authCode='',sessionData=null,onboardingEvent='',completing=false,finished=false,cancelled=false;
  function show(message,kind='status'){status.textContent=message;status.className=kind;}
  function clearCodeTimer(){if(codeTimer!==null){clearTimeout(codeTimer);codeTimer=null;}}
  function chooseAccount(result){
    completing=false;btn.hidden=true;show('Choose the authorized WhatsApp number you want to connect.');
    const choices=document.getElementById('accountChoices');choices.textContent='';choices.hidden=false;
    for(const account of result.choices){
      const option=document.createElement('button');option.type='button';option.className='button secondary';option.textContent=(account.verifiedName||'WhatsApp Business')+' · '+(account.displayPhoneNumber||account.phoneNumberId);
      option.addEventListener('click',function(){if(completing)return;choices.hidden=true;sessionData={waba_id:account.wabaId,phone_number_id:account.phoneNumberId};complete();});choices.appendChild(option);
    }
  }
  function ready(){if(!finished&&!completing){btn.disabled=!sdkReady;retry.hidden=true;show('Ready. Continue to Facebook to connect your business.');}}
  function sdkFailure(message){loadingSdk=false;btn.disabled=true;retry.hidden=false;show(message,'status error');}
  window.fbAsyncInit=function(){
    if(!window.FB)return;
    try{window.FB.init({appId:APP_ID,cookie:true,autoLogAppEvents:false,xfbml:false,version:API_VERSION});sdkReady=true;loadingSdk=false;if(sdkTimer!==null)clearTimeout(sdkTimer);ready();}
    catch(_){sdkFailure('Facebook sign-in could not initialize. Retry, or return to GreetSync and start a new connection.');}
  };
  function loadSdk(){
    if(!launchToken){show('This secure connection link is missing or expired. Return to GreetSync and start again.','status error');return;}
    if(loadingSdk)return;if(window.FB&&sdkReady){ready();return;}
    loadingSdk=true;sdkReady=false;btn.disabled=true;retry.hidden=true;show('Preparing secure Facebook sign-in…');
    const attempt=++loadAttempt,previous=document.getElementById('facebook-jssdk');if(previous)previous.remove();
    if(sdkTimer!==null)clearTimeout(sdkTimer);
    const sdk=document.createElement('script');sdk.id='facebook-jssdk';sdk.async=true;sdk.defer=true;sdk.crossOrigin='anonymous';sdk.nonce=${js(nonce)};sdk.src='https://connect.facebook.net/en_US/sdk.js';
    sdk.onerror=function(){if(attempt===loadAttempt&&!sdkReady){if(sdkTimer!==null)clearTimeout(sdkTimer);sdkFailure('Facebook sign-in could not load. Retry with an internet connection; allow Facebook in any browser blocker or VPN.');}};
    sdkTimer=setTimeout(function(){if(attempt===loadAttempt&&!sdkReady)sdkFailure('Facebook is taking too long to load. Retry, or open this connection in your normal browser.');},20000);
    document.head.appendChild(sdk);
  }
  async function complete(){
    if((!authCode&&!RESUME_SELECTION)||completing||finished||cancelled)return;
    clearCodeTimer();completing=true;btn.disabled=true;retry.hidden=true;show('Fetching your authorized business and WhatsApp number…');
    const data=sessionData||{};
    try{
      const response=await fetch('/meta/embedded-signup/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:SESSION_ID,launchToken,code:authCode,wabaId:data.waba_id,phoneNumberId:data.phone_number_id,onboardingEvent})});
      const result=await response.json();
      if(result.selectionRequired&&Array.isArray(result.choices)&&result.choices.length){
        chooseAccount(result);return;
      }
      if(!response.ok||!result.success)throw new Error(result.error||'The connection could not be completed.');
      finished=true;try{sessionStorage.removeItem(key);}catch(_){}
      document.getElementById('heading').textContent='Your WhatsApp is connected';document.getElementById('intro').textContent='GreetSync has securely saved your authorized account. Return to the app to view your templates and schedule messages.';
      document.getElementById('steps').hidden=true;btn.hidden=true;document.getElementById('details').hidden=false;
      document.getElementById('businessName').textContent=result.verifiedName||result.wabaName||'WhatsApp Business';document.getElementById('phone').textContent=result.displayPhoneNumber||'Connected number';document.getElementById('waba').textContent=result.wabaId||'';document.getElementById('phoneId').textContent=result.phoneNumberId||'';
      show(result.warning||'Connected successfully. Your account details are saved.','status success');
    }catch(error){finished=true;btn.hidden=true;show(error.message||'Connection failed. Return to GreetSync to start again.','status error');}
  }
  function isMetaOrigin(value){try{const origin=new URL(value);return origin.protocol==='https:'&&!origin.port&&(origin.hostname==='facebook.com'||origin.hostname.endsWith('.facebook.com'));}catch(_){return false;}}
  window.addEventListener('message',function(event){
    if(!isMetaOrigin(event.origin)||finished||cancelled)return;
    let payload;try{payload=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch(_){return;}
    if(!payload||payload.type!=='WA_EMBEDDED_SIGNUP')return;
    if(['FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING','FINISH'].includes(payload.event)){
      sessionData=payload.data||{};onboardingEvent=payload.event;complete();
    }else if(['CANCEL','ERROR'].includes(payload.event)){
      cancelled=true;clearCodeTimer();btn.hidden=true;show('Meta onboarding was not completed. Return to GreetSync and try again.','status error');
    }
  });
  btn.addEventListener('click',function(){
    if(!sdkReady||!window.FB||completing||finished||cancelled)return;
    btn.disabled=true;show('Complete the business connection in the Facebook window…');
    try{window.FB.login(function(response){
      if(response&&response.authResponse&&response.authResponse.code){
        authCode=response.authResponse.code;if(sessionData)complete();else{show('Confirming the WhatsApp account you authorized…');clearCodeTimer();codeTimer=setTimeout(complete,8000);}
      }else{btn.disabled=false;show('Facebook sign-in was cancelled or no access was granted. You can try again.','status error');}
    },{config_id:CONFIG_ID,response_type:'code',override_default_response_type:true,extras:{setup:{},featureType:'whatsapp_business_app_onboarding',sessionInfoVersion:'3'}});}
    catch(_){btn.disabled=false;show('Facebook sign-in could not open. Allow the login popup and try again.','status error');}
  });
  async function resumeSelection(){
    if(!launchToken){show('Return to GreetSync to open your secure connection link.','status error');return;}
    try{
      const response=await fetch('/meta/embedded-signup/selection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:SESSION_ID,launchToken})});
      const result=await response.json();if(!response.ok||!Array.isArray(result.choices)||!result.choices.length)throw new Error(result.error||'This connection must be restarted from GreetSync.');chooseAccount(result);
    }catch(error){show(error.message||'Return to GreetSync and start again.','status error');}
  }
  retry.addEventListener('click',loadSdk);if(RESUME_SELECTION)resumeSelection();else loadSdk();
})();
</script></body></html>`;
  return {html,headers:metaSignupBridgeHeaders(nonce)};
}
