import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAiTemplate} from '../src/server/ai-template.ts';
import {templateGuide,validateGuidedTemplate} from '../src/server/ai-template-guide.ts';
const business={name:'Owner',businessName:'Brain Educational Consultancy',businessAddress:'Solapur'};
const body='Hello {{customer_name}}, on your birthday we celebrate your curiosity, courage and the progress you have made. May this new year bring good health, happiness and the confidence to explore your strengths. Keep learning with an open mind, take thoughtful steps toward your dreams, and appreciate every small achievement along the way. We wish you meaningful growth, supportive friendships and a fulfilling year ahead.\nWarm Regards,\nTeam Brain Educational Consultancy';
const draft={templateName:'birthday_growth',category:'UTILITY',language:'en_US',header:'',body,footer:'',mediaFormat:'NONE',assistantMessage:'Birthday greeting with a reusable recipient name.'};
test('guided birthday uses owned business identity, preview name and supplied audience while categorizing greetings as Marketing',async()=>{
  const result=await generateAiTemplate({language:'en_US',guide:{purpose:'BIRTHDAY',recipientType:'Student',recipientName:'Navin',organization:'Local school',tone:'Inspirational',businessName:'Other tenant'},messages:[{role:'user',text:'A warm educational birthday message'}]},business,async request=>{
    const context=JSON.parse(request.contents).context;
    assert.equal(context.businessName,business.businessName);assert.equal(context.guide.businessName,undefined);assert.equal(context.guide.closing,'Warm Regards,\nTeam Brain Educational Consultancy');
    assert.equal(context.guide.recipientType,'Student');assert.equal(context.guide.recipientName,'Navin');assert.match(request.config.systemInstruction,/PREVIEW SAMPLE/);
    return JSON.stringify(draft);
  });
  assert.equal(result.category,'MARKETING');assert.equal(result.bodySamples.customer_name,'Navin');assert.ok(result.body.includes('{{customer_name}}'));assert.doesNotMatch(result.body,/Navin/);
});
test('bilingual guidance retains a supported Meta language code and preserves current edited content for revisions',async()=>{
  await generateAiTemplate({language:'mr',guide:{purpose:'BIRTHDAY',languageStyle:'BILINGUAL',recipientType:'Teacher'},currentDraft:{body:'Owner edited this'},messages:[{role:'user',text:'Revise into English and Marathi'}]},business,async request=>{
    const context=JSON.parse(request.contents).context;assert.equal(context.language,'mr');assert.equal(context.guide.languageStyle,'BILINGUAL');assert.equal(context.currentDraft.body,'Owner edited this');
    return JSON.stringify({...draft,language:'mr',body:body.replace('Hello','नमस्कार')});
  });
});
test('invalid guided type, age, length or language choice fails before any provider call',async()=>{
  let calls=0;
  for(const guide of [{purpose:'INVENTED'},{purpose:'BIRTHDAY',age:'0'},{purpose:'BIRTHDAY',age:'abc'},{recipientType:'x'.repeat(121)},{tone:'x'.repeat(121)},{tone:{invalid:true}},{languageStyle:'BILINGUAL'}])
    await assert.rejects(()=>generateAiTemplate({language:'en_US',guide,messages:[{role:'user',text:'Create'}]},business,async()=>{calls++;return JSON.stringify(draft);}));
  assert.equal(calls,0);
});
test('birthday word range, reusable name, business closing and explicit attachment choice are enforced',()=>{
  const guide=templateGuide({purpose:'BIRTHDAY'},'en_US',business);
  assert.doesNotThrow(()=>validateGuidedTemplate(draft,guide));
  assert.throws(()=>validateGuidedTemplate({...draft,body:'Happy birthday!'},guide),/60–120/);
  assert.throws(()=>validateGuidedTemplate({...draft,body:body.replace('{{customer_name}}','Navin')},guide),/reusable recipient name/);
  assert.throws(()=>validateGuidedTemplate({...draft,body:body.replace('Brain Educational Consultancy','Other business')},guide),/business birthday closing/);
  assert.throws(()=>validateGuidedTemplate(draft,templateGuide({purpose:'OTHER',mediaPreference:'DOCUMENT'},'en_US',business)),/attachment choice/);
});
test('optional birthday age remains a per-contact variable with the supplied age used only in preview',async()=>{
  const result=await generateAiTemplate({language:'en_US',guide:{purpose:'BIRTHDAY',age:'22'},messages:[{role:'user',text:'Mention the age'}]},business,async()=>JSON.stringify({...draft,body:body.replace('on your birthday','as you turn {{customer_age}} today')}));
  assert.equal(result.bodySamples.customer_age,'22');assert.equal(result.bodyMeanings.customer_age,'AGE');assert.ok(result.body.includes('{{customer_age}}'));
});
for(const purpose of ['CAMPAIGN','MARKETING','FESTIVAL'])test(`${purpose} cannot be mislabeled Utility by the AI`,async()=>{
  const result=await generateAiTemplate({guide:{purpose},messages:[{role:'user',text:'Write our business update'}]},business,async()=>JSON.stringify({...draft,body:'Hello {{customer_name}}, we would like to share our business news with you.'}));
  assert.equal(result.category,'MARKETING');
});

test('custom purpose, tone and audience are allowed as bounded data and preserve business ownership',async()=>{
 const result=await generateAiTemplate({language:'en_US',guide:{purpose:'OTHER',purposeLabel:'Annual alumni reunion',tone:'Warm and celebratory',recipientType:'Alumni and their families',businessName:'Spoofed'},messages:[{role:'user',text:'Invite our alumni'}]},business,async request=>{
  const {context}=JSON.parse(request.contents);
  assert.equal(context.guide.purposeLabel,'Annual alumni reunion');assert.equal(context.guide.tone,'Warm and celebratory');assert.equal(context.guide.recipientType,'Alumni and their families');assert.equal(context.businessName,business.businessName);assert.equal(context.guide.businessName,undefined);
  return JSON.stringify({...draft,category:'MARKETING',body:'Hello {{customer_name}}, we welcome our alumni and their families to our annual reunion.'});
 });assert.equal(result.category,'MARKETING');
});
