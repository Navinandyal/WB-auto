import 'dotenv/config';
import express from 'express';
import { randomBytes, randomInt } from 'crypto';
import path from 'path';
import { db, initDatabaseSchema, isDatabaseConnected } from './src/db/index.ts';
import { localStore } from './src/db/localStore.ts';
import {
  users,
  whatsappAccounts,
  contacts,
  contactGroups,
  contactGroupMembers,
  messageTemplates,
  automations,
  messages,
  auditLogs,
  passwordResetRequests,
} from './src/db/schema.ts';
import { eq, desc, sql, and, count, inArray, or, like, gt, isNull } from 'drizzle-orm';
import { requireAuth, requireAdmin, AuthRequest } from './src/middleware/auth.ts';
import { ensureFixedAdminUser } from './src/db/users.ts';
import { createSessionToken, hashPassword, normalizeLoginPhone, verifyPassword } from './src/lib/password-auth.ts';
import { WhatsAppService } from './src/server/whatsapp.ts';
import { automationWorker } from './src/server/worker.ts';
import { resolveWhatsAppCredentials, encryptedCredentialValues } from './src/server/credentials.ts';
import { decryptSecret } from './src/server/credential-crypto.ts';
import { WishflowService } from './src/server/wishflow.ts';

const app = express();
const PORT = 3000;

app.use(express.json());

// WhatsApp credentials are stored per approved business user in PostgreSQL.
// No automation credentials are loaded from .env or shared globally.

