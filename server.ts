import 'dotenv/config';
import express from 'express';
import { randomBytes, randomInt, createHash } from 'crypto';
import path from 'path';
import { db, initDatabaseSchema, isDatabaseConnected, pool } from './src/db/index.ts';
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
  refreshSessions,
} from './src/db/schema.ts';
import { eq, desc, sql, and, count, inArray, or, like, gt, isNull } from 'drizzle-orm';
import { requireAuth, requireAdmin, AuthRequest } from './src/middleware/auth.ts';
import { ensureFixedAdminUser } from './src/db/users.ts';
import { createAccessToken, createRefreshToken, createPurposeToken, verifyPurposeToken, hashPassword, hashRefreshToken, normalizeLoginPhone, verifyPassword } from './src/lib/password-auth.ts';
import { WhatsAppService } from './src/server/whatsapp.ts';
import { automationWorker } from './src/server/worker.ts';
import { resolveWhatsAppCredentials, encryptedCredentialValues } from './src/server/credentials.ts';
import { decryptSecret, encryptSecret } from './src/server/credential-crypto.ts';
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

        console.log('[WhatsApp] Legacy demo templates removed. Real templates must come from each business WABA.');
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
      role: 'BUSINESS_OWNER',
      isActive: true,
      approvalStatus: 'PENDING_APPROVAL',
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
      status: 'PENDING_APPROVAL',
      message: 'Registration submitted successfully. Please wait for administrator approval.',
      user: created,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to register account.' });
  }
});

// Mobile number + password only. WhatsApp connection is NOT a login requirement.
async function mobileLoginHandler(req: any, res: any) {
  try {
    if (!isDatabaseConnected) return res.status(503).json({ error: 'Database is not connected. Login requires PostgreSQL.' });
    const phone = normalizeLoginPhone(req.body?.mobile || req.body?.phone || '');
    const password = String(req.body?.password || '');
    const rememberMe = req.body?.rememberMe !== false;
    if (!phone || !password) return res.status(400).json({ error: 'Mobile number and password are required.' });
    const [account] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!account || !account.passwordHash || !verifyPassword(password, account.passwordHash)) {
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', error: 'Invalid mobile number or password.' });
    }
    const status = String(account.approvalStatus || '').toUpperCase();
    if (account.role !== 'admin') {
      if (status === 'PENDING' || status === 'PENDING_APPROVAL') return res.status(403).json({ code: 'ACCOUNT_PENDING', error: 'Your account is waiting for administrator approval.' });
      if (status === 'REJECTED') return res.status(403).json({ code: 'ACCOUNT_REJECTED', error: 'Your registration was rejected. Please contact support.' });
      if (status === 'SUSPENDED' || !account.isActive) return res.status(403).json({ code: 'ACCOUNT_SUSPENDED', error: 'Your account is suspended. Please contact support.' });
      if (status !== 'ACTIVE' && status !== 'APPROVED') return res.status(403).json({ code: 'ACCOUNT_NOT_ACTIVE', error: 'Your account is not active. Please contact support.' });
    } else if (!account.isActive) {
      return res.status(403).json({ code: 'ACCOUNT_SUSPENDED', error: 'Your account is suspended. Please contact support.' });
    }
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, account.id));
    const user = { id: account.id, businessId: account.role === 'admin' ? null : account.id, uid: account.uid, phone: account.phone || phone, email: account.email, name: account.name || 'User', role: account.role, businessName: account.businessName || '', businessAddress: account.businessAddress || '', approvalStatus: account.role === 'admin' ? 'ACTIVE' : (status === 'APPROVED' ? 'ACTIVE' : status) };
    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken();
    await db.insert(refreshSessions).values({ userId: account.id, tokenHash: hashRefreshToken(refreshToken), expiresAt: new Date(Date.now() + (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000) });
    let whatsappConnection: any = { exists: false, credentialsStatus: 'NOT_SAVED', connectionStatus: 'NOT_CONNECTED' };
    if (account.role !== 'admin') {
      const [wa] = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, account.id)).limit(1);
      if (wa) whatsappConnection = {
        exists: true,
        credentialsStatus: 'SAVED',
        connectionStatus: wa.connectionStatus || 'SAVED',
        businessAccountId: wa.businessAccountId || '',
        phoneNumberId: wa.phoneNumberId || '',
        displayPhoneNumber: wa.displayPhoneNumber || wa.businessPhone || '',
      };
    }
    res.json({ success: true, accessToken, refreshToken, token: accessToken, expiresIn: 900, rememberMe, user, whatsappConnection });
  } catch (err: any) {
    console.error('Mobile login error:', err);
    res.status(500).json({ error: 'Failed to authenticate user.' });
  }
}
app.post('/api/auth/login', mobileLoginHandler);
app.post('/api/auth/mobile-login', mobileLoginHandler);

// Device-specific biometric login. The mobile app never stores the user's password.
// A random device credential is generated only after an authenticated user enables biometrics.
app.post('/api/auth/biometric/enable', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
    const deviceLabel = String(req.body?.deviceLabel || 'Android device').trim().slice(0, 120) || 'Android device';
    const credentialId = `bio_${randomBytes(18).toString('hex')}`;
    const secret = randomBytes(32).toString('base64url');
    // Re-enabling on the same labelled device revokes the previous credential without affecting other devices.
    await pool.query('UPDATE biometric_credentials SET revoked_at = NOW() WHERE user_id = $1 AND device_label = $2 AND revoked_at IS NULL', [req.user.id, deviceLabel]);
    await pool.query(
      'INSERT INTO biometric_credentials (user_id, credential_id, secret_hash, device_label) VALUES ($1, $2, $3, $4)',
      [req.user.id, credentialId, hashPassword(secret), deviceLabel],
    );
    res.json({ success: true, credentialId, secret, deviceLabel });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unable to enable biometric login.' });
  }
});

app.post('/api/auth/biometric/disable', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
    const credentialId = String(req.body?.credentialId || '').trim();
    if (credentialId) {
      await pool.query('UPDATE biometric_credentials SET revoked_at = NOW() WHERE user_id = $1 AND credential_id = $2 AND revoked_at IS NULL', [req.user.id, credentialId]);
    } else {
      await pool.query('UPDATE biometric_credentials SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unable to disable biometric login.' });
  }
});

app.post('/api/auth/biometric/login', async (req, res) => {
  try {
    if (!isDatabaseConnected) return res.status(503).json({ error: 'Database is not connected.' });
    const credentialId = String(req.body?.credentialId || '').trim();
    const secret = String(req.body?.secret || '').trim();
    if (!credentialId || !secret) return res.status(400).json({ error: 'Biometric credential is required.' });

    const result = await pool.query(`
      SELECT bc.id AS biometric_id, bc.secret_hash, bc.device_label,
             u.id, u.uid, u.email, u.phone, u.name, u.role, u.is_active,
             u.approval_status, u.business_name, u.business_address
      FROM biometric_credentials bc
      JOIN users u ON u.id = bc.user_id
      WHERE bc.credential_id = $1 AND bc.revoked_at IS NULL
      LIMIT 1
    `, [credentialId]);
    const account: any = result.rows[0];
    if (!account || !verifyPassword(secret, account.secret_hash)) {
      return res.status(401).json({ code: 'BIOMETRIC_CREDENTIAL_INVALID', error: 'Biometric login is no longer valid. Sign in with your password and enable biometrics again.' });
    }
    const status = String(account.approval_status || '').toUpperCase();
    if (!account.is_active) return res.status(403).json({ code: 'ACCOUNT_SUSPENDED', error: 'Your account is suspended.' });
    if (account.role !== 'admin' && !['ACTIVE', 'APPROVED'].includes(status)) {
      return res.status(403).json({ code: 'ACCOUNT_NOT_ACTIVE', error: 'Your business account is not active.' });
    }
    const user = {
      id: Number(account.id), businessId: account.role === 'admin' ? null : Number(account.id), uid: account.uid,
      phone: account.phone || '', email: account.email || '', name: account.name || 'User', role: account.role,
      businessName: account.business_name || '', businessAddress: account.business_address || '',
      approvalStatus: account.role === 'admin' ? 'ACTIVE' : (status === 'APPROVED' ? 'ACTIVE' : status),
    };
    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken();
    await db.insert(refreshSessions).values({ userId: Number(account.id), tokenHash: hashRefreshToken(refreshToken), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
    await pool.query('UPDATE biometric_credentials SET last_used_at = NOW() WHERE id = $1', [account.biometric_id]);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, Number(account.id)));
    res.json({ success: true, accessToken, refreshToken, token: accessToken, expiresIn: 900, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Biometric login failed.' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '').trim();
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required.' });
    const [session] = await db.select().from(refreshSessions).where(and(eq(refreshSessions.tokenHash, hashRefreshToken(refreshToken)), isNull(refreshSessions.revokedAt), gt(refreshSessions.expiresAt, new Date()))).limit(1);
    if (!session) return res.status(401).json({ error: 'Refresh session is invalid or expired.' });
    const [account] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!account || !account.isActive) return res.status(401).json({ error: 'User session is no longer active.' });
    const status = String(account.approvalStatus || '').toUpperCase();
    if (account.role !== 'admin' && !['ACTIVE','APPROVED'].includes(status)) return res.status(403).json({ error: 'Account approval is required.' });
    const user = { id: account.id, businessId: account.role === 'admin' ? null : account.id, uid: account.uid, phone: account.phone || '', email: account.email, name: account.name || 'User', role: account.role, businessName: account.businessName || '', businessAddress: account.businessAddress || '', approvalStatus: account.role === 'admin' ? 'ACTIVE' : (status === 'APPROVED' ? 'ACTIVE' : status) };
    res.json({ accessToken: createAccessToken(user), expiresIn: 900, user });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Unable to refresh session.' }); }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '').trim();
    if (refreshToken) await db.update(refreshSessions).set({ revokedAt: new Date() }).where(eq(refreshSessions.tokenHash, hashRefreshToken(refreshToken)));
    // Logout revokes only this app session. Business-owned data, including the encrypted
    // WhatsApp connection/access token, remains stored on the backend for the same account.
    res.json({ success: true, sessionEnded: true, whatsappCredentialsPreserved: true });
  } catch { res.json({ success: true }); }
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


// Production endpoint aliases used by the Flutter client.
app.post('/api/auth/forgot-password/request', async (req, res) => {
  try {
    const phone = normalizeLoginPhone(req.body?.mobile || req.body?.phone || '');
    if (!phone) return res.status(400).json({ error: 'Enter a valid mobile number.' });
    const [account] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!account) return res.status(404).json({ error: 'Mobile number not found.' });
    const resetId = randomBytes(24).toString('hex'); const code = String(randomInt(100000, 1000000));
    await db.insert(passwordResetRequests).values({ resetId, userId: account.id, codeHash: hashPassword(code), expiresAt: new Date(Date.now() + 15*60*1000) });
    res.json({ success: true, resetId, message: 'Reset code sent.', ...(process.env.NODE_ENV === 'production' ? {} : { verificationCode: code }) });
  } catch { res.status(500).json({ error: 'Unable to start password reset.' }); }
});
app.post('/api/auth/forgot-password/reset', async (req, res) => {
  try {
    const resetId=String(req.body?.resetId||'').trim(), code=String(req.body?.code||req.body?.otp||'').trim(), newPassword=String(req.body?.newPassword||'');
    if(!/^\d{6}$/.test(code)) return res.status(400).json({error:'Invalid reset code.'});
    if(newPassword.length<8) return res.status(400).json({error:'Password must be at least 8 characters.'});
    const [r]=await db.select().from(passwordResetRequests).where(and(eq(passwordResetRequests.resetId,resetId),isNull(passwordResetRequests.usedAt))).limit(1);
    if(!r) return res.status(400).json({error:'Invalid reset code.'});
    if(r.expiresAt <= new Date()) return res.status(400).json({error:'Reset code expired.'});
    if(!verifyPassword(code,r.codeHash)) return res.status(400).json({error:'Invalid reset code.'});
    await db.update(users).set({passwordHash:hashPassword(newPassword)}).where(eq(users.id,r.userId));
    await db.update(passwordResetRequests).set({usedAt:new Date()}).where(eq(passwordResetRequests.id,r.id));
    await db.update(refreshSessions).set({revokedAt:new Date()}).where(and(eq(refreshSessions.userId,r.userId),isNull(refreshSessions.revokedAt)));
    res.json({success:true,message:'Password reset successfully.'});
  } catch { res.status(500).json({error:'Unable to reset password.'}); }
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
    const [account] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
    if (!account || !account.isActive) return res.status(401).json({ error: 'User session is no longer active.' });
    if (account.role !== 'admin' && !['ACTIVE','APPROVED'].includes(String(account.approvalStatus).toUpperCase())) {
      return res.status(403).json({ code: 'ACCOUNT_PENDING', error: 'Account approval is required.' });
    }
    res.json({ user: {
      id: account.id, uid: account.uid, phone: account.phone || '', email: account.email,
      name: account.name || 'User', role: account.role, businessName: account.businessName || '', businessAddress: account.businessAddress || '',
      approvalStatus: account.role === 'admin' ? 'ACTIVE' : (String(account.approvalStatus).toUpperCase() === 'APPROVED' ? 'ACTIVE' : account.approvalStatus),
    }});
  } catch {
    res.status(500).json({ error: 'Unable to load current user.' });
  }
});

app.put('/api/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
    const [account] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const name = String(req.body?.name ?? account.name ?? '').trim();
    const email = String(req.body?.email ?? account.email ?? '').trim();
    const businessName = String(req.body?.businessName ?? account.businessName ?? '').trim();
    const businessAddress = String(req.body?.businessAddress ?? account.businessAddress ?? '').trim();

    if (name.length < 2) return res.status(400).json({ error: 'Enter a valid full name.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (account.role !== 'admin') {
      if (businessName.length < 2) return res.status(400).json({ error: 'Enter a valid business name.' });
      if (businessAddress.length < 3) return res.status(400).json({ error: 'Enter a valid business address.' });
    }

    const [updated] = await db.update(users).set({
      name,
      email: email || account.email,
      businessName: account.role === 'admin' ? account.businessName : businessName,
      businessAddress: account.role === 'admin' ? account.businessAddress : businessAddress,
    }).where(eq(users.id, account.id)).returning();

    const status = String(updated.approvalStatus || '').toUpperCase();
    res.json({ success: true, user: {
      id: updated.id, businessId: updated.role === 'admin' ? null : updated.id, uid: updated.uid,
      phone: updated.phone || '', email: updated.email || '', name: updated.name || 'User', role: updated.role,
      businessName: updated.businessName || '', businessAddress: updated.businessAddress || '',
      approvalStatus: updated.role === 'admin' ? 'ACTIVE' : (status === 'APPROVED' ? 'ACTIVE' : status),
    }});
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unable to update profile.' });
  }
});

