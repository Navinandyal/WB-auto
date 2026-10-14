type Graph = (path: string, params?: Record<string,string>) => Promise<any>;
export const signupPermissions = ['whatsapp_business_management','whatsapp_business_messaging'] as const;
function fail(code:string,message:string):never { throw Object.assign(new Error(message),{code,statusCode:400}); }
function id(value:unknown):string { const text=String(value||'').trim();return /^\d+$/.test(text)?text:''; }

export function validateSignupGrant(debug:any,appId:string) {
  const grant=debug?.data;
  if(!grant || grant.is_valid!==true) fail('META_TOKEN_INVALID','Meta authorization is expired or invalid. Start a new connection.');
  if(String(grant.app_id||'')!==appId) fail('META_TOKEN_APP_MISMATCH','The authorization belongs to another Meta app. Check the GreetSync App ID and Embedded Signup configuration.');
  const granular=Array.isArray(grant.granular_scopes)?grant.granular_scopes:[];
  const scopes=new Set<string>([...(Array.isArray(grant.scopes)?grant.scopes:[]),...granular.map((s:any)=>s?.scope)].map(String));
  const missing=signupPermissions.filter(scope=>!scopes.has(scope));
  if(missing.length) fail('META_PERMISSIONS_MISSING',`Meta did not grant ${missing.join(' and ')}. Enable these permissions in GreetSync's Facebook Login for Business configuration and reconnect. For customer accounts, the provider must have the required Meta access approval.`);
  return {granular,scopes};
}