// Ensure tables exist on startup (especially on local device)
initDatabaseSchema()
  .then(async (connected) => {
    if (connected) {
      try {
        // Ensure the fixed administrator exists for mobile-number/password login.
        const fixedAdmin = await ensureFixedAdminUser();
        if (fixedAdmin) {
          console.log(`[Auth] Fixed administrator ready for ${fixedAdmin.phone}.`);
        }

        // Remove legacy demo templates from older builds. These records were platform
        // placeholders and must not appear in real business accounts.
        const legacyDemoMetaIds = [
          'meta_tpl_hello_world',
          'meta_tpl_appointment_confirmation',
          'meta_tpl_payment_reminder',
          'meta_tpl_welcome_message',
          'meta_tpl_happy_birthday_wishes',
        ];
        await db.delete(messageTemplates).where(and(
          isNull(messageTemplates.ownerUserId),
          inArray(messageTemplates.metaTemplateId, legacyDemoMetaIds),
        ));

        // The user supplied this Birthday template as an already-approved Meta
        // template. Keep exactly one platform reference for it, with the real
        // template name used for sending: `birthday`. Business-synced Meta
        // templates still override/appear alongside this only when they are real.
        await db.insert(messageTemplates).values({
          ownerUserId: null,
          metaTemplateId: 'approved_reference_birthday',
          name: 'birthday',
          language: 'en_US',
          category: 'MARKETING',
          status: 'APPROVED',
          components: [{
            type: 'BODY',
            text: 'Happy Birthday {{1}}! 🎂🎉 Wishing you a wonderful celebration and a fantastic year ahead filled with happiness, health, and success! Warmest regards from our team.',
          }],
          variableCount: 1,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: messageTemplates.metaTemplateId,
          set: {
            name: 'birthday',
            language: 'en_US',
            category: 'MARKETING',
            status: 'APPROVED',
            components: [{
              type: 'BODY',
              text: 'Happy Birthday {{1}}! 🎂🎉 Wishing you a wonderful celebration and a fantastic year ahead filled with happiness, health, and success! Warmest regards from our team.',
            }],
            variableCount: 1,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
        });
        // The supplied screenshot confirms the Birthday template is approved.
        // Upgrade any older pending copy of this same template so the UI does not
        // keep showing PENDING_APPROVAL from previous demo/build data.
        await db.update(messageTemplates).set({
          status: 'APPROVED',
          category: 'MARKETING',
          language: 'en_US',
          components: [{
            type: 'BODY',
            text: 'Happy Birthday {{1}}! 🎂🎉 Wishing you a wonderful celebration and a fantastic year ahead filled with happiness, health, and success! Warmest regards from our team.',
          }],
          variableCount: 1,
          updatedAt: new Date(),
        }).where(or(
          eq(messageTemplates.name, 'birthday'),
          eq(messageTemplates.name, 'happy_birthday_wishes'),
        ));

        console.log('[WhatsApp] Legacy demo templates removed; approved Birthday template is ready.');
      } catch (err: any) {
        console.warn('Notice seeding env WhatsApp credentials/templates to DB:', err?.message);
      }
    }
  })
  .catch((err) => {
    console.warn('Initial schema sync notice:', err.message);
  });

// Start the background worker queue
automationWorker.start();

// Initialize WishFlow and sync birthday automations
setTimeout(async () => {
  WishflowService.syncAllContactsBirthdays()
    .then((res) => console.log(`[Wishflow] Initial sync: verified ${res.synced} contacts, scheduled ${res.scheduled} birthday automations.`))
    .catch((err) => console.warn('[Wishflow] Initial sync notice:', err?.message));
}, 3000);

/* =========================================================================
   1. AUTHENTICATION, REGISTRATION & APPROVAL
   ========================================================================= */

// Public registration for business users. The account cannot log in until an admin approves it.
app.post('/api/auth/register', async (req, res) => {
  try {
    if (!isDatabaseConnected) return res.status(503).json({ error: 'Database is not connected.' });

    const phone = normalizeLoginPhone(req.body?.mobile || req.body?.phone || '');
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();
    const businessName = String(req.body?.businessName || '').trim();
    const businessAddress = String(req.body?.businessAddress || '').trim();
    const email = String(req.body?.email || '').trim();

    if (!phone || !password || !name || !businessName || !businessAddress) {
      return res.status(400).json({ error: 'Name, business name, business address, mobile number and password are required.' });
    }
    const registrationPhoneCheck = validateInternationalPhone(phone);
    if (!registrationPhoneCheck.ok) return res.status(400).json({ error: registrationPhoneCheck.error });
    if (name.length < 2) return res.status(400).json({ error: 'Please enter a valid full name.' });
    if (businessName.length < 2) return res.status(400).json({ error: 'Please enter a valid business name.' });
    if (businessAddress.length < 3) return res.status(400).json({ error: 'Please enter a valid business address.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const existing = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (existing.length) return res.status(409).json({ error: 'An account with this mobile number already exists.' });

    const digits = phone.replace(/\D/g, '');
    const [created] = await db.insert(users).values({
      uid: `business_${digits}_${Date.now()}`,
      email: email || `${digits}@business.local`,
      phone,
      passwordHash: hashPassword(password),
      name,
      businessName,
      businessAddress: businessAddress || null,
      role: 'business_user',
      isActive: true,
      approvalStatus: 'PENDING',
    }).returning({
      id: users.id,
      phone: users.phone,
      name: users.name,
      businessName: users.businessName,
      approvalStatus: users.approvalStatus,
      createdAt: users.createdAt,
    });

    await db.insert(auditLogs).values({
      action: 'BUSINESS_USER_REGISTERED',
      actor: phone,
      details: { userId: created.id, businessName },
    });

    res.status(201).json({
      success: true,
      status: 'PENDING',
      message: 'Registration submitted. Please wait for administrator approval before signing in.',
      user: created,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to register account.' });
  }
});

// Mobile number + password only. No Google/OAuth/bypass login.
app.post('/api/auth/mobile-login', async (req, res) => {
  try {
    if (!isDatabaseConnected) return res.status(503).json({ error: 'Database is not connected. Login requires PostgreSQL.' });

    const phone = normalizeLoginPhone(req.body?.mobile || req.body?.phone || '');
    const password = String(req.body?.password || '');
    if (!phone || !password) return res.status(400).json({ error: 'Mobile number and password are required.' });

    const [account] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!account || !account.passwordHash || !verifyPassword(password, account.passwordHash)) {
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', error: 'Invalid mobile number or password.' });
    }
    if (!account.isActive) {
      return res.status(403).json({ code: 'ACCOUNT_DISABLED', error: 'This account has been disabled by the administrator.' });
    }
    if (account.role !== 'admin') {
      if (account.approvalStatus === 'PENDING') {
        return res.status(403).json({ code: 'ACCOUNT_PENDING', error: 'Your account is waiting for admin approval. Please try again after approval.' });
      }
      if (account.approvalStatus === 'REJECTED') {
        return res.status(403).json({ code: 'ACCOUNT_REJECTED', error: 'Your registration was not approved. Please contact the administrator.' });
      }
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, account.id));
    const user = {
      id: account.id,
      uid: account.uid,
      phone: account.phone || phone,
      email: account.email,
      name: account.name || 'User',
      role: account.role,
      businessName: account.businessName || '',
      approvalStatus: account.role === 'admin' ? 'APPROVED' : account.approvalStatus,
    };
    const token = createSessionToken(user);
    res.json({ success: true, token, user });
  } catch (err: any) {
    console.error('Mobile login error:', err);
    res.status(500).json({ error: 'Failed to authenticate user.' });
  }
});


// Password recovery. Mobile number or registered email may be used to request a short-lived code.
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    if (!isDatabaseConnected) return res.status(503).json({ error: 'Database is not connected.' });

    const identifier = String(req.body?.identifier || '').trim();
    if (!identifier) return res.status(400).json({ error: 'Enter your registered mobile number or email.' });

    let account: any | undefined;
    if (identifier.includes('@')) {
      const [row] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${identifier})`).limit(1);
      account = row;
    } else {
      const phone = normalizeLoginPhone(identifier);
      if (!phone) return res.status(400).json({ error: 'Enter a valid mobile number.' });
      const [row] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
      account = row;
    }

    if (!account) return res.status(404).json({ error: 'No account was found for that mobile number or email.' });
    if (!account.isActive) return res.status(403).json({ error: 'This account is disabled. Contact the administrator.' });

    const resetId = randomBytes(24).toString('hex');
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(passwordResetRequests).values({
      resetId,
      userId: account.id,
      codeHash: hashPassword(code),
      expiresAt,
    });

    await db.insert(auditLogs).values({
      action: 'PASSWORD_RESET_REQUESTED',
      actor: account.phone || account.email,
      details: { userId: account.id },
    });

    // This project currently has no SMS/email delivery provider. For local development,
    // return the verification code so the complete reset flow can be tested end-to-end.
    // Production intentionally omits it; connect an SMS/email sender before deployment.
    res.json({
      success: true,
      resetId,
      expiresInSeconds: 900,
      message: 'Verification code generated. It expires in 15 minutes.',
      ...(process.env.NODE_ENV === 'production' ? {} : { verificationCode: code }),
    });
  } catch (err: any) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Unable to start password reset.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    if (!isDatabaseConnected) return res.status(503).json({ error: 'Database is not connected.' });

    const resetId = String(req.body?.resetId || '').trim();
    const code = String(req.body?.code || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!resetId || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the valid 6-digit verification code.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const [request] = await db
      .select()
      .from(passwordResetRequests)
      .where(and(
        eq(passwordResetRequests.resetId, resetId),
        isNull(passwordResetRequests.usedAt),
        gt(passwordResetRequests.expiresAt, new Date()),
      ))
      .limit(1);

    if (!request || !verifyPassword(code, request.codeHash)) {
      return res.status(400).json({ error: 'The verification code is invalid or has expired.' });
    }

    await db.update(users).set({ passwordHash: hashPassword(newPassword) }).where(eq(users.id, request.userId));
    await db.update(passwordResetRequests).set({ usedAt: new Date() }).where(eq(passwordResetRequests.id, request.id));

    await db.insert(auditLogs).values({
      action: 'PASSWORD_RESET_COMPLETED',
      actor: `user:${request.userId}`,
      details: { userId: request.userId },
    });

    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err: any) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Unable to reset password.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
    const [account] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
    if (!account || !account.isActive) return res.status(401).json({ error: 'User session is no longer active.' });
    if (account.role !== 'admin' && account.approvalStatus !== 'APPROVED') {
      return res.status(403).json({ code: 'ACCOUNT_PENDING', error: 'Account approval is required.' });
    }
    res.json({ user: {
      id: account.id, uid: account.uid, phone: account.phone || '', email: account.email,
      name: account.name || 'User', role: account.role, businessName: account.businessName || '',
      approvalStatus: account.role === 'admin' ? 'APPROVED' : account.approvalStatus,
    }});
  } catch {
    res.status(500).json({ error: 'Unable to load current user.' });
  }
});

app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [[businesses], [pending], [contactCount], [automationCount], [messageCount]] = await Promise.all([
      db.select({ val: count() }).from(users).where(eq(users.role, 'business_user')),
      db.select({ val: count() }).from(users).where(and(eq(users.role, 'business_user'), eq(users.approvalStatus, 'PENDING'))),
      db.select({ val: count() }).from(contacts),
      db.select({ val: count() }).from(automations),
      db.select({ val: count() }).from(messages),
    ]);
    res.json({
      totalBusinesses: Number(businesses?.val || 0),
      pendingApprovals: Number(pending?.val || 0),
      totalContacts: Number(contactCount?.val || 0),
      totalAutomations: Number(automationCount?.val || 0),
      totalMessages: Number(messageCount?.val || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load admin overview.' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select({
      id: users.id, uid: users.uid, phone: users.phone, email: users.email, name: users.name,
      businessName: users.businessName, businessAddress: users.businessAddress, role: users.role,
      isActive: users.isActive, approvalStatus: users.approvalStatus, approvedAt: users.approvedAt,
      lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
    }).from(users).where(sql`${users.role} <> 'admin'`).orderBy(desc(users.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to load business users.' });
  }
});

app.post('/api/admin/users/:id/approval', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '').toUpperCase();
    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
      return res.status(400).json({ error: 'status must be APPROVED, REJECTED or PENDING.' });
    }
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing || existing.role === 'admin') return res.status(404).json({ error: 'Business user not found.' });
    const [updated] = await db.update(users).set({
      approvalStatus: status,
      approvedAt: status === 'APPROVED' ? new Date() : null,
      approvedById: status === 'APPROVED' ? req.user?.id : null,
      isActive: status === 'REJECTED' ? false : true,
    }).where(eq(users.id, id)).returning();
    await db.insert(auditLogs).values({
      action: `BUSINESS_USER_${status}`,
      actor: req.user?.phone || 'admin',
      details: { userId: id, businessName: existing.businessName },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update approval status.' });
  }
});

app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing || existing.role === 'admin') return res.status(404).json({ error: 'Business user not found.' });
    const update: any = {};
    if (req.body?.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body?.email !== undefined) update.email = String(req.body.email).trim() || existing.email;
    if (req.body?.businessName !== undefined) update.businessName = String(req.body.businessName).trim();
    if (req.body?.businessAddress !== undefined) update.businessAddress = String(req.body.businessAddress).trim();
    if (req.body?.isActive !== undefined) update.isActive = Boolean(req.body.isActive);
    if (req.body?.password) {
      const password = String(req.body.password);
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      update.passwordHash = hashPassword(password);
    }
    const [updated] = await db.update(users).set(update).where(eq(users.id, id)).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update business user.' });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing || existing.role === 'admin') return res.status(404).json({ error: 'Business user not found.' });
    await db.delete(users).where(eq(users.id, id));
    await db.insert(auditLogs).values({ action: 'BUSINESS_USER_DELETED', actor: req.user?.phone || 'admin', details: { userId: id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete business user.' });
  }
});

/* =========================================================================
   2. BUSINESS DASHBOARD STATS
   ========================================================================= */

app.get('/api/dashboard/stats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const ownerUserId = req.user!.id;
    const creds = await resolveWhatsAppCredentials(ownerUserId);
    const [[contactCount], [scheduledCount], [sentCount], [failedCount], accountRows, upcoming] = await Promise.all([
      db.select({ val: count() }).from(contacts).where(eq(contacts.ownerUserId, ownerUserId)),
      db.select({ val: count() }).from(automations).where(and(eq(automations.ownerUserId, ownerUserId), eq(automations.status, 'SCHEDULED'))),
      db.select({ val: count() }).from(messages).where(and(eq(messages.ownerUserId, ownerUserId), inArray(messages.status, ['SENT', 'DELIVERED', 'READ']))),
      db.select({ val: count() }).from(messages).where(and(eq(messages.ownerUserId, ownerUserId), eq(messages.status, 'FAILED'))),
      db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, ownerUserId)).limit(1),
      db.select({
        id: automations.id, contactId: automations.contactId, templateId: automations.templateId,
        scheduledAt: automations.scheduledAt, timezone: automations.timezone, status: automations.status,
        variables: automations.variables, executedAt: automations.executedAt, errorMessage: automations.errorMessage,
        contactName: contacts.name, contactPhone: contacts.phone, contactOptIn: contacts.optIn,
        templateName: messageTemplates.name, templateLanguage: messageTemplates.language, templateStatus: messageTemplates.status,
      }).from(automations)
        .innerJoin(contacts, eq(automations.contactId, contacts.id))
        .innerJoin(messageTemplates, eq(automations.templateId, messageTemplates.id))
        .where(and(eq(automations.ownerUserId, ownerUserId), eq(automations.status, 'SCHEDULED')))
        .orderBy(automations.scheduledAt).limit(5),
    ]);
    const account = accountRows[0];
    res.json({
      connection: {
        configured: creds.isFullyConfigured, hasToken: creds.hasToken, hasPhoneId: creds.hasPhoneId,
        tokenSource: creds.tokenSource, status: creds.isFullyConfigured ? 'CONNECTED' : 'DISCONNECTED',
        displayPhoneNumber: account?.displayPhoneNumber || null, verifiedName: account?.verifiedName || null,
        qualityRating: account?.qualityRating || null, lastTestedAt: account?.lastTestedAt || null,
      },
      stats: {
        totalContacts: Number(contactCount?.val || 0), scheduledMessages: Number(scheduledCount?.val || 0),
        messagesSent: Number(sentCount?.val || 0), failedMessages: Number(failedCount?.val || 0),
      },
      upcoming,
    });
  } catch (err: any) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to load dashboard.' });
  }
});

/* =========================================================================
   3. PER-USER WHATSAPP SETTINGS & CONNECTION TEST
   ========================================================================= */

const maskSecret = (secret: string | null | undefined): string => {
  if (!secret) return '';
  if (secret.length <= 8) return '••••••••';
  return `${secret.slice(0, 4)}••••••••${secret.slice(-4)}`;
};
const isMaskedSecret = (val: string | null | undefined): boolean => Boolean(val && (val.includes('••••') || val.includes('****')));

app.get('/api/whatsapp/account', requireAuth, async (req: AuthRequest, res) => {
  try {
    const ownerUserId = req.user!.id;
    const creds = await resolveWhatsAppCredentials(ownerUserId);
    const [acc] = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, ownerUserId)).limit(1);
    res.json({
      configured: creds.isFullyConfigured, hasToken: creds.hasToken, hasPhoneId: creds.hasPhoneId,
      id: acc?.id || null, metaAppId: creds.metaAppId, metaAppSecretMasked: maskSecret(creds.metaAppSecret),
      businessAccountId: creds.businessAccountId, phoneNumberId: creds.phoneNumberId,
      accessTokenMasked: maskSecret(creds.accessToken), webhookVerifyTokenMasked: maskSecret(creds.webhookVerifyToken),
      apiVersion: creds.apiVersion, status: creds.status, displayPhoneNumber: acc?.displayPhoneNumber || null,
      verifiedName: acc?.verifiedName || null, qualityRating: acc?.qualityRating || null, lastTestedAt: acc?.lastTestedAt || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load WhatsApp settings.' });
  }
});

app.post('/api/whatsapp/account', requireAuth, async (req: AuthRequest, res) => {
  try {
    const ownerUserId = req.user!.id;
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'WhatsApp credentials belong to business users, not the platform admin.' });
    const current = await resolveWhatsAppCredentials(ownerUserId);
    const [existing] = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, ownerUserId)).limit(1);

    const phoneNumberId = String(req.body?.phoneNumberId || '').trim().replace(/['"]/g, '');
    const businessAccountId = String(req.body?.businessAccountId || '').trim().replace(/['"]/g, '');
    const metaAppId = String(req.body?.metaAppId || '').trim().replace(/['"]/g, '');
    const apiVersion = String(req.body?.apiVersion || 'v21.0').trim() || 'v21.0';
    const tokenInput = String(req.body?.accessToken || '').trim().replace(/['"]/g, '');
    const secretInput = String(req.body?.metaAppSecret || '').trim().replace(/['"]/g, '');
    const verifyInput = String(req.body?.webhookVerifyToken || '').trim().replace(/['"]/g, '');
    const accessToken = tokenInput && !isMaskedSecret(tokenInput) ? tokenInput : current.accessToken;
    const metaAppSecret = secretInput && !isMaskedSecret(secretInput) ? secretInput : current.metaAppSecret;
    const webhookVerifyToken = verifyInput && !isMaskedSecret(verifyInput) ? verifyInput : current.webhookVerifyToken;

    if (!phoneNumberId || !accessToken) {
      return res.status(400).json({ error: 'Phone Number ID and Access Token are required.' });
    }

    const secretValues = encryptedCredentialValues({ accessToken, metaAppSecret, webhookVerifyToken });
    let row: any;
    if (existing) {
      [row] = await db.update(whatsappAccounts).set({
        metaAppId, businessAccountId, phoneNumberId, apiVersion,
        ...secretValues, status: 'CONNECTED', updatedAt: new Date(),
      }).where(eq(whatsappAccounts.id, existing.id)).returning();
    } else {
      [row] = await db.insert(whatsappAccounts).values({
        ownerUserId, metaAppId, businessAccountId, phoneNumberId, apiVersion,
        metaAppSecret: secretValues.metaAppSecret || '', accessToken: secretValues.accessToken || '',
        webhookVerifyToken: secretValues.webhookVerifyToken || '', status: 'CONNECTED',
      }).returning();
    }

    await db.insert(auditLogs).values({
      action: 'WHATSAPP_CONFIG_UPDATED', actor: req.user?.phone || String(ownerUserId),
      details: { userId: ownerUserId, phoneNumberId, businessAccountId },
    });
    res.json({ success: true, configured: true, message: 'WhatsApp credentials saved securely for your account.' });
  } catch (err: any) {
    console.error('Save WhatsApp settings error:', err);
    res.status(500).json({ error: err.message || 'Failed to save WhatsApp settings.' });
  }
});

app.post('/api/whatsapp/test', requireAuth, async (req: AuthRequest, res) => {
  try {
    const ownerUserId = req.user!.id;
    const current = await resolveWhatsAppCredentials(ownerUserId);
    const bodyPhone = String(req.body?.phoneNumberId || '').trim();
    const bodyToken = String(req.body?.accessToken || '').trim();
    const phoneNumberId = bodyPhone || current.phoneNumberId;
    const accessToken = bodyToken && !isMaskedSecret(bodyToken) ? bodyToken : current.accessToken;
    const apiVersion = String(req.body?.apiVersion || current.apiVersion || 'v21.0');
    if (!phoneNumberId || !accessToken) return res.status(400).json({ success: false, error: 'Enter your Phone Number ID and Access Token first.' });

    const testRes = await WhatsAppService.testConnection(phoneNumberId, accessToken, apiVersion);
    const [existing] = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, ownerUserId)).limit(1);
    if (existing) {
      await db.update(whatsappAccounts).set({
        status: testRes.success ? 'CONNECTED' : 'ERROR',
        displayPhoneNumber: testRes.phoneNumber || existing.displayPhoneNumber,
        verifiedName: testRes.verifiedName || existing.verifiedName,
        qualityRating: testRes.qualityRating || existing.qualityRating,
        lastTestedAt: new Date(), updatedAt: new Date(),
      }).where(eq(whatsappAccounts.id, existing.id));
    }
    if (!testRes.success) return res.status(400).json({ success: false, error: testRes.error || 'Connection test failed.' });
    res.json({ success: true, phoneNumber: testRes.phoneNumber, verifiedName: testRes.verifiedName, qualityRating: testRes.qualityRating });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Unexpected connection test error.' });
  }
});

/* =========================================================================
   4. CONTACTS MANAGEMENT
   ========================================================================= */

// Normalize phone to E.164. Country code is required. E.164 allows max 15 digits.
const normalizeE164 = (raw: string): string => {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits || digits.length < 7 || digits.length > 15) return '';
  return `+${digits}`;
};

const validateInternationalPhone = (raw: string): { ok: boolean; normalized?: string; error?: string } => {
  const normalized = normalizeE164(raw);
  if (!normalized) return { ok: false, error: 'Enter a valid international phone number with country code.' };
  const digits = normalized.slice(1);
  // India: +91 followed by exactly 10 digits, mobile starts with 6-9.
  if (digits.startsWith('91')) {
    const national = digits.slice(2);
    if (!/^[6-9][0-9]{9}$/.test(national)) return { ok: false, error: 'Indian mobile numbers must be +91 followed by 10 digits starting with 6, 7, 8 or 9.' };
  }
  return { ok: true, normalized };
};

// GET contacts with search. Business users see only their own records; admin can inspect all.
app.get('/api/contacts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const list = req.user?.role === 'admin'
      ? await db.select().from(contacts).orderBy(desc(contacts.createdAt))
      : await db.select().from(contacts).where(eq(contacts.ownerUserId, req.user!.id)).orderBy(desc(contacts.createdAt));
    const filtered = search ? list.filter((c) => c.name.toLowerCase().includes(search) || c.phone.toLowerCase().includes(search)) : list;
    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load contacts.' });
  }
});

app.post('/api/contacts', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Create contacts from a business account.' });
    const { name, phone, email, optIn, notes, dob, birthdayAutomationEnabled } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and WhatsApp phone number are required.' });
    const phoneValidation = validateInternationalPhone(phone);
    if (!phoneValidation.ok) return res.status(400).json({ error: phoneValidation.error });
    const normalizedPhone = phoneValidation.normalized!;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return res.status(400).json({ error: 'Enter a valid email address.' });
    const [duplicate] = await db.select({ id: contacts.id }).from(contacts)
      .where(and(eq(contacts.ownerUserId, req.user!.id), eq(contacts.phone, normalizedPhone))).limit(1);
    if (duplicate) return res.status(409).json({ error: 'This phone number is already saved in WishFlow.' });
    const [newContact] = await db.insert(contacts).values({
      ownerUserId: req.user!.id, name: name.trim(), phone: normalizedPhone, email: email ? String(email).trim() : null, optIn: optIn !== false,
      dob: dob ? String(dob).trim() : null, birthdayAutomationEnabled: birthdayAutomationEnabled !== false,
      notes: notes || null,
    }).returning();
    if (newContact.dob && newContact.birthdayAutomationEnabled !== false) {
      WishflowService.syncContactBirthdayAutomation(newContact.id).catch((err) => console.warn('Birthday sync notice:', err?.message));
    }
    res.status(201).json(newContact);
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'This phone number is already saved in WishFlow.' });
    res.status(500).json({ error: err.message || 'Failed to create contact.' });
  }
});

app.put('/api/contacts/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const ownerCondition = req.user?.role === 'admin' ? eq(contacts.id, id) : and(eq(contacts.id, id), eq(contacts.ownerUserId, req.user!.id));
    const { name, phone, email, optIn, notes, dob, birthdayAutomationEnabled } = req.body;
    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = String(name).trim();
    if (phone !== undefined) { const v = validateInternationalPhone(String(phone)); if (!v.ok) return res.status(400).json({ error: v.error }); updateData.phone = v.normalized; }
    if (email !== undefined) { if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return res.status(400).json({ error: 'Enter a valid email address.' }); updateData.email = email ? String(email).trim() : null; }
    if (typeof optIn === 'boolean') updateData.optIn = optIn;
    if (notes !== undefined) updateData.notes = notes;
    if (dob !== undefined) updateData.dob = dob ? String(dob).trim() : null;
    if (typeof birthdayAutomationEnabled === 'boolean') updateData.birthdayAutomationEnabled = birthdayAutomationEnabled;
    const [updated] = await db.update(contacts).set(updateData).where(ownerCondition).returning();
    if (!updated) return res.status(404).json({ error: 'Contact not found.' });
    if (updated.dob && updated.birthdayAutomationEnabled !== false) {
      WishflowService.syncContactBirthdayAutomation(updated.id).catch((err) => console.warn('Birthday sync notice:', err?.message));
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update contact.' });
  }
});

app.delete('/api/contacts/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const ownerCondition = req.user?.role === 'admin' ? eq(contacts.id, id) : and(eq(contacts.id, id), eq(contacts.ownerUserId, req.user!.id));
    const deleted = await db.delete(contacts).where(ownerCondition).returning({ id: contacts.id });
    if (!deleted.length) return res.status(404).json({ error: 'Contact not found.' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete contact.' });
  }
});


// Fixed CSV import payload. Expected columns in the client: name,country_code,phone,email,date_of_birth,opt_in,notes
app.post('/api/contacts/import', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Import contacts from a business account.' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'No CSV contact rows were provided.' });
    if (rows.length > 5000) return res.status(400).json({ error: 'Import up to 5,000 contacts at a time.' });
    let imported = 0, skipped = 0, failed = 0;
    const errors: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const name = String(row.name || '').trim();
      const country = String(row.country_code || '').replace(/\D/g, '');
      const national = String(row.phone || '').replace(/\D/g, '');
      const rawPhone = `+${country}${national}`;
      const check = validateInternationalPhone(rawPhone);
      if (!name || !check.ok) { failed++; errors.push({ row: i + 2, error: !name ? 'Missing name' : check.error }); continue; }
      const [dupe] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.ownerUserId, req.user!.id), eq(contacts.phone, check.normalized!))).limit(1);
      if (dupe) { skipped++; continue; }
      const email = String(row.email || '').trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { failed++; errors.push({ row: i + 2, error: 'Invalid email' }); continue; }
      await db.insert(contacts).values({ ownerUserId: req.user!.id, name, phone: check.normalized!, email: email || null, dob: row.date_of_birth ? String(row.date_of_birth).trim() : null, optIn: ['true','1','yes','y'].includes(String(row.opt_in ?? '').toLowerCase()), birthdayAutomationEnabled: true, notes: row.notes ? String(row.notes).trim() : null });
      imported++;
    }
    res.json({ success: true, imported, skipped, failed, errors: errors.slice(0, 100) });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Contact import failed.' }); }
});

app.get('/api/contact-groups', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.json([]);
    const groups = await db.select().from(contactGroups).where(eq(contactGroups.ownerUserId, req.user!.id)).orderBy(desc(contactGroups.createdAt));
    const out = [];
    for (const g of groups) {
      const [c] = await db.select({ val: count() }).from(contactGroupMembers).where(eq(contactGroupMembers.groupId, g.id));
      out.push({ ...g, memberCount: Number(c?.val || 0) });
    }
    res.json(out);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Failed to load groups.' }); }
});

app.post('/api/contact-groups', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Create groups from a business account.' });
    const name = String(req.body?.name || '').trim(); const description = String(req.body?.description || '').trim();
    const contactIds = Array.isArray(req.body?.contactIds) ? req.body.contactIds.map(Number).filter(Boolean) : [];
    if (name.length < 2) return res.status(400).json({ error: 'Group name must be at least 2 characters.' });
    const [g] = await db.insert(contactGroups).values({ ownerUserId: req.user!.id, name, description: description || null }).returning();
    if (contactIds.length) {
      const owned = await db.select({id: contacts.id}).from(contacts).where(and(eq(contacts.ownerUserId, req.user!.id), inArray(contacts.id, contactIds)));
      for (const c of owned) await db.insert(contactGroupMembers).values({ groupId: g.id, contactId: c.id }).onConflictDoNothing();
    }
    res.status(201).json(g);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Failed to create group.' }); }
});

app.get('/api/contact-groups/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [g] = await db.select().from(contactGroups).where(and(eq(contactGroups.id,id), eq(contactGroups.ownerUserId, req.user!.id))).limit(1);
    if (!g) return res.status(404).json({ error: 'Group not found.' });
    const members = await db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone, optIn: contacts.optIn, dob: contacts.dob }).from(contactGroupMembers).innerJoin(contacts, eq(contactGroupMembers.contactId, contacts.id)).where(eq(contactGroupMembers.groupId,id));
    res.json({ group: g, members });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Failed to load group.' }); }
});

app.put('/api/contact-groups/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id=Number(req.params.id); const [g]=await db.select().from(contactGroups).where(and(eq(contactGroups.id,id),eq(contactGroups.ownerUserId,req.user!.id))).limit(1);
    if(!g) return res.status(404).json({error:'Group not found.'});
    const name=String(req.body?.name ?? g.name).trim(); const description=String(req.body?.description ?? g.description ?? '').trim();
    await db.update(contactGroups).set({name,description:description||null,updatedAt:new Date()}).where(eq(contactGroups.id,id));
    if(Array.isArray(req.body?.contactIds)){
      await db.delete(contactGroupMembers).where(eq(contactGroupMembers.groupId,id));
      const ids=req.body.contactIds.map(Number).filter(Boolean);
      if(ids.length){ const owned=await db.select({id:contacts.id}).from(contacts).where(and(eq(contacts.ownerUserId,req.user!.id),inArray(contacts.id,ids))); for(const c of owned) await db.insert(contactGroupMembers).values({groupId:id,contactId:c.id}).onConflictDoNothing(); }
    }
    res.json({success:true});
  } catch(err:any){res.status(500).json({error:err.message||'Failed to update group.'});}
});

app.delete('/api/contact-groups/:id', requireAuth, async (req: AuthRequest,res)=>{ try{ const id=Number(req.params.id); const deleted=await db.delete(contactGroups).where(and(eq(contactGroups.id,id),eq(contactGroups.ownerUserId,req.user!.id))).returning({id:contactGroups.id}); if(!deleted.length)return res.status(404).json({error:'Group not found.'}); res.json({success:true}); }catch(err:any){res.status(500).json({error:err.message||'Failed to delete group.'});}});

/* =========================================================================
   5. TEMPLATES (OFFICIAL META SYNC & LISTING)
   ========================================================================= */

// Helper to count {{1}}, {{2}} variables in template text components
function extractVariableCount(components: any[]): number {
  let highest = 0;
  if (!Array.isArray(components)) return 0;
  for (const comp of components) {
    if (comp && comp.text) {
      const matches = comp.text.match(/\{\{(\d+)\}\}/g);
      if (matches) {
        matches.forEach((m: string) => {
          const num = parseInt(m.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(num) && num > highest) highest = num;
        });
      }
    }
  }
  return highest;
}

// GET message templates
const getTemplatesHandler = async (req: AuthRequest, res: any) => {
  let list: any[] = [];
  if (isDatabaseConnected) {
    try {
      list = await db
        .select()
        .from(messageTemplates)
        .orderBy(desc(messageTemplates.updatedAt));
    } catch (err: any) {
      console.warn('Notice fetching templates from DB:', err?.message);
    }
  }

  if (!list || list.length === 0) {
    list = localStore.templates;
  }

  const legacyDemoMetaIds = new Set([
    'meta_tpl_hello_world',
    'meta_tpl_appointment_confirmation',
    'meta_tpl_payment_reminder',
    'meta_tpl_welcome_message',
    'meta_tpl_happy_birthday_wishes',
  ]);
  list = list.filter((t: any) => !legacyDemoMetaIds.has(String(t.metaTemplateId || '')));

  if (req.user?.role !== 'admin') {
    // Show the approved platform Birthday reference plus templates genuinely
    // created/synced by this business.
    list = list.filter((t: any) => !t.ownerUserId || Number(t.ownerUserId) === req.user!.id);

    // Avoid duplicate Birthday rows left by older builds. Prefer the business's
    // own Meta-synced record over the platform reference when both exist.
    const byTemplate = new Map<string, any>();
    for (const t of list) {
      const key = `${String(t.name || '').toLowerCase()}|${String(t.language || '').toLowerCase()}`;
      const current = byTemplate.get(key);
      if (!current || (t.ownerUserId && !current.ownerUserId)) byTemplate.set(key, t);
    }
    list = Array.from(byTemplate.values());
  }
  res.json(list);
};

app.get('/api/whatsapp/templates', requireAuth, getTemplatesHandler);
app.get('/api/templates', requireAuth, getTemplatesHandler);

// SYNC templates from the logged-in business user's Meta account.
app.post('/api/whatsapp/templates/sync', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Template sync is performed from a business account.' });
    const creds = await resolveWhatsAppCredentials(req.user!.id);
    if (!creds.businessAccountId || !creds.accessToken) {
      return res.status(400).json({ error: 'Connect your WhatsApp Business account in Settings first.' });
    }
    const metaRes = await WhatsAppService.fetchTemplates(creds.businessAccountId, creds.accessToken, creds.apiVersion);
    if (!metaRes.success || !metaRes.templates) return res.status(400).json({ error: metaRes.error || 'Failed to fetch templates from Meta.' });
    let syncedCount = 0;
    for (const t of metaRes.templates) {
      const varCount = extractVariableCount(t.components);
      await db.insert(messageTemplates).values({
        ownerUserId: req.user!.id, metaTemplateId: t.id, name: t.name, language: t.language, category: t.category,
        status: t.status, components: t.components, variableCount: varCount,
        lastSyncedAt: new Date(), updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: messageTemplates.metaTemplateId,
        set: { ownerUserId: req.user!.id, name: t.name, language: t.language, category: t.category, status: t.status,
          components: t.components, variableCount: varCount, lastSyncedAt: new Date(), updatedAt: new Date() },
      });
      syncedCount++;
    }
    res.json({ success: true, syncedCount, message: `Synchronized ${syncedCount} templates from Meta.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Template synchronization failed.' });
  }
});