app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [[businesses], [pending], [contactCount], [automationCount], [messageCount]] = await Promise.all([
      db.select({ val: count() }).from(users).where(sql`${users.role} <> 'admin'`),
      db.select({ val: count() }).from(users).where(and(sql`${users.role} <> 'admin'`, inArray(users.approvalStatus, ['PENDING','PENDING_APPROVAL']))),
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


app.get('/api/admin/businesses', requireAuth, requireAdmin, async (_req, res) => {
  const rows = await db.select({ id:users.id, phone:users.phone, email:users.email, ownerName:users.name, businessName:users.businessName, businessAddress:users.businessAddress, status:users.approvalStatus, isActive:users.isActive, createdAt:users.createdAt, lastLoginAt:users.lastLoginAt }).from(users).where(sql`${users.role} <> 'admin'`).orderBy(desc(users.createdAt));
  res.json(rows.map((r:any)=>({...r,status:r.status==='APPROVED'?'ACTIVE':r.status==='PENDING'?'PENDING_APPROVAL':r.status})));
});
app.get('/api/admin/businesses/:id', requireAuth, requireAdmin, async (req, res) => {
  const id=Number(req.params.id); const [business]=await db.select().from(users).where(eq(users.id,id)).limit(1); if(!business||business.role==='admin') return res.status(404).json({error:'Business not found.'});
  const [[contactCount],[templateCount],[automationCount],[messageCount],[wa]] = await Promise.all([
    db.select({val:count()}).from(contacts).where(eq(contacts.ownerUserId,id)), db.select({val:count()}).from(messageTemplates).where(eq(messageTemplates.ownerUserId,id)), db.select({val:count()}).from(automations).where(eq(automations.ownerUserId,id)), db.select({val:count()}).from(messages).where(eq(messages.ownerUserId,id)), db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId,id)).limit(1)
  ]);
  res.json({
    business:{...business,businessId:business.id,status:business.approvalStatus==='APPROVED'?'ACTIVE':business.approvalStatus==='PENDING'?'PENDING_APPROVAL':business.approvalStatus},
    counts:{contacts:Number(contactCount?.val||0),templates:Number(templateCount?.val||0),automations:Number(automationCount?.val||0),messages:Number(messageCount?.val||0)},
    whatsapp:wa?{
      status:wa.connectionStatus||'SAVED',credentialsStored:true,metaAppId:wa.metaAppId||null,
      metaBusinessId:wa.metaBusinessId||null,businessAccountId:wa.businessAccountId||null,phoneNumberId:wa.phoneNumberId||null,
      businessPhone:wa.businessPhone||null,displayPhoneNumber:wa.displayPhoneNumber||null,verifiedName:wa.verifiedName||null,
      qualityRating:wa.qualityRating||null,lastTestedAt:wa.lastTestedAt||null,lastConnectionError:wa.lastConnectionError||null,
      accessTokenStored:Boolean(wa.accessToken),appSecretStored:Boolean(wa.metaAppSecret),webhookTokenStored:Boolean(wa.webhookVerifyToken)
    }:{status:'NOT_CONNECTED',credentialsStored:false}
  });
});
const adminSetBusinessStatus = (target:string) => async (req:any,res:any) => { try { const id=Number(req.params.id); const [b]=await db.select().from(users).where(eq(users.id,id)).limit(1); if(!b||b.role==='admin') return res.status(404).json({error:'Business not found.'}); const [updated]=await db.update(users).set({approvalStatus:target,isActive:!['REJECTED','SUSPENDED'].includes(target),approvedAt:target==='ACTIVE'?new Date():b.approvedAt,approvedById:target==='ACTIVE'?req.user?.id:b.approvedById}).where(eq(users.id,id)).returning(); res.json(updated); } catch(e:any){res.status(500).json({error:e.message||'Failed to update business status.'});} };
app.post('/api/admin/businesses/:id/approve', requireAuth, requireAdmin, adminSetBusinessStatus('ACTIVE'));
app.post('/api/admin/businesses/:id/reject', requireAuth, requireAdmin, adminSetBusinessStatus('REJECTED'));
app.post('/api/admin/businesses/:id/suspend', requireAuth, requireAdmin, adminSetBusinessStatus('SUSPENDED'));
app.post('/api/admin/businesses/:id/reactivate', requireAuth, requireAdmin, adminSetBusinessStatus('ACTIVE'));

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
    if (!['ACTIVE', 'APPROVED', 'REJECTED', 'PENDING', 'PENDING_APPROVAL', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({ error: 'status must be ACTIVE, REJECTED, SUSPENDED or PENDING_APPROVAL.' });
    }
    const normalizedStatus = status === 'APPROVED' ? 'ACTIVE' : status === 'PENDING' ? 'PENDING_APPROVAL' : status;
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing || existing.role === 'admin') return res.status(404).json({ error: 'Business user not found.' });
    const [updated] = await db.update(users).set({
      approvalStatus: normalizedStatus,
      approvedAt: normalizedStatus === 'ACTIVE' ? new Date() : null,
      approvedById: normalizedStatus === 'ACTIVE' ? req.user?.id : null,
      isActive: !['REJECTED','SUSPENDED'].includes(normalizedStatus),
    }).where(eq(users.id, id)).returning();
    await db.insert(auditLogs).values({
      action: `BUSINESS_USER_${normalizedStatus}`,
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



// Complete admin business inspection. Secrets are never returned to the admin UI.
app.get('/api/admin/businesses/:id/resources', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [business] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!business || business.role === 'admin') return res.status(404).json({ error: 'Business not found.' });
    const [contactRows, templateRows, automationRows, messageRows, auditRows, waRows] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.ownerUserId, id)).orderBy(desc(contacts.createdAt)).limit(100),
      db.select().from(messageTemplates).where(eq(messageTemplates.ownerUserId, id)).orderBy(desc(messageTemplates.updatedAt)).limit(100),
      db.select({
        id: automations.id, status: automations.status, scheduledAt: automations.scheduledAt, timezone: automations.timezone,
        errorMessage: automations.errorMessage, createdAt: automations.createdAt,
        contactId: contacts.id, contactName: contacts.name, contactPhone: contacts.phone,
        templateId: messageTemplates.id, templateName: messageTemplates.name,
      }).from(automations)
        .leftJoin(contacts, eq(automations.contactId, contacts.id))
        .leftJoin(messageTemplates, eq(automations.templateId, messageTemplates.id))
        .where(eq(automations.ownerUserId, id)).orderBy(desc(automations.createdAt)).limit(100),
      db.select({
        id: messages.id, status: messages.status, templateName: messages.templateName, content: messages.content,
        whatsappMessageId: messages.whatsappMessageId, errorCode: messages.errorCode, errorMessage: messages.errorMessage,
        sentAt: messages.sentAt, deliveredAt: messages.deliveredAt, readAt: messages.readAt, createdAt: messages.createdAt,
        contactName: contacts.name, contactPhone: contacts.phone,
      }).from(messages).leftJoin(contacts, eq(messages.contactId, contacts.id))
        .where(eq(messages.ownerUserId, id)).orderBy(desc(messages.createdAt)).limit(100),
      db.select().from(auditLogs).where(sql`${auditLogs.details}->>'userId' = ${String(id)}`).orderBy(desc(auditLogs.createdAt)).limit(50),
      db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, id)).limit(1),
    ]);
    const wa:any = waRows[0];
    res.json({
      business: {
        id: business.id, ownerName: business.name, mobile: business.phone, email: business.email,
        businessName: business.businessName, businessAddress: business.businessAddress,
        status: business.approvalStatus === 'APPROVED' ? 'ACTIVE' : business.approvalStatus === 'PENDING' ? 'PENDING_APPROVAL' : business.approvalStatus,
        isActive: business.isActive, createdAt: business.createdAt, approvedAt: business.approvedAt, lastLoginAt: business.lastLoginAt,
      },
      whatsapp: wa ? {
        status: wa.connectionStatus, metaAppId: wa.metaAppId, wabaId: wa.businessAccountId, phoneNumberId: wa.phoneNumberId,
        businessPhone: wa.businessPhone, displayPhoneNumber: wa.displayPhoneNumber, verifiedName: wa.verifiedName,
        qualityRating: wa.qualityRating, metaBusinessId: wa.metaBusinessId, lastTestedAt: wa.lastTestedAt,
        lastConnectionError: wa.lastConnectionError, credentialsStored: true,
        accessTokenStored: Boolean(wa.accessToken), appSecretStored: Boolean(wa.metaAppSecret), webhookTokenStored: Boolean(wa.webhookVerifyToken),
      } : { status: 'NOT_CONNECTED', credentialsStored: false, accessTokenStored: false, appSecretStored: false, webhookTokenStored: false },
      contacts: contactRows,
      templates: templateRows,
      automations: automationRows,
      messages: messageRows,
      activity: auditRows,
    });
  } catch (e:any) {
    res.status(500).json({ error: e.message || 'Failed to load business details.' });
  }
});


