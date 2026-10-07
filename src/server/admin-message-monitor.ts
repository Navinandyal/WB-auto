/** One activity per scheduled send, plus standalone outbound messages.
 * UTC database timestamps are grouped by the business reporting zone explicitly.
 * ACCEPTED is labelled Sent; an uncertain transport result remains Processing.
 */
export const reportingTimezone = 'Asia/Kolkata';
const statuses = ['ALL','SENT','FAILED','SCHEDULED','PROCESSING','PAUSED','CANCELLED','SIMULATED'];
export function monitorOptions(query: Record<string, unknown>) {
  const date = (value: unknown) => {
    if (!value) return null;
    const s = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s+'T00:00:00Z')) || new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s) throw new Error('Use a valid YYYY-MM-DD date.');
    return s;
  };
  const start=date(query.start), end=date(query.end);
  if (start && end && start>end) throw new Error('Start date must not follow end date.');
  const businessId=query.businessId!==undefined && query.businessId!==null && query.businessId!=='' ? Number(query.businessId) : null;
  if (businessId!==null && (!Number.isSafeInteger(businessId)||businessId<1)) throw new Error('Invalid business.');
  const status=String(query.status||'ALL').toUpperCase();
  if (!statuses.includes(status)) throw new Error('Invalid message status.');
  const page=Number(query.page??1),limit=Number(query.limit??40);
  if (!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>100) throw new Error('Invalid page or page size.');
  return {start,end,businessId,status,page,limit,search:String(query.search||'').trim().slice(0,150)};
}
export const messageMonitorSql = `WITH activity AS (
 SELECT 'automation:'||a.id AS key,a.id AS "automationId",m.id AS "messageId",a.owner_user_id AS "businessId",
 u.business_name AS "businessName",u.name AS "ownerName",c.name AS "contactName",c.phone AS "contactPhone",
 COALESCE(a.template_snapshot->>'name',t.name,m.template_name) AS "templateName",
 COALESCE(a.template_snapshot->>'language',t.language,m.template_language) AS language,
 COALESCE(a.template_snapshot->'components',t.components,'[]'::jsonb) AS components,
 COALESCE(m.variables,a.variables,'{}'::jsonb) AS variables,
 COALESCE(m.status,a.status) AS "rawStatus",m.whatsapp_message_id AS "whatsappMessageId",
 COALESCE(m.error_message,a.error_message) AS "errorMessage",m.error_code AS "errorCode",
 a.scheduled_at AS "scheduledAt",m.sent_at AS "sentAt",m.delivered_at AS "deliveredAt",m.read_at AS "readAt",
 COALESCE(m.sent_at,a.executed_at,a.scheduled_at) AS "activityAt",a.timezone,
 m.content,a.created_at AS "createdAt"
 FROM automations a JOIN users u ON u.id=a.owner_user_id
 LEFT JOIN contacts c ON c.id=a.contact_id LEFT JOIN message_templates t ON t.id=a.template_id
 LEFT JOIN LATERAL (SELECT * FROM messages WHERE automation_id=a.id AND direction='OUTBOUND' ORDER BY created_at DESC,id DESC LIMIT 1) m ON TRUE
 UNION ALL
 SELECT 'message:'||m.id,NULL,m.id,m.owner_user_id,u.business_name,u.name,c.name,c.phone,m.template_name,m.template_language,
 CASE WHEN m.content IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type','BODY','text',m.content)) END,
 COALESCE(m.variables,'{}'::jsonb),m.status,m.whatsapp_message_id,m.error_message,m.error_code,
 NULL,m.sent_at,m.delivered_at,m.read_at,COALESCE(m.sent_at,m.created_at),'UTC',m.content,m.created_at
 FROM messages m JOIN users u ON u.id=m.owner_user_id LEFT JOIN contacts c ON c.id=m.contact_id
 WHERE m.automation_id IS NULL AND m.direction='OUTBOUND'
), labelled AS (
 SELECT *, CASE
 WHEN "rawStatus"='ACCEPTED' AND variables->>'__meta_message_status'='unknown' THEN 'PROCESSING'
 WHEN "rawStatus" IN ('ACCEPTED','SENT','DELIVERED','READ') THEN 'SENT'
 ELSE "rawStatus" END AS status,
 (("activityAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date AS day
 FROM activity
), bounded AS (
 SELECT * FROM labelled WHERE ($1::int IS NULL OR "businessId"=$1)
 AND ($2::date IS NULL OR day>=$2) AND ($3::date IS NULL OR day<=$3)
 AND ($4::text='' OR POSITION(LOWER($4) IN LOWER(CONCAT_WS(' ',"businessName","ownerName","contactName","contactPhone","templateName")))>0)
), selected AS (SELECT * FROM bounded WHERE $5='ALL' OR status=$5),
 daily AS (SELECT day,COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='SENT')::int AS sent,
 COUNT(*) FILTER(WHERE status='FAILED')::int AS failed,COUNT(*) FILTER(WHERE status='SCHEDULED')::int AS scheduled,
 COUNT(*) FILTER(WHERE status='PROCESSING')::int AS processing,
 COUNT(*) FILTER(WHERE status IN ('PAUSED','CANCELLED','SIMULATED'))::int AS other
 FROM bounded GROUP BY day ORDER BY day DESC LIMIT 90)
 SELECT jsonb_build_object(
 'summary', (SELECT jsonb_build_object('total',COUNT(*),'sent',COUNT(*) FILTER(WHERE status='SENT'),
 'failed',COUNT(*) FILTER(WHERE status='FAILED'),'scheduled',COUNT(*) FILTER(WHERE status='SCHEDULED'),
 'processing',COUNT(*) FILTER(WHERE status='PROCESSING'),'other',COUNT(*) FILTER(WHERE status IN ('PAUSED','CANCELLED','SIMULATED'))) FROM bounded),
 'daily',COALESCE((SELECT jsonb_agg(to_jsonb(daily) ORDER BY day DESC) FROM daily),'[]'::jsonb),
 'total',(SELECT COUNT(*) FROM selected),
 'items',COALESCE((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY "activityAt" DESC,key DESC) FROM
 (SELECT * FROM selected ORDER BY "activityAt" DESC,key DESC LIMIT $6 OFFSET $7) page_rows),'[]'::jsonb)
 ) AS result`;
export async function messageMonitor(query: Record<string, unknown>, client: {query: Function}) {
 const o=monitorOptions(query);
 const data=await client.query(messageMonitorSql,[o.businessId,o.start,o.end,o.search,o.status,o.limit,(o.page-1)*o.limit]);
 return {...data.rows[0].result,page:o.page,limit:o.limit,timezone:reportingTimezone,dailyLimit:90};
}