// Create a WhatsApp template in the logged-in business WABA. Meta returns it as PENDING until reviewed.
app.post('/api/whatsapp/templates', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Create templates from a business account.' });
    const name = String(req.body?.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g,'_');
    const category = String(req.body?.category || 'MARKETING').toUpperCase();
    const language = String(req.body?.language || 'en_US');
    const body = String(req.body?.body || '').trim();
    if (!/^[a-z0-9_]{3,512}$/.test(name)) return res.status(400).json({ error: 'Template name must use lowercase letters, numbers and underscores.' });
    if (!['MARKETING','UTILITY','AUTHENTICATION'].includes(category)) return res.status(400).json({ error: 'Invalid template category.' });
    if (body.length < 5 || body.length > 1024) return res.status(400).json({ error: 'Template body must be 5-1024 characters.' });
    const creds = await resolveWhatsAppCredentials(req.user!.id);
    if (!creds.businessAccountId || !creds.accessToken) return res.status(400).json({ error: 'Connect WhatsApp Business credentials first.' });
    const result = await WhatsAppService.createTemplate({ businessAccountId: creds.businessAccountId, accessToken: creds.accessToken, apiVersion: creds.apiVersion, name, category, language, body });
    if (!result.success) return res.status(400).json({ error: result.error || 'Meta rejected the template request.' });
    const components = [{ type: 'BODY', text: body }];
    const variableCount = extractVariableCount(components);
    const [created] = await db.insert(messageTemplates).values({ ownerUserId:req.user!.id, metaTemplateId: result.id || null, name, language, category, status: result.status || 'PENDING', components, variableCount, lastSyncedAt:new Date(), updatedAt:new Date() }).returning();
    res.status(201).json(created);
  } catch (err:any) { res.status(500).json({ error: err.message || 'Failed to create template.' }); }
});

