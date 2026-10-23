import { and, eq, sql } from 'drizzle-orm';
import { contactGroups, contactGroupMembers } from '../db/schema.ts';

export function importGroupName(value: unknown): string | null {
  if (value == null) return null;
  const name = String(value).trim();
  if (name.length < 2 || name.length > 80) {
    throw Object.assign(new Error('Group name must contain 2–80 characters.'), {statusCode: 400});
  }
  return name;
}

/** Called inside the same transaction as the import. Existing owned duplicates
 * are included as members without changing their details or consent. */
export async function attachImportedGroup(tx: any, ownerUserId: number, name: string | null, ids: number[]) {
  const contactIds = [...new Set(ids)];
  if (!name || !contactIds.length) return null;
  const [existing] = await tx.select().from(contactGroups).where(and(
    eq(contactGroups.ownerUserId, ownerUserId), sql`lower(${contactGroups.name}) = lower(${name})`)).limit(1);
  const group = existing ?? (await tx.insert(contactGroups).values({ownerUserId, name}).returning())[0];
  const current = await tx.select({contactId: contactGroupMembers.contactId}).from(contactGroupMembers)
    .where(eq(contactGroupMembers.groupId, group.id));
  const members = new Set(current.map((row: any) => row.contactId));
  const added = contactIds.filter(id => !members.has(id));
  if (added.length) await tx.insert(contactGroupMembers).values(added.map(contactId => ({groupId: group.id, contactId})));
  return {id: group.id, name: group.name, added: added.length, memberCount: members.size + added.length, created: !existing};
}