export async function discoverSignupAssets(options:{appId:string;debug:any;graph:Graph;hints?:any;requireCoexistence?:boolean}) {
  const {granular,scopes}=validateSignupGrant(options.debug,options.appId);
  const graph=options.graph;const hints=options.hints||{};
  const hintedWaba=id(hints.wabaId),hintedPhone=id(hints.phoneNumberId);
  if(hints.wabaId&&!hintedWaba || hints.phoneNumberId&&!hintedPhone) fail('META_ASSET_ID_INVALID','Meta returned an invalid account or phone identifier. Start a new connection.');
  const wabaCandidates=new Set<string>(),businessCandidates=new Set<string>();
  for(const entry of granular) for(const target of (Array.isArray(entry?.target_ids)?entry.target_ids:[])) {
    const value=id(target);if(!value)continue;
    if(entry.scope==='business_management')businessCandidates.add(value);
    if(signupPermissions.includes(entry.scope))wabaCandidates.add(value);
  }
  // Session hints only narrow the search. Meta API access and phone membership
  // still prove that the token grants this WABA and its selected phone.
  if(hintedWaba){wabaCandidates.clear();wabaCandidates.add(hintedWaba);}
  const list=async(path:string,params:Record<string,string>={})=>{
    const rows:any[]=[];let after='';const seen=new Set<string>();
    for(let page=0;page<20;page++){
      const data=await graph(path,{...params,limit:'100',...(after?{after}:{})});
      if(!Array.isArray(data?.data))fail('META_ASSET_RESPONSE_INVALID','Meta returned an unexpected business-account response. Reconnect or retry later.');
      rows.push(...data.data);
      if(!data.paging?.next)return rows;
      const cursor=String(data.paging?.cursors?.after||'');
      if(!cursor||seen.has(cursor))fail('META_ASSET_RESPONSE_INVALID','Meta account pagination could not be completed. Retry later.');
      seen.add(cursor);after=cursor;
    }
    fail('META_ASSET_LIST_TOO_LARGE','Too many authorized accounts to select safely. Select a specific account in Meta and reconnect.');
  };
  const accounts=new Map<string,{wabaId:string;phone:any;metaBusinessId:string}>();
  const visited=new Set<string>();let membershipFailed=false;
  const loadWaba=async(wabaId:string,businessId='')=>{
    if(visited.has(wabaId))return;visited.add(wabaId);
    let phones:any[];
    try {phones=await list(`/${wabaId}/phone_numbers`,{fields:'id,display_phone_number,verified_name,quality_rating,code_verification_status'});}
    catch(error:any){if(['META_ASSET_LIST_TOO_LARGE','META_ASSET_RESPONSE_INVALID'].includes(error.code))throw error;return;}
    if(hintedPhone&&!phones.some(phone=>id(phone.id)===hintedPhone)){membershipFailed=true;return;}
    for(const phone of phones){
      const phoneId=id(phone.id);if(!phoneId || hintedPhone&&phoneId!==hintedPhone)continue;
      let details=phone;
      if(options.requireCoexistence){
        const state=await graph(`/${phoneId}`,{fields:'id,is_on_biz_app,platform_type'});
        if(state.is_on_biz_app!==true || state.platform_type!=='CLOUD_API')continue;
        details={...phone,...state};
      }
      accounts.set(`${wabaId}:${phoneId}`,{wabaId,phone:details,metaBusinessId:businessId});
    }
  };
  for(const candidate of wabaCandidates)await loadWaba(candidate);
  if(!accounts.size&&!hintedWaba&&scopes.has('business_management')){
    if(!businessCandidates.size){
      for(const business of await list('/me/businesses',{fields:'id,name'})){const bid=id(business.id);if(bid)businessCandidates.add(bid);}
    }
    for(const bid of businessCandidates)for(const edge of ['owned_whatsapp_business_accounts','client_whatsapp_business_accounts']){
      let wabas:any[]=[];
      try{wabas=await list(`/${bid}/${edge}`,{fields:'id,name'});}catch(error:any){if(error.code?.startsWith('META_ASSET_'))throw error;continue;}
      for(const waba of wabas){const wabaId=id(waba.id);if(wabaId)await loadWaba(wabaId,bid);}
    }
  }
  if(!accounts.size){
    if(membershipFailed)fail('META_PHONE_WABA_MISMATCH','The selected phone does not belong to the WhatsApp account granted in Meta. Reconnect and select the correct account.');
    fail('META_WHATSAPP_ASSET_NOT_GRANTED',options.requireCoexistence
      ? 'No authorized WhatsApp Business app number with Cloud API Coexistence was found. Select the existing Business app number in Meta and complete its connection confirmation.'
      : 'No WhatsApp account with a phone number was granted. Select your business WhatsApp account and number in Meta, then reconnect.');
  }
  if(accounts.size>1)throw Object.assign(new Error('Choose which authorized WhatsApp number to connect to GreetSync.'),{
    code:'META_ASSET_SELECTION_REQUIRED',statusCode:400,
    choices:[...accounts.values()].map(account=>({wabaId:account.wabaId,phoneNumberId:id(account.phone.id),displayPhoneNumber:String(account.phone.display_phone_number||''),verifiedName:String(account.phone.verified_name||'WhatsApp Business')})),
  });
  const chosen=[...accounts.values()][0];
  // Fetch actual Meta metadata; never persist an unverified browser business ID.
  let wabaName='';let businessName='';let businessProfile:any=null;
  try{
    const waba=await graph(`/${chosen.wabaId}`,{fields:'id,name,owner_business_info'});
    wabaName=String(waba.name||'');
    const owner=id(waba.owner_business_info?.id);
    if(owner)chosen.metaBusinessId=owner;
    businessName=String(waba.owner_business_info?.name||'');
  }catch{/* Extra display metadata is optional; validated IDs remain usable. */}
  if(chosen.metaBusinessId&&!businessName){try{const business=await graph(`/${chosen.metaBusinessId}`,{fields:'id,name'});businessName=String(business.name||'');}catch{}}
  try{const profile=await graph(`/${chosen.phone.id}/whatsapp_business_profile`,{fields:'about,address,description,email,profile_picture_url,websites,vertical'});businessProfile=Array.isArray(profile?.data)?profile.data[0]||null:null;}catch{}
  return {wabaId:chosen.wabaId,phoneNumberId:id(chosen.phone.id),metaBusinessId:chosen.metaBusinessId,wabaName,businessName,businessProfile,phone:chosen.phone,isCoexistence:options.requireCoexistence===true};
}