// SEED STANDARD TEMPLATES HELPER (For test/demo environments if Meta account has not approved yet)
app.post('/api/whatsapp/templates/seed-defaults', requireAuth, async (_req, res) => {
  res.status(410).json({
    error: 'Demo template seeding has been removed. Use Template Sync or Create Template instead.',
  });
});

/* =========================================================================
   6. AUTOMATIONS & SCHEDULING
   ========================================================================= */

const automationSelect = {
  id: automations.id,
  contactId: automations.contactId,
  templateId: automations.templateId,
  variables: automations.variables,
  scheduledAt: automations.scheduledAt,
  timezone: automations.timezone,
  status: automations.status,
  executedAt: automations.executedAt,
  errorMessage: automations.errorMessage,
  createdAt: automations.createdAt,
  contactName: contacts.name,
  contactPhone: contacts.phone,
  contactOptIn: contacts.optIn,
  templateName: messageTemplates.name,
  templateLanguage: messageTemplates.language,
  templateStatus: messageTemplates.status,
};

app.get('/api/automations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const base = db.select(automationSelect).from(automations)
      .innerJoin(contacts, eq(automations.contactId, contacts.id))
      .innerJoin(messageTemplates, eq(automations.templateId, messageTemplates.id));
    const list = req.user?.role === 'admin'
      ? await base.orderBy(desc(automations.scheduledAt))
      : await base.where(eq(automations.ownerUserId, req.user!.id)).orderBy(desc(automations.scheduledAt));
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load automations.' });
  }
});

