import test from 'node:test';
import assert from 'node:assert/strict';
import { WhatsAppService } from '../src/server/whatsapp.ts';
import { templateHeaderError } from '../src/server/template-media.ts';
import { acceptanceVariables, sameSendVariables } from '../src/server/message-acceptance.ts';

const base = {phoneNumberId:'123',accessToken:'test-token',recipientPhone:'+919876543210',templateName:'brain_add',templateLanguage:'en_US'};
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json'}});

for (const format of ['IMAGE', 'VIDEO', 'DOCUMENT']) {
  test(`${format} sends the actual typed media header and complete body parameters`, async () => {
    let payload: any;
    const original = globalThis.fetch;
    globalThis.fetch = async (_url, init) => { if(init?.method!=='POST') return response({id:'123456789',mime_type:format==='DOCUMENT'?'application/pdf':'video/mp4'}); payload=JSON.parse(String(init?.body)); return response({messages:[{id:'wamid.test'}]}); };
    try {
      const result = await WhatsAppService.sendTemplateMessage({...base,variables:{__header_media_type:format,__header_media_id:'123456789',__header_media_filename:'offer.pdf','1':'Navin'},
        templateComponents:[{type:'HEADER',format},{type:'BODY',text:'Hello {{1}}. Visit our website.'},{type:'BUTTONS',buttons:[{type:'URL',text:'Visit our website',url:'https://example.com'}]}]});
      assert.equal(result.success,true);
      assert.equal(payload.template.components[0].type,'header');
      assert.equal(payload.template.components[0].parameters[0].type,format.toLowerCase());
      assert.equal(payload.template.components[0].parameters[0][format.toLowerCase()].id,'123456789');
      if(format==='DOCUMENT') assert.equal(payload.template.components[0].parameters[0].document.filename,'offer.pdf');
      assert.deepEqual(payload.template.components[1],{type:'body',parameters:[{type:'text',text:'Navin'}]});
    } finally { globalThis.fetch=original; }
  });
}

test('missing image is rejected without contacting Meta or using a review header_handle', async () => {
  let calls=0;
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{calls++;return response({});};
  try {
    const result=await WhatsAppService.sendTemplateMessage({...base,variables:{},templateComponents:[{type:'HEADER',format:'IMAGE',example:{header_handle:['review-handle']}},{type:'BODY',text:'The entire message'}]});
    assert.equal(result.success,false);
    assert.match(result.error!,/image/);
    assert.equal(calls,0);
  } finally {globalThis.fetch=original;}
});

test('wrong media type and malformed media ID are rejected', () => {
  assert.match(templateHeaderError([{type:'HEADER',format:'IMAGE'}],{__header_media_type:'VIDEO',__header_media_id:'123'})!,/requires image/);
  assert.match(templateHeaderError([{type:'HEADER',format:'IMAGE'}],{__header_media_id:'review-upload-handle'})!,/Invalid WhatsApp media ID/);
});

test('missing location does not become latitude/longitude zero', () => {
  assert.ok(templateHeaderError([{type:'HEADER',format:'LOCATION'}],{}));
  assert.equal(templateHeaderError([{type:'HEADER',format:'LOCATION'}],{__header_location_latitude:'0',__header_location_longitude:'0',__header_location_name:'Shop',__header_location_address:'Full street address'}),null);
});

test('media schedule limit uses the original upload time', () => {
  assert.ok(templateHeaderError([{type:'HEADER',format:'IMAGE'}],{__header_media_id:'123',__header_media_uploaded_at:'2026-10-01T00:00:00Z'},new Date('2026-11-01T00:00:00Z')));
});

test('named body variables remain named and missing values fail before sending', async () => {
  let payload: any;
  const original=globalThis.fetch;
  globalThis.fetch=async(_url,init)=>{payload=JSON.parse(String(init?.body));return response({messages:[{id:'wamid.test'}]});};
  try {
    const components=[{type:'HEADER',format:'TEXT',text:'Order {{reference}}'},{type:'BODY',text:'Hi {{customer_name}}'}];
    const result=await WhatsAppService.sendTemplateMessage({...base,variables:{header_reference:'A100',customer_name:'Navin'},templateComponents:components});
    assert.equal(result.success,true);
    assert.equal(payload.template.components[1].parameters[0].parameter_name,'customer_name');
    assert.equal((await WhatsAppService.sendTemplateMessage({...base,variables:{},templateComponents:components})).success,false);
  } finally {globalThis.fetch=original;}
});

