import { and, count, desc, eq, gt, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { automations, contacts, messages, subscriptionPackages, userSubscriptions } from '../db/schema.ts';

export type PackageAccessSummary = {
  active: boolean;
  activeBase: any | null;
  activeAddons: any[];
  pending: any[];
  messageLimit: number;
  messagesUsed: number;
  scheduledReserved: number;
  messagesRemaining: number;
  contactLimit: number;
  contactsUsed: number;
  automationLimit: number;
  automationsUsed: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

function normalizePackage(row: any) {
  if (!row) return null;
  return {
    id: Number(row.packageId ?? row.id),
    subscriptionId: row.subscriptionId == null ? null : Number(row.subscriptionId),
    name: String(row.name || ''),
    description: row.description == null ? null : String(row.description),
    packageType: String(row.packageType || 'BASE'),
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    messageLimit: Number(row.messageLimit ?? 0),
    contactLimit: Number(row.contactLimit ?? 0),
    automationLimit: Number(row.automationLimit ?? 0),
    pricePaise: Number(row.pricePaise ?? 0),
    durationMonths: Number(row.durationMonths ?? 1),
    status: row.status == null ? null : String(row.status),
    startsAt: row.startsAt ?? null,
    endsAt: row.endsAt ?? null,
    createdAt: row.createdAt ?? null,
  };
}

export async function expireOldSubscriptions(userId?: number) {
  const now = new Date();
  const condition = userId
    ? and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, 'ACTIVE'), lte(userSubscriptions.endsAt, now))
    : and(eq(userSubscriptions.status, 'ACTIVE'), lte(userSubscriptions.endsAt, now));
  await db.update(userSubscriptions).set({ status: 'EXPIRED', updatedAt: now }).where(condition as any);
}

export async function getPackageAccessSummary(userId: number): Promise<PackageAccessSummary> {
  await expireOldSubscriptions(userId);
  const now = new Date();
  const rows = await db.select({
    subscriptionId: userSubscriptions.id,
    packageId: subscriptionPackages.id,
    status: userSubscriptions.status,
    startsAt: userSubscriptions.startsAt,
    endsAt: userSubscriptions.endsAt,
    createdAt: userSubscriptions.createdAt,
    name: subscriptionPackages.name,
    description: subscriptionPackages.description,
    packageType: subscriptionPackages.packageType,
    benefits: subscriptionPackages.benefits,
    messageLimit: userSubscriptions.messageLimitSnapshot,
    contactLimit: subscriptionPackages.contactLimit,
    automationLimit: subscriptionPackages.automationLimit,
    pricePaise: userSubscriptions.pricePaiseSnapshot,
    durationMonths: subscriptionPackages.durationMonths,
  }).from(userSubscriptions)
    .innerJoin(subscriptionPackages, eq(userSubscriptions.packageId, subscriptionPackages.id))
    .where(eq(userSubscriptions.userId, userId))
    .orderBy(desc(userSubscriptions.createdAt));

  const activeRows = rows.filter((r) => r.status === 'ACTIVE' && r.startsAt && r.endsAt && new Date(r.startsAt) <= now && new Date(r.endsAt) > now);
  const baseRows = activeRows.filter((r) => r.packageType === 'BASE').sort((a,b) => +new Date(b.startsAt!) - +new Date(a.startsAt!));
  const base = baseRows[0] || null;
  const addons = activeRows.filter((r) => r.packageType === 'MESSAGE_ADDON');
  const pending = rows.filter((r) => r.status === 'PENDING').map(normalizePackage);

  if (!base) {
    const [[contactCount], [automationCount]] = await Promise.all([
      db.select({ val: count() }).from(contacts).where(eq(contacts.ownerUserId, userId)),
      db.select({ val: count() }).from(automations).where(and(eq(automations.ownerUserId, userId), inArray(automations.status, ['SCHEDULED','PROCESSING']))),
    ]);
    return {
      active: false, activeBase: null, activeAddons: addons.map(normalizePackage), pending,
      messageLimit: 0, messagesUsed: 0, scheduledReserved: 0, messagesRemaining: 0,
      contactLimit: 0, contactsUsed: Number(contactCount?.val || 0),
      automationLimit: 0, automationsUsed: Number(automationCount?.val || 0),
      startsAt: null, endsAt: null,
    };
  }

  const startsAt = new Date(base.startsAt!);
  const endsAt = new Date(base.endsAt!);
  const messageLimit = Math.max(0, Number(base.messageLimit || 0)) + addons.reduce((sum, a) => sum + Math.max(0, Number(a.messageLimit || 0)), 0);
  const [[messageCount], [reservedCount], [contactCount], [automationCount]] = await Promise.all([
    db.select({ val: count() }).from(messages).where(and(
      eq(messages.ownerUserId, userId),
      inArray(messages.status, ['ACCEPTED','SENT','DELIVERED','READ']),
      gte(messages.createdAt, startsAt),
      lte(messages.createdAt, endsAt),
    )),
    db.select({ val: count() }).from(automations).where(and(
      eq(automations.ownerUserId, userId),
      inArray(automations.status, ['SCHEDULED','PROCESSING']),
      gte(automations.scheduledAt, startsAt),
      lte(automations.scheduledAt, endsAt),
    )),
    db.select({ val: count() }).from(contacts).where(eq(contacts.ownerUserId, userId)),
    db.select({ val: count() }).from(automations).where(and(eq(automations.ownerUserId, userId), inArray(automations.status, ['SCHEDULED','PROCESSING']))),
  ]);

  const messagesUsed = Number(messageCount?.val || 0);
  const scheduledReserved = Number(reservedCount?.val || 0);
  const unlimitedMessages = messageLimit <= 0;
  const remaining = unlimitedMessages ? 2147483647 : Math.max(0, messageLimit - messagesUsed - scheduledReserved);

  return {
    active: true,
    activeBase: normalizePackage(base),
    activeAddons: addons.map(normalizePackage),
    pending,
    messageLimit,
    messagesUsed,
    scheduledReserved,
    messagesRemaining: remaining,
    contactLimit: Math.max(0, Number(base.contactLimit || 0)),
    contactsUsed: Number(contactCount?.val || 0),
    automationLimit: Math.max(0, Number(base.automationLimit || 0)),
    automationsUsed: Number(automationCount?.val || 0),
    startsAt,
    endsAt,
  };
}