app.get('/api/admin/contacts', requireAuth, requireAdmin, async (_req,res)=>{
  try { const rows=await db.select({id:contacts.id,name:contacts.name,phone:contacts.phone,email:contacts.email,optIn:contacts.optIn,dob:contacts.dob,createdAt:contacts.createdAt,businessId:users.id,businessName:users.businessName,ownerName:users.name}).from(contacts).leftJoin(users,eq(contacts.ownerUserId,users.id)).orderBy(desc(contacts.createdAt)); res.json(rows); }
  catch(e:any){res.status(500).json({error:e.message||'Failed to load admin contacts.'});}
});
app.get('/api/admin/templates', requireAuth, requireAdmin, async (_req,res)=>{
  try { const rows=await db.select({id:messageTemplates.id,name:messageTemplates.name,language:messageTemplates.language,category:messageTemplates.category,status:messageTemplates.status,components:messageTemplates.components,variableCount:messageTemplates.variableCount,updatedAt:messageTemplates.updatedAt,businessId:users.id,businessName:users.businessName,ownerName:users.name}).from(messageTemplates).leftJoin(users,eq(messageTemplates.ownerUserId,users.id)).orderBy(desc(messageTemplates.updatedAt)); res.json(rows); }
  catch(e:any){res.status(500).json({error:e.message||'Failed to load admin templates.'});}
});
app.get('/api/admin/automations', requireAuth, requireAdmin, async (_req,res)=>{
  try { const rows=await db.select({id:automations.id,status:automations.status,scheduledAt:automations.scheduledAt,timezone:automations.timezone,errorMessage:automations.errorMessage,createdAt:automations.createdAt,businessId:users.id,businessName:users.businessName,ownerName:users.name,contactName:contacts.name,contactPhone:contacts.phone,templateName:messageTemplates.name}).from(automations).leftJoin(users,eq(automations.ownerUserId,users.id)).leftJoin(contacts,eq(automations.contactId,contacts.id)).leftJoin(messageTemplates,eq(automations.templateId,messageTemplates.id)).orderBy(desc(automations.createdAt)); res.json(rows); }
  catch(e:any){res.status(500).json({error:e.message||'Failed to load admin automations.'});}
});
app.get('/api/admin/messages', requireAuth, requireAdmin, async (_req,res)=>{
  try { const rows=await db.select({id:messages.id,status:messages.status,templateName:messages.templateName,content:messages.content,whatsappMessageId:messages.whatsappMessageId,errorCode:messages.errorCode,errorMessage:messages.errorMessage,sentAt:messages.sentAt,createdAt:messages.createdAt,businessId:users.id,businessName:users.businessName,ownerName:users.name,contactName:contacts.name,contactPhone:contacts.phone}).from(messages).leftJoin(users,eq(messages.ownerUserId,users.id)).leftJoin(contacts,eq(messages.contactId,contacts.id)).orderBy(desc(messages.createdAt)); res.json(rows); }
  catch(e:any){res.status(500).json({error:e.message||'Failed to load admin messages.'});}
});


// Super Admin operational controls. These actions always execute with the selected
// business's own WhatsApp credentials; the platform admin credentials are never used.
app.post('/api/admin/businesses/:id/whatsapp/test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const businessId = Number(req.params.id);
    const [business] = await db.select().from(users).where(eq(users.id, businessId)).limit(1);
    if (!business || business.role === 'admin') return res.status(404).json({ error: 'Business not found.' });
    const creds = await resolveWhatsAppCredentials(businessId);
    if (!creds.isFullyConfigured) return res.status(400).json({ error: 'This business has not saved complete WhatsApp credentials.' });
    const result = await WhatsAppService.testConnection(creds.phoneNumberId, creds.accessToken, creds.apiVersion);
    const [wa] = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, businessId)).limit(1);
    if (wa) await db.update(whatsappAccounts).set({
      connectionStatus: result.success ? 'CONNECTED' : 'CONNECTION_ERROR', status: result.success ? 'CONNECTED' : 'ERROR',
      displayPhoneNumber: result.phoneNumber || wa.displayPhoneNumber, verifiedName: result.verifiedName || wa.verifiedName,
      qualityRating: result.qualityRating || wa.qualityRating, lastConnectionError: result.success ? null : (result.error || 'Connection test failed.'),
      lastTestedAt: new Date(), updatedAt: new Date(),
    }).where(eq(whatsappAccounts.id, wa.id));
    await db.insert(auditLogs).values({ action: 'ADMIN_WHATSAPP_TEST', actor: req.user?.phone || 'admin', details: { userId: businessId, success: result.success } });
    if (!result.success) return res.status(400).json({ success: false, error: result.error || 'Connection test failed.' });
    res.json({ success: true, phoneNumber: result.phoneNumber, verifiedName: result.verifiedName, qualityRating: result.qualityRating });
  } catch (e:any) { res.status(500).json({ error: e.message || 'Failed to test business WhatsApp connection.' }); }
});

app.post('/api/admin/businesses/:id/templates/sync', requireAuth, requireAdmin, async (req, res) => {
  try {
    const businessId = Number(req.params.id);
    const [business] = await db.select().from(users).where(eq(users.id, businessId)).limit(1);
    if (!business || business.role === 'admin') return res.status(404).json({ error: 'Business not found.' });
    const creds = await resolveWhatsAppCredentials(businessId);
    if (!creds.businessAccountId || !creds.accessToken) return res.status(400).json({ error: 'This business has not connected WhatsApp Business.' });
    const metaRes = await WhatsAppService.fetchTemplates(creds.businessAccountId, creds.accessToken, creds.apiVersion);
    if (!metaRes.success || !metaRes.templates) return res.status(400).json({ error: metaRes.error || 'Failed to fetch templates from Meta.' });
    let syncedCount = 0;
    for (const t of metaRes.templates) {
      const varCount = extractVariableCount(t.components);
      await db.insert(messageTemplates).values({
        ownerUserId: businessId, metaTemplateId: t.id, name: t.name, language: t.language, category: t.category,
        status: t.status, components: t.components, variableCount: varCount, lastSyncedAt: new Date(), updatedAt: new Date(),
      }).onConflictDoUpdate({ target: messageTemplates.metaTemplateId, set: {
        ownerUserId: businessId, name: t.name, language: t.language, category: t.category, status: t.status,
        components: t.components, variableCount: varCount, lastSyncedAt: new Date(), updatedAt: new Date(),
      }});
      syncedCount++;
    }
    await db.insert(auditLogs).values({ action: 'ADMIN_TEMPLATE_SYNC', actor: req.user?.phone || 'admin', details: { userId: businessId, syncedCount } });
    res.json({ success: true, syncedCount });
  } catch (e:any) { res.status(500).json({ error: e.message || 'Failed to sync business templates.' }); }
});

app.post('/api/admin/automations/:id/:action', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id); const action = String(req.params.action || '').toLowerCase();
    const [automation] = await db.select().from(automations).where(eq(automations.id, id)).limit(1);
    if (!automation) return res.status(404).json({ error: 'Automation not found.' });
    if (action === 'run-now') {
      if (automation.status !== 'SCHEDULED') return res.status(409).json({ error: `Automation is ${automation.status}. Only SCHEDULED automations can run now.` });
      const result = await automationWorker.triggerNow({ forceId: id });
      await db.insert(auditLogs).values({ action: 'ADMIN_AUTOMATION_RUN_NOW', actor: req.user?.phone || 'admin', details: { userId: automation.ownerUserId, automationId: id } });
      return res.json(result);
    }
    if (action === 'pause') {
      if (automation.status !== 'SCHEDULED') return res.status(409).json({ error: `Automation is ${automation.status}. Only SCHEDULED automations can be paused.` });
      const [updated] = await db.update(automations).set({ status: 'PAUSED', updatedAt: new Date() }).where(eq(automations.id, id)).returning();
      return res.json({ success: true, automation: updated });
    }
    if (action === 'cancel' || action === 'stop') {
      if (['SENT','DELIVERED','READ','PROCESSING','CANCELLED'].includes(automation.status)) return res.status(409).json({ error: `Automation cannot be cancelled from ${automation.status}.` });
      const [updated] = await db.update(automations).set({ status: 'CANCELLED', updatedAt: new Date() }).where(eq(automations.id, id)).returning();
      return res.json({ success: true, automation: updated });
    }
    if (action === 'resume') {
      if (automation.status !== 'PAUSED') return res.status(409).json({ error: `Automation is ${automation.status}. Only PAUSED automations can resume.` });
      const [updated] = await db.update(automations).set({ status: 'SCHEDULED', updatedAt: new Date() }).where(eq(automations.id, id)).returning();
      return res.json({ success: true, automation: updated });
    }
    return res.status(400).json({ error: 'Unsupported automation action.' });
  } catch (e:any) { res.status(500).json({ error: e.message || 'Failed to control automation.' }); }
});

