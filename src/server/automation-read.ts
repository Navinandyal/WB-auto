import {automations,contacts,messageTemplates} from '../db/schema.ts';
import {and,desc,eq,lt,getTableColumns, sql, type SQLWrapper} from 'drizzle-orm';
// Project in PostgreSQL: removing bytes after fetching would not reduce pooler egress.
export function compactComponents(column:SQLWrapper){
 return sql`COALESCE((SELECT jsonb_agg(part.value - 'greetsync_media_preview' ORDER BY part.ordinality) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${column})='array' THEN ${column} ELSE '[]'::jsonb END) WITH ORDINALITY AS part(value,ordinality)), '[]'::jsonb)`;
}
export function compactSnapshot(column:SQLWrapper){
 return sql`CASE WHEN jsonb_typeof(${column}->'components')='array' THEN jsonb_set(${column},'{components}',${compactComponents(sql`${column}->'components'`)}) ELSE ${column} END`;
}
export function confirmedAutomationRows(rows:any[],template:any,recipients:any[]){
 const byId=new Map(recipients.map(c=>[c.id,c]));
 return rows.map(row=>({...row,contactName:byId.get(row.contactId)?.name||'',contactPhone:byId.get(row.contactId)?.phone||'',contactOptIn:byId.get(row.contactId)?.optIn===true,templateName:template.name,templateLanguage:template.language,templateStatus:template.status,templateComponents:[]}));
}

export async function readAutomationStatuses(database:{query:(...args:any[])=>Promise<any>},owner:number|null,rawIds:unknown){
 const ids=String(rawIds||'').split(',').filter(Boolean).map(Number);
 if(!ids.length||ids.length>500||ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw Object.assign(new Error('Provide 1-500 valid message IDs.'),{statusCode:400});
 return (await database.query('SELECT id,status,executed_at AS "executedAt",error_message AS "errorMessage",updated_at AS "updatedAt" FROM automations WHERE id=ANY($1::int[]) AND ($2::int IS NULL OR owner_user_id=$2)',[ids,owner])).rows;
}

export const templateListSelect = {...getTableColumns(messageTemplates),components:compactComponents(messageTemplates.components)};

export const automationListSelect = {
  id: automations.id,
  ownerUserId: automations.ownerUserId,
  contactId: automations.contactId,
  templateId: automations.templateId,
  variables: automations.variables,
  scheduledAt: automations.scheduledAt,
  timezone: automations.timezone,
  status: automations.status,
  templateSnapshot: compactSnapshot(automations.templateSnapshot),
  sendRequestId: automations.sendRequestId,
  executedAt: automations.executedAt,
  errorMessage: automations.errorMessage,
  createdAt: automations.createdAt,
  contactName: contacts.name,
  contactPhone: contacts.phone,
  contactOptIn: contacts.optIn,
  templateName: messageTemplates.name,
  templateLanguage: messageTemplates.language,
  templateStatus: messageTemplates.status,
  templateComponents: sql`CASE WHEN ${automations.templateSnapshot} IS NOT NULL THEN '[]'::jsonb ELSE ${compactComponents(messageTemplates.components)} END`,
};

export const MAX_BULK_RECIPIENTS=2000;
export function validateAudience(ids:number[]){
 if(!ids.length||ids.length>MAX_BULK_RECIPIENTS)throw Object.assign(new Error('Select between 1 and 2,000 contacts per batch.'),{statusCode:400});
}
export function pageOptions(query:any){
 const limit=query?.limit==null?50:Number(query.limit);const before=query?.before==null?null:Number(query.before);
 if(!Number.isInteger(limit)||limit<1||limit>100||before!==null&&(!Number.isSafeInteger(before)||before<=0))throw Object.assign(new Error('Use a page size of 1-100 and a valid before ID.'),{statusCode:400});
 return {limit,before};
}
export async function readAutomationPage(database:any,owner:number|null,query:any){
 const {limit,before}=pageOptions(query);
 const rows=await database.select(automationListSelect).from(automations)
  .innerJoin(contacts,eq(automations.contactId,contacts.id)).innerJoin(messageTemplates,eq(automations.templateId,messageTemplates.id))
  .where(and(owner===null?undefined:eq(automations.ownerUserId,owner),before===null?undefined:lt(automations.id,before)))
  .orderBy(desc(automations.id)).limit(limit+1);
 const items=rows.slice(0,limit);
 return {items,nextCursor:rows.length>limit?items[items.length-1].id:null};
}
