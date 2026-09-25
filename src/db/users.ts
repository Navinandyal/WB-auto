import { eq } from 'drizzle-orm';
import { db, isDatabaseConnected } from './index.ts';
import { users } from './schema.ts';
import { hashPassword, normalizeLoginPhone } from '../lib/password-auth.ts';

export async function getOrCreateUser(uid: string, email: string, name?: string) {
  if (!isDatabaseConnected) {
    return { id: 1, uid, email, phone: null, name: name || 'Admin', role: 'admin', isActive: true, createdAt: new Date() };
  }

  try {
    const result = await db.insert(users)
      .values({ uid, email, name: name || null, role: 'admin', isActive: true })
      .onConflictDoUpdate({ target: users.uid, set: { email, name: name || null } })
      .returning();
    return result[0];
  } catch (error) {
    console.warn('Notice syncing legacy user to PostgreSQL (using session user):', error);
    return { id: 1, uid, email, phone: null, name: name || 'Admin', role: 'admin', isActive: true, createdAt: new Date() };
  }
}

export const FIXED_ADMIN_MOBILE = '+919999999999';
export const FIXED_ADMIN_PASSWORD = 'Admin@12345';
export const FIXED_ADMIN_NAME = 'System Administrator';
export const FIXED_ADMIN_EMAIL = 'admin@wishflow.local';

export async function ensureFixedAdminUser() {
  if (!isDatabaseConnected) return null;

  // The platform administrator is intentionally fixed. WhatsApp/business
  // automation credentials are NOT stored here and are never shared globally.
  const phone = normalizeLoginPhone(FIXED_ADMIN_MOBILE);
  const password = FIXED_ADMIN_PASSWORD;
  const name = FIXED_ADMIN_NAME;
  const email = FIXED_ADMIN_EMAIL;
  const uid = 'fixed_admin';

  if (!phone) throw new Error('Fixed administrator mobile number is invalid.');
  const byUid = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
  const passwordHash = hashPassword(password);

  if (byUid[0]) {
    const updated = await db.update(users).set({
      phone,
      role: 'admin',
      isActive: true,
      approvalStatus: 'ACTIVE',
      approvedAt: new Date(),
      passwordHash,
    }).where(eq(users.id, byUid[0].id)).returning();
    return updated[0];
  }

  const byPhone = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (byPhone[0]) {
    const updated = await db.update(users).set({
      uid,
      role: 'admin',
      isActive: true,
      approvalStatus: 'ACTIVE',
      approvedAt: new Date(),
      passwordHash,
    }).where(eq(users.id, byPhone[0].id)).returning();
    return updated[0];
  }

  const inserted = await db.insert(users).values({
    uid,
    email,
    phone,
    passwordHash,
    name,
    role: 'admin',
    isActive: true,
    approvalStatus: 'ACTIVE',
    approvedAt: new Date(),
  }).returning();
  return inserted[0];
}
