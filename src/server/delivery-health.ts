import { pool } from '../db/index.ts';
export async function deliveryHealth(wabaId:string,phoneId:string){
  const result=await pool.query(`SELECT MAX(i.created_at) AS last_received_at,
    COUNT(*) FILTER (WHERE i.processed_at IS NULL)::int AS pending_events,
    MAX(i.last_error) FILTER (WHERE i.processed_at IS NULL) AS processing_error
    FROM meta_webhook_inbox i WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(i.payload->'entry') e,
        jsonb_array_elements(e->'changes') c
      WHERE e->>'id'=$1 AND c->'value'->'metadata'->>'phone_number_id'=$2
        AND jsonb_array_length(COALESCE(c->'value'->'statuses','[]'::jsonb))>0)`,[wabaId,phoneId]);
  const row=result.rows[0]||{};
  return {lastStatusReceivedAt:row.last_received_at||null,pendingEvents:Number(row.pending_events||0),processingError:row.processing_error||null};
}

/** Called only for this activity's verified, owner-scoped account. */
export async function deliveryEvidence(wabaId:string,phoneId:string,owner:number,activityId:number,messageIds:string[]){
  const result=await pool.query(`SELECT i.id,i.created_at,i.processed_at,s->>'status' AS status,s->'errors' AS errors
    FROM meta_webhook_inbox i
    CROSS JOIN LATERAL jsonb_array_elements(i.payload->'entry') e
    CROSS JOIN LATERAL jsonb_array_elements(e->'changes') c
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c->'value'->'statuses','[]'::jsonb)) s
    WHERE e->>'id'=$1 AND c->'value'->'metadata'->>'phone_number_id'=$2
      AND (s->>'id'=ANY($3::text[]) OR s->>'biz_opaque_callback_data'=$4)
    ORDER BY i.created_at DESC,i.id DESC LIMIT 1`,[wabaId,phoneId,messageIds,`greetsync:${owner}:${activityId}`]);
  const row=result.rows[0];
  return row?{id:row.id,receivedAt:row.created_at,processedAt:row.processed_at,status:row.status,errors:row.errors}:null;
}
