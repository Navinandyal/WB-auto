/** Conservative local guidance. Meta remains the authority on category and approval. */
export function categoryAdvice(category:string, body:string, buttons:any[] = []) {
  const promotional = /\b(discount|coupon|promo(?:tion)?|sale|shop now|buy now|offer|cashback|limited time|new collection|happy birthday|happy diwali|happy new year)\b|छूट|ऑफर|सवलत|खरेदी|जन्मदिन|वाढदिवस/iu.test(body + ' ' + buttons.map(b=>b.text||'').join(' ')) || buttons.some(b=>String(b.type).toUpperCase()==='COPY_CODE');
  if(category==='UTILITY' && promotional) return {recommendedCategory:'MARKETING',message:'This message contains promotional or greeting content. Marketing is recommended. Utility must relate to a specific customer transaction, account, request or essential update and contain no promotions. Meta decides the final category.'};
  return null;
}
export function validateTemplateSetup(input:any) {
  if(!['en_US','en','en_GB','hi','mr'].includes(String(input.language||'en_US'))) throw Object.assign(new Error('Choose English, Hindi or Marathi.'),{statusCode:400});
  if(/\b(otp|one[- ]time (password|passcode)|verification code|authentication code)\b|ओटीपी|सत्यापन कोड/iu.test(String(input.body||'')))throw Object.assign(new Error('One-time passwords and verification codes require a Meta Authentication template. Create these in WhatsApp Manager; this editor supports Marketing and Utility.'),{statusCode:400});
  const mode=String(input.templateMode||'DEFAULT').toUpperCase();
  if(!['DEFAULT','FLOW'].includes(mode)) throw Object.assign(new Error('Choose Default or Flow.'),{statusCode:400});
  const flows=(Array.isArray(input.buttons)?input.buttons:[]).filter((b:any)=>String(b.type).toUpperCase()==='FLOW');
  if(mode==='FLOW' && flows.length!==1) throw Object.assign(new Error('Flow templates require exactly one published Meta Flow button.'),{statusCode:400});
  if(input.submitToMeta===true && input.category==='UTILITY' && input.utilityConfirmed!==true) throw Object.assign(new Error('Confirm that Utility content relates to a specific customer transaction, account or request and contains no promotions.'),{statusCode:400});
  const advice=categoryAdvice(String(input.category),String(input.body||''),input.buttons);
  if(input.submitToMeta===true && advice && input.categoryAcknowledged!==true) throw Object.assign(new Error(advice.message),{statusCode:400,code:'CATEGORY_MISMATCH',...advice});
}
export function previewSnapshot(template:any) {
  // Keep historical text/buttons. Actual sent media is stored once by media ID.
  return {name:template.name,language:template.language,category:template.category,components:(Array.isArray(template.components)?template.components:[]).map((c:any)=>{const copy={...c};delete copy.greetsync_media_preview;return copy;})};
}
export function semanticComponents(components:any[]) {
  const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).filter(k=>!k.startsWith('greetsync_')&&k!=='example').sort().map(k=>[k,canonical(value[k])])):value;
  return JSON.stringify(canonical(Array.isArray(components)?components:[]));
}