app.get('/api/automations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const condition = req.user?.role === 'admin'
      ? eq(automations.id, id)
      : and(eq(automations.id, id), eq(automations.ownerUserId, req.user!.id));
    const [item] = await db.select(automationSelect).from(automations)
      .innerJoin(contacts, eq(automations.contactId, contacts.id))
      .innerJoin(messageTemplates, eq(automations.templateId, messageTemplates.id))
      .where(condition).limit(1);
    if (!item) return res.status(404).json({ error: 'Automation not found.' });
    const relatedMessages = await db.select().from(messages).where(eq(messages.automationId, id));
    res.json({ automation: item, messages: relatedMessages });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load automation.' });
  }
});

app.post('/api/automations', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Create automations from a business account.' });
    const { contactId, templateId, variables, scheduledAt, timezone } = req.body;
    const cId = Number(contactId), tId = Number(templateId);
    if (!cId || !tId || !scheduledAt) return res.status(400).json({ error: 'Contact, template and scheduled date/time are required.' });
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, cId), eq(contacts.ownerUserId, req.user!.id))).limit(1);
    if (!contact) return res.status(404).json({ error: 'Contact not found in your account.' });
    if (!contact.optIn) return res.status(400).json({ error: `${contact.name} has opted out of WhatsApp messages.` });
    const [template] = await db.select().from(messageTemplates).where(eq(messageTemplates.id, tId)).limit(1);
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    if (template.status !== 'APPROVED') return res.status(400).json({ error: 'The selected template is not approved by Meta yet.' });
    const targetDate = new Date(scheduledAt);
    if (Number.isNaN(targetDate.getTime())) return res.status(400).json({ error: 'Invalid scheduled date or time.' });
    if (targetDate.getTime() <= Date.now()) return res.status(400).json({ error: 'Schedule must be in the future.' });

    const normalizedVariables: Record<string, string> = {};
    if (variables && typeof variables === 'object' && !Array.isArray(variables)) {
      for (const [key, value] of Object.entries(variables)) {
        const v = String(value ?? '').trim();
        if (v) normalizedVariables[String(key)] = v;
      }
    }
    // Birthday templates normally use the contact name as {{1}}. Fill it safely when omitted.
    if (template.variableCount > 0 && !normalizedVariables['1']) normalizedVariables['1'] = contact.name;
    if (Object.keys(normalizedVariables).length < template.variableCount) {
      return res.status(400).json({ error: `Template ${template.name} requires ${template.variableCount} variable value(s).` });
    }

    const [created] = await db.insert(automations).values({
      ownerUserId: req.user!.id, contactId: contact.id, templateId: template.id,
      variables: normalizedVariables, scheduledAt: targetDate, timezone: timezone || 'Asia/Kolkata', status: 'SCHEDULED',
    }).returning();
    await db.insert(auditLogs).values({
      action: 'AUTOMATION_SCHEDULED', actor: req.user!.phone,
      details: { automationId: created.id, contactId: contact.id, templateId: template.id },
    });
    if (targetDate <= new Date()) setTimeout(() => automationWorker.triggerNow({ forceId: created.id }).catch(() => {}), 250);
    res.status(201).json({ success: true, automation: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to schedule automation.' });
  }
});

