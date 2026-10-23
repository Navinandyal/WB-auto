import { metaErrorText } from './marketing-limits.ts';
import { randomUUID } from 'node:crypto';
import { templateHeaderError } from './template-media.ts';
/**
 * Official Meta WhatsApp Business Cloud API Integration Service
 * Follows Graph API v21.0 standards
 */

export interface MetaSendTemplateParams {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
  recipientPhone: string; // E.164 format without + or spaces e.g. "919876543210"
  templateName: string;
  templateLanguage: string; // e.g. "en_US" or "en"
  variables: Record<string, string>; // body: { "1": "Rahul" }, header: { "header_1": "Order 123" }
  templateComponents?: any[]; // Stored Meta template components, used to place header/body variables correctly.
  trackingId?: string;
  fallbackToHelloWorldIfNotFound?: boolean; // If custom template does not exist on Meta (#132001), fallback to official hello_world
}

export interface MetaTestResult {
  success: boolean;
  phoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  error?: string;
}

export interface MetaTemplateComponent {
  type: string; // BODY, HEADER, FOOTER, BUTTONS
  format?: string;
  text?: string;
  example?: {
    body_text?: string[][];
  };
}

export interface MetaRawTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: MetaTemplateComponent[];
}

export class WhatsAppService {
  static async createTemplate(params: { businessAccountId: string; accessToken: string; apiVersion?: string; name: string; category: string; language: string; components: any[] }): Promise<{success:boolean; id?:string; status?:string; category?:string; error?:string}> {
    try {
      const url = `https://graph.facebook.com/${params.apiVersion || 'v21.0'}/${encodeURIComponent(params.businessAccountId)}/message_templates`;
      const cleanComponents = params.components.map((raw:any) => {
        const component = {...raw};
        delete component.greetsync_variable_meanings;
        delete component.greetsync_location;
        delete component.greetsync_media_preview;
        return component;
      });
      const response = await fetch(url, {
        method:'POST',
        headers:{ Authorization:`Bearer ${params.accessToken}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ name:params.name, category:params.category, language:params.language, components:cleanComponents, parameter_format:params.components.some((c:any)=>/\{\{\s*[a-z_]/.test(String(c.text||'')))?'NAMED':'POSITIONAL' }),
      });
      const data = await response.json();
      if(!response.ok || data.error){ const f=this.formatMetaErrorMessage(data.error,response.status); return {success:false,error:f.message}; }
      return {success:true,id:data.id,status:data.status || 'PENDING',category:data.category};
    } catch(err:any){ return {success:false,error:err.message || 'Unable to create WhatsApp template.'}; }
  }
  static async editTemplate(params:{templateId:string;accessToken:string;apiVersion?:string;category?:string;components:any[]}):Promise<{success:boolean;status?:string;category?:string;error?:string}> {
    try {
      const components=params.components.map(raw=>Object.fromEntries(Object.entries(raw).filter(([key])=>!key.startsWith('greetsync_'))));
      const response=await fetch(`https://graph.facebook.com/${params.apiVersion||'v21.0'}/${encodeURIComponent(params.templateId)}`,{
        method:'POST',headers:{Authorization:`Bearer ${params.accessToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({category:params.category,components}),
      });
      const data=await response.json();
      if(!response.ok||data.error||data.success===false) return {success:false,error:this.formatMetaErrorMessage(data.error,response.status).message};
      // An edit is never treated as approved locally; sync/webhooks confirm it.
      try {const current=await fetch(`https://graph.facebook.com/${params.apiVersion||'v21.0'}/${encodeURIComponent(params.templateId)}?fields=status,category`,{headers:{Authorization:`Bearer ${params.accessToken}`}});const updated=await current.json();if(current.ok&&!updated.error)return {success:true,status:updated.status||'PENDING',category:updated.category};}catch{}
      return {success:true,status:'PENDING'};
    }catch(err:any){return {success:false,error:err.message||'Meta template edit failed.'};}
  }
  static async uploadTemplateMediaSample(params: { appId:string; accessToken:string; apiVersion?:string; fileName:string; mimeType:string; bytes:Uint8Array }): Promise<{success:boolean; handle?:string; error?:string}> {
    try {
      const version=params.apiVersion||'v21.0';
      const sessionUrl=new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(params.appId)}/uploads`);
      sessionUrl.searchParams.set('file_length',String(params.bytes.byteLength));
      sessionUrl.searchParams.set('file_type',params.mimeType);
      sessionUrl.searchParams.set('file_name',params.fileName);
      const sessionRes=await fetch(sessionUrl,{method:'POST',headers:{Authorization:`Bearer ${params.accessToken}`}});
      const sessionData=await sessionRes.json();
      if(!sessionRes.ok||sessionData.error||!sessionData.id){ const f=this.formatMetaErrorMessage(sessionData.error,sessionRes.status); return {success:false,error:f.message||'Unable to create Meta upload session.'}; }
      const uploadRes=await fetch(`https://graph.facebook.com/${version}/${sessionData.id}`,{
        method:'POST',
        headers:{Authorization:`OAuth ${params.accessToken}`,'Content-Type':params.mimeType,'file_offset':'0'},
        body:params.bytes,
      });
      const uploadData=await uploadRes.json();
      if(!uploadRes.ok||uploadData.error||!uploadData.h){ const f=this.formatMetaErrorMessage(uploadData.error,uploadRes.status); return {success:false,error:f.message||'Unable to upload template media sample.'}; }
      return {success:true,handle:String(uploadData.h)};
    } catch(err:any){ return {success:false,error:err.message||'Unable to upload template media sample.'}; }
  }

  static async uploadMessageMedia(params:{phoneNumberId:string;accessToken:string;apiVersion?:string;fileName:string;mimeType:string;bytes:Uint8Array}):Promise<{success:boolean;mediaId?:string;error?:string}> {
    try {
      const version=params.apiVersion||'v21.0';
      const form=new FormData();
      form.append('messaging_product','whatsapp');
      form.append('type',params.mimeType);
      const arrayBuffer=params.bytes.buffer.slice(params.bytes.byteOffset,params.bytes.byteOffset+params.bytes.byteLength) as ArrayBuffer;
      form.append('file',new Blob([arrayBuffer],{type:params.mimeType}),params.fileName||'greetsync-media');
      const response=await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(params.phoneNumberId)}/media`,{
        method:'POST',
        headers:{Authorization:`Bearer ${params.accessToken}`},
        body:form,
      });
      const data=await response.json();
      if(!response.ok||data.error||!data.id){const f=this.formatMetaErrorMessage(data.error,response.status);return {success:false,error:f.message||'Unable to upload WhatsApp media.'};}
      return {success:true,mediaId:String(data.id)};
    } catch(err:any){return {success:false,error:err.message||'Unable to upload WhatsApp media.'};}
  }

  static async deleteTemplate(params:{businessAccountId:string;accessToken:string;apiVersion?:string;name:string;metaTemplateId?:string|null}):Promise<{success:boolean;error?:string}> {
    try{
      const version=params.apiVersion||'v21.0';
      const attempt = async (includeId:boolean) => {
        const url=new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(params.businessAccountId)}/message_templates`);
        url.searchParams.set('name',params.name);
        if(includeId && params.metaTemplateId) url.searchParams.set('hsm_id',String(params.metaTemplateId));
        const response=await fetch(url,{method:'DELETE',headers:{Authorization:`Bearer ${params.accessToken}`}});
        const data=await response.json().catch(()=>({}));
        if(response.ok && !data.error) return {success:true as const};
        const f=this.formatMetaErrorMessage(data.error,response.status);
        const message=f.message||'Meta template deletion failed.';
        if(/does not exist|not found|already deleted|unknown template/i.test(message)) return {success:true as const};
        return {success:false as const,error:message};
      };
      if(params.metaTemplateId){
        const byId=await attempt(true);
        if(byId.success) return {success:true};
        const byName=await attempt(false);
        return byName.success ? {success:true} : {success:false,error:byName.error||byId.error};
      }
      const byName=await attempt(false);
      return byName.success ? {success:true} : {success:false,error:byName.error};
    }catch(err:any){ return {success:false,error:err.message||'Meta template deletion failed.'}; }
  }

  /**
   * Cleans and normalizes phone number to WhatsApp recipient format (digits only, no + or spaces)
   */
  static normalizePhoneForWhatsApp(phone: string): string {
    return (phone || '').replace(/[^0-9]/g, '');
  }

  /**
   * Automatically discovers the WhatsApp Business Account (WABA) ID linked to a given Phone Number ID.
   */
  static async autoDiscoverBusinessAccountId(
    phoneNumberId: string,
    accessToken: string,
    apiVersion: string = 'v21.0'
  ): Promise<string | null> {
    try {
      const cleanPhoneId = (phoneNumberId || '').trim().replace(/['"]/g, '');
      const cleanToken = (accessToken || '').trim().replace(/['"]/g, '');
      const cleanVersion = (apiVersion || 'v21.0').trim().replace(/['"]/g, '') || 'v21.0';

      if (!cleanPhoneId || !cleanToken) return null;

      const url = `https://graph.facebook.com/${cleanVersion}/${encodeURIComponent(cleanPhoneId)}?fields=whatsapp_business_account`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.whatsapp_business_account?.id || null;
    } catch {
      return null;
    }
  }

  /**
   * Translates common Meta API errors into clear, actionable developer guidance
   */
  static formatMetaErrorMessage(errorObj: any, status: number): { message: string; code: string } {
    const errCode = errorObj?.code ? String(errorObj.code) : String(status);
    let errMsg = metaErrorText(errorObj, `Meta API error (${status})`);

    if (errCode === '131030' || errMsg.includes('131030') || errMsg.toLowerCase().includes('not in allowed list')) {
      errMsg = `Recipient not in allowed list (Meta Error #131030): Your Meta App is in Development / Test Mode. Meta only permits messages to verified test numbers. To fix: In Meta Developer Dashboard -> WhatsApp -> API Setup, find the "To" recipient dropdown, click "Manage phone number list", add the recipient's phone number, and verify with OTP. (To message anyone without whitelisting, switch your Meta App to Live Mode).`;
    } else if (errCode === '132001' || errMsg.includes('132001') || errMsg.toLowerCase().includes('does not exist in the translation')) {
      errMsg = `Template Not Found in WhatsApp (#132001): The template is not created or approved in your Meta WhatsApp Business Account for this language. "hello_world" (en_US) is WhatsApp's only built-in pre-approved template that works out-of-the-box. To use other template names, create and approve them in Meta WhatsApp Manager, or use "hello_world".`;
    } else if (errCode === '131026' || errMsg.includes('Message undeliverable')) {
      errMsg = `Message Undeliverable (#131026): The recipient number might not have WhatsApp installed, or 24 hours have passed since customer interaction. Use an APPROVED template message for customer-initiated conversations.`;
    } else if (errCode === '190' || errMsg.includes('OAuth') || errMsg.includes('access token')) {
      errMsg = `Access Token Expired or Invalid (#190): Please check your System User Permanent Access Token in WhatsApp Settings.`;
    }

    return { message: errMsg, code: errCode };
  }

  /**
   * Sends a custom text message via Meta WhatsApp Business Cloud API
   */
  static async sendTextMessage(params: {
    phoneNumberId: string;
    accessToken: string;
    apiVersion?: string;
    recipientPhone: string;
    text: string;
  }): Promise<{
    success: boolean;
    whatsappMessageId?: string;
    rawResponse?: any;
    error?: string;
    errorCode?: string;
  }> {
    const {
      phoneNumberId,
      accessToken,
      apiVersion = 'v21.0',
      recipientPhone,
      text,
    } = params;

    const normalizedRecipient = this.normalizePhoneForWhatsApp(recipientPhone);
    if (!normalizedRecipient || normalizedRecipient.length < 8) {
      return {
        success: false,
        error: 'Invalid recipient phone number. Must include country code without + or spaces (e.g., 919876543210).',
      };
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedRecipient,
      type: 'text',
      text: {
        preview_url: false,
        body: text,
      },
    };

    try {
      const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        const { message: errMsg, code: errCode } = this.formatMetaErrorMessage(data.error, response.status);
        return {
          success: false,
          error: errMsg,
          errorCode: errCode,
          rawResponse: data,
        };
      }

      const messageId = data.messages?.[0]?.id;
      if (!messageId) return {success:false,error:'Meta did not accept the message: no message ID was returned.',errorCode:'MISSING_MESSAGE_ID',rawResponse:data};
      return {
        success: true,
        whatsappMessageId: messageId,
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error executing Meta WhatsApp API call',
      };
    }
  }

  /**
   * Tests the Meta WhatsApp Business API connection by querying the phone number details
   */
  static async testConnection(
    phoneNumberId: string,
    accessToken: string,
    apiVersion: string = 'v21.0'
  ): Promise<MetaTestResult> {
    try {
      const cleanPhoneId = (phoneNumberId || '').trim().replace(/['"]/g, '');
      const cleanToken = (accessToken || '').trim().replace(/['"]/g, '');
      const cleanVersion = (apiVersion || 'v21.0').trim().replace(/['"]/g, '') || 'v21.0';

      if (!cleanPhoneId || !cleanToken) {
        return {
          success: false,
          error: 'Phone Number ID and Access Token must not be empty.',
        };
      }

      const url = `https://graph.facebook.com/${cleanVersion}/${encodeURIComponent(cleanPhoneId)}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        },
      });

      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        return {
          success: false,
          error: `Meta Graph API returned an unexpected response (HTTP ${response.status}): ${text.slice(0, 150)}`,
        };
      }

      if (!response.ok || data.error) {
        const metaError = data.error;
        let errorMsg = metaError?.message || `Meta API error (HTTP ${response.status})`;
        if (metaError?.error_user_msg) {
          errorMsg = `${errorMsg} - ${metaError.error_user_msg}`;
        }
        return {
          success: false,
          error: errorMsg,
        };
      }

      return {
        success: true,
        phoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
        qualityRating: data.quality_rating,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error connecting to Meta Graph API',
      };
    }
  }

  /**
   * Fetches approved message templates for the WhatsApp Business Account (WABA)
   */
  static async fetchTemplates(
    businessAccountId: string,
    accessToken: string,
    apiVersion: string = 'v21.0'
  ): Promise<{ success: boolean; templates?: MetaRawTemplate[]; error?: string }> {
    try {
      const rawTemplates: MetaRawTemplate[] = [];
      let after: string | undefined;
      const cursors = new Set<string>();
      do {
        const url = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(businessAccountId)}/message_templates`);
        url.searchParams.set('limit', '100');
        url.searchParams.set('fields', 'id,name,language,category,status,components');
        if (after) url.searchParams.set('after', after);
        const response = await fetch(url, {headers: {Authorization: `Bearer ${accessToken}`}});
        const data = await response.json();
        if (!response.ok || data.error || !Array.isArray(data.data)) {
          return {success:false,error:data.error?.message || `Failed to fetch templates: HTTP ${response.status}`};
        }
        rawTemplates.push(...data.data);
        after = data.paging?.next ? data.paging?.cursors?.after : undefined;
        if (data.paging?.next && !after) return {success:false,error:'Meta returned incomplete template pagination. Try syncing again.'};
        if (after && cursors.has(after)) return {success:false,error:'Meta repeated a template page. Try syncing again.'};
        if (after) cursors.add(after);
      } while (after);
      return {success:true,templates:rawTemplates};
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to fetch templates from Meta Graph API',
      };
    }
  }

  /**
   * Sends an official WhatsApp Template Message via Meta WhatsApp Business Cloud API
   * POST https://graph.facebook.com/{apiVersion}/{phoneNumberId}/messages
   */
  static async sendTemplateMessage(params: MetaSendTemplateParams): Promise<{
    success: boolean;
    whatsappMessageId?: string;
    rawResponse?: any;
    error?: string;
    errorCode?: string;
    fellBackToHelloWorld?: boolean;
    fallbackNote?: string;
  }> {
    const {
      phoneNumberId,
      accessToken,
      apiVersion = 'v21.0',
      recipientPhone,
      templateName,
      templateLanguage,
      variables,
      templateComponents = [],
      fallbackToHelloWorldIfNotFound = false,
    } = params;

    const normalizedRecipient = this.normalizePhoneForWhatsApp(recipientPhone);
    if (!normalizedRecipient || normalizedRecipient.length < 8) {
      return {
        success: false,
        error: 'Invalid recipient phone number. Must include country code.',
      };
    }

    const tokensFor = (type: string): string[] => {
      const raw = Array.isArray(templateComponents)
        ? templateComponents.find((component: any) => String(component?.type || '').toUpperCase() === type)
        : null;
      const text = String(raw?.text || '');
      const seen: string[] = [];
      for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
        const token = String(match[1] || '').trim();
        if (token && !seen.includes(token)) seen.push(token);
      }
      return seen;
    };

    const parameterFor = (token: string, value: string) => {
      const parameter: any = { type: 'text', text: String(value ?? '') };
      if (!/^\d+$/.test(token)) parameter.parameter_name = token;
      return parameter;
    };

    const headerError = templateHeaderError(templateComponents, variables);
    if (headerError) return {success:false,error:headerError,errorCode:'INVALID_TEMPLATE_HEADER'};
    const components: any[] = [];
    const rawHeader = Array.isArray(templateComponents)
      ? templateComponents.find((component:any)=>String(component?.type||'').toUpperCase()==='HEADER')
      : null;
    const headerFormat=String(rawHeader?.format||'TEXT').toUpperCase();
    if(['IMAGE','VIDEO','DOCUMENT'].includes(headerFormat) && templateName !== 'hello_world'){
      const mediaId=String(variables.__header_media_id||'').trim();
      const mediaLink=String(variables.__header_media_link||'').trim();
      if(!mediaId && !mediaLink){
        return {success:false,error:`Template ${templateName} requires a ${headerFormat.toLowerCase()} header. Select the media before scheduling the message.`,errorCode:'MISSING_MEDIA_HEADER'};
      }
      const mediaKey=headerFormat.toLowerCase();
      const mediaPayload:any=mediaId?{id:mediaId}:{link:mediaLink};
      if(headerFormat==='DOCUMENT' && String(variables.__header_media_filename||'').trim()) mediaPayload.filename=String(variables.__header_media_filename).trim();
      components.push({type:'header',parameters:[{type:mediaKey,[mediaKey]:mediaPayload}]});
    } else if(headerFormat==='LOCATION' && templateName !== 'hello_world'){
      const latitude=Number(variables.__header_location_latitude);
      const longitude=Number(variables.__header_location_longitude);
      const name=String(variables.__header_location_name||'').trim();
      const address=String(variables.__header_location_address||'').trim();
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)){
        return {success:false,error:`Template ${templateName} requires a location header. Select a location before scheduling the message.`,errorCode:'MISSING_LOCATION_HEADER'};
      }
      components.push({type:'header',parameters:[{type:'location',location:{latitude,longitude,name,address}}]});
    }
    // An accepted send can fail later if WhatsApp cannot retrieve/decode the media.
    // Check uploaded media against this business number; review handles are never send IDs.
    if (['VIDEO','DOCUMENT'].includes(headerFormat)) {
      const id=String(variables.__header_media_id||'').trim();
      if(!id) return {success:false,error:'Upload the actual video or PDF file. A preview/download link is not a verified WhatsApp attachment.',errorCode:'MEDIA_UPLOAD_REQUIRED'};
      try {
        const url=new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(id)}`);
        url.searchParams.set('phone_number_id',phoneNumberId);
        const check=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(15000)});
        const media=await check.json();
        if(!check.ok||media.error||String(media.id||'')!==id) return {success:false,error:'The uploaded attachment is expired or unavailable for this WhatsApp number. Select and upload the file again.',errorCode:'MEDIA_UNAVAILABLE'};
        const allowed=headerFormat==='DOCUMENT'?['application/pdf']:['video/mp4','video/3gpp'];
        if(!allowed.includes(media.mime_type)) return {success:false,error:'The uploaded attachment does not match this template. Upload a compatible video or PDF.',errorCode:'MEDIA_TYPE_MISMATCH'};
      } catch {return {success:false,error:'Unable to verify the attachment with WhatsApp. Try again before sending.',errorCode:'MEDIA_CHECK_FAILED'};}
    }
    const headerTokens = tokensFor('HEADER');
    if (headerFormat==='TEXT' && headerTokens.length > 0 && templateName !== 'hello_world') {
      const parameters = headerTokens.map((token) => {
        const key = `header_${token}`;
        return parameterFor(token, String(variables[key] ?? ''));
      });
      if (parameters.some(parameter => !String(parameter.text).trim())) return {success:false,error:'Enter all required header variables.',errorCode:'MISSING_TEMPLATE_VARIABLE'};
      components.push({ type: 'header', parameters });
    }

    const bodyTokens = tokensFor('BODY');
    let bodyParameters: any[] = [];
    if (bodyTokens.length > 0) {
      bodyParameters = bodyTokens.map((token) =>
        parameterFor(token, String(variables[`body_${token}`] ?? variables[token] ?? '')),
      );
    } else if (!templateComponents.some((c:any) => String(c?.type || '').toUpperCase() === 'BODY')) {
      // Backwards compatibility only when no BODY definition was stored.
      const sortedKeys = Object.keys(variables)
        .filter((key) => /^\d+$/.test(key))
        .map((key) => Number(key))
        .sort((a, b) => a - b);
      bodyParameters = sortedKeys.map((idx) => ({ type: 'text', text: String(variables[String(idx)] ?? '') }));
    }
    if (bodyParameters.some(parameter => !String(parameter.text).trim())) return {success:false,error:'Enter all required body variables.',errorCode:'MISSING_TEMPLATE_VARIABLE'};
    if (bodyParameters.length > 0 && templateName !== 'hello_world') {
      components.push({ type: 'body', parameters: bodyParameters });
    }

    const buttons=templateComponents.find((c:any)=>String(c?.type||'').toUpperCase()==='BUTTONS')?.buttons || [];
    for(let index=0;index<buttons.length;index++){
      const button=buttons[index], type=String(button.type||'').toUpperCase();
      if(type==='FLOW')components.push({type:'button',sub_type:'flow',index:String(index),parameters:[{type:'action',action:{flow_token:variables[`button_${index}_flow_token`]||randomUUID()}}]});
      if(type==='COPY_CODE'){
        const coupon=String(variables[`button_${index}_code`]||button.example||'').trim();
        if(!coupon||coupon.length>20)return {success:false,error:'Enter an offer code up to 20 characters.',errorCode:'INVALID_COUPON_CODE'};
        components.push({type:'button',sub_type:'copy_code',index:String(index),parameters:[{type:'coupon_code',coupon_code:coupon}]});
      }
      if(type==='URL'){
        const token=String(button.url||'').match(/\{\{\s*([^{}]+?)\s*\}\}/)?.[1]?.trim();
        if(token){
          const text=String(variables[`button_${index}_${token}`]??variables[token]??'').trim();
          if(!text)return {success:false,error:`Enter the URL value for button ${index+1}.`,errorCode:'MISSING_TEMPLATE_VARIABLE'};
          components.push({type:'button',sub_type:'url',index:String(index),parameters:[parameterFor(token,encodeURIComponent(text))]});
        }
      }
    }

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedRecipient,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: templateLanguage,
        },
      },
    };

    if (components.length > 0) {
      payload.template.components = components;
    }
    if(params.trackingId)payload.biz_opaque_callback_data=params.trackingId;

    try {
      const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25000),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        const { message: errMsg, code: errCode } = this.formatMetaErrorMessage(data.error, response.status);

        // If template doesn't exist on Meta (#132001) and was not hello_world,
        // automatically fall back to Meta's universal pre-approved 'hello_world' template!
        const isTemplateMissingOnMeta =
          errCode === '132001' ||
          String(data.error?.code) === '132001' ||
          errMsg.includes('132001') ||
          errMsg.toLowerCase().includes('does not exist in the translation');

        if (isTemplateMissingOnMeta && templateName !== 'hello_world' && fallbackToHelloWorldIfNotFound) {
          console.warn(`[WhatsApp] Template '${templateName}' does not exist in Meta account (Error #132001). Attempting automatic fallback to WhatsApp's default approved 'hello_world' template...`);

          const fallbackPayload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: normalizedRecipient,
            type: 'template',
            template: {
              name: 'hello_world',
              language: {
                code: 'en_US',
              },
            },
          };

          try {
            const fallbackRes = await fetch(url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(fallbackPayload),
            });
            const fallbackData = await fallbackRes.json();
            if (fallbackRes.ok && fallbackData.messages?.[0]?.id) {
              const fallbackMsgId = fallbackData.messages[0].id;
              console.log(`[WhatsApp] Successfully delivered via fallback 'hello_world' template (WAMID: ${fallbackMsgId})`);
              return {
                success: true,
                whatsappMessageId: fallbackMsgId,
                fellBackToHelloWorld: true,
                fallbackNote: `Fell back to WhatsApp's default pre-approved 'hello_world' template because template '${templateName}' is not approved on Meta yet.`,
                rawResponse: fallbackData,
              };
            } else {
              console.warn('[WhatsApp] Fallback hello_world returned error:', fallbackData.error);
            }
          } catch (fbErr: any) {
            console.warn('[WhatsApp] Fallback hello_world request failed:', fbErr?.message);
          }
        }

        return {
          success: false,
          error: errMsg,
          errorCode: errCode,
          rawResponse: data,
        };
      }

      const messageId = data.messages?.[0]?.id;
      if (!messageId) return {success:false,error:'Meta did not accept the message: no message ID was returned.',errorCode:'MISSING_MESSAGE_ID',rawResponse:data};
      return {
        success: true,
        whatsappMessageId: messageId,
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: 'The connection ended before Meta confirmed the send result. Delivery is unknown; check the recipient before creating another attempt.',
        errorCode: 'SEND_OUTCOME_UNKNOWN',
      };
    }
  }
}
