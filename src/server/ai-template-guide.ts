const fail=(message:string)=>Object.assign(new Error(message),{statusCode:400});
export function templateGuide(raw:any,language:string,business:any){
  if(raw==null)return null;
  if(typeof raw!=='object'||Array.isArray(raw))throw fail('Choose valid AI template options.');
  const text=(key:string,max:number)=>{if(raw[key]!=null&&!['string','number'].includes(typeof raw[key]))throw fail(`AI ${key} must be text.`);const value=String(raw[key]||'').trim();if(value.length>max)throw fail(`AI ${key} is too long.`);return value;};
  const purpose=text('purpose',20)||'OTHER',tone=text('tone',120)||'Professional',languageStyle=text('languageStyle',20)||'STANDARD',mediaPreference=text('mediaPreference',20)||'AUTO';
  if(!['BIRTHDAY','CAMPAIGN','MARKETING','FESTIVAL','REMINDER','OTHER'].includes(purpose))throw fail('Select a supported template purpose.');
  if(!['STANDARD','BILINGUAL'].includes(languageStyle)||languageStyle==='BILINGUAL'&&!['hi','mr'].includes(language))throw fail('Choose English + Marathi or English + Hindi for a bilingual message.');
  if(!['AUTO','NONE','IMAGE','VIDEO','DOCUMENT','LOCATION'].includes(mediaPreference))throw fail('Choose a supported attachment type.');
  const recipientType=text('recipientType',120)||'Customer';
  const age=text('age',3);if(age&&(!/^\d{1,3}$/.test(age)||Number(age)<1||Number(age)>120))throw fail('Enter an optional age from 1 to 120.');
  return {purpose,purposeLabel:text('purposeLabel',120)||purpose,tone,languageStyle,mediaPreference,recipientType,recipientName:text('recipientName',80),organization:text('organization',140),age,achievement:text('achievement',180),campaignTitle:text('campaignTitle',120),offer:text('offer',180),callToAction:text('callToAction',140),date:text('date',100),closing:purpose==='BIRTHDAY'?`Warm Regards,\nTeam ${String(business.businessName||business.name||'Your business').trim()}`:''};
}
export function validateGuidedTemplate(draft:any,guide:ReturnType<typeof templateGuide>){
  if(!guide)return;
  if(guide.mediaPreference!=='AUTO'&&draft.mediaFormat!==guide.mediaPreference)throw Object.assign(new Error('AI did not follow your attachment choice. Generate again or choose Automatic.'),{statusCode:502});
  if(guide.purpose==='BIRTHDAY'){
    const complete=[draft.body,draft.footer].filter(Boolean).join('\n').trim();
    const words=complete.split(/\s+/u).filter(Boolean).length;
    if(words<60||words>120)throw Object.assign(new Error('AI birthday text must contain 60–120 words within the WhatsApp character limit. Try generating again with a shorter change note.'),{statusCode:502});
    if(!draft.body.includes('{{customer_name}}'))throw Object.assign(new Error('AI omitted the reusable recipient name. Generate the birthday template again.'),{statusCode:502});
    if(!complete.endsWith(guide.closing))throw Object.assign(new Error('AI omitted your business birthday closing. Generate again to include Warm Regards and your business team name.'),{statusCode:502});
  }
}