app.post('/api/automations/:id/cancel', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const condition = req.user?.role === 'admin' ? eq(automations.id, id) : and(eq(automations.id, id), eq(automations.ownerUserId, req.user!.id));
    const [existing] = await db.select().from(automations).where(condition).limit(1);
    if (!existing) return res.status(404).json({ error: 'Automation not found.' });
    if (['SENT', 'DELIVERED', 'READ', 'PROCESSING'].includes(existing.status)) return res.status(400).json({ error: `Cannot cancel an automation in ${existing.status} state.` });
    const [updated] = await db.update(automations).set({ status: 'CANCELLED', updatedAt: new Date() }).where(condition).returning();
    res.json({ success: true, automation: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to cancel automation.' });
  }
});

app.post('/api/automations/:id/run', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const condition = req.user?.role === 'admin' ? eq(automations.id, id) : and(eq(automations.id, id), eq(automations.ownerUserId, req.user!.id));
    const [existing] = await db.select().from(automations).where(condition).limit(1);
    if (!existing) return res.status(404).json({ error: 'Automation not found.' });
    if (existing.status !== 'SCHEDULED') {
      return res.status(409).json({ error: `Automation is ${existing.status}. Only queued automations can be run.` });
    }
    const result = await automationWorker.triggerNow({ forceId: id });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to run automation.' });
  }
});