test('static body templates do not receive unrelated numeric parameters', async () => {
  let payload: any;
  const original=globalThis.fetch;
  globalThis.fetch=async(_url,init)=>{payload=JSON.parse(String(init?.body));return response({messages:[{id:'wamid.test'}]});};
  try {
    assert.equal((await WhatsAppService.sendTemplateMessage({...base,variables:{'1':'old value'},templateComponents:[{type:'BODY',text:'Complete static message'}]})).success,true);
    assert.equal(payload.template.components,undefined);
  } finally {globalThis.fetch=original;}
});

test('template sync reads every page including the complete components', async () => {
  const urls:string[]=[];
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    urls.push(String(url));
    return urls.length===1 ? response({data:[{id:'1',components:[{type:'BODY',text:'First full body'}]}],paging:{next:'https://graph.facebook.com/next',cursors:{after:'next-page'}}}) : response({data:[{id:'2',components:[{type:'BODY',text:'Second full body'}]}]});
  };
  try {
    const result=await WhatsAppService.fetchTemplates('456','test-token');
    assert.equal(result.templates?.length,2);
    assert.equal(result.templates?.[1].components[0].text,'Second full body');
    assert.equal(new URL(urls[1]).searchParams.get('after'),'next-page');
    assert.match(new URL(urls[0]).searchParams.get('fields')!,/components/);
  } finally {globalThis.fetch=original;}
});

test('a failed later sync page does not return a partial template list for cleanup', async () => {
  let calls=0;
  const original=globalThis.fetch;
  globalThis.fetch=async()=>++calls===1 ? response({data:[{id:'1'}],paging:{next:'next',cursors:{after:'2'}}}) : response({error:{message:'try again'}},500);
  try {const result=await WhatsAppService.fetchTemplates('456','test-token');assert.equal(result.success,false);assert.equal(result.templates,undefined);}
  finally {globalThis.fetch=original;}
});

test('local media preview and variable meanings are stripped from Meta review requests', async () => {
  let payload:any;
  const original=globalThis.fetch;
  globalThis.fetch=async(_url,init)=>{payload=JSON.parse(String(init?.body));return response({id:'123',status:'PENDING'});};
  try {
    await WhatsAppService.createTemplate({businessAccountId:'456',accessToken:'test-token',name:'brain_add',language:'en_US',category:'MARKETING',components:[{type:'HEADER',format:'IMAGE',greetsync_media_preview:{dataBase64:'local'},greetsync_variable_meanings:{},example:{header_handle:['review']}}]});
    assert.equal(payload.components[0].greetsync_media_preview,undefined);
    assert.equal(payload.components[0].greetsync_variable_meanings,undefined);
    assert.deepEqual(payload.components[0].example,{header_handle:['review']});
  } finally {globalThis.fetch=original;}
});


test('location message sends coordinates, shop name and mandatory address to Meta', async () => {
  let payload: any;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(String(init?.body));
    return response({messages:[{id:'wamid.location'}]});
  };
  try {
    const result = await WhatsAppService.sendTemplateMessage({...base,
      variables:{__header_location_latitude:'17.6599', __header_location_longitude:'75.9064',
        __header_location_name:'Brain Consultancy', __header_location_address:'Main Road, Solapur, Maharashtra 413001'},
      templateComponents:[{type:'HEADER',format:'LOCATION'},{type:'BODY',text:'Visit our shop at the selected location.'}]});
    assert.equal(result.success,true);
    assert.deepEqual(payload.template.components[0].parameters[0],{type:'location',location:{
      latitude:17.6599,longitude:75.9064,name:'Brain Consultancy',address:'Main Road, Solapur, Maharashtra 413001'}});
  } finally { globalThis.fetch=original; }
});

test('location without name or address fails locally before contacting Meta', async () => {
  let calls=0;
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{calls++; return response({messages:[{id:'unexpected'}]});};
  try {
    const vars={__header_location_latitude:'17.6599',__header_location_longitude:'75.9064',__header_location_name:'Shop'};
    const result=await WhatsAppService.sendTemplateMessage({...base,variables:vars,
      templateComponents:[{type:'HEADER',format:'LOCATION'}]});
    assert.equal(result.success,false);
    assert.match(result.error!,/address/);
    assert.equal(calls,0);
    assert.match(templateHeaderError([{type:'HEADER',format:'LOCATION'}], {...vars,__header_location_name:''})!,/name/);
  } finally {globalThis.fetch=original;}
});