app.get('/api/admin/reports', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [businesses, contactRows, automationRows, messageRows, templateRows] = await Promise.all([
      db.select({status: users.approvalStatus, isActive: users.isActive}).from(users).where(sql`${users.role} <> 'admin'`),
      db.select({ownerUserId: contacts.ownerUserId}).from(contacts),
      db.select({ownerUserId: automations.ownerUserId, status: automations.status}).from(automations),
      db.select({ownerUserId: messages.ownerUserId, status: messages.status}).from(messages),
      db.select({ownerUserId: messageTemplates.ownerUserId, status: messageTemplates.status}).from(messageTemplates),
    ]);
    const countStatus=(rows:any[], key:string, value:string)=>rows.filter(r=>String(r[key]||'').toUpperCase()===value).length;
    res.json({
      businesses: { total: businesses.length, active: businesses.filter((b:any)=>b.isActive && ['ACTIVE','APPROVED'].includes(String(b.status).toUpperCase())).length, pending: businesses.filter((b:any)=>['PENDING','PENDING_APPROVAL'].includes(String(b.status).toUpperCase())).length, suspended: countStatus(businesses,'status','SUSPENDED'), rejected: countStatus(businesses,'status','REJECTED') },
      contacts: { total: contactRows.length },
      automations: { total: automationRows.length, scheduled: countStatus(automationRows,'status','SCHEDULED'), sent: countStatus(automationRows,'status','SENT'), failed: countStatus(automationRows,'status','FAILED') },
      messages: { total: messageRows.length, sent: messageRows.filter((m:any)=>['SENT','DELIVERED','READ'].includes(String(m.status).toUpperCase())).length, delivered: countStatus(messageRows,'status','DELIVERED'), read: countStatus(messageRows,'status','READ'), failed: countStatus(messageRows,'status','FAILED') },
      templates: { total: templateRows.length, approved: countStatus(templateRows,'status','APPROVED'), pending: countStatus(templateRows,'status','PENDING'), rejected: countStatus(templateRows,'status','REJECTED') },
    });
  } catch (e:any) { res.status(500).json({error:e.message||'Failed to load reports.'}); }
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
        configured: creds.status === 'CONNECTED', hasToken: creds.hasToken, hasPhoneId: creds.hasPhoneId,
        credentialsSaved: Boolean(account), tokenSource: creds.tokenSource, status: creds.status,
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
      businessPhone: acc?.businessPhone || '', metaBusinessId: acc?.metaBusinessId || '',
      accessTokenMasked: maskSecret(creds.accessToken), webhookVerifyTokenMasked: maskSecret(creds.webhookVerifyToken),
      apiVersion: creds.apiVersion, status: acc?.connectionStatus || creds.status, credentialsStatus: acc ? 'SAVED' : 'NOT_SAVED',
      metaConnectionStatus: acc?.connectionStatus === 'CONNECTED' ? 'CONNECTED' : acc?.connectionStatus === 'CONNECTION_ERROR' ? 'ERROR' : 'NOT_CHECKED',
      displayPhoneNumber: acc?.displayPhoneNumber || null,
      verifiedName: acc?.verifiedName || null, qualityRating: acc?.qualityRating || null, lastTestedAt: acc?.lastTestedAt || null,
      lastConnectionError: acc?.lastConnectionError || null,
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

    const phoneNumberId = String(req.body?.phoneNumberId ?? existing?.phoneNumberId ?? '').trim().replace(/['"]/g, '');
    const businessAccountId = String(req.body?.businessAccountId ?? existing?.businessAccountId ?? '').trim().replace(/['"]/g, '');
    const metaAppId = String(req.body?.metaAppId ?? existing?.metaAppId ?? '').trim().replace(/['"]/g, '');
    const businessPhone = String(req.body?.businessPhone ?? existing?.businessPhone ?? '').trim();
    const metaBusinessId = String(req.body?.metaBusinessId ?? existing?.metaBusinessId ?? '').trim();
    const apiVersion = String(req.body?.apiVersion || 'v21.0').trim() || 'v21.0';
    const tokenInput = String(req.body?.accessToken || '').trim().replace(/['"]/g, '');
    const secretInput = String(req.body?.metaAppSecret || '').trim().replace(/['"]/g, '');
    const verifyInput = String(req.body?.webhookVerifyToken || '').trim().replace(/['"]/g, '');
    const accessToken = tokenInput && !isMaskedSecret(tokenInput) ? tokenInput : current.accessToken;
    const metaAppSecret = secretInput && !isMaskedSecret(secretInput) ? secretInput : current.metaAppSecret;
    const webhookVerifyToken = verifyInput && !isMaskedSecret(verifyInput) ? verifyInput : current.webhookVerifyToken;

    const secretValues = encryptedCredentialValues({ accessToken, metaAppSecret, webhookVerifyToken });
    let row: any;
    if (existing) {
      [row] = await db.update(whatsappAccounts).set({
        metaAppId, businessAccountId, phoneNumberId, businessPhone, metaBusinessId, apiVersion,
        ...secretValues, status: 'DISCONNECTED', connectionStatus: 'SAVED', lastConnectionError: null, updatedAt: new Date(),
      }).where(eq(whatsappAccounts.id, existing.id)).returning();
    } else {
      [row] = await db.insert(whatsappAccounts).values({
        ownerUserId, metaAppId, businessAccountId, phoneNumberId, businessPhone, metaBusinessId, apiVersion,
        metaAppSecret: secretValues.metaAppSecret || '', accessToken: secretValues.accessToken || '',
        webhookVerifyToken: secretValues.webhookVerifyToken || '', status: 'DISCONNECTED', connectionStatus: 'SAVED',
      }).returning();
    }

    await db.insert(auditLogs).values({
      action: 'WHATSAPP_CONFIG_UPDATED', actor: req.user?.phone || String(ownerUserId),
      details: { userId: ownerUserId, phoneNumberId, businessAccountId },
    });
    res.json({ success: true, configured: Boolean(phoneNumberId && accessToken), credentialsStatus: 'SAVED', metaConnectionStatus: 'NOT_CHECKED', message: 'WhatsApp Details Saved' });
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
        status: testRes.success ? 'CONNECTED' : 'ERROR', connectionStatus: testRes.success ? 'CONNECTED' : 'CONNECTION_ERROR',
        lastConnectionError: testRes.success ? null : (testRes.error || 'Connection test failed.'),
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
   META EMBEDDED SIGNUP (IN-APP WEBVIEW)
   ========================================================================= */
async function metaPlatformConfig() {
  try {
    const result = await pool.query('SELECT meta_app_id, meta_app_secret, embedded_signup_config_id, graph_api_version, public_base_url, webhook_verify_token FROM platform_meta_settings WHERE id = 1 LIMIT 1');
    const row: any = result.rows?.[0];
    if (row) {
      const dbSecret = decryptSecret(row.meta_app_secret);
      if (String(row.meta_app_id || '').trim() || String(row.embedded_signup_config_id || '').trim() || dbSecret) {
        return {
          appId: String(row.meta_app_id || '').trim(),
          appSecret: String(dbSecret || '').trim(),
          configId: String(row.embedded_signup_config_id || '').trim(),
          apiVersion: String(row.graph_api_version || 'v26.0').trim() || 'v26.0',
          publicBaseUrl: String(row.public_base_url || '').trim().replace(/\/$/, ''),
          webhookVerifyToken: String(decryptSecret(row.webhook_verify_token) || '').trim(),
          source: 'database',
        };
      }
    }
  } catch (e: any) {
    console.warn('[Meta] Could not read platform Meta settings from database:', e?.message);
  }
  const envConfig = {
    appId: String(process.env.META_PLATFORM_APP_ID || '').trim(),
    appSecret: String(process.env.META_PLATFORM_APP_SECRET || '').trim(),
    configId: String(process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || '').trim(),
    apiVersion: String(process.env.META_GRAPH_API_VERSION || 'v26.0').trim() || 'v26.0',
    publicBaseUrl: String(process.env.PUBLIC_BASE_URL || process.env.META_PUBLIC_BASE_URL || '').trim().replace(/\/$/, ''),
    webhookVerifyToken: String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim(),
  };
  return {
    ...envConfig,
    source: (envConfig.appId || envConfig.appSecret || envConfig.configId) ? 'environment' : 'not_configured',
  };
}


async function ensurePlatformWebhookVerifyToken(existing?: string) {
  const current = String(existing || '').trim();
  if (current) return current;
  const generated = `wf_meta_wh_${randomBytes(32).toString('hex')}`;
  await pool.query(`
    INSERT INTO platform_meta_settings (id, webhook_verify_token, updated_at)
    VALUES (1, $1, NOW())
    ON CONFLICT (id) DO UPDATE SET webhook_verify_token = EXCLUDED.webhook_verify_token, updated_at = NOW()
  `, [encryptSecret(generated)]);
  return generated;
}


async function resolveMetaPublicBaseUrl(configuredUrl?: string) {
  const direct = String(configuredUrl || '').trim().replace(/\/$/, '');
  if (/^https:\/\//i.test(direct)) return { url: direct, source: 'database' };

  const envUrl = String(process.env.META_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (/^https:\/\//i.test(envUrl)) return { url: envUrl, source: 'environment' };

  // Local development convenience: ngrok exposes its active tunnel list on 127.0.0.1:4040.
  // This never exposes secrets; it only discovers the temporary HTTPS forwarding URL.
  try {
    const response = await fetch('http://127.0.0.1:4040/api/tunnels');
    if (response.ok) {
      const body: any = await response.json();
      const tunnels = Array.isArray(body?.tunnels) ? body.tunnels : [];
      const httpsTunnel = tunnels.find((t: any) => /^https:\/\//i.test(String(t?.public_url || '')));
      const url = String(httpsTunnel?.public_url || '').trim().replace(/\/$/, '');
      if (url) return { url, source: 'ngrok' };
    }
  } catch {
    // ngrok is optional; normal production deployments use a configured HTTPS URL.
  }
  return { url: '', source: 'not_available' };
}

function metaPublicHostname(publicUrl?: string) {
  try { return new URL(String(publicUrl || '')).hostname; } catch { return ''; }
}

app.get('/api/admin/meta-platform-settings', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const cfg = await metaPlatformConfig();
    const webhookVerifyToken = await ensurePlatformWebhookVerifyToken(cfg.webhookVerifyToken);
    const resolvedPublic = await resolveMetaPublicBaseUrl(cfg.publicBaseUrl);
    res.json({
      configured: Boolean(cfg.appId && cfg.appSecret && cfg.configId),
      metaAppId: cfg.appId,
      appSecretMasked: cfg.appSecret ? maskSecret(cfg.appSecret) : '',
      embeddedSignupConfigId: cfg.configId,
      apiVersion: cfg.apiVersion,
      publicBaseUrl: cfg.publicBaseUrl || '',
      detectedPublicBaseUrl: resolvedPublic.url,
      detectedPublicBaseUrlSource: resolvedPublic.source,
      oauthRedirectUri: '',
      embeddedSignupOrigin: resolvedPublic.url || '',
      embeddedSignupHostname: metaPublicHostname(resolvedPublic.url),
      webhookCallbackUrl: resolvedPublic.url ? `${resolvedPublic.url}/api/webhooks/whatsapp` : '',
      webhookVerifyToken,
      source: cfg.source,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load Meta platform settings.' });
  }
});

app.put('/api/admin/meta-platform-settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const current = await metaPlatformConfig();
    const appId = String(req.body?.metaAppId ?? current.appId ?? '').trim();
    const configId = String(req.body?.embeddedSignupConfigId ?? current.configId ?? '').trim();
    const apiVersion = String(req.body?.apiVersion ?? current.apiVersion ?? 'v26.0').trim() || 'v26.0';
    const publicBaseUrl = String(req.body?.publicBaseUrl ?? current.publicBaseUrl ?? '').trim().replace(/\/$/, '');
    const incomingSecret = String(req.body?.appSecret ?? '').trim();
    const appSecret = incomingSecret && !isMaskedSecret(incomingSecret) ? incomingSecret : current.appSecret;
    const incomingWebhookToken = String(req.body?.webhookVerifyToken ?? '').trim();
    const webhookVerifyToken = incomingWebhookToken || current.webhookVerifyToken || `wf_meta_wh_${randomBytes(32).toString('hex')}`;
    if (!appId || !configId || !appSecret) return res.status(400).json({ error: 'Meta App ID, App Secret and Embedded Signup Configuration ID are required.' });
    if (publicBaseUrl && !/^https:\/\//i.test(publicBaseUrl)) return res.status(400).json({ error: 'If provided, the Meta callback/backend URL must start with https://. For local development you can leave it blank and run ngrok; WishFlow will detect the tunnel automatically.' });
    if (!/^v\d+\.\d+$/.test(apiVersion)) return res.status(400).json({ error: 'Graph API version must look like v26.0.' });
    await pool.query(`
      INSERT INTO platform_meta_settings (id, meta_app_id, meta_app_secret, embedded_signup_config_id, graph_api_version, public_base_url, webhook_verify_token, updated_at)
      VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET
        meta_app_id = EXCLUDED.meta_app_id,
        meta_app_secret = EXCLUDED.meta_app_secret,
        embedded_signup_config_id = EXCLUDED.embedded_signup_config_id,
        graph_api_version = EXCLUDED.graph_api_version,
        public_base_url = EXCLUDED.public_base_url,
        webhook_verify_token = EXCLUDED.webhook_verify_token,
        updated_at = NOW()
    `, [appId, encryptSecret(appSecret), configId, apiVersion, publicBaseUrl, encryptSecret(webhookVerifyToken)]);
    const resolvedPublic = await resolveMetaPublicBaseUrl(publicBaseUrl);
    res.json({ success: true, configured: true, metaAppId: appId, appSecretMasked: maskSecret(appSecret), embeddedSignupConfigId: configId, apiVersion, publicBaseUrl, detectedPublicBaseUrl: resolvedPublic.url, detectedPublicBaseUrlSource: resolvedPublic.source, oauthRedirectUri: '', embeddedSignupOrigin: resolvedPublic.url || '', embeddedSignupHostname: metaPublicHostname(resolvedPublic.url), webhookCallbackUrl: resolvedPublic.url ? `${resolvedPublic.url}/api/webhooks/whatsapp` : '', webhookVerifyToken, source: 'database' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to save Meta platform settings.' });
  }
});



app.post('/api/admin/meta-platform-settings/regenerate-webhook-token', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const generated = `wf_meta_wh_${randomBytes(32).toString('hex')}`;
    await pool.query(`
      INSERT INTO platform_meta_settings (id, webhook_verify_token, updated_at)
      VALUES (1, $1, NOW())
      ON CONFLICT (id) DO UPDATE SET webhook_verify_token = EXCLUDED.webhook_verify_token, updated_at = NOW()
    `, [encryptSecret(generated)]);
    const cfg = await metaPlatformConfig();
    const resolvedPublic = await resolveMetaPublicBaseUrl(cfg.publicBaseUrl);
    res.json({ success: true, webhookVerifyToken: generated, webhookCallbackUrl: resolvedPublic.url ? `${resolvedPublic.url}/api/webhooks/whatsapp` : '' });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message || 'Failed to regenerate webhook verify token.' });
  }
});

app.post('/api/admin/meta-platform-settings/test', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const cfg = await metaPlatformConfig();
    const resolvedPublic = await resolveMetaPublicBaseUrl(cfg.publicBaseUrl);
    if (!cfg.appId || !cfg.appSecret || !cfg.configId) {
      return res.status(400).json({
        success: false,
        code: 'META_PLATFORM_NOT_CONFIGURED',
        error: 'Save the WishFlow Meta App ID, App Secret and Embedded Signup Configuration ID first.',
      });
    }
    const tokenUrl = `https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/oauth/access_token?client_id=${encodeURIComponent(cfg.appId)}&client_secret=${encodeURIComponent(cfg.appSecret)}&grant_type=client_credentials`;
    const response = await fetch(tokenUrl);
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) {
      return res.status(400).json({
        success: false,
        code: 'META_APP_CREDENTIALS_INVALID',
        error: body?.error?.message || 'Meta rejected the App ID/App Secret. Check the WishFlow Meta Developer App credentials.',
      });
    }
    return res.json({
      success: true,
      ready: true,
      metaAppId: cfg.appId,
      embeddedSignupConfigId: cfg.configId,
      apiVersion: cfg.apiVersion,
      publicBaseUrl: resolvedPublic.url,
      oauthRedirectUri: '',
      embeddedSignupOrigin: resolvedPublic.url || '',
      embeddedSignupHostname: metaPublicHostname(resolvedPublic.url),
      detectedPublicBaseUrl: resolvedPublic.url,
      detectedPublicBaseUrlSource: resolvedPublic.source,
      source: cfg.source,
      message: resolvedPublic.url ? `WishFlow Meta credentials are valid. Meta signup URL detected: ${resolvedPublic.url}` : 'WishFlow Meta credentials are valid. Start ngrok on port 3000 for local Meta/Facebook login.',
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message || 'Could not validate Meta platform settings.' });
  }
});

app.get('/api/whatsapp/embedded-signup/readiness', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Embedded Signup is available only for business accounts.' });
    const cfg = await metaPlatformConfig();
    const resolvedPublic = await resolveMetaPublicBaseUrl(cfg.publicBaseUrl);
    const credentialsReady = Boolean(cfg.appId && cfg.appSecret && cfg.configId);
    const ready = Boolean(credentialsReady && resolvedPublic.url);
    return res.json({
      ready,
      credentialsReady,
      apiVersion: cfg.apiVersion,
      publicBaseUrl: resolvedPublic.url,
      publicBaseUrlSource: resolvedPublic.source,
      source: cfg.source,
      reason: ready ? null : !credentialsReady
        ? 'WishFlow Meta platform setup is incomplete. Ask the Super Admin to save the Meta App ID, App Secret and Embedded Signup Configuration ID.'
        : 'No HTTPS Meta callback is available. For local development start ngrok with: ngrok http 3000. WishFlow will detect it automatically.',
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Could not check Meta Embedded Signup readiness.' });
  }
});

function hashMetaSignupState(value: string) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function cleanMetaError(body: any, fallback: string) {
  const err = body?.error || body;
  return String(err?.error_user_msg || err?.error_user_title || err?.message || fallback || 'Meta API request failed.');
}

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function metaGraphJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok || body?.error) {
    const error: any = new Error(cleanMetaError(body, `Meta API request failed (HTTP ${response.status}).`));
    error.meta = body?.error || body;
    error.httpStatus = response.status;
    throw error;
  }
  return body;
}

async function exchangeMetaEmbeddedSignupCode(cfg: any, code: string, redirectUri?: string) {
  // Codes returned by the Embedded Signup Builder / Facebook JS SDK are
  // exchanged server-side. For the current Builder flow Meta does not require
  // us to invent a redirect URI; including a different URI can invalidate the
  // short-lived code. Keep redirect_uri optional for backward compatibility
  // with the older redirect-based flow retained below.
  const params = new URLSearchParams({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    code,
  });
  const normalizedRedirect = String(redirectUri || '').trim();
  if (normalizedRedirect) params.set('redirect_uri', normalizedRedirect);
  const tokenUrl = `https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/oauth/access_token?${params.toString()}`;
  const body: any = await metaGraphJson(tokenUrl);
  const token = String(body?.access_token || '').trim();
  if (!token) throw new Error('Meta did not return a business access token.');
  return { accessToken: token, expiresIn: Number(body?.expires_in || 0) || null };
}

async function getMetaAppAccessToken(cfg: any) {
  const params = new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, grant_type: 'client_credentials' });
  try {
    const body: any = await metaGraphJson(`https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/oauth/access_token?${params.toString()}`);
    return String(body?.access_token || `${cfg.appId}|${cfg.appSecret}`);
  } catch {
    return `${cfg.appId}|${cfg.appSecret}`;
  }
}

async function discoverMetaWhatsappAssets(cfg: any, accessToken: string, hints: any = {}) {
  let wabaId = String(hints.wabaId || '').trim();
  let phoneNumberId = String(hints.phoneNumberId || '').trim();
  let metaBusinessId = String(hints.businessId || '').trim();

  // The system-user token generated by Embedded Signup normally includes the
  // granted WhatsApp assets in debug_token.granular_scopes.target_ids.  Rather
  // than assuming the first target ID is a WABA, test each candidate against
  // /{candidate}/phone_numbers and keep the first real WABA.
  const candidateWabaIds: string[] = [];
  try {
    const appAccessToken = await getMetaAppAccessToken(cfg);
    const debug: any = await metaGraphJson(
      `https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/debug_token?input_token=${encodeURIComponent(accessToken)}`,
      { headers: { Authorization: `Bearer ${appAccessToken}` } },
    );
    const scopes = Array.isArray(debug?.data?.granular_scopes) ? debug.data.granular_scopes : [];
    for (const item of scopes) {
      const scope = String(item?.scope || '');
      if (!['whatsapp_business_management', 'whatsapp_business_messaging', 'business_management'].includes(scope)) continue;
      for (const raw of (Array.isArray(item?.target_ids) ? item.target_ids : [])) {
        const id = String(raw || '').trim();
        if (id && !candidateWabaIds.includes(id)) candidateWabaIds.push(id);
      }
    }
  } catch (e: any) {
    console.warn('[Meta] debug_token asset discovery failed:', e?.message);
  }

  const tryWaba = async (candidate: string) => {
    if (!candidate) return false;
    try {
      const body: any = await metaGraphJson(
        `https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/${encodeURIComponent(candidate)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status&limit=100&access_token=${encodeURIComponent(accessToken)}`,
      );
      const phones = Array.isArray(body?.data) ? body.data : [];
      if (!phones.length) return false;
      wabaId = candidate;
      if (!phoneNumberId) phoneNumberId = String(phones[0]?.id || '').trim();
      return Boolean(phoneNumberId);
    } catch {
      return false;
    }
  };

  if (wabaId) await tryWaba(wabaId);
  if ((!wabaId || !phoneNumberId) && candidateWabaIds.length) {
    for (const id of candidateWabaIds) {
      if (await tryWaba(id)) break;
    }
  }

  // Fallback: enumerate business portfolios visible to the connected system user.
  // Check both owned and client/shared WABAs because businesses can be onboarded
  // under either relationship depending on the Meta Business configuration.
  if (!wabaId || !phoneNumberId) {
    try {
      const businesses: any = await metaGraphJson(
        `https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/me/businesses?fields=id,name&limit=100&access_token=${encodeURIComponent(accessToken)}`,
      );
      for (const business of (Array.isArray(businesses?.data) ? businesses.data : [])) {
        const bid = String(business?.id || '').trim();
        if (!bid) continue;
        for (const edge of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
          try {
            const wab: any = await metaGraphJson(
              `https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/${encodeURIComponent(bid)}/${edge}?fields=id,name&limit=100&access_token=${encodeURIComponent(accessToken)}`,
            );
            for (const row of (Array.isArray(wab?.data) ? wab.data : [])) {
              const id = String(row?.id || '').trim();
              if (id && await tryWaba(id)) {
                metaBusinessId = metaBusinessId || bid;
                break;
              }
            }
          } catch {}
          if (wabaId && phoneNumberId) break;
        }
        if (wabaId && phoneNumberId) break;
      }
    } catch (e: any) {
      console.warn('[Meta] business/WABA enumeration failed:', e?.message);
    }
  }

  if (!wabaId || !phoneNumberId) {
    throw new Error('Meta login completed, but no WhatsApp Business Account with a phone number was granted. In Meta, use the WhatsApp Embedded Signup login variation, choose the WhatsApp account/number, and grant whatsapp_business_management and whatsapp_business_messaging.');
  }
  return { wabaId, phoneNumberId, metaBusinessId };
}

async function finishMetaEmbeddedSignup(user: any, code: string, cfg: any, options: any = {}) {
  const tokenResult = await exchangeMetaEmbeddedSignupCode(cfg, code, options.redirectUri);
  const accessToken = tokenResult.accessToken;
  const assets = await discoverMetaWhatsappAssets(cfg, accessToken, options);
  const details = await WhatsAppService.testConnection(assets.phoneNumberId, accessToken, cfg.apiVersion);
  if (!details.success) {
    throw new Error(details.error || 'Meta granted access, but the WhatsApp phone number could not be verified.');
  }

  const enc = encryptedCredentialValues({
    accessToken,
    // The Meta App Secret is platform-owned, but keeping the existing encrypted
    // column populated preserves compatibility with the current credential resolver.
    metaAppSecret: cfg.appSecret,
    webhookVerifyToken: randomBytes(24).toString('hex'),
  });
  const [existing] = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, user.id)).limit(1);
  const values: any = {
    metaAppId: cfg.appId,
    businessAccountId: assets.wabaId,
    phoneNumberId: assets.phoneNumberId,
    metaBusinessId: assets.metaBusinessId,
    apiVersion: cfg.apiVersion,
    ...enc,
    businessPhone: details.phoneNumber || '',
    connectionStatus: 'CONNECTED',
    status: 'CONNECTED',
    displayPhoneNumber: details.phoneNumber || null,
    verifiedName: details.verifiedName || null,
    qualityRating: details.qualityRating || null,
    lastConnectionError: null,
    lastTestedAt: new Date(),
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(whatsappAccounts).set(values).where(eq(whatsappAccounts.id, existing.id));
  } else {
    await db.insert(whatsappAccounts).values({ ownerUserId: user.id, ...values });
  }

  let subscribed = false;
  try {
    await metaGraphJson(
      `https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/${encodeURIComponent(assets.wabaId)}/subscribed_apps`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
    );
    subscribed = true;
  } catch (e: any) {
    console.warn('[Meta] WABA subscribed_apps warning:', e?.message);
  }

  // Pull the business's real templates immediately so the account is ready for
  // automation as soon as onboarding finishes.
  try {
    const templateResult = await WhatsAppService.fetchTemplates(assets.wabaId, accessToken, cfg.apiVersion);
    if (templateResult.success && Array.isArray(templateResult.templates)) {
      for (const tpl of templateResult.templates) {
        const metaId = String((tpl as any).id || '').trim() || `${user.id}:${(tpl as any).name}:${(tpl as any).language}`;
        const components = Array.isArray((tpl as any).components) ? (tpl as any).components : [];
        const bodyText = String(components.find((c:any)=>String(c?.type||'').toUpperCase()==='BODY')?.text || '');
        const variableCount = Math.max(0, ...Array.from(bodyText.matchAll(/\{\{(\d+)\}\}/g)).map((m:any)=>Number(m[1])||0));
        const existingTpl = await db.select().from(messageTemplates).where(and(eq(messageTemplates.ownerUserId, user.id), eq(messageTemplates.metaTemplateId, metaId))).limit(1);
        const tplValues:any = {
          ownerUserId:user.id, metaTemplateId:metaId, name:String((tpl as any).name||''), language:String((tpl as any).language||'en_US'),
          category:String((tpl as any).category||'MARKETING'), status:String((tpl as any).status||'PENDING'), components, variableCount, lastSyncedAt:new Date(), updatedAt:new Date(),
        };
        if (existingTpl.length) await db.update(messageTemplates).set(tplValues).where(eq(messageTemplates.id, existingTpl[0].id));
        else await db.insert(messageTemplates).values(tplValues);
      }
    }
  } catch (e:any) {
    console.warn('[Meta] Initial template sync warning:', e?.message);
  }

  return {
    success: true,
    connectionStatus: 'CONNECTED',
    wabaId: assets.wabaId,
    phoneNumberId: assets.phoneNumberId,
    displayPhoneNumber: details.phoneNumber,
    verifiedName: details.verifiedName,
    qualityRating: details.qualityRating,
    subscribed,
    accessTokenStored: true,
  };
}

app.post('/api/whatsapp/embedded-signup/session', requireAuth, async (req:AuthRequest,res)=>{
  try {
    if(req.user?.role==='admin') return res.status(403).json({error:'Embedded Signup is available only for business accounts.'});
    const cfg=await metaPlatformConfig();
    if(!cfg.appId || !cfg.appSecret || !cfg.configId) return res.status(503).json({code:'META_PLATFORM_NOT_CONFIGURED',error:'WishFlow Meta platform setup is incomplete. The Super Admin must save the Meta App ID, App Secret and Embedded Signup Configuration ID once before business owners can use Meta login.'});
    const resolvedPublic = await resolveMetaPublicBaseUrl(cfg.publicBaseUrl);
    if (!resolvedPublic.url) return res.status(503).json({code:'META_TUNNEL_REQUIRED',error:'Meta Embedded Signup requires an HTTPS page. For local development run `ngrok http 3000`; WishFlow will detect the active HTTPS tunnel automatically.'});

    const sessionId = randomBytes(18).toString('hex');
    // This one-time launch secret never needs to reach Meta. It is stored only
    // as a SHA-256 hash and is placed in the URL fragment so it is not sent to
    // ngrok/server access logs by the browser.
    const launchSecret = randomBytes(32).toString('hex');
    const stateHash = hashMetaSignupState(launchSecret);
    const legacyRedirectUri=`${resolvedPublic.url}/meta/embedded-signup/callback`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await pool.query(`INSERT INTO meta_embedded_signup_sessions (session_id,user_id,state_hash,status,redirect_uri,expires_at,created_at,updated_at) VALUES ($1,$2,$3,'PENDING',$4,$5,NOW(),NOW())`, [sessionId, req.user!.id, stateHash, legacyRedirectUri, expiresAt]);

    // Start from our HTTPS bridge page. That page invokes Meta Login for Business
    // directly with the configured configuration ID, avoiding a dependency on
    // the Facebook JavaScript SDK on the customer's browser.
    const startUrl=`${resolvedPublic.url}/meta/embedded-signup/start?session=${encodeURIComponent(sessionId)}#token=${encodeURIComponent(launchSecret)}`;
    return res.json({
      sessionId,
      url:startUrl,
      flow:'EMBEDDED_SIGNUP_BUILDER',
      publicBaseUrl:resolvedPublic.url,
      publicBaseUrlSource:resolvedPublic.source,
      expiresIn:900,
    });
  } catch(e:any){return res.status(500).json({error:e.message||'Failed to start Meta Embedded Signup.'});}
});

app.get('/api/whatsapp/embedded-signup/session/:sessionId', requireAuth, async (req:AuthRequest,res)=>{
  try {
    const sessionId=String(req.params.sessionId||'');
    const result=await pool.query(`SELECT session_id,status,error_message,waba_id,phone_number_id,display_phone_number,verified_name,expires_at,completed_at FROM meta_embedded_signup_sessions WHERE session_id=$1 AND user_id=$2 LIMIT 1`,[sessionId,req.user!.id]);
    const row:any=result.rows?.[0];
    if(!row) return res.status(404).json({error:'Meta signup session not found.'});
    if(new Date(row.expires_at).getTime()<Date.now() && row.status==='PENDING') {
      await pool.query(`UPDATE meta_embedded_signup_sessions SET status='EXPIRED',error_message='This Meta signup session expired. Start again.',updated_at=NOW() WHERE session_id=$1`,[sessionId]);
      row.status='EXPIRED'; row.error_message='This Meta signup session expired. Start again.';
    }
    return res.json({sessionId:row.session_id,status:row.status,error:row.error_message||null,wabaId:row.waba_id||null,phoneNumberId:row.phone_number_id||null,displayPhoneNumber:row.display_phone_number||null,verifiedName:row.verified_name||null,completedAt:row.completed_at||null});
  } catch(e:any){return res.status(500).json({error:e.message||'Could not read Meta signup status.'});}
});

app.get('/meta/embedded-signup/start', async (req,res)=>{
  try {
    const sessionId=String(req.query.session||'').trim();
    if(!sessionId) return res.status(400).type('html').send('<h2>Missing WishFlow signup session.</h2>');
    const sessionResult=await pool.query(`SELECT session_id,status,expires_at FROM meta_embedded_signup_sessions WHERE session_id=$1 LIMIT 1`,[sessionId]);
    const session:any=sessionResult.rows?.[0];
    if(!session) return res.status(404).type('html').send('<h2>WishFlow signup session not found.</h2><p>Return to WishFlow and start again.</p>');
    if(session.status!=='PENDING') return res.status(409).type('html').send(`<h2>Signup session is ${escapeHtml(session.status)}.</h2><p>Return to WishFlow to see the current connection status.</p><a href="wishflow://meta-connected">Return to WishFlow</a>`);
    if(new Date(session.expires_at).getTime()<Date.now()) {
      await pool.query(`UPDATE meta_embedded_signup_sessions SET status='EXPIRED',error_message='Session expired',updated_at=NOW() WHERE session_id=$1`,[sessionId]);
      return res.status(410).type('html').send('<h2>Meta signup session expired.</h2><p>Return to WishFlow and start again.</p>');
    }
    const cfg=await metaPlatformConfig();
    if(!cfg.appId || !cfg.configId) return res.status(503).type('html').send('<h2>WishFlow Meta configuration is incomplete.</h2><p>Ask the Super Admin to configure the Meta App ID and Embedded Signup Configuration ID.</p>');

    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options','nosniff');
    // This page no longer waits for the Facebook JS SDK. Some mobile browsers,
    // privacy extensions and enterprise networks block connect.facebook.net,
    // which left the customer stuck on "Loading Meta…". Instead, the button
    // invokes Facebook Login for Business directly with the Embedded Signup
    // Builder configuration ID. Meta still owns the login/onboarding UI.
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';");

    const safeSessionId=escapeHtml(sessionId);
    return res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>Connect WhatsApp Business — WishFlow</title>
  <style>
    :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:#f5fbf8;color:#10231a}.wrap{max-width:620px;margin:0 auto;padding:22px 16px 50px}.card{background:#fff;border:1px solid #dce9e2;border-radius:24px;padding:24px;box-shadow:0 12px 38px rgba(16,35,26,.06)}h1{margin:0 0 10px;font-size:28px}p{line-height:1.5;color:#5f6f67}.steps{margin:22px 0}.step{display:flex;gap:12px;margin:14px 0}.n{width:34px;height:34px;border-radius:50%;background:#e3f7ed;color:#07864d;display:grid;place-items:center;font-weight:800;flex:0 0 34px}.step b{display:block;margin:3px 0}.btn{display:block;width:100%;border:0;border-radius:15px;padding:16px 18px;font-size:17px;font-weight:800;background:#0866ff;color:#fff;cursor:pointer;text-align:center;text-decoration:none}.status{margin-top:14px;padding:13px 14px;border-radius:13px;background:#eef5ff;color:#21436b;white-space:pre-wrap}.error{background:#fff0f0;color:#b42318}.note{margin-top:14px;padding:12px;border-radius:12px;background:#fff8e6;color:#73510d;font-size:13px}.small{font-size:12px;color:#76857d;margin-top:14px}.meta{font-weight:800;color:#0866ff}
  </style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>Connect WhatsApp Business</h1>
    <p>Continue to <span class="meta">Meta</span> to sign in with this business owner's own Facebook/Meta account. The Embedded Signup Builder configuration will control the WhatsApp assets and permissions. WishFlow never receives the Facebook password.</p>
    <div class="steps">
      <div class="step"><span class="n">1</span><div><b>Sign in to Meta</b><span>Authenticate on Meta's own secure page.</span></div></div>
      <div class="step"><span class="n">2</span><div><b>Choose Business Portfolio & WABA</b><span>Select or create this customer's WhatsApp Business Account.</span></div></div>
      <div class="step"><span class="n">3</span><div><b>Choose WhatsApp number</b><span>Select/register the number used by this business.</span></div></div>
      <div class="step"><span class="n">4</span><div><b>Grant permissions</b><span>Meta returns a short-lived authorization code to WishFlow.</span></div></div>
    </div>
    <a id="connectBtn" class="btn" href="#">Continue with Facebook / Meta</a>
    <div id="status" class="status">Ready. Tap Continue with Facebook / Meta.</div>
    <div class="note">After Meta finishes, WishFlow exchanges the authorization code on the backend, discovers the WABA and Phone Number ID, encrypts the business access token, subscribes webhooks, syncs approved templates, and marks this business ready for automation.</div>
    <div class="small">Session: ${safeSessionId.slice(0,10)}…</div>
  </div>
</div>
<script>
(() => {
  const APP_ID = ${JSON.stringify(String(cfg.appId))};
  const CONFIG_ID = ${JSON.stringify(String(cfg.configId))};
  const API_VERSION = ${JSON.stringify(String(cfg.apiVersion || 'v26.0'))};
  const btn = document.getElementById('connectBtn');
  const status = document.getElementById('status');

  function launchSecret() {
    const raw = String(location.hash || '').replace(/^#/, '');
    return new URLSearchParams(raw).get('token') || '';
  }

  function buildMetaUrl() {
    const state = launchSecret();
    if (!state) throw new Error('This WishFlow signup link is missing its secure session token. Return to WishFlow and start again.');
    const redirectUri = location.origin + '/meta/embedded-signup/callback';
    const p = new URLSearchParams({
      client_id: APP_ID,
      redirect_uri: redirectUri,
      state,
      config_id: CONFIG_ID,
      response_type: 'code',
      override_default_response_type: 'true',
      auth_type: 'rerequest'
    });
    return 'https://www.facebook.com/' + encodeURIComponent(API_VERSION) + '/dialog/oauth?' + p.toString();
  }

  btn.addEventListener('click', (event) => {
    event.preventDefault();
    try {
      const url = buildMetaUrl();
      status.textContent = 'Opening Meta Business Login…';
      // Use a full-page redirect instead of a popup. This works reliably on
      // Android Chrome/Brave and does not depend on connect.facebook.net.
      location.assign(url);
    } catch (e) {
      status.textContent = e && e.message ? e.message : String(e);
      status.className = 'status error';
    }
  });
})();
</script>
</body>
</html>`);
  } catch(e:any) {
    return res.status(500).type('html').send(`<h2>Could not prepare Meta Embedded Signup.</h2><p>${escapeHtml(e.message||e)}</p>`);
  }
});

app.post('/meta/embedded-signup/complete', async (req,res)=>{
  try {
    const sessionId=String(req.body?.sessionId||'').trim();
    const launchToken=String(req.body?.launchToken||'').trim();
    const code=String(req.body?.code||'').trim();
    if(!sessionId || !launchToken || !code) return res.status(400).json({error:'Meta signup session, secure launch token and authorization code are required.'});
    const stateHash=hashMetaSignupState(launchToken);
    const sessionResult=await pool.query(`SELECT session_id,user_id,status,expires_at FROM meta_embedded_signup_sessions WHERE session_id=$1 AND state_hash=$2 LIMIT 1`,[sessionId,stateHash]);
    const session:any=sessionResult.rows?.[0];
    if(!session) return res.status(401).json({error:'WishFlow could not validate this Meta signup session. Start again from the app.'});
    if(new Date(session.expires_at).getTime()<Date.now()) {
      await pool.query(`UPDATE meta_embedded_signup_sessions SET status='EXPIRED',error_message='Session expired',updated_at=NOW() WHERE session_id=$1`,[sessionId]);
      return res.status(410).json({error:'This Meta signup session expired. Start again from WishFlow.'});
    }
    if(session.status==='CONNECTED') {
      const existing=await pool.query(`SELECT waba_id,phone_number_id,display_phone_number,verified_name FROM meta_embedded_signup_sessions WHERE session_id=$1 LIMIT 1`,[sessionId]);
      const row:any=existing.rows?.[0]||{};
      return res.json({success:true,alreadyConnected:true,wabaId:row.waba_id||null,phoneNumberId:row.phone_number_id||null,displayPhoneNumber:row.display_phone_number||null,verifiedName:row.verified_name||null});
    }
    if(session.status!=='PENDING') return res.status(409).json({error:`This Meta signup session is ${session.status}. Start a new connection from WishFlow.`});

    const userResult=await db.select().from(users).where(eq(users.id,Number(session.user_id))).limit(1);
    const user:any=userResult[0];
    if(!user || user.role==='admin') throw new Error('Business account not found for this signup session.');
    const cfg=await metaPlatformConfig();
    const result=await finishMetaEmbeddedSignup(user,code,cfg,{
      // Builder/JS SDK code exchange should not be coupled to our legacy OAuth
      // callback URI. The WABA/phone hints come from the official session event.
      redirectUri:'',
      wabaId:String(req.body?.wabaId||'').trim(),
      phoneNumberId:String(req.body?.phoneNumberId||'').trim(),
      businessId:String(req.body?.businessId||'').trim(),
    });
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='CONNECTED',waba_id=$2,phone_number_id=$3,display_phone_number=$4,verified_name=$5,completed_at=NOW(),updated_at=NOW() WHERE session_id=$1`,[sessionId,result.wabaId,result.phoneNumberId,result.displayPhoneNumber||null,result.verifiedName||null]);
    return res.json(result);
  } catch(e:any) {
    const sessionId=String(req.body?.sessionId||'').trim();
    const message=String(e?.message||e);
    if(sessionId) {
      try { await pool.query(`UPDATE meta_embedded_signup_sessions SET status='FAILED',error_message=$2,updated_at=NOW() WHERE session_id=$1 AND status='PENDING'`,[sessionId,message]); } catch {}
    }
    return res.status(500).json({error:message});
  }
});

// Convenience URL retained for old bookmarks. New builds create a secure
// business-specific session first, then open /meta/embedded-signup/start.
app.get('/meta/embedded-signup', async (_req,res)=>{
  return res.status(410).type('html').send('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Arial;padding:28px"><h2>Start Meta signup from WishFlow</h2><p>Return to the WishFlow app and tap Continue with Meta. WishFlow will open the Embedded Signup Builder flow linked to your business account.</p></div>');
});

app.get('/meta/embedded-signup/callback', async (req,res)=>{
  const state=String(req.query.state||'').trim();
  const stateHash=hashMetaSignupState(state);
  const sessionResult=await pool.query(`SELECT session_id,user_id,status,redirect_uri,expires_at FROM meta_embedded_signup_sessions WHERE state_hash=$1 LIMIT 1`,[stateHash]);
  const session:any=sessionResult.rows?.[0];
  if(!session) return res.status(401).type('html').send('<h2>Meta signup session not found.</h2><p>Return to WishFlow and start again.</p>');
  if(new Date(session.expires_at).getTime()<Date.now()) {
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='EXPIRED',error_message='Session expired',updated_at=NOW() WHERE session_id=$1`,[session.session_id]);
    return res.status(400).type('html').send('<h2>Meta signup session expired.</h2><p>Return to WishFlow and start again.</p>');
  }
  const error=String(req.query.error_description||req.query.error_message||req.query.error||'').trim();
  if(error) {
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='FAILED',error_message=$2,updated_at=NOW() WHERE session_id=$1`,[session.session_id,error]);
    return res.status(400).type('html').send(`<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Arial;padding:28px"><h2>Meta connection was not completed</h2><p>${error.replace(/[<>&]/g,'')}</p><a href="wishflow://meta-connected">Return to WishFlow</a></div>`);
  }
  const code=String(req.query.code||'').trim();
  if(!code) {
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='FAILED',error_message='Meta did not return an authorization code.',updated_at=NOW() WHERE session_id=$1`,[session.session_id]);
    return res.status(400).type('html').send('<h2>Meta did not return an authorization code.</h2><p>Return to WishFlow and try again.</p>');
  }
  try {
    const userResult=await db.select().from(users).where(eq(users.id,Number(session.user_id))).limit(1);
    const user:any=userResult[0];
    if(!user || user.role==='admin') throw new Error('Business account not found for this signup session.');
    const cfg=await metaPlatformConfig();
    const result=await finishMetaEmbeddedSignup(user,code,cfg,{redirectUri:String(session.redirect_uri||'')});
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='CONNECTED',waba_id=$2,phone_number_id=$3,display_phone_number=$4,verified_name=$5,completed_at=NOW(),updated_at=NOW() WHERE session_id=$1`,[session.session_id,result.wabaId,result.phoneNumberId,result.displayPhoneNumber||null,result.verifiedName||null]);
    const phone=String(result.displayPhoneNumber||''); const name=String(result.verifiedName||'WhatsApp Business');
    return res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;background:#f4fbf7;margin:0;padding:28px;color:#10231a}.card{max-width:520px;margin:40px auto;background:#fff;border-radius:22px;padding:26px;border:1px solid #dfece5;text-align:center}.ok{font-size:52px;color:#079455}.btn{display:block;margin-top:22px;padding:15px;border-radius:14px;background:#079455;color:#fff;text-decoration:none;font-weight:700}.muted{color:#667085}</style></head><body><div class="card"><div class="ok">✓</div><h2>WhatsApp Business Connected</h2><p><b>${name.replace(/[<>&]/g,'')}</b></p><p>${phone.replace(/[<>&]/g,'')}</p><p>WishFlow securely stored this business's WABA ID, Phone Number ID and encrypted access token. Approved templates are being synchronized and automations can now use this account.</p><p class="muted">You can close this browser if WishFlow does not open automatically.</p><a class="btn" href="wishflow://meta-connected">Return to WishFlow</a></div><script>setTimeout(()=>{location.href='wishflow://meta-connected'},900)</script></body></html>`);
  } catch(e:any) {
    const message=String(e?.message||e);
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='FAILED',error_message=$2,updated_at=NOW() WHERE session_id=$1`,[session.session_id,message]);
    return res.status(500).type('html').send(`<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Arial;padding:28px"><h2>Meta connection could not be completed</h2><p>${message.replace(/[<>&]/g,'')}</p><p>Return to WishFlow, correct the Meta app/configuration if necessary, and try again.</p><a href="wishflow://meta-connected">Return to WishFlow</a></div>`);
  }
});

// Backward-compatible completion endpoint for older app builds.
app.post('/api/whatsapp/embedded-signup/complete', async (req,res)=>{
  try {
    const sessionToken=String(req.body?.sessionToken||''); const user=verifyPurposeToken(sessionToken,'meta_embedded_signup');
    if(!user || user.role==='admin') return res.status(401).json({error:'Embedded Signup session expired.'});
    const cfg=await metaPlatformConfig(); const code=String(req.body?.code||'').trim();
    if(!code) return res.status(400).json({error:'Meta authorization code is missing.'});
    const result=await finishMetaEmbeddedSignup(user,code,cfg,{redirectUri:String(req.body?.redirectUri||'')});
    res.json(result);
  } catch(e:any){res.status(500).json({error:e.message||'Failed to complete Meta Embedded Signup.'});}
});

// Production WhatsApp connection API. Save first, verify second.
app.get('/api/whatsapp/connection', requireAuth, async (req: AuthRequest, res) => {
  try {
    const ownerUserId=req.user!.id; const creds=await resolveWhatsAppCredentials(ownerUserId); const [acc]=await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId,ownerUserId)).limit(1);
    res.json({
      exists:Boolean(acc), credentialsStatus:acc?'SAVED':'NOT_SAVED', connectionStatus:acc?.connectionStatus||'NOT_CONNECTED', metaConnectionStatus:acc?.connectionStatus==='CONNECTED'?'CONNECTED':acc?.connectionStatus==='CONNECTION_ERROR'?'ERROR':'NOT_CHECKED',
      metaAppId:creds.metaAppId,businessAccountId:creds.businessAccountId,phoneNumberId:creds.phoneNumberId,businessPhone:acc?.businessPhone||'',metaBusinessId:acc?.metaBusinessId||'',apiVersion:creds.apiVersion,
      accessTokenMasked:maskSecret(creds.accessToken),appSecretMasked:maskSecret(creds.metaAppSecret),webhookVerifyTokenMasked:maskSecret(creds.webhookVerifyToken),displayPhoneNumber:acc?.displayPhoneNumber||null,verifiedName:acc?.verifiedName||null,qualityRating:acc?.qualityRating||null,lastSyncedAt:acc?.lastTestedAt||null,lastConnectionError:acc?.lastConnectionError||null,
    });
  } catch(e:any){res.status(500).json({error:e.message||'Failed to load WhatsApp connection.'});}
});
app.put('/api/whatsapp/connection', requireAuth, async (req: AuthRequest, res) => {
  try {
    if(req.user?.role==='admin') return res.status(403).json({error:'WhatsApp credentials belong to a business account.'});
    const ownerUserId=req.user!.id; const [existing]=await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId,ownerUserId)).limit(1); const current=await resolveWhatsAppCredentials(ownerUserId);
    const clean=(v:any)=>String(v??'').trim().replace(/['"]/g,'');
    const metaAppId=clean(req.body?.metaAppId ?? existing?.metaAppId), businessAccountId=clean(req.body?.businessAccountId ?? existing?.businessAccountId), phoneNumberId=clean(req.body?.phoneNumberId ?? existing?.phoneNumberId), businessPhone=String(req.body?.businessPhone ?? existing?.businessPhone ?? '').trim(), metaBusinessId=clean(req.body?.metaBusinessId ?? existing?.metaBusinessId), apiVersion=clean(req.body?.apiVersion ?? existing?.apiVersion ?? 'v21.0')||'v21.0';
    const tokenIn=String(req.body?.accessToken??'').trim(), secretIn=String(req.body?.appSecret??req.body?.metaAppSecret??'').trim(), verifyIn=String(req.body?.webhookVerifyToken??'').trim();
    const accessToken=tokenIn&&!isMaskedSecret(tokenIn)?tokenIn:current.accessToken, metaAppSecret=secretIn&&!isMaskedSecret(secretIn)?secretIn:current.metaAppSecret, webhookVerifyToken=verifyIn&&!isMaskedSecret(verifyIn)?verifyIn:current.webhookVerifyToken;
    const enc=encryptedCredentialValues({accessToken,metaAppSecret,webhookVerifyToken}); let row:any;
    if(existing){[row]=await db.update(whatsappAccounts).set({metaAppId,businessAccountId,phoneNumberId,businessPhone,metaBusinessId,apiVersion,...enc,connectionStatus:'SAVED',status:'DISCONNECTED',lastConnectionError:null,updatedAt:new Date()}).where(eq(whatsappAccounts.id,existing.id)).returning();}
    else {[row]=await db.insert(whatsappAccounts).values({ownerUserId,metaAppId,businessAccountId,phoneNumberId,businessPhone,metaBusinessId,apiVersion,metaAppSecret:enc.metaAppSecret||'',accessToken:enc.accessToken||'',webhookVerifyToken:enc.webhookVerifyToken||'',connectionStatus:'SAVED',status:'DISCONNECTED'}).returning();}
    res.json({success:true,credentialsStatus:'SAVED',connectionStatus:'SAVED',message:'WhatsApp Details Saved'});
  } catch(e:any){res.status(500).json({error:e.message||'Failed to save WhatsApp connection.'});}
});
app.post('/api/whatsapp/connection/test', requireAuth, async (req: AuthRequest, res) => {
  try {
    const ownerUserId=req.user!.id; const creds=await resolveWhatsAppCredentials(ownerUserId); const [acc]=await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId,ownerUserId)).limit(1);
    if(!acc) return res.status(400).json({error:'Save WhatsApp details first.'});
    if(!creds.phoneNumberId||!creds.accessToken){await db.update(whatsappAccounts).set({connectionStatus:'CONNECTION_ERROR',lastConnectionError:'Phone Number ID and Access Token are required.',lastTestedAt:new Date()}).where(eq(whatsappAccounts.id,acc.id));return res.status(400).json({error:'Phone Number ID and Access Token are required. Your saved details were not deleted.'});}
    const result=await WhatsAppService.testConnection(creds.phoneNumberId,creds.accessToken,creds.apiVersion);
    await db.update(whatsappAccounts).set({connectionStatus:result.success?'CONNECTED':'CONNECTION_ERROR',status:result.success?'CONNECTED':'ERROR',lastConnectionError:result.success?null:(result.error||'Connection test failed.'),displayPhoneNumber:result.phoneNumber||acc.displayPhoneNumber,verifiedName:result.verifiedName||acc.verifiedName,qualityRating:result.qualityRating||acc.qualityRating,lastTestedAt:new Date(),updatedAt:new Date()}).where(eq(whatsappAccounts.id,acc.id));
    if(!result.success) return res.status(400).json({success:false,connectionStatus:'CONNECTION_ERROR',error:result.error||'Connection test failed. Saved credentials were kept.'});
    res.json({success:true,connectionStatus:'CONNECTED',displayPhoneNumber:result.phoneNumber,verifiedName:result.verifiedName,qualityRating:result.qualityRating});
  } catch(e:any){res.status(500).json({error:e.message||'Connection test failed. Saved credentials were kept.'});}
});
app.delete('/api/whatsapp/connection', requireAuth, async (req:AuthRequest,res)=>{try{await db.delete(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId,req.user!.id));res.json({success:true});}catch(e:any){res.status(500).json({error:e.message||'Failed to disconnect WhatsApp.'});}});