export async function requirePackageForAction(userId: number) {
  const summary = await getPackageAccessSummary(userId);
  if (!summary.active) {
    const err: any = new Error('No active GreetSync package. Purchase a package to unlock contacts, templates, messaging and automations.');
    err.statusCode = 402;
    err.code = 'PACKAGE_REQUIRED';
    err.summary = summary;
    throw err;
  }
  return summary;
}

export async function assertMessageCapacity(userId: number, requested: number, options?: { reserveScheduled?: boolean; scheduledAt?: Date }) {
  const summary = await requirePackageForAction(userId);
  if (options?.scheduledAt && summary.endsAt && options.scheduledAt > summary.endsAt) {
    const err: any = new Error(`Your active package expires on ${summary.endsAt.toISOString().slice(0,10)}. Choose a schedule before the package end date or renew the package.`);
    err.statusCode = 402; err.code = 'PACKAGE_EXPIRES_BEFORE_SCHEDULE'; throw err;
  }
  if (summary.messageLimit > 0) {
    const available = options?.reserveScheduled === false
      ? Math.max(0, summary.messageLimit - summary.messagesUsed)
      : summary.messagesRemaining;
    if (requested > available) {
      const over = requested - available;
      const err: any = new Error(`Message limit exceeded by ${over}. Your package allows ${summary.messageLimit} messages; ${summary.messagesUsed} are already sent and ${summary.scheduledReserved} are scheduled. Purchase a message add-on or upgrade your package.`);
      err.statusCode = 409; err.code = 'MESSAGE_LIMIT_EXCEEDED'; err.overBy = over; err.summary = summary; throw err;
    }
  }
  return summary;
}

export async function assertContactCapacity(userId: number, requestedNewContacts = 1) {
  const summary = await requirePackageForAction(userId);
  if (summary.contactLimit > 0 && summary.contactsUsed + requestedNewContacts > summary.contactLimit) {
    const over = summary.contactsUsed + requestedNewContacts - summary.contactLimit;
    const err: any = new Error(`Contact limit exceeded by ${over}. Your package allows ${summary.contactLimit} contacts.`);
    err.statusCode = 409; err.code = 'CONTACT_LIMIT_EXCEEDED'; throw err;
  }
  return summary;
}

export async function assertAutomationCapacity(userId: number, requested = 1) {
  const summary = await requirePackageForAction(userId);
  if (summary.automationLimit > 0 && summary.automationsUsed + requested > summary.automationLimit) {
    const over = summary.automationsUsed + requested - summary.automationLimit;
    const err: any = new Error(`Automation limit exceeded by ${over}. Your package allows ${summary.automationLimit} active automations.`);
    err.statusCode = 409; err.code = 'AUTOMATION_LIMIT_EXCEEDED'; throw err;
  }
  return summary;
}

export async function monthlyMessageUsage(userId: number, months = 6) {
  const result = await db.execute(sql`
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
           COUNT(*) FILTER (WHERE status IN ('ACCEPTED','SENT','DELIVERED','READ'))::int AS sent,
           COUNT(*) FILTER (WHERE status IN ('DELIVERED','READ'))::int AS delivered,
           COUNT(*) FILTER (WHERE status = 'READ')::int AS read,
           COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
    FROM messages
    WHERE owner_user_id = ${userId}
      AND created_at >= date_trunc('month', NOW()) - (${months - 1} * INTERVAL '1 month')
    GROUP BY date_trunc('month', created_at)
    ORDER BY date_trunc('month', created_at) ASC
  `);
  return (result.rows || []).map((r: any) => ({
    month: String(r.month), sent: Number(r.sent || 0), delivered: Number(r.delivered || 0), read: Number(r.read || 0), failed: Number(r.failed || 0),
  }));
}
