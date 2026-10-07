function normalizeTemplateButtons(rawButtons: unknown): any[] {
  const buttons = Array.isArray(rawButtons) ? rawButtons : [];
  if (buttons.length > 10) throw Object.assign(new Error('A template can contain at most 10 buttons.'), { statusCode: 400 });
  const counts = new Map<string, number>();
  const normalized = buttons.map((raw:any)=>{
    const type=String(raw?.type||'QUICK_REPLY').toUpperCase();
    counts.set(type,(counts.get(type)||0)+1);
    const text=String(raw?.text||'').trim();
    if(type!=='COPY_CODE' && type!=='REQUEST_CONTACT_INFO' && !text) throw Object.assign(new Error('Every button requires display text.'),{statusCode:400});
    if(text.length>25) throw Object.assign(new Error(`Button text can contain at most 25 characters.`),{statusCode:400});
    if(type==='URL'){
      const url=String(raw?.url||'').trim();
      if(url.length<8||url.length>2000||!/^https?:\/\//i.test(url)) throw Object.assign(new Error('Visit Website buttons require a complete http/https URL up to 2000 characters.'),{statusCode:400});
      if(/\{\{|\}\}/.test(url))throw Object.assign(new Error('Use a complete static website URL in this editor. Dynamic URLs require per-recipient button examples in WhatsApp Manager.'),{statusCode:400});
      return {type:'URL',text,url};
    }
    if(type==='PHONE_NUMBER'){
      const phone=String(raw?.phone_number||raw?.phoneNumber||'').trim();
      if(phone.length>20||!/^\+[1-9][0-9]{6,19}$/.test(phone)) throw Object.assign(new Error('Call Phone Number requires an international number with country code and maximum 20 characters.'),{statusCode:400});
      return {type:'PHONE_NUMBER',text,phone_number:phone};
    }
    if(type==='VOICE_CALL'){
      const ttl=Math.max(1440,Math.min(43200,Number(raw?.ttl_minutes||raw?.ttlMinutes||10080)));
      return {type:'VOICE_CALL',text,ttl_minutes:ttl};
    }
    if(type==='COPY_CODE'){
      const example=String(raw?.example||raw?.code||'').trim();
      if(!example||example.length>20) throw Object.assign(new Error('Copy Offer Code requires a sample code up to 20 characters.'),{statusCode:400});
      return {type:'COPY_CODE',example};
    }
    if(type==='FLOW'){
      const flowId=String(raw?.flow_id||raw?.flowId||raw?.value||'').trim();
      if(!/^\d+$/.test(flowId)) throw Object.assign(new Error('Flow templates require a Flow ID.'),{statusCode:400});
      const screen=String(raw?.navigate_screen||raw?.navigateScreen||'').trim();
      if(!screen) throw Object.assign(new Error('Flow button requires its initial screen ID.'),{statusCode:400});
      return {type:'FLOW',text,flow_id:flowId,flow_action:'navigate',navigate_screen:screen};
    }
    if(type==='REQUEST_CONTACT_INFO'){
      return {type:'REQUEST_CONTACT_INFO',text:'Share Contact Info'};
    }
    if(type!=='QUICK_REPLY') throw Object.assign(new Error(`Unsupported template button type: ${type}`),{statusCode:400});
    return {type:'QUICK_REPLY',text};
  });
  const maxPerType:Record<string,number>={URL:2,PHONE_NUMBER:1,COPY_CODE:1,FLOW:1,VOICE_CALL:1,REQUEST_CONTACT_INFO:1};
  for(const [type,limit] of Object.entries(maxPerType)) if((counts.get(type)||0)>limit) throw Object.assign(new Error(`A template can contain at most ${limit} ${type.replaceAll('_',' ')} button${limit===1?'':'s'}.`),{statusCode:400});
  if((counts.get('REQUEST_CONTACT_INFO')||0)>0 && buttons.length>1) throw Object.assign(new Error('Share Contact Info must be the only button in the template.'),{statusCode:400});
  let transitions=0;
  for(let i=1;i<normalized.length;i++)if((normalized[i].type==='QUICK_REPLY')!==(normalized[i-1].type==='QUICK_REPLY'))transitions++;
  if(transitions>1)throw Object.assign(new Error('Group Quick Reply buttons together, before or after all other buttons.'),{statusCode:400});
  return normalized;
}

export function validateTemplateVariableSyntax(text: string, label: string, options: {body?:boolean; header?:boolean} = {}) {
  const source=String(text||'');
  const openings=(source.match(/\{\{/g)||[]).length;
  const closings=(source.match(/\}\}/g)||[]).length;
  const matches=[...source.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
  if(openings!==closings||matches.length!==openings) throw Object.assign(new Error(`${label} contains malformed variables. Use {{1}} or {{order_id}}.`),{statusCode:400});
  if(!matches.length) return;
  const tokens=matches.map(m=>String(m[1]||'').trim());
  const areNumbers=tokens.every(t=>/^[1-9]\d*$/.test(t));
  const areNames=tokens.every(t=>/^[a-z_]+$/.test(t));
  if(!areNumbers&&!areNames) throw Object.assign(new Error(`${label} variables must consistently use numbered placeholders or named placeholders.`),{statusCode:400});
  if(areNumbers){
    const unique=[...new Set(tokens.map(Number))].sort((a,b)=>a-b);
    for(let i=0;i<unique.length;i++) if(unique[i]!==i+1) throw Object.assign(new Error(`${label} variables must be numbered sequentially starting with {{1}}.`),{statusCode:400});
  }
  if(/\}\}\s*\{\{/.test(source)) throw Object.assign(new Error(`${label} variables cannot be adjacent. Add normal text between variables.`),{statusCode:400});
  if(options.header&&new Set(tokens).size>1) throw Object.assign(new Error('Template header supports only one variable.'),{statusCode:400});
  if(options.body){
    const trimmed=source.trim();
    if(/^\{\{\s*[^{}]+?\s*\}\}/.test(trimmed)||/\{\{\s*[^{}]+?\s*\}\}$/.test(trimmed)) throw Object.assign(new Error('Variables can’t be at the start or end of the template. Add normal text before and after them.'),{statusCode:400});
    const staticLength=trimmed.replace(/\{\{\s*[^{}]+?\s*\}\}/g,'').replace(/\s+/g,' ').trim().length;
    if(staticLength<Math.max(8,matches.length*8)) throw Object.assign(new Error('This template has too many variables for its length. Reduce the number of variables or increase the message length.'),{statusCode:400});
  }
}

export function buildTemplateComponents(
  header: string,
  body: string,
  footer: string,
  rawButtons: unknown,
  mediaFormat: string = 'NONE',
  mediaHandle: string = '',
  rawHeaderSamples: unknown = {},
  rawBodySamples: unknown = {},
  rawHeaderMeanings: unknown = {},
  rawBodyMeanings: unknown = {},
  rawLocationSample: unknown = null,
  rawMediaPreview: unknown = null,
  requireSamples: boolean = true,
): any[] {
  const originalHeader=String(header||'');
  const originalBody=String(body||'');
  const headerTokens=[...new Set([...originalHeader.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(m=>String(m[1]||'').trim()).filter(Boolean))];
  const bodyTokens=[...new Set([...originalBody.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(m=>String(m[1]||'').trim()).filter(Boolean))];
  const sampleMap=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const meaningMap=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const headerSamples=sampleMap(rawHeaderSamples), bodySamples=sampleMap(rawBodySamples);
  const headerMeanings=meaningMap(rawHeaderMeanings), bodyMeanings=meaningMap(rawBodyMeanings);

  validateTemplateVariableSyntax(originalHeader,'Header',{header:true});
  validateTemplateVariableSyntax(originalBody,'Body',{body:true});
  header=originalHeader;
  body=originalBody;
  const allTokens=[...headerTokens,...bodyTokens];
  if(allTokens.some(t=>/^\d+$/.test(t))&&allTokens.some(t=>!/^\d+$/.test(t))) throw Object.assign(new Error('Use either Name or Number variables throughout the template, not both.'),{statusCode:400});
  validateTemplateVariableSyntax(header,'Header',{header:true});
  validateTemplateVariableSyntax(body,'Body',{body:true});
  if (body.length < 1 || body.length > 1024) throw Object.assign(new Error('Template body must contain 1-1024 characters.'), { statusCode: 400 });
  if (header.length > 60) throw Object.assign(new Error('Template header can contain at most 60 characters.'), { statusCode: 400 });
  if (header && /\p{Extended_Pictographic}/u.test(header)) throw Object.assign(new Error('Template text header cannot contain emojis.'), { statusCode: 400 });
  if (footer.length > 60) throw Object.assign(new Error('Template footer can contain at most 60 characters.'), { statusCode: 400 });
  if(/\{\{|\}\}/.test(footer)) throw Object.assign(new Error('Footer cannot contain variables.'),{statusCode:400});
  const normalizedButtons = normalizeTemplateButtons(rawButtons);
  const components:any[]=[];
  const normalizedMedia=String(mediaFormat||'NONE').toUpperCase();
  if(normalizedMedia !== 'NONE'){
    if(!['IMAGE','VIDEO','DOCUMENT','LOCATION'].includes(normalizedMedia)) throw Object.assign(new Error('Unsupported media header type.'),{statusCode:400});
    const headerComponent:any={type:'HEADER',format:normalizedMedia};
    if(normalizedMedia !== 'LOCATION'){
      const handle=String(mediaHandle||'').trim();
      if(!handle && requireSamples) throw Object.assign(new Error(`${normalizedMedia} headers require a Meta media sample handle.`),{statusCode:400});
      if(handle) headerComponent.example={header_handle:[handle]};
      if(rawMediaPreview && typeof rawMediaPreview==='object'){
        const preview=rawMediaPreview as any;
        const dataBase64=String(preview.dataBase64||'').trim();
        const mimeType=String(preview.mimeType||'').trim();
        const fileName=String(preview.fileName||'').trim();
        if(dataBase64 && mimeType){
          // Local-only metadata. WhatsAppService strips this field before the
          // create-template request is sent to Meta. It is retained in GreetSync
          // so the business can preview/reuse the media when scheduling.
          headerComponent.greetsync_media_preview={dataBase64,mimeType,fileName};
        }
      }
    } else if(rawLocationSample&&typeof rawLocationSample==='object') {
      const loc=rawLocationSample as any;
      const lat=Number(loc.latitude), lng=Number(loc.longitude);
      const validCoordinates=loc.latitude!=null&&loc.longitude!=null&&String(loc.latitude).trim()!==''&&String(loc.longitude).trim()!==''&&Number.isFinite(lat)&&lat>=-90&&lat<=90&&Number.isFinite(lng)&&lng>=-180&&lng<=180;
      if(requireSamples&&!validCoordinates) throw Object.assign(new Error('Choose a valid point on the location map.'),{statusCode:400});
      const name=String(loc.name||'').trim(), address=String(loc.address||'').trim();
      if(requireSamples && (!name||!address))throw Object.assign(new Error('Add the shop/location name and full street address before submitting this location template.'),{statusCode:400});
      headerComponent.greetsync_location={latitude:validCoordinates?lat:'',longitude:validCoordinates?lng:'',name,address};
    } else if(normalizedMedia==='LOCATION' && requireSamples) {
      throw Object.assign(new Error('Choose a location, shop name and address before submitting.'),{statusCode:400});
    }
    components.push(headerComponent);
  } else if(header){
    const headerComponent:any={type:'HEADER',format:'TEXT',text:header};
    if(headerTokens.length){
      const examples=headerTokens.map((token)=>String(headerSamples[token]??'').trim());
      if(examples.some(v=>!v)) throw Object.assign(new Error('Add a sample value for the header variable.'),{statusCode:400});
      headerComponent.example=headerTokens.every(t=>/^\d+$/.test(t))?{header_text:examples}:{header_text_named_params:headerTokens.map((token,i)=>({param_name:token,example:examples[i]}))};
      const normalizedHeaderTokens=[...new Set([...header.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(m=>String(m[1]||'').trim()).filter(Boolean))];
      headerComponent.greetsync_variable_meanings=Object.fromEntries(normalizedHeaderTokens.map((token,index)=>[token,String(headerMeanings[headerTokens[index]]||'CUSTOM')]));
    }
    components.push(headerComponent);
  }
  const bodyComponent:any={type:'BODY',text:body};
  if(bodyTokens.length){
    const examples=bodyTokens.map((token)=>String(bodySamples[token]??'').trim());
    if(examples.some(v=>!v)) throw Object.assign(new Error('Add a sample value for every body variable.'),{statusCode:400});
    bodyComponent.example=bodyTokens.every(t=>/^\d+$/.test(t))?{body_text:[examples]}:{body_text_named_params:bodyTokens.map((token,i)=>({param_name:token,example:examples[i]}))};
    const normalizedBodyTokens=[...new Set([...body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(m=>String(m[1]||'').trim()).filter(Boolean))];
    bodyComponent.greetsync_variable_meanings=Object.fromEntries(normalizedBodyTokens.map((token,index)=>[token,String(bodyMeanings[bodyTokens[index]]||'CUSTOM')]));
  }
  components.push(bodyComponent);
  if(footer) components.push({type:'FOOTER',text:footer});
  if(normalizedButtons.length) components.push({type:'BUTTONS',buttons:normalizedButtons});
  return components;
}
