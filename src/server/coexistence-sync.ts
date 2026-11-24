type Query = {query: (sql: string, args?: any[]) => Promise<any>};
type Store = Query & {connect: () => Promise<Query & {release: () => void}>};
/** Persist the claim before the one-time remote operation. An uncertain outcome
 * must be reconciled with webhooks/Meta, never retried as a new sync request. */
export async function requestCoexistenceSync(store: Store, owner: number, phone: string,
  send: (type: string) => Promise<any>) {
  for (const type of ['smb_app_state_sync', 'history']) {
    const c = await store.connect();
    let claimed = false;
    try {
      await c.query('BEGIN');
      const result = await c.query('SELECT phone_number_id,onboarding_mode,connection_status,coexistence_sync_requests FROM whatsapp_accounts WHERE owner_user_id=$1 FOR UPDATE', [owner]);
      const a = result.rows[0];
      if (!a || a.phone_number_id !== phone || a.onboarding_mode !== 'COEXISTENCE' || !['CONNECTING','CONNECTED'].includes(a.connection_status))
        throw new Error('Reconnect this WhatsApp Business number before synchronizing.');
      const ledger = a.coexistence_sync_requests || {};
      if (!ledger[type]) {
        // Older connections have no trustworthy onboarding timestamp. Do not
        // invent a new 24-hour window on reconnect.
        const started = Date.parse(ledger.firstConnectedAt || '');
        if (!Number.isFinite(started) || Date.now() - started > 24 * 60 * 60 * 1000)
          throw new Error('The one-time synchronization window is unverified or expired. Continue using automation; check sharing in WhatsApp Business.');
        ledger[type] = {state: 'REQUESTING', at: new Date().toISOString()};
        await c.query('UPDATE whatsapp_accounts SET coexistence_sync_requests=$2 WHERE owner_user_id=$1', [owner, JSON.stringify(ledger)]);
        claimed = true;
      }
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
    if (!claimed) continue;
    try {
      const result = await send(type);
      if (!result?.request_id) throw new Error('Meta did not return a synchronization request ID.');
      await store.query(`UPDATE whatsapp_accounts SET coexistence_sync_requests=jsonb_set(coexistence_sync_requests,ARRAY[$2::text],$3::jsonb),coexistence_sync_status=CASE WHEN coexistence_sync_status IN ('COMPLETE','HISTORY_NOT_SHARED') THEN coexistence_sync_status ELSE 'REQUESTED' END,updated_at=NOW() WHERE owner_user_id=$1 AND phone_number_id=$4`,
        [owner,type,JSON.stringify({state:'REQUESTED',requestId:String(result.request_id)}),phone]);
    } catch {
      await store.query(`UPDATE whatsapp_accounts SET coexistence_sync_requests=jsonb_set(coexistence_sync_requests,ARRAY[$2::text],$3::jsonb),coexistence_sync_status=CASE WHEN coexistence_sync_status IN ('COMPLETE','HISTORY_NOT_SHARED') THEN coexistence_sync_status ELSE 'SYNC_ERROR' END WHERE owner_user_id=$1 AND phone_number_id=$4`,
        [owner,type,JSON.stringify({state:'OUTCOME_UNKNOWN'}),phone]);
      throw new Error('Synchronization outcome is unconfirmed. The one-time request will not be repeated; wait for WhatsApp sharing events or contact support. Automation can still use the connected number.');
    }
  }
  const result = await store.query('SELECT coexistence_sync_requests FROM whatsapp_accounts WHERE owner_user_id=$1',[owner]);
  const ledger = result.rows[0]?.coexistence_sync_requests || {};
  if (Object.values(ledger).some((v:any) => v?.state === 'OUTCOME_UNKNOWN' || v?.state === 'REQUESTING'))
    throw new Error('A previous synchronization request is still unconfirmed. It cannot be submitted again safely.');
}