app.post('/api/automations/worker/run', requireAuth, async (_req: AuthRequest, res) => {
  try { res.json(await automationWorker.triggerNow()); }
  catch (err: any) { res.status(500).json({ error: err.message || 'Worker failed.' }); }
});

app.post('/api/whatsapp/send', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Send messages from a business account.' });
    const cId = Number(req.body?.contactId), tId = Number(req.body?.templateId);
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, cId), eq(contacts.ownerUserId, req.user!.id))).limit(1);
    const [template] = await db.select().from(messageTemplates).where(eq(messageTemplates.id, tId)).limit(1);
    if (!contact || !template) return res.status(404).json({ error: 'Contact or template not found.' });
    const creds = await resolveWhatsAppCredentials(req.user!.id);
    if (!creds.isFullyConfigured) return res.status(400).json({ error: 'Connect your WhatsApp Business credentials in Settings first.' });
    const send = await WhatsAppService.sendTemplateMessage({
      phoneNumberId: creds.phoneNumberId, accessToken: creds.accessToken, apiVersion: creds.apiVersion,
      recipientPhone: contact.phone, templateName: template.name, templateLanguage: template.language,
      variables: req.body?.variables || {},
    });
    if (!send.success) return res.status(400).json({ error: send.error || 'Message send failed.' });
    const [message] = await db.insert(messages).values({
      ownerUserId: req.user!.id, contactId: contact.id, direction: 'OUTBOUND', messageType: 'TEMPLATE',
      templateName: template.name, templateLanguage: template.language, variables: req.body?.variables || {},
      whatsappMessageId: send.whatsappMessageId, status: 'SENT', sentAt: new Date(),
    }).returning();
    res.json({ success: true, message });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to send WhatsApp message.' });
  }
});


// Generic bulk sender for birthdays, marketing and other approved templates.
app.post('/api/whatsapp/send-bulk', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Send messages from a business account.' });
    let contactIds: number[] = Array.isArray(req.body?.contactIds) ? req.body.contactIds.map(Number).filter(Boolean) : [];
    const groupIds: number[] = Array.isArray(req.body?.groupIds) ? req.body.groupIds.map(Number).filter(Boolean) : [];
    if (groupIds.length) {
      const rows = await db.select({ contactId: contactGroupMembers.contactId }).from(contactGroupMembers).innerJoin(contactGroups, eq(contactGroupMembers.groupId,contactGroups.id)).where(and(eq(contactGroups.ownerUserId,req.user!.id),inArray(contactGroupMembers.groupId,groupIds)));
      contactIds.push(...rows.map(r=>r.contactId));
    }
    contactIds = [...new Set(contactIds)];
    if (!contactIds.length) return res.status(400).json({ error: 'Select at least one contact or group.' });
    if (contactIds.length > 500) return res.status(400).json({ error: 'Send to up to 500 contacts per batch.' });
    const templateId = Number(req.body?.templateId);
    const [template] = await db.select().from(messageTemplates).where(eq(messageTemplates.id,templateId)).limit(1);
    if (!template || template.status !== 'APPROVED') return res.status(400).json({ error: 'Select an approved WhatsApp template.' });
    const suppliedVars = req.body?.variables && typeof req.body.variables === 'object' ? req.body.variables : {};
    for (let n = 2; n <= template.variableCount; n++) {
      if (!String(suppliedVars[String(n)] ?? '').trim()) return res.status(400).json({ error: `Template variable {{${n}}} is required.` });
    }
    const recipients = await db.select().from(contacts).where(and(eq(contacts.ownerUserId,req.user!.id),inArray(contacts.id,contactIds)));
    const creds = await resolveWhatsAppCredentials(req.user!.id);
    if (!creds.isFullyConfigured) return res.status(400).json({ error: 'Connect your WhatsApp Business credentials first.' });
    const results=[];
    for(const contact of recipients){
      if(!contact.optIn){ results.push({contactId:contact.id,name:contact.name,status:'SKIPPED',error:'No WhatsApp consent'}); continue; }
      const vars: Record<string,string> = {};
      const supplied=req.body?.variables && typeof req.body.variables==='object' ? req.body.variables : {};
      for(const [k,v] of Object.entries(supplied)) vars[String(k)] = String(v).replace(/\{\{name\}\}/gi,contact.name);
      if(template.variableCount>0 && !vars['1']) vars['1']=contact.name;
      const send=await WhatsAppService.sendTemplateMessage({phoneNumberId:creds.phoneNumberId,accessToken:creds.accessToken,apiVersion:creds.apiVersion,recipientPhone:contact.phone,templateName:template.name,templateLanguage:template.language,variables:vars});
      const status=send.success?'SENT':'FAILED';
      await db.insert(messages).values({ownerUserId:req.user!.id,contactId:contact.id,direction:'OUTBOUND',messageType:'TEMPLATE',templateName:template.name,templateLanguage:template.language,variables:vars,whatsappMessageId:send.whatsappMessageId,status,errorCode:send.errorCode,errorMessage:send.error,sentAt:new Date(),failedAt:send.success?null:new Date()});
      results.push({contactId:contact.id,name:contact.name,status,error:send.error});
    }
    res.json({success:true,total:results.length,sent:results.filter(r=>r.status==='SENT').length,failed:results.filter(r=>r.status==='FAILED').length,skipped:results.filter(r=>r.status==='SKIPPED').length,results});
  } catch(err:any){res.status(500).json({error:err.message||'Bulk send failed.'});}
});

/* =========================================================================
   6.5. BIRTHDAY WISHFLOW API
   ========================================================================= */

// GET WishFlow settings
app.get('/api/wishflow/settings', requireAuth, (_req, res) => {
  try {
    const settings = WishflowService.getSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get WishFlow settings' });
  }
});

// UPDATE WishFlow settings
app.post('/api/wishflow/settings', requireAuth, async (req, res) => {
  try {
    const updated = await WishflowService.updateSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update WishFlow settings' });
  }
});

// GET WishFlow summary (all contacts with birthdays, upcoming countdown, and automation status)
app.get('/api/wishflow/summary', requireAuth, async (req: AuthRequest, res) => {
  try {
    const summary = await WishflowService.getBirthdaySummaryList(req.user?.role === 'admin' ? undefined : req.user!.id);
    res.json(summary);
  } catch (err: any) {
    console.error('Error getting WishFlow summary:', err);
    res.status(500).json({ error: err.message || 'Failed to load birthday summary' });
  }
});