for(const format of ['VIDEO','DOCUMENT']) {
  test(`${format} expired or wrong-account attachment fails before sending`,async()=>{
    const original=globalThis.fetch;const calls:string[]=[];
    globalThis.fetch=async(url,init)=>{calls.push(String(url));assert.notEqual(init?.method,'POST');assert.equal(new URL(String(url)).searchParams.get('phone_number_id'),'123');return response({error:{message:'expired media'}},404);};
    try {const result=await WhatsAppService.sendTemplateMessage({...base,variables:{__header_media_id:'123456789'},templateComponents:[{type:'HEADER',format},{type:'BODY',text:'Full message'}]});assert.equal(result.success,false);assert.equal(result.errorCode,'MEDIA_UNAVAILABLE');assert.equal(calls.length,1);}
    finally{globalThis.fetch=original;}
  });
}
test('Meta HTTP success without a WhatsApp message ID is not a successful send',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>response({success:true});
  try {const result=await WhatsAppService.sendTemplateMessage({...base,variables:{},templateComponents:[{type:'BODY',text:'Complete text'}]});assert.equal(result.success,false);assert.equal(result.errorCode,'MISSING_MESSAGE_ID');}
  finally{globalThis.fetch=original;}
});
test('a document preview URL cannot bypass upload verification',async()=>{
  const result=await WhatsAppService.sendTemplateMessage({...base,variables:{__header_media_link:'https://private.example/invoice.pdf'},templateComponents:[{type:'HEADER',format:'DOCUMENT'}]});
  assert.equal(result.errorCode,'MEDIA_UPLOAD_REQUIRED');
});

test('media from the wrong content type is rejected before a template send',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>response({id:'123456789',mime_type:'image/png'});
  try {const result=await WhatsAppService.sendTemplateMessage({...base,variables:{__header_media_id:'123456789'},templateComponents:[{type:'HEADER',format:'DOCUMENT'}]});assert.equal(result.errorCode,'MEDIA_TYPE_MISMATCH');}
  finally{globalThis.fetch=original;}
});

test('birthday header/body values remain unchanged while the send carries receipt correlation',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_url,init)=>{
    calls++;const payload=JSON.parse(String(init?.body));
    assert.equal(payload.biz_opaque_callback_data,'greetsync:1:22');
    assert.deepEqual(payload.template,{name:'brithday',language:{code:'en_US'},components:[
      {type:'header',parameters:[{type:'text',text:'Navin'}]},
      {type:'body',parameters:[{type:'text',text:'Navin'},{type:'text',text:'22'}]},
    ]});
    assert.ok(init?.signal);
    return response({messages:[{id:'wamid.birthday',message_status:'held_for_quality_assessment'}]});
  };
  try{
    const vars={'1':'Navin','2':'22',header_1:'Navin'};
    const result=await WhatsAppService.sendTemplateMessage({...base,templateName:'brithday',variables:vars,trackingId:'greetsync:1:22',templateComponents:[{type:'HEADER',format:'TEXT',text:'Happy birthday {{1}}'},{type:'BODY',text:'Hello {{1}}, congratulations on turning {{2}} today.'}]});
    assert.equal(result.success,true);assert.equal(calls,1);
    assert.match(acceptanceVariables(vars,result.rawResponse).__delivery_note,/holding/);
  }finally{globalThis.fetch=original;}
});
test('a template POST transport timeout stays uncertain and does not automatically send twice',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw Object.assign(new Error('socket ended after request'),{cause:{code:'ECONNRESET'}});};
  try{const result=await WhatsAppService.sendTemplateMessage({...base,variables:{},templateComponents:[{type:'BODY',text:'Our complete message.'}]});assert.equal(result.errorCode,'SEND_OUTCOME_UNKNOWN');assert.equal(result.success,false);assert.equal(calls,1);}
  finally{globalThis.fetch=original;}
});
test('send replay compares actual variables regardless of JSONB order or later receipt metadata',()=>{
  assert.equal(sameSendVariables({'1':'Navin','2':'22'},{'2':'22','1':'Navin',__meta_message_status:'delivered',__delivery_note:'old note'}),true);
  assert.equal(sameSendVariables({'1':'Navin'},{'1':'Other customer'}),false);
  assert.equal(sameSendVariables({__header_media_id:'123'},{__header_media_id:'456'}),false);
});
