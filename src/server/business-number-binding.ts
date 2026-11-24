import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { whatsappAccounts } from '../db/schema.ts';
import { assertBusinessNumberBinding } from './coexistence-policy.ts';

/** All connection writers use one short transaction; no network calls under its lock. */
export async function saveBusinessNumber(ownerUserId: number, values: any, manual = false, database: any = db) {
  return database.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7302, 1)`);
    const [existing] = await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, ownerUserId)).limit(1);
    const others = await tx.select().from(whatsappAccounts).where(eq(whatsappAccounts.phoneNumberId, values.phoneNumberId));
    assertBusinessNumberBinding(existing, others, values.phoneNumberId, values.businessAccountId, manual);
    if (existing?.onboardingMode === 'COEXISTENCE' && values.onboardingMode === 'COEXISTENCE') {
      values = {...values, webhookVerifyToken: existing.webhookVerifyToken,
        coexistenceSyncRequests: existing.coexistenceSyncRequests,
        coexistenceSyncStatus: existing.coexistenceSyncStatus};
    }
    if (existing?.onboardingMode !== 'COEXISTENCE' && values.onboardingMode === 'COEXISTENCE')
      values = {...values, coexistenceSyncRequests: {firstConnectedAt: new Date().toISOString()}};
    const [row] = existing
      ? await tx.update(whatsappAccounts).set(values).where(eq(whatsappAccounts.id, existing.id)).returning()
      : await tx.insert(whatsappAccounts).values({ownerUserId, ...values}).returning();
    return row;
  });
}