app.get('/api/whatsapp/connection/readiness', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Business account required.' });
    const creds = await resolveWhatsAppCredentials(req.user!.id);
    const [account] = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, req.user!.id)).limit(1);
    const approved = await db.select().from(messageTemplates).where(and(eq(messageTemplates.ownerUserId, req.user!.id), eq(messageTemplates.status, 'APPROVED')));
    const connected = account?.connectionStatus === 'CONNECTED' && creds.isFullyConfigured;
    return res.json({
      connected,
      automationReady: connected && approved.length > 0,
      credentials: {
        accessTokenStored: creds.hasToken,
        phoneNumberIdStored: creds.hasPhoneId,
        wabaIdStored: Boolean(creds.businessAccountId),
        displayPhoneNumber: account?.displayPhoneNumber || account?.businessPhone || null,
        verifiedName: account?.verifiedName || null,
      },
      approvedTemplateCount: approved.length,
      nextAction: !connected
        ? 'Connect and verify this business WhatsApp account with Meta.'
        : approved.length === 0
          ? 'Sync or create an approved WhatsApp template before running automations.'
          : 'Automation is ready to send using this business WhatsApp account.',
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Failed to check WhatsApp automation readiness.' });
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
  try {
    if (!isDatabaseConnected) return res.status(503).json({ error: 'Database is not connected.' });
    const list = req.user?.role === 'admin'
      ? await db.select().from(messageTemplates).orderBy(desc(messageTemplates.updatedAt))
      : await db.select().from(messageTemplates).where(eq(messageTemplates.ownerUserId, req.user!.id)).orderBy(desc(messageTemplates.updatedAt));
    res.json(list);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Failed to load templates.' }); }
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


// Create a local template draft first. Optionally submit the persisted draft to Meta.
app.post('/api/whatsapp/templates', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Create templates from a business account.' });
    const name = String(req.body?.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g,'_');
    const category = String(req.body?.category || 'MARKETING').toUpperCase();
    const language = String(req.body?.language || 'en_US');
    const header = String(req.body?.header || '').trim();
    const body = String(req.body?.body || '').trim();
    const footer = String(req.body?.footer || '').trim();
    const buttons = Array.isArray(req.body?.buttons) ? req.body.buttons : [];
    const submitToMeta = req.body?.submitToMeta === true;
    if (!/^[a-z0-9_]{3,512}$/.test(name)) return res.status(400).json({ error: 'Template name must use lowercase letters, numbers and underscores.' });
    if (!['MARKETING','UTILITY','AUTHENTICATION'].includes(category)) return res.status(400).json({ error: 'Invalid template category.' });
    if (body.length < 5 || body.length > 1024) return res.status(400).json({ error: 'Template body must be 5-1024 characters.' });
    const components:any[]=[]; if(header) components.push({type:'HEADER',format:'TEXT',text:header}); components.push({type:'BODY',text:body}); if(footer) components.push({type:'FOOTER',text:footer}); if(buttons.length) components.push({type:'BUTTONS',buttons});
    const variableCount=extractVariableCount(components);
    const [draft] = await db.insert(messageTemplates).values({ ownerUserId:req.user!.id, metaTemplateId:null, name, language, category, status:'DRAFT', components, variableCount, lastSyncedAt:new Date(), updatedAt:new Date() }).returning();
    if (!submitToMeta) return res.status(201).json(draft);
    const creds=await resolveWhatsAppCredentials(req.user!.id);
    if(!creds.businessAccountId||!creds.accessToken) return res.status(201).json({...draft,submitError:'Template saved as DRAFT. Connect WhatsApp Business before submitting to Meta.'});
    const result=await WhatsAppService.createTemplate({businessAccountId:creds.businessAccountId,accessToken:creds.accessToken,apiVersion:creds.apiVersion,name,category,language,body});
    if(!result.success) return res.status(201).json({...draft,submitError:result.error||'Meta submission failed. Draft was kept.'});
    const [updated]=await db.update(messageTemplates).set({metaTemplateId:result.id||null,status:result.status||'PENDING',updatedAt:new Date(),lastSyncedAt:new Date()}).where(eq(messageTemplates.id,draft.id)).returning();
    res.status(201).json(updated);
  } catch (err:any) { res.status(500).json({ error: err.message || 'Failed to save template.' }); }
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
    const rawIds = Array.isArray(req.body?.contactIds) ? req.body.contactIds : [req.body?.contactId];
    const contactIds = [...new Set(rawIds.map(Number).filter(Boolean))];
    const tId = Number(req.body?.templateId), variables = req.body?.variables || {}, scheduledAt = req.body?.scheduledAt, timezone = String(req.body?.timezone || 'Asia/Kolkata');
    if (!contactIds.length || !tId || !scheduledAt) return res.status(400).json({ error: 'Audience, template and scheduled date/time are required.' });
    const targetDate = new Date(scheduledAt);
    if (Number.isNaN(targetDate.getTime())) return res.status(400).json({ error: 'Invalid scheduled date or time.' });
    if (targetDate.getTime() <= Date.now()) return res.status(400).json({ error: 'Schedule must be in the future.' });
    const [template] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.id,tId),eq(messageTemplates.ownerUserId,req.user!.id))).limit(1);
    if (!template) return res.status(404).json({ error: 'Template not found in your business.' });
    if (template.status !== 'APPROVED') return res.status(400).json({ error: 'Selected template is not Meta-approved yet.' });
    const selectedContacts = await db.select().from(contacts).where(and(eq(contacts.ownerUserId,req.user!.id),inArray(contacts.id,contactIds)));
    if (selectedContacts.length !== contactIds.length) return res.status(400).json({ error: 'One or more selected contacts do not belong to your business.' });
    const invalid = selectedContacts.find(c=>!c.optIn);
    if(invalid) return res.status(400).json({ error: `${invalid.name} has not opted in to WhatsApp messages.` });
    const created:any[]=[];
    for(const contact of selectedContacts){
      const normalizedVariables:Record<string,string>={};
      if(variables&&typeof variables==='object'&&!Array.isArray(variables)){ for(const [k,v] of Object.entries(variables)){ const text=String(v??'').trim().replace(/\{\{name\}\}/gi,contact.name); if(text) normalizedVariables[String(k)]=text; }}
      if(template.variableCount>0&&!normalizedVariables['1']) normalizedVariables['1']=contact.name;
      if(Object.keys(normalizedVariables).length<template.variableCount) return res.status(400).json({error:`Template ${template.name} requires ${template.variableCount} variable value(s).`});
      const [row]=await db.insert(automations).values({ownerUserId:req.user!.id,contactId:contact.id,templateId:template.id,variables:normalizedVariables,scheduledAt:targetDate,timezone,status:'SCHEDULED'}).returning();
      created.push(row);
    }
    await db.insert(auditLogs).values({action:'AUTOMATION_SCHEDULED',actor:req.user!.phone,details:{automationIds:created.map(x=>x.id),contactIds,templateId:tId,scheduledAt:targetDate.toISOString(),timezone}});
    res.status(201).json({success:true,count:created.length,automations:created,automation:created[0]||null});
  } catch(err:any){res.status(500).json({error:err.message||'Failed to schedule automation.'});}
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