// SYNC ALL BIRTHDAYS (Recalculate & schedule missing birthday automations)
app.post('/api/wishflow/sync', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await WishflowService.syncAllContactsBirthdays(req.user?.role === 'admin' ? undefined : req.user!.id);
    res.json({ success: true, ...result, message: `Synced ${result.synced} contacts, scheduled ${result.scheduled} birthday messages.` });
  } catch (err: any) {
    console.error('Error syncing birthdays:', err);
    res.status(500).json({ error: err.message || 'Failed to sync birthday automations' });
  }
});

// TOGGLE birthday automation per contact
app.post('/api/wishflow/contacts/:id/toggle', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (req.user?.role !== 'admin') { const [c] = await db.select().from(contacts).where(and(eq(contacts.id,id), eq(contacts.ownerUserId, req.user!.id))).limit(1); if (!c) return res.status(404).json({ error: 'Contact not found.' }); }
    const { enabled } = req.body;
    await WishflowService.toggleContactBirthdayAutomation(id, Boolean(enabled));
    res.json({ success: true, contactId: id, enabled: Boolean(enabled) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle birthday automation' });
  }
});

// SEND BIRTHDAY WISH IMMEDIATELY
app.post('/api/wishflow/contacts/:id/send-now', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (req.user?.role !== 'admin') { const [c] = await db.select().from(contacts).where(and(eq(contacts.id,id), eq(contacts.ownerUserId, req.user!.id))).limit(1); if (!c) return res.status(404).json({ error: 'Contact not found.' }); }
    const { customMessage } = req.body;
    const sendResult = await WishflowService.sendBirthdayWishNow(id, customMessage);
    if (sendResult.success) {
      res.json(sendResult);
    } else {
      res.status(400).json(sendResult);
    }
  } catch (err: any) {
    console.error('Error sending birthday wish now:', err);
    res.status(500).json({ error: err.message || 'Failed to send birthday wish' });
  }
});

// EDIT SCHEDULED BIRTHDAY WISH
app.put('/api/wishflow/automations/:id', requireAuth, async (req, res) => {
  try {
    const automationId = parseInt(req.params.id, 10);
    const { scheduledAt, templateId, customMessage } = req.body;
    const updateResult = await WishflowService.updateScheduledWish({
      automationId,
      scheduledAt,
      templateId,
      customMessage,
    });
    res.json(updateResult);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update scheduled birthday wish' });
  }
});

// GET BIRTHDAY WISH HISTORY
app.get('/api/wishflow/history', requireAuth, (_req, res) => {
  try {
    const history = WishflowService.getWishHistory();
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get wish history' });
  }
});

/* =========================================================================
   7. WEBHOOKS (GET for Meta verification, POST for real-time status updates)
   ========================================================================= */

// Webhook Verification (Meta calls this when you configure the webhook URL in Meta App Dashboard)
app.get('/api/webhooks/whatsapp', async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    let tokenMatches = false;
    if (isDatabaseConnected && typeof token === 'string') {
      try {
        const accounts = await db.select({ webhookVerifyToken: whatsappAccounts.webhookVerifyToken }).from(whatsappAccounts);
        tokenMatches = accounts.some((a) => decryptSecret(a.webhookVerifyToken) === token);
      } catch (err) {
        console.warn('Notice checking webhook verification tokens:', err);
      }
    }

    if (mode === 'subscribe' && tokenMatches) {
      console.log('[Webhook] Verification successful for Meta WhatsApp Webhook');
      return res.status(200).send(challenge);
    } else {
      console.warn('[Webhook] Verification token mismatch');
      return res.status(403).send('Verification failed');
    }
  } catch (err) {
    console.error('[Webhook] Verification error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Webhook Events (SENT, DELIVERED, READ, FAILED statuses)
app.post('/api/webhooks/whatsapp', async (req, res) => {
  try {
    const body = req.body;
    console.log('[Webhook] Received Meta WhatsApp event payload:', JSON.stringify(body).slice(0, 300));

    // Acknowledge immediately per Meta requirements
    res.status(200).send('EVENT_RECEIVED');

    if (body.object === 'whatsapp_business_account') {
      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value;
          if (value && value.statuses) {
            for (const statusObj of value.statuses) {
              const wamid = statusObj.id; // WhatsApp message ID
              const status = statusObj.status?.toUpperCase(); // "SENT", "DELIVERED", "READ", "FAILED"
              const timestamp = statusObj.timestamp ? new Date(parseInt(statusObj.timestamp, 10) * 1000) : new Date();

              console.log(`[Webhook] Status update for message ${wamid} -> ${status}`);

              // Find matching message in DB
              if (isDatabaseConnected) {
                try {
                  const matched = await db
                    .select()
                    .from(messages)
                    .where(eq(messages.whatsappMessageId, wamid))
                    .limit(1);

                  if (matched.length > 0) {
                    const existingMsg = matched[0];
                    const updateFields: any = { status };

                    if (status === 'DELIVERED') updateFields.deliveredAt = timestamp;
                    if (status === 'READ') updateFields.readAt = timestamp;
                    if (status === 'FAILED') {
                      updateFields.failedAt = timestamp;
                      if (statusObj.errors && statusObj.errors.length > 0) {
                        updateFields.errorCode = String(statusObj.errors[0].code);
                        updateFields.errorMessage = statusObj.errors[0].title || statusObj.errors[0].message;
                      }
                    }

                    await db
                      .update(messages)
                      .set(updateFields)
                      .where(eq(messages.id, existingMsg.id));

                    // If message is linked to an automation, update automation status as well
                    if (existingMsg.automationId) {
                      await db
                        .update(automations)
                        .set({
                          status,
                          updatedAt: new Date(),
                          ...(status === 'FAILED' && updateFields.errorMessage
                            ? { errorMessage: updateFields.errorMessage }
                            : {}),
                        })
                        .where(eq(automations.id, existingMsg.automationId));
                    }
                  }
                } catch (err: any) {
                  console.warn('Notice updating message in DB from webhook:', err?.message);
                }
              }

              // Also update in localStore
              const localMsg = localStore.messages.find((m) => m.whatsappMessageId === wamid);
              if (localMsg) {
                localMsg.status = status;
                if (status === 'DELIVERED') localMsg.deliveredAt = timestamp;
                if (status === 'READ') localMsg.readAt = timestamp;
                if (status === 'FAILED') {
                  localMsg.failedAt = timestamp;
                  if (statusObj.errors && statusObj.errors.length > 0) {
                    localMsg.errorMessage = statusObj.errors[0].title || statusObj.errors[0].message;
                  }
                }
                if (localMsg.automationId) {
                  const localAuto = localStore.automations.find((a) => a.id === localMsg.automationId);
                  if (localAuto) {
                    localAuto.status = status;
                    localAuto.updatedAt = new Date();
                    if (status === 'FAILED' && localMsg.errorMessage) {
                      localAuto.errorMessage = localMsg.errorMessage;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] Error processing event:', err);
  }
});

/* =========================================================================
   8. HEALTH & VITE INTEGRATION
   ========================================================================= */

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'whatsapp-automation-backend',
  });
});

// Any unmatched /api route returns 404 JSON instead of falling through to Vite SPA html
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.path}`,
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[App] WhatsApp Message Automation running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
