import {messageTemplates} from '../db/schema.ts';
import {getTableColumns, sql, type SQLWrapper} from 'drizzle-orm';
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
