import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTemplateComponents, validateTemplateVariableSyntax} from '../src/server/template-builder.ts';
import {categoryAdvice, semanticComponents, previewSnapshot, validateTemplateSetup} from '../src/server/template-rules.ts';
import {WhatsAppService} from '../src/server/whatsapp.ts';
import {isCoexistencePhone, webhookStatus} from '../src/server/coexistence.ts';
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const create=(buttons:any[]=[])=>buildTemplateComponents('','Your order is ready for collection.','',buttons);

test('named variables stay named and use official Meta examples',()=>{
 const components=buildTemplateComponents('Order {{order_id}}','Hello {{customer_name}}, your order is ready.','',[], 'NONE','',{order_id:'1042'},{customer_name:'Rahul'});
 assert.equal(components[0].text,'Order {{order_id}}');
 assert.deepEqual(components[0].example,{header_text_named_params:[{param_name:'order_id',example:'1042'}]});
 assert.deepEqual(components[1].example,{body_text_named_params:[{param_name:'customer_name',example:'Rahul'}]});
 assert.throws(()=>buildTemplateComponents('Order {{1}}','Hello {{customer_name}}, your order is ready.','',[], 'NONE','',{'1':'1042'},{customer_name:'Rahul'}),/Name or Number/);
});
test('invalid variable syntax is rejected before submission',()=>{
 for(const text of ['Hello {{2}}, your order is ready.','Hello {{1}} {{2}}, your order is ready.','{{1}} your order is ready.','Your order is ready {{1}}','Hello {{Customer}}, your order is ready.','Hello {{1}, your order is ready.'])assert.throws(()=>validateTemplateVariableSyntax(text,'Body',{body:true}));
 assert.throws(()=>create([{type:'QUICK_REPLY',text:'a'.repeat(26)}]),/25/);
 assert.throws(()=>buildTemplateComponents('','Your order is ready.','Footer {{1}}',[]),/Footer/);
});
test('quick replies must form one group and button counts are enforced',()=>{
 assert.throws(()=>create([{type:'QUICK_REPLY',text:'Yes'},{type:'URL',text:'Open',url:'https://example.com'},{type:'QUICK_REPLY',text:'No'}]),/Group Quick Reply/);
 assert.throws(()=>create([{type:'PHONE_NUMBER',text:'Call',phone_number:'+919876543210'},{type:'PHONE_NUMBER',text:'Call',phone_number:'+919876543211'}]),/at most 1/);
 assert.equal(create([{type:'QUICK_REPLY',text:'Yes'},{type:'QUICK_REPLY',text:'No'},{type:'URL',text:'Open',url:'https://example.com'}]).length,2);
});
test('a Flow requires a numeric ID and an initial screen',()=>{
 assert.throws(()=>create([{type:'FLOW',text:'Continue',flow_id:'123'}]),/screen/);
 const components=create([{type:'FLOW',text:'Continue',flow_id:'123',navigate_screen:'WELCOME'}]);
 assert.equal(components[1].buttons[0].flow_action,'navigate');
 assert.throws(()=>validateTemplateSetup({language:'en_US',category:'MARKETING',templateMode:'FLOW',buttons:[]}),/exactly one/);
});
test('Utility guidance, consent confirmation, supported languages and OTP classification',()=>{
 assert.equal(categoryAdvice('UTILITY','Get 20% discount today.')?.recommendedCategory,'MARKETING');
 assert.equal(categoryAdvice('UTILITY','सवलत मिळवा')?.recommendedCategory,'MARKETING');
 assert.equal(categoryAdvice('UTILITY','Your order 1042 is ready.'),null);
 assert.throws(()=>validateTemplateSetup({language:'fr',category:'UTILITY'}),/English, Hindi or Marathi/);
 assert.throws(()=>validateTemplateSetup({category:'UTILITY',submitToMeta:true,body:'Your order 1042 is ready.'}),/Confirm/);
 assert.throws(()=>validateTemplateSetup({category:'MARKETING',body:'Your verification code is 123456.'}),/Authentication/);
 validateTemplateSetup({language:'mr',category:'UTILITY',submitToMeta:true,utilityConfirmed:true,body:'Your order 1042 is ready.'});
});
test('scheduled content comparison ignores Meta key order, samples and local preview bytes',()=>{
 const old=[{type:'BODY',text:'Your order is ready.',example:{body_text:[['1']]},greetsync_variable_meanings:{}}];
 assert.equal(semanticComponents(old),semanticComponents([{text:'Your order is ready.',type:'BODY'}]));
 assert.notEqual(semanticComponents(old),semanticComponents([{type:'BODY',text:'Your order is cancelled.'}]));
 const template:any={name:'order',components:[{type:'HEADER',greetsync_media_preview:{dataBase64:'large'},format:'IMAGE'},...old]};
 const snapshot=previewSnapshot(template);assert.equal(snapshot.components[0].greetsync_media_preview,undefined);assert.equal(template.components[0].greetsync_media_preview?.dataBase64,'large');
});
test('approved Meta edit sends components without category or immutable identity',async()=>{
 const original=globalThis.fetch;const payloads:any[]=[];
 globalThis.fetch=async(_url,init)=>{if(init?.method==='POST'){payloads.push(JSON.parse(String(init.body)));return response({success:true});}return response({status:'APPROVED',category:'UTILITY'});};
 try{const result=await WhatsAppService.editTemplate({templateId:'123',accessToken:'test',components:[{type:'BODY',text:'Your order is ready.',greetsync_template_mode:'DEFAULT'}]});
 assert.equal(result.status,'APPROVED');assert.deepEqual(Object.keys(payloads[0]),['components']);assert.equal(payloads[0].components[0].greetsync_template_mode,undefined);}finally{globalThis.fetch=original;}
});
test('named template creation explicitly declares NAMED',async()=>{
 const original=globalThis.fetch;let payload:any;globalThis.fetch=async(_url,init)=>{payload=JSON.parse(String(init?.body));return response({id:'123',status:'PENDING',category:'MARKETING'});};
 try{await WhatsAppService.createTemplate({businessAccountId:'456',accessToken:'test',name:'offer',category:'MARKETING',language:'en_US',components:[{type:'BODY',text:'Hello {{customer}}, view our new collection.'}]});assert.equal(payload.parameter_format,'NAMED');}finally{globalThis.fetch=original;}
});
test('Flow and copy-code send payloads contain the required button parameters at actual indexes',async()=>{
 const original=globalThis.fetch;let payload:any;globalThis.fetch=async(_url,init)=>{payload=JSON.parse(String(init?.body));return response({messages:[{id:'wamid.flow'}]});};
 try{const result=await WhatsAppService.sendTemplateMessage({phoneNumberId:'123',accessToken:'test',recipientPhone:'+919876543210',templateName:'offer',templateLanguage:'en_US',variables:{},templateComponents:[{type:'BODY',text:'See our latest offer.'},{type:'BUTTONS',buttons:[{type:'URL',text:'Visit',url:'https://example.com'},{type:'FLOW',text:'Choose',flow_id:'789'},{type:'COPY_CODE',example:'WELCOME20'}]}]});
 assert.equal(result.success,true);assert.equal(payload.template.components[0].index,'1');assert.equal(payload.template.components[0].sub_type,'flow');assert.ok(payload.template.components[0].parameters[0].action.flow_token);assert.deepEqual(payload.template.components[1].parameters,[{type:'coupon_code',coupon_code:'WELCOME20'}]);}finally{globalThis.fetch=original;}
});
test('dynamic URL values are encoded when sending an existing Meta template',async()=>{
 const original=globalThis.fetch;let payload:any;globalThis.fetch=async(_url,init)=>{payload=JSON.parse(String(init?.body));return response({messages:[{id:'wamid.url'}]});};
 try{const result=await WhatsAppService.sendTemplateMessage({phoneNumberId:'123',accessToken:'test',recipientPhone:'+919876543210',templateName:'order',templateLanguage:'en_US',variables:{button_0_customer_name:'Gonçalves'},templateComponents:[{type:'BODY',text:'Your order is ready.'},{type:'BUTTONS',buttons:[{type:'URL',text:'Open order',url:'https://example.com/order?name={{customer_name}}'}]}]});assert.equal(result.success,true);assert.equal(payload.template.components[0].parameters[0].text,'Gon%C3%A7alves');assert.equal(payload.template.components[0].parameters[0].parameter_name,'customer_name');}finally{globalThis.fetch=original;}
});
test('Coexistence requires the Business App on Cloud API and delivery status cannot regress',()=>{
 assert.equal(isCoexistencePhone({is_on_biz_app:true,platform_type:'CLOUD_API'}),true);
 assert.equal(isCoexistencePhone({is_on_biz_app:false,platform_type:'CLOUD_API'}),false);
 assert.equal(isCoexistencePhone({is_on_biz_app:true,platform_type:'ON_PREMISE'}),false);
 assert.equal(webhookStatus('READ','SENT'),'READ');assert.equal(webhookStatus('DELIVERED','FAILED'),'DELIVERED');assert.equal(webhookStatus('SENT','READ'),'READ');
});


