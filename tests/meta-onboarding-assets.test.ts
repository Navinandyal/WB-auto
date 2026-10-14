import test from 'node:test';import assert from 'node:assert/strict';
import {discoverSignupAssets,validateSignupGrant} from '../src/server/meta-onboarding-assets.ts';
const grant=(targets=['300'])=>({data:{is_valid:true,app_id:'100',scopes:['whatsapp_business_management','whatsapp_business_messaging'],granular_scopes:[{scope:'whatsapp_business_management',target_ids:targets}]}});
function fixture(overrides:Record<string,any>={}){
 const calls:any[]=[];const data:Record<string,any>={
 '/300/phone_numbers':{data:[{id:'400',display_phone_number:'+919876543210',verified_name:'Fixture Shop'}]},'/400':{id:'400',is_on_biz_app:true,platform_type:'CLOUD_API'},
 '/300':{id:'300',name:'Fixture WhatsApp',owner_business_info:{id:'500',name:'Fixture Business'}},'/400/whatsapp_business_profile':{data:[{address:'Fixture address'}]},...overrides};
 return {calls,graph:async(path:string,params:any)=>{calls.push({path,params});const v=data[path];if(v instanceof Error)throw v;if(typeof v==='function')return v(params);if(!v)throw new Error('Not granted');return v;}};
}
test('authorized Coexistence WABA and number auto-fetch actual Meta business metadata',async()=>{
 const f=fixture();const r=await discoverSignupAssets({appId:'100',debug:grant(),graph:f.graph,hints:{wabaId:'300',businessId:'untrusted'},requireCoexistence:true});
 assert.equal(r.wabaId,'300');assert.equal(r.phoneNumberId,'400');assert.equal(r.metaBusinessId,'500');assert.equal(r.businessName,'Fixture Business');assert.equal(r.businessProfile.address,'Fixture address');
});
for(const [name,debug,code]of [
 ['invalid token',{data:{...grant().data,is_valid:false}},'META_TOKEN_INVALID'],['different app',{data:{...grant().data,app_id:'999'}},'META_TOKEN_APP_MISMATCH'],
 ['missing permission',{data:{...grant().data,scopes:['whatsapp_business_management']}},'META_PERMISSIONS_MISSING'],
] as const)test(`${name} blocks discovery before asset requests`,async()=>{const f=fixture();await assert.rejects(()=>discoverSignupAssets({appId:'100',debug,graph:f.graph}),(e:any)=>e.code===code);assert.equal(f.calls.length,0);});
test('granular scopes can report permission names',()=>{assert.doesNotThrow(()=>validateSignupGrant({data:{is_valid:true,app_id:'100',granular_scopes:[{scope:'whatsapp_business_management'},{scope:'whatsapp_business_messaging'}]}},'100'));});
test('phone mismatch and ungranted WABA cannot fall back to another business',async()=>{
 const f=fixture();await assert.rejects(()=>discoverSignupAssets({appId:'100',debug:grant(),graph:f.graph,hints:{wabaId:'300',phoneNumberId:'999'}}),(e:any)=>e.code==='META_PHONE_WABA_MISMATCH');
 const other=fixture();await assert.rejects(()=>discoverSignupAssets({appId:'100',debug:grant(),graph:other.graph,hints:{wabaId:'999'}}));assert.deepEqual(other.calls.map(x=>x.path),['/999/phone_numbers']);
});
test('Coexistence must be confirmed by actual phone state',async()=>{
 const f=fixture({'/400':{id:'400',is_on_biz_app:false,platform_type:'CLOUD_API'}});await assert.rejects(()=>discoverSignupAssets({appId:'100',debug:grant(),graph:f.graph,requireCoexistence:true}),(e:any)=>e.code==='META_WHATSAPP_ASSET_NOT_GRANTED');
});
test('multiple numbers require explicit selection; valid selected number is retained',async()=>{
 const f=fixture({'/300/phone_numbers':{data:[{id:'400'},{id:'401'}]},'/401':{id:'401',is_on_biz_app:true,platform_type:'CLOUD_API'}});
 await assert.rejects(()=>discoverSignupAssets({appId:'100',debug:grant(),graph:f.graph,requireCoexistence:true}),(e:any)=>e.code==='META_ASSET_SELECTION_REQUIRED');
 const r=await discoverSignupAssets({appId:'100',debug:grant(),graph:f.graph,hints:{wabaId:'300',phoneNumberId:'401'},requireCoexistence:true});assert.equal(r.phoneNumberId,'401');
});
test('all granted WABAs are checked; first business is not silently chosen',async()=>{
 const f=fixture({'/301/phone_numbers':{data:[{id:'401'}]}});await assert.rejects(()=>discoverSignupAssets({appId:'100',debug:grant(['300','301']),graph:f.graph}),(e:any)=>e.code==='META_ASSET_SELECTION_REQUIRED');
});
test('pagination finds a phone on a later page without following external URLs',async()=>{
 const f=fixture({'/300/phone_numbers':(p:any)=>p.after?{data:[{id:'401'}]}:{data:[{id:'400'}],paging:{next:'https://untrusted.invalid/ignored',cursors:{after:'page2'}}}});
 const r=await discoverSignupAssets({appId:'100',debug:grant(),graph:f.graph,hints:{phoneNumberId:'401'}});assert.equal(r.phoneNumberId,'401');assert.ok(f.calls.some(x=>x.params.after==='page2'));
});
test('business scope fallback resolves only authorized owned/shared WABAs',async()=>{
 const f=fixture({'/500/owned_whatsapp_business_accounts':{data:[]},'/500/client_whatsapp_business_accounts':{data:[{id:'300'}]}});
 const debug={data:{...grant([]).data,scopes:[...grant().data.scopes,'business_management'],granular_scopes:[{scope:'business_management',target_ids:['500']}]}};
 const r=await discoverSignupAssets({appId:'100',debug,graph:f.graph});assert.equal(r.wabaId,'300');assert.equal(r.metaBusinessId,'500');
});
test('empty targets use a validated session WABA, without unrelated business enumeration',async()=>{
 const r=await discoverSignupAssets({appId:'100',debug:grant([]),graph:fixture().graph,hints:{wabaId:'300'},requireCoexistence:true});assert.equal(r.phoneNumberId,'400');
 const f=fixture();await assert.rejects(()=>discoverSignupAssets({appId:'100',debug:grant([]),graph:f.graph}));assert.equal(f.calls.length,0);
});
test('optional profile denial preserves verified IDs without persisting unverified business hints',async()=>{
 const f=fixture({'/300':new Error('metadata denied'),'/400/whatsapp_business_profile':new Error('denied')});const r=await discoverSignupAssets({appId:'100',debug:grant(),graph:f.graph,hints:{businessId:'999'}});assert.equal(r.phoneNumberId,'400');assert.equal(r.metaBusinessId,'');
});
test('missing/repeating page cursor fails safely',async()=>{
 const f=fixture({'/300/phone_numbers':{data:[{id:'400'}],paging:{next:'https://graph.facebook.com/next'}}});await assert.rejects(()=>discoverSignupAssets({appId:'100',debug:grant(),graph:f.graph}),(e:any)=>e.code==='META_ASSET_RESPONSE_INVALID');
});
