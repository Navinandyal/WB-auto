/** A provider business ID on account_update is not the customer's WABA ID. */
export function effectiveWebhookWaba(entryId: string, change: any): string {
  return change?.field === 'account_update'
    ? String(change.value?.waba_info?.waba_id || entryId)
    : String(entryId);
}
export function automationConnectionReady(account: any): boolean {
  const state = String(account?.connectionStatus || 'NOT_CONNECTED');
  return state === 'CONNECTED' || (account?.onboardingMode !== 'COEXISTENCE' && state === 'SAVED');
}
export function assertBusinessNumberBinding(existing: any, others: any[], phone: string, waba: string, manual = false) {
  if (!phone || !waba) throw new Error('Both the authorized WhatsApp number and business account are required.');
  if (others.some(a => a.phoneNumberId === phone && a.ownerUserId !== existing?.ownerUserId))
    throw new Error('This WhatsApp number is already connected to another GreetSync business.');
  if (existing?.phoneNumberId && (existing.phoneNumberId !== phone || existing.businessAccountId !== waba))
    throw new Error('Changing the sender would affect existing scheduled messages. Use a separate business account for another number.');
  if (manual && existing?.onboardingMode === 'COEXISTENCE')
    throw new Error('Reconnect this number through Meta Embedded Signup to preserve WhatsApp Business app Coexistence.');
}