test('location creation and edit use a generic Meta header and keep local details', async () => {
  const components=buildTemplateComponents('', 'Your shop location is available below.', '', [], 'LOCATION', '', {}, {}, {}, {},
    {latitude:'17.6599',longitude:'75.9064',name:'Brain Consultancy',address:'Main Road, Solapur 413001'});
  assert.deepEqual(components[0].greetsync_location,{latitude:17.6599,longitude:75.9064,name:'Brain Consultancy',address:'Main Road, Solapur 413001'});
  assert.equal(components[0].example,undefined);
  assert.throws(()=>buildTemplateComponents('', 'Your shop location is available below.', '', [], 'LOCATION', '', {}, {}, {}, {},
    {latitude:'',longitude:'',name:'Shop',address:'Address'}),/map/);
  assert.throws(()=>buildTemplateComponents('', 'Your shop location is available below.', '', [], 'LOCATION', '', {}, {}, {}, {},
    {latitude:17,longitude:75,name:'Shop'}),/street address/);
  const original=globalThis.fetch;
  const posted:any[]=[];
  globalThis.fetch=async (_url,init)=>{
    if(init?.method==='POST') posted.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({id:'meta.location',status:'PENDING',category:'MARKETING'}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    assert.equal((await WhatsAppService.createTemplate({businessAccountId:'1',accessToken:'test',name:'shop_location',category:'MARKETING',language:'en_US',components})).success,true);
    assert.equal((await WhatsAppService.editTemplate({templateId:'meta.location',accessToken:'test',components})).success,true);
    assert.deepEqual(posted[0].components[0],{type:'HEADER',format:'LOCATION'});
    assert.deepEqual(posted[1].components[0],{type:'HEADER',format:'LOCATION'});
    assert.ok(!('name' in posted[1]));
  } finally {globalThis.fetch=original;}
});

test('AI location drafts retain business name/address without fabricated coordinates, but approval requires a real point',()=>{
  const components=buildTemplateComponents('', 'Visit our business for your appointment.', '', [], 'LOCATION', '', {}, {}, {}, {}, {latitude:'',longitude:'',name:'Aikyam',address:'Solapur'},null,false);
  assert.deepEqual(components[0].greetsync_location,{latitude:'',longitude:'',name:'Aikyam',address:'Solapur'});
  assert.throws(()=>buildTemplateComponents('', 'Visit our business for your appointment.', '', [], 'LOCATION', '', {}, {}, {}, {}, {latitude:'',longitude:'',name:'Aikyam',address:'Solapur'},null,true),/valid point/);
});