app.post('/api/automations/:id/pause', requireAuth, async (req:AuthRequest,res)=>{try{const id=Number(req.params.id);const cond=req.user?.role==='admin'?eq(automations.id,id):and(eq(automations.id,id),eq(automations.ownerUserId,req.user!.id));const [a]=await db.select().from(automations).where(cond).limit(1);if(!a)return res.status(404).json({error:'Automation not found.'});if(!['SCHEDULED','PROCESSING'].includes(a.status))return res.status(409).json({error:`Cannot pause automation in ${a.status} state.`});const [u]=await db.update(automations).set({status:'PAUSED',updatedAt:new Date()}).where(cond).returning();res.json(u);}catch(e:any){res.status(500).json({error:e.message||'Failed to pause automation.'});}});
app.post('/api/automations/:id/run-now', requireAuth, async (req:AuthRequest,res)=>{try{const id=Number(req.params.id);const cond=req.user?.role==='admin'?eq(automations.id,id):and(eq(automations.id,id),eq(automations.ownerUserId,req.user!.id));const [a]=await db.select().from(automations).where(cond).limit(1);if(!a)return res.status(404).json({error:'Automation not found.'});if(a.status!=='SCHEDULED')return res.status(409).json({error:`Automation is ${a.status}. Only scheduled automations can run now.`});const result=await automationWorker.triggerNow({forceId:id});res.json(result);}catch(e:any){res.status(500).json({error:e.message||'Failed to run automation.'});}});

