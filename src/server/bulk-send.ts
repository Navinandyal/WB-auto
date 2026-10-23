import { and, eq, inArray, sql } from 'drizzle-orm';
import { automations } from '../db/schema.ts';
import { previewSnapshot } from './template-rules.ts';
import { sameSendVariables } from './message-acceptance.ts';

/** Commit the entire audience before responding. No network send occurs in this transaction.
 * A recipient/request unique key makes a timed-out HTTP response safe to replay. */
export async function enqueueSendNowBatch(database: any, ownerUserId: number, requestId: string,
  template: any, recipients: Array<{contact: any; vars: any}>,
  assertCapacity: (count: number, transaction: any) => Promise<unknown>) {
  if (!recipients.length) return [];
  return database.transaction(async (tx: any) => {
    // Serialise this business's simultaneous bulk requests, including quota reservation.
    await tx.execute(sql`select pg_advisory_xact_lock(45871, ${ownerUserId})`);
    const key = (id: number) => `${ownerUserId}:${requestId}:${id}`;
    const existing = await tx.select().from(automations).where(and(
      eq(automations.ownerUserId, ownerUserId),
      inArray(automations.sendRequestId, recipients.map(row => key(row.contact.id)))));
    const saved = new Map<number, any>(existing.map((row: any) => [row.contactId, row]));
    for (const row of recipients) {
      const previous = saved.get(row.contact.id);
      if (previous && (previous.templateId !== template.id || !sameSendVariables(previous.variables, row.vars))) {
        throw Object.assign(new Error('This send request ID was already used with different content. Start a new message.'), {statusCode: 409});
      }
    }
    const fresh = recipients.filter(row => !saved.has(row.contact.id));
    if (fresh.length) {
      await assertCapacity(fresh.length, tx);
      const now = new Date();
      const created = await tx.insert(automations).values(fresh.map(row => ({
        ownerUserId, contactId: row.contact.id, templateId: template.id,
        variables: row.vars, templateSnapshot: previewSnapshot(template),
        scheduledAt: now, timezone: 'Asia/Kolkata', status: 'SCHEDULED',
        sendRequestId: key(row.contact.id),
      }))).returning();
      for (const row of created) saved.set(row.contactId, row);
    }
    return recipients.map(row => {
      const job = saved.get(row.contact.id);
      return {contactId: row.contact.id, name: row.contact.name, automationId: job.id,
        status: job.status, replayed: existing.some((old: any) => old.id === job.id), error: job.errorMessage};
    });
  });
}
