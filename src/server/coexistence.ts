import { pool } from '../db/index.ts';
import { createNotification } from './notifications.ts';

export function isCoexistencePhone(phone:any):boolean {return phone?.is_on_biz_app===true && phone?.platform_type==='CLOUD_API';}
export function webhookStatus(current:string,next:string):string {
  if(current==='FAILED' && next==='SENT')return current;
  if(next==='FAILED')return ['READ','DELIVERED'].includes(current)?current:next;
  const rank:Record<string,number>={SENT:1,DELIVERED:2,READ:3};
  return (rank[next]||0)>(rank[current]||0)?next:current;
}
function digits(phone:any){return String(phone||'').replace(/\D/g,'');}
export async function digestWhatsAppChange(wabaId:string,change:any):Promise<void> {
  const value=change?.value||{};
  const phoneId=String(value.metadata?.phone_number_id||'');
  const accounts=await pool.query('SELECT owner_user_id,phone_number_id,display_phone_number,onboarding_mode FROM whatsapp_accounts WHERE business_account_id=$1 AND ($2=\'\' OR phone_number_id=$2)',[wabaId,phoneId]);
  if(!accounts.rows.length)return;
  if(['message_template_status_update','template_category_update','message_template_category_update'].includes(change.field)) {
    const id=String(value.message_template_id||'');
    const status=String(value.event||'').toUpperCase(), category=String(value.new_category||value.category||'');
    for(const a of accounts.rows){
      if(change.field==='message_template_status_update'&&['APPROVED','REJECTED','PENDING','PAUSED','DISABLED','PENDING_DELETION'].includes(status))await pool.query('UPDATE message_templates SET status=$1,updated_at=NOW() WHERE owner_user_id=$2 AND meta_template_id=$3',[status,a.owner_user_id,id]);
      if(['MARKETING','UTILITY','AUTHENTICATION'].includes(category))await pool.query('UPDATE message_templates SET category=$1,updated_at=NOW() WHERE owner_user_id=$2 AND meta_template_id=$3',[category,a.owner_user_id,id]);
    }return;
  }
  for(const account of accounts.rows){
    const owner=Number(account.owner_user_id);
    if(change.field==='account_update' && ['ACCOUNT_OFFBOARDED','ACCOUNT_DISCONNECTED'].includes(String(value.event))){
      await pool.query('UPDATE whatsapp_accounts SET connection_status=\'DISCONNECTED\',status=\'DISCONNECTED\',updated_at=NOW() WHERE owner_user_id=$1',[owner]);
      await createNotification({userId:owner,type:'ACCOUNT',title:'WhatsApp disconnected',message:'Reconnect your WhatsApp Business app from GreetSync to resume automation.'});return;
    }
    // Contacts received through Coexistence do not imply marketing consent.
    for(const state of Array.isArray(value.state_sync)?value.state_sync:[]){
      if(state.type!=='contact')continue;
      const phone=digits(state.contact?.phone_number);if(!phone)continue;
      if(String(state.action).toLowerCase()==='delete'||String(state.action).toLowerCase()==='remove')continue; // retain historical GreetSync contacts
      const name=String(state.contact?.full_name||state.contact?.first_name||phone);
      await pool.query(`INSERT INTO contacts(owner_user_id,name,phone,opt_in,notes) SELECT $1,$2,$3,FALSE,'Synced from WhatsApp Business app; consent must be confirmed before automation.' WHERE NOT EXISTS(SELECT 1 FROM contacts WHERE owner_user_id=$1 AND regexp_replace(phone,'[^0-9]','','g')=$4)`,[owner,name,'+'+phone,phone]);
    }
    const ensureContact=async(phone:string,name?:string)=>{
      const found=await pool.query(`SELECT id FROM contacts WHERE owner_user_id=$1 AND regexp_replace(phone,'[^0-9]','','g')=$2 LIMIT 1`,[owner,phone]);if(found.rows[0])return found.rows[0].id;
      const added=await pool.query('INSERT INTO contacts(owner_user_id,name,phone,opt_in) VALUES($1,$2,$3,FALSE) RETURNING id',[owner,name||phone,'+'+phone]);return added.rows[0].id;
    };
    const saveMessage=async(m:any,threadPhone?:string,forceOutbound=false)=>{
      if(!m.id)return;
      const from=digits(m.from),to=digits(m.to),business=digits(account.display_phone_number);
      const outbound=forceOutbound || (!!threadPhone && from!==digits(threadPhone)) || (!!business && from===business);
      const phone=digits(threadPhone)||(outbound?to:from);if(!phone)return;
      const contactId=await ensureContact(phone,value.contacts?.find((c:any)=>digits(c.wa_id)===phone)?.profile?.name);
      const type=String(m.type||'text');const content=m.text?.body||m[type]?.caption||m[type]?.filename||`[${type}]`;
      const timestamp=new Date((Number(m.timestamp)||Math.floor(Date.now()/1000))*1000);
      const historicalStatus=String(m.history_context?.status||'SENT').toUpperCase();
      const status=['SENT','DELIVERED','READ','FAILED'].includes(historicalStatus)?historicalStatus:historicalStatus==='ERROR'?'FAILED':'SENT';
      const meta={__source:forceOutbound?'WHATSAPP_BUSINESS_APP':threadPhone?'WHATSAPP_HISTORY':'CLOUD_API',...(m[type]?.id?{__header_media_id:String(m[type].id),__header_media_type:type.toUpperCase()}:{}),...(m.location?{__header_location_latitude:String(m.location.latitude),__header_location_longitude:String(m.location.longitude)}:{})};
      // Dedupe echoes and replayed history chunks by WhatsApp message ID. Later
      // media chunks only enrich content; they never overwrite delivery status.
      await pool.query(`INSERT INTO messages(owner_user_id,contact_id,direction,message_type,content,variables,whatsapp_message_id,status,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(whatsapp_message_id) DO UPDATE SET content=CASE WHEN messages.message_type='MEDIA_PLACEHOLDER' THEN EXCLUDED.content ELSE messages.content END,variables=COALESCE(messages.variables,'{}'::jsonb)||EXCLUDED.variables,message_type=CASE WHEN messages.message_type='MEDIA_PLACEHOLDER' THEN EXCLUDED.message_type ELSE messages.message_type END WHERE messages.owner_user_id=EXCLUDED.owner_user_id`,[owner,contactId,outbound?'OUTBOUND':'INBOUND',type.toUpperCase(),content,JSON.stringify(meta),String(m.id),status,timestamp]);
    };
    for(const m of Array.isArray(value.messages)?value.messages:[])await saveMessage(m);
    for(const m of Array.isArray(value.message_echoes)?value.message_echoes:[])await saveMessage(m,undefined,true);
    for(const chunk of Array.isArray(value.history)?value.history:[]){
      for(const thread of Array.isArray(chunk.threads)?chunk.threads:[])for(const m of Array.isArray(thread.messages)?thread.messages:[])await saveMessage(m,String(thread.id));
      if(chunk.metadata?.progress===100){const updated=await pool.query(`UPDATE whatsapp_accounts SET coexistence_sync_status='COMPLETE',updated_at=NOW() WHERE owner_user_id=$1 AND coexistence_sync_status IS DISTINCT FROM 'COMPLETE' RETURNING id`,[owner]);if(updated.rowCount)await createNotification({userId:owner,type:'ACCOUNT',title:'WhatsApp history synchronized',message:'Your shared WhatsApp Business app history is synchronized. You can continue using the Business app and GreetSync together.'});}
      if(chunk.errors?.some((e:any)=>Number(e.code)===2593109))await pool.query("UPDATE whatsapp_accounts SET coexistence_sync_status='HISTORY_NOT_SHARED' WHERE owner_user_id=$1",[owner]);
    }
    for(const status of Array.isArray(value.statuses)?value.statuses:[]){
      const next=String(status.status||'').toUpperCase();if(!['SENT','DELIVERED','READ','FAILED'].includes(next))continue;
      const found=await pool.query('SELECT id,status,automation_id FROM messages WHERE owner_user_id=$1 AND whatsapp_message_id=$2',[owner,String(status.id)]);let row=found.rows[0];
      const correlation=String(status.biz_opaque_callback_data||'').match(/^greetsync:(\d+):(\d+)$/);
      if(!row && correlation && Number(correlation[1])===owner){
        // A POST can time out after Meta accepted it. Recover its message ID
        // from the signed receipt without submitting another message.
        const uncertain=await pool.query("SELECT id,status,automation_id FROM messages WHERE owner_user_id=$1 AND automation_id=$2 AND whatsapp_message_id IS NULL AND status='ACCEPTED' LIMIT 1",[owner,Number(correlation[2])]);
        if(uncertain.rows[0]){
          row=uncertain.rows[0];
          await pool.query('UPDATE messages SET whatsapp_message_id=$1 WHERE id=$2 AND whatsapp_message_id IS NULL',[String(status.id),row.id]);
        }
      }
      if(!row){
        if(correlation && Number(correlation[1])===owner){
          const early=await pool.query("SELECT id FROM automations WHERE id=$1 AND owner_user_id=$2 AND status IN ('PROCESSING','ACCEPTED')",[Number(correlation[2]),owner]);
          if(early.rows.length)throw new Error('Delivery event arrived before its message record. Retry the persisted webhook.');
        }
        const pending=await pool.query(`SELECT a.id FROM automations a JOIN contacts c ON c.id=a.contact_id WHERE a.owner_user_id=$1 AND a.status IN ('PROCESSING','ACCEPTED') AND regexp_replace(c.phone,'[^0-9]','','g')=$2 AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.automation_id=a.id) LIMIT 1`,[owner,digits(status.recipient_id)]);
        if(pending.rows.length)throw new Error('Delivery event arrived before its message record. Retry the persisted webhook.');
        continue;
      }
      const normalized=webhookStatus(row.status,next), stamp=new Date((Number(status.timestamp)||Date.now()/1000)*1000).toISOString();
      const metaError=status.errors?.[0];
      const errorText=normalized==='FAILED' && next==='FAILED' ? [metaError?.title,metaError?.message,metaError?.error_data?.details].filter(Boolean).join(': ') || 'WhatsApp delivery failed.' : null;
      // Event timestamps belong to the incoming event, not the final status.
      // A late SENT must not rewrite an already recorded delivery/read time.
      await pool.query(`UPDATE messages SET status=$1,
        sent_at=CASE WHEN $5='SENT' THEN COALESCE(sent_at,$2::timestamptz AT TIME ZONE 'UTC') ELSE sent_at END,
        delivered_at=CASE WHEN $5='DELIVERED' THEN COALESCE(delivered_at,$2::timestamptz AT TIME ZONE 'UTC') ELSE delivered_at END,
        read_at=CASE WHEN $5='READ' THEN COALESCE(read_at,$2::timestamptz AT TIME ZONE 'UTC') ELSE read_at END,
        failed_at=CASE WHEN $1='FAILED' AND $5='FAILED' THEN COALESCE(failed_at,$2::timestamptz AT TIME ZONE 'UTC') ELSE failed_at END,
        variables=CASE WHEN $1 IN ('SENT','DELIVERED','READ') THEN (COALESCE(variables,'{}'::jsonb)-'__delivery_note'-'__delivery_tracking_warning')||jsonb_build_object('__meta_message_status',lower($1::text)) ELSE variables END,
        error_message=CASE WHEN $1 IN ('SENT','DELIVERED','READ') THEN NULL ELSE COALESCE($3,error_message) END,
        error_code=CASE WHEN $1 IN ('SENT','DELIVERED','READ') THEN NULL ELSE error_code END WHERE id=$4`,[normalized,stamp,errorText,row.id,next]);
      if(errorText) await pool.query('UPDATE messages SET error_code=$1 WHERE id=$2',[String(metaError?.code||'DELIVERY_FAILED'),row.id]);
      if(row.automation_id)await pool.query(`UPDATE automations SET status=$1,updated_at=NOW(),
        variables=CASE WHEN $1 IN ('SENT','DELIVERED','READ') THEN (COALESCE(variables,'{}'::jsonb)-'__delivery_note'-'__delivery_tracking_warning')||jsonb_build_object('__meta_message_status',lower($1::text)) ELSE variables END,
        error_message=CASE WHEN $1 IN ('SENT','DELIVERED','READ') THEN NULL ELSE COALESCE($2,error_message) END WHERE id=$3`,[normalized,errorText,row.automation_id]);
      if(normalized==='FAILED' && row.status!=='FAILED') await createNotification({userId:owner,type:'MESSAGE',title:'WhatsApp message failed',message:errorText!,entityType:'AUTOMATION',entityId:row.automation_id||null});
    }
  }
}