app.get('/api/messages', requireAuth, async (req:AuthRequest,res)=>{try{const rows=req.user?.role==='admin'?await db.select().from(messages).orderBy(desc(messages.createdAt)):await db.select().from(messages).where(eq(messages.ownerUserId,req.user!.id)).orderBy(desc(messages.createdAt));res.json(rows);}catch(e:any){res.status(500).json({error:e.message||'Failed to load message logs.'});}});
app.get('/api/messages/:id', requireAuth, async (req:AuthRequest,res)=>{try{const id=Number(req.params.id);const cond=req.user?.role==='admin'?eq(messages.id,id):and(eq(messages.id,id),eq(messages.ownerUserId,req.user!.id));const [row]=await db.select().from(messages).where(cond).limit(1);if(!row)return res.status(404).json({error:'Message not found.'});res.json(row);}catch(e:any){res.status(500).json({error:e.message||'Failed to load message.'});}});

app.post('/api/automations/worker/run', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  try { res.json(await automationWorker.triggerNow()); }
  catch (err: any) { res.status(500).json({ error: err.message || 'Worker failed.' }); }
});

app.post('/api/whatsapp/send', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Send messages from a business account.' });
    const cId = Number(req.body?.contactId), tId = Number(req.body?.templateId);
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, cId), eq(contacts.ownerUserId, req.user!.id))).limit(1);
    const [template] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.id, tId), eq(messageTemplates.ownerUserId, req.user!.id))).limit(1);
    if (!contact || !template) return res.status(404).json({ error: 'Contact or template not found in your business.' });
    if (template.status !== 'APPROVED') return res.status(400).json({ error: 'Selected template is not Meta-approved for your WhatsApp Business account.' });
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
    const [template] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.id,templateId),eq(messageTemplates.ownerUserId,req.user!.id))).limit(1);
    if (!template || template.status !== 'APPROVED') return res.status(400).json({ error: 'Select an approved WhatsApp template from your own business account.' });
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
async function verifyMetaWebhookRequest(req: express.Request, res: express.Response) {
  try {
    const mode = String(req.query['hub.mode'] || '');
    const token = String(req.query['hub.verify_token'] || '');
    const challenge = String(req.query['hub.challenge'] || '');
    const cfg = await metaPlatformConfig();
    const expected = await ensurePlatformWebhookVerifyToken(cfg.webhookVerifyToken);
    if (mode === 'subscribe' && token && token === expected) {
      console.log('[Webhook] Platform verification successful');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    }
    console.warn('[Webhook] Platform verification token mismatch');
    return res.status(403).send('Verification failed');
  } catch (err) {
    console.error('[Webhook] Verification error:', err);
    return res.status(500).send('Internal Server Error');
  }
}

app.get('/webhooks/whatsapp', verifyMetaWebhookRequest);
app.get('/api/webhooks/whatsapp', verifyMetaWebhookRequest);

// Webhook Events (SENT, DELIVERED, READ, FAILED statuses)
app.post('/webhooks/whatsapp', async (req, res) => {
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
