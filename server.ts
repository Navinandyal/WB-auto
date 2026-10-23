import { createPasswordResetHandlers } from './src/server/password-reset.ts';
import { schedulerAuthorized } from './src/server/scheduler-auth.ts';
import { contactName } from './src/server/contact-name.ts';
import { importGroupName, attachImportedGroup } from './src/server/contact-import-group.ts';
import { enqueueSendNowBatch } from './src/server/bulk-send.ts';
import { marketingRetryAfter, marketingLimitMessage } from './src/server/marketing-limits.ts';
import { publicPolicyPage, publicPolicyHeaders } from './src/server/public-policies';
import { messageMonitor } from './src/server/admin-message-monitor';
import { savedMediaPreview } from './src/server/saved-media-preview';
import { renderMetaSignupBridge } from './src/server/meta-signup-bridge.ts';
import { discoverSignupAssets } from './src/server/meta-onboarding-assets.ts';
import { metaPlatformConfig } from './src/server/meta-config.ts';
import { generateAiTemplate, checkAiConfiguration } from './src/server/ai-template.ts';
import { matchesWebhookSignature, authorizeAccountWebhook } from './src/server/webhook-auth.ts';
import { ensureDeliverySubscription, prepareDeliveryTracking } from './src/server/delivery-setup.ts';
import { acceptanceVariables, sameSendVariables } from './src/server/message-acceptance.ts';
import { deliveryHealth,deliveryEvidence } from './src/server/delivery-health.ts';
import { explainDelivery } from './src/server/delivery-explanation.ts';
import { decodeMediaFile, validateMediaFile } from './src/server/media-validation.ts';
import { assertRetrySource } from './src/server/retry-rules.ts';
import { businessVariableValue } from './src/server/business-variables.ts';
import { buildTemplateComponents } from './src/server/template-builder.ts';
import { isCoexistencePhone, digestWhatsAppChange } from './src/server/coexistence.ts';
import { validateTemplateSetup, categoryAdvice, previewSnapshot } from './src/server/template-rules.ts';
import { templateHeaderError, messageMediaMimeTypes } from './src/server/template-media.ts';
import 'dotenv/config';
import express from 'express';
import { randomBytes, randomInt, createHash, createHmac, timingSafeEqual } from 'crypto';
import path from 'path';
import { promises as dns } from 'node:dns';
import { db, initDatabaseSchema, isDatabaseConnected, pool, checkDatabaseConnection } from './src/db/index.ts';
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
  notifications,
  subscriptionPackages,
  userSubscriptions,
  templateSuggestions,
} from './src/db/schema.ts';
import { eq, desc, asc, sql, and, count, inArray, or, like, gt, gte, lte, isNull } from 'drizzle-orm';
import { requireAuth, requireAdmin, AuthRequest } from './src/middleware/auth.ts';
import { ensureFixedAdminUser } from './src/db/users.ts';
import { createAccessToken, createRefreshToken, createPurposeToken, verifyPurposeToken, hashPassword, hashRefreshToken, normalizeLoginPhone, verifyPassword } from './src/lib/password-auth.ts';
import { WhatsAppService } from './src/server/whatsapp.ts';
import { automationWorker } from './src/server/worker.ts';
import { resolveWhatsAppCredentials, encryptedCredentialValues } from './src/server/credentials.ts';
import { decryptSecret, encryptSecret } from './src/server/credential-crypto.ts';
import { WishflowService } from './src/server/wishflow.ts';
import { createNotification } from './src/server/notifications.ts';
import {
  getPackageAccessSummary,
  requirePackageForAction,
  assertMessageCapacity,
  assertContactCapacity,
  assertAutomationCapacity,
  monthlyMessageUsage,
} from './src/server/subscriptions.ts';

const app = express();
// Correlate failed phone requests with Render logs without logging credentials,
// query strings, contacts, template contents or reset codes.
app.use((req, res, next) => {
  const reference = randomBytes(8).toString('hex');
  res.setHeader('X-GreetSync-Request-ID', reference);
  const started = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 500) console.warn('[API]', JSON.stringify({reference,method:req.method,path:req.route?.path || 'unmatched',status:res.statusCode,durationMs:Date.now()-started}));
  });
  next();
});
const PORT = Number(process.env.PORT || 3000);
if (!Number.isFinite(PORT) || PORT <= 0) {
  throw new Error('Invalid PORT environment variable.');
}

app.use(express.json({ limit: '30mb', verify: (req:any,_res,buffer) => { req.rawBody=Buffer.from(buffer); } }));

// Database outages are availability failures, never invalid-password failures.
app.use('/api/auth', async (_req, res, next) => {
  if (!await checkDatabaseConnection()) return res.status(503).json({code:'DATABASE_UNAVAILABLE',error:'The database is temporarily unavailable. Your password was not checked. Please try again shortly.'});
  next();
});

// Wake requests never force/replay messages: the normal worker uses existing
// durable job claims and due dates after startup. No user payload is trusted.
app.post('/api/internal/scheduler/wake', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!schedulerAuthorized(req.headers.authorization, process.env.AUTH_TOKEN_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized scheduler request.' });
  }
  if (!isDatabaseConnected) return res.status(503).json({ error: 'Database unavailable.' });
  return res.status(200).json({ status: 'awake', scheduling: 'normal-durable-worker' });
});


const sendRuleError = (res: any, err: any, fallback = 'Request failed.') => {
  const status = Number(err?.statusCode || 0);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: err?.message || fallback,
    code: err?.code || null,
    overBy: err?.overBy ?? null,
    package: err?.summary ?? null,
  });
};


const PERSON_NAME_RE = /^[\p{L}][\p{L}\p{M} .'-]{1,79}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IMAGE_DATA_RE = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\r\n]+$/i;

function isValidPersonName(value: unknown): boolean {
  const name = String(value ?? '').trim();
  return PERSON_NAME_RE.test(name);
}

function isValidEmailSyntax(value: unknown): boolean {
  return EMAIL_RE.test(String(value ?? '').trim());
}

function validateImageData(value: unknown, maxCharacters = 2_500_000): string | null {
  if (value === null || value === undefined || value === '') return null;
  const data = String(value);
  if (data.length > maxCharacters || !IMAGE_DATA_RE.test(data)) {
    throw Object.assign(new Error('Image must be a PNG, JPG or WebP file within the allowed size.'), { statusCode: 400 });
  }
  return data;
}

function isDnsNotFound(err: any): boolean {
  return ['ENOTFOUND', 'ENODATA', 'NXDOMAIN', 'EAI_NONAME'].includes(String(err?.code || '').toUpperCase());
}

async function withDnsTimeout<T>(promise: Promise<T>, ms = 2500): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const error: any = new Error('DNS lookup timed out');
      error.code = 'ETIMEOUT';
      setTimeout(() => reject(error), ms);
    }),
  ]);
}

// A syntactically valid email is rejected only when DNS conclusively reports that
// the domain does not exist. Transient resolver/network failures do not block saving.
async function hasResolvableEmailDomain(email: string): Promise<boolean> {
  const domain = email.trim().split('@').pop()?.toLowerCase() || '';
  if (!domain || domain.length > 253) return false;
  try {
    const mx = await withDnsTimeout(dns.resolveMx(domain));
    if (mx.length > 0) return true;
  } catch (err: any) {
    if (!isDnsNotFound(err)) return true;
  }
  const addressResolvers: Array<(host: string) => Promise<string[]>> = [
    (host) => dns.resolve4(host),
    (host) => dns.resolve6(host),
  ];
  for (const resolver of addressResolvers) {
    try {
      const addresses = await withDnsTimeout(resolver(domain));
      if (addresses.length > 0) return true;
    } catch (err: any) {
      if (!isDnsNotFound(err)) return true;
    }
  }
  return false;
}

function toMetaTemplateName(displayName: string, ownerUserId: number): string {
  const ascii = displayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 480);
  if (/^[a-z0-9_]{3,512}$/.test(ascii)) return ascii;
  return `template_${ownerUserId}_${Date.now()}`;
}

function publicUserPayload(account: any) {
  const status = String(account?.approvalStatus ?? account?.approval_status ?? '').toUpperCase();
  const role = String(account?.role || 'business_user');
  return {
    id: Number(account?.id),
    businessId: role === 'admin' ? null : Number(account?.id),
    uid: String(account?.uid || ''),
    phone: String(account?.phone || ''),
    email: String(account?.email || ''),
    name: String(account?.name || 'User'),
    role,
    businessName: String(account?.businessName ?? account?.business_name ?? ''),
    businessAddress: String(account?.businessAddress ?? account?.business_address ?? ''),
    businessLogoData: String(account?.businessLogoData ?? account?.business_logo_data ?? ''),
    approvalStatus: role === 'admin' ? 'ACTIVE' : (status === 'APPROVED' ? 'ACTIVE' : status),
  };
}

const requireActiveBusinessPackage = async (req: AuthRequest, res: any, next: any) => {
  if (req.user?.role === 'admin') return next();
  try {
    await requirePackageForAction(req.user!.id);
    next();
  } catch (err: any) {
    sendRuleError(res, err, 'An active GreetSync package is required.');
  }
};

function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.max(1, months));
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

function istDayRange(base = new Date()) {
  const offset = 330 * 60 * 1000;
  const shifted = new Date(base.getTime() + offset);
  const start = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - offset);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
}

function istMonthRange(base = new Date()) {
  const offset = 330 * 60 * 1000;
  const shifted = new Date(base.getTime() + offset);
  const start = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - offset);
  const next = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1) - offset);
  return { start, end: new Date(next.getTime() - 1) };
}

// WhatsApp credentials are stored per approved business user in PostgreSQL.
// No automation credentials are loaded from .env or shared globally.

let accountPurgeTimer: NodeJS.Timeout | null = null;

async function initializeApplicationServices() {
  const connected = await initDatabaseSchema();
  if (!connected) {
    throw new Error('PostgreSQL is unavailable. GreetSync cannot start without its production database.');
  }

  if (process.env.DATABASE_PROVIDER === 'supabase') {
    const migrated = await pool.query("SELECT target_fingerprint FROM public.greetsync_deployment_migrations WHERE id='railway_to_supabase'");
    if (!migrated.rows[0] || (process.env.DATABASE_TARGET_FINGERPRINT && migrated.rows[0].target_fingerprint !== process.env.DATABASE_TARGET_FINGERPRINT)) {
      throw new Error('Supabase restore is not verified for this target. Run RUN_PRODUCTION_SETUP.cmd before enabling this backend. No admin or worker was started.');
    }
  }

  const fixedAdmin = await ensureFixedAdminUser();
  if (fixedAdmin) {
    console.log(`[Auth] Fixed administrator ready for ${fixedAdmin.phone}.`);
  }

  // Remove only old platform/demo placeholders. Real per-business Meta templates remain untouched.
  const legacyDemoMetaIds = [
    'meta_tpl_hello_world',
    'meta_tpl_appointment_confirmation',
    'meta_tpl_payment_reminder',
    'meta_tpl_welcome_message',
    'meta_tpl_happy_birthday_wishes',
  ];
  await db.update(messageTemplates).set({status: 'DELETED', updatedAt: new Date()}).where(and(
    isNull(messageTemplates.ownerUserId),
    inArray(messageTemplates.metaTemplateId, legacyDemoMetaIds),
  ));

  // Approved templates must come from the connected business's real Meta WABA.
  // Older GreetSync builds inserted local APPROVED starter/sample rows without a
  // Meta template id. Remove those rows during startup so they can never be
  // mistaken for templates that Meta actually approved for this business.
  await db.update(messageTemplates).set({status: 'DELETED', updatedAt: new Date()}).where(and(
    eq(messageTemplates.status, 'APPROVED'),
    isNull(messageTemplates.metaTemplateId),
  ));

  const [suggestionCount] = await db.select({ val: count() }).from(templateSuggestions);
  if (Number(suggestionCount?.val || 0) === 0) {
    await db.insert(templateSuggestions).values([
      {
        title: 'Diwali Greeting',
        festival: 'Diwali',
        description: 'Warm festive greeting suggestion that a business can personalize before sending to Meta for approval.',
        templateName: 'diwali_greeting',
        language: 'en_US',
        category: 'MARKETING',
        header: 'Happy Diwali ✨',
        body: 'Wishing you and your family a joyful and prosperous Diwali. Thank you for being a valued part of our journey.',
        footer: 'Warm wishes from our team',
        buttons: [],
        isActive: true,
      },
      {
        title: 'Festival Offer',
        festival: 'Festival Campaign',
        description: 'Promotional greeting suggestion with a website call-to-action.',
        templateName: 'festival_special_offer',
        language: 'en_US',
        category: 'MARKETING',
        header: 'Festival Special',
        body: 'Hi {{1}}, celebrate the festive season with a special offer from {{2}}. Tap below to know more.',
        footer: 'Offer terms apply.',
        buttons: [{ type: 'URL', text: 'View Offer', url: 'https://example.com' }],
        isActive: true,
      },
      {
        title: 'New Year Greeting',
        festival: 'New Year',
        description: 'Simple New Year greeting suggestion for customers and business contacts.',
        templateName: 'new_year_greeting',
        language: 'en_US',
        category: 'MARKETING',
        header: 'Happy New Year 🎉',
        body: 'Wishing you a wonderful New Year filled with happiness, growth and success. Thank you for staying connected with {{1}}.',
        footer: 'Best wishes',
        buttons: [],
        isActive: true,
      },
    ]);
  }

  const purgeExpiredAccounts = async () => {
    const result = await pool.query(`DELETE FROM users WHERE approval_status = 'DELETION_PENDING' AND purge_after IS NOT NULL AND purge_after <= NOW() RETURNING id`);
    if (result.rowCount) console.log(`[Account] Purged ${result.rowCount} expired deleted account(s).`);
  };

  await purgeExpiredAccounts();
  accountPurgeTimer = setInterval(() => {
    purgeExpiredAccounts().catch((e: any) => console.warn('[Account] Scheduled purge notice:', e?.message));
  }, 60 * 60 * 1000);

  // Workers run while this instance is awake. Supabase Cron wakes free instances
  // every 20 minutes; overdue jobs remain in PostgreSQL during idle sleep.
  automationWorker.start();

  setTimeout(() => {
    WishflowService.syncAllContactsBirthdays()
      .then((res) => console.log(`[GreetSync] Initial sync: verified ${res.synced} contacts, scheduled ${res.scheduled} birthday automations.`))
      .catch((err) => console.warn('[GreetSync] Initial sync notice:', err?.message));
  }, 3000);
}

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
    const termsAccepted = req.body?.termsAccepted === true;
    const privacyAccepted = req.body?.privacyAccepted === true;

    if (!termsAccepted || !privacyAccepted) {
      return res.status(400).json({ error: 'You must accept the Terms and Conditions and Privacy Policy to create a GreetSync account.' });
    }

    if (!phone || !password || !name || !businessName || !businessAddress) {
      return res.status(400).json({ error: 'Name, business name, business address, mobile number and password are required.' });
    }
    const registrationPhoneCheck = validateInternationalPhone(phone);
    if (!registrationPhoneCheck.ok) return res.status(400).json({ error: registrationPhoneCheck.error });
    if (!isValidPersonName(name)) return res.status(400).json({ error: 'Full name may contain letters, spaces, apostrophes, periods and hyphens only.' });
    if (businessName.length < 2) return res.status(400).json({ error: 'Please enter a valid business name.' });
    if (businessAddress.length < 3) return res.status(400).json({ error: 'Please enter a valid business address.' });
    if (email && !isValidEmailSyntax(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (email && !(await hasResolvableEmailDomain(email))) {
      return res.status(400).json({ error: 'The email domain could not be found. Check the email address and try again.' });
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
      termsAcceptedAt: new Date(),
      privacyAcceptedAt: new Date(),
      legalVersion: '2026-10-02',
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
    await createNotification({
      targetRole: 'ADMIN',
      type: 'BUSINESS',
      title: 'New business awaiting approval',
      message: `${businessName} (${name}) submitted a new GreetSync account request.`,
      entityType: 'BUSINESS',
      entityId: created.id,
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
      if (status === 'DEACTIVATED') return res.status(403).json({code:'ACCOUNT_DEACTIVATED',error:'Your account is deactivated. Contact support to reactivate it; your business data is retained.'});
      if (status === 'SUSPENDED' || !account.isActive) return res.status(403).json({ code: 'ACCOUNT_SUSPENDED', error: 'Your account is suspended. Please contact support.' });
      if (status !== 'ACTIVE' && status !== 'APPROVED') return res.status(403).json({ code: 'ACCOUNT_NOT_ACTIVE', error: 'Your account is not active. Please contact support.' });
    } else if (!account.isActive) {
      return res.status(403).json({ code: 'ACCOUNT_SUSPENDED', error: 'Your account is suspended. Please contact support.' });
    }
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, account.id));
    const user = { ...publicUserPayload(account), phone: account.phone || phone };
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
    res.status(503).json({ code: 'AUTH_SERVICE_UNAVAILABLE', error: 'Sign-in could not finish. Please try again shortly; this is not an invalid-password response.' });
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
             u.approval_status, u.business_name, u.business_address, u.business_logo_data
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
    const user = publicUserPayload(account);
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
    const user = publicUserPayload(account);
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
const passwordResetHandlers = createPasswordResetHandlers(pool);
app.post('/api/auth/forgot-password', passwordResetHandlers.request);
app.post('/api/auth/forgot-password/request', passwordResetHandlers.request);
app.post('/api/auth/reset-password', passwordResetHandlers.reset);
app.post('/api/auth/forgot-password/reset', passwordResetHandlers.reset);

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
    const [account] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
    if (!account || String(account.approvalStatus).toUpperCase()==='DEACTIVATED') return res.status(401).json({ error: 'User session is no longer active.' });
    res.json({ user: publicUserPayload(account) });
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
    let businessLogoData = account.businessLogoData || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'businessLogoData')) {
      businessLogoData = validateImageData(req.body?.businessLogoData, 2_500_000);
    }

    if (!isValidPersonName(name)) {
      return res.status(400).json({ error: 'Full name may contain letters, spaces, apostrophes, periods and hyphens only.' });
    }
    if (email && !isValidEmailSyntax(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (email && !(await hasResolvableEmailDomain(email))) {
      return res.status(400).json({ error: 'The email domain could not be found. Check the email address and try again.' });
    }
    if (account.role !== 'admin') {
      if (businessName.length < 2) return res.status(400).json({ error: 'Enter a valid business name.' });
      if (businessAddress.length < 3) return res.status(400).json({ error: 'Enter a valid business address.' });
    }

    const [updated] = await db.update(users).set({
      name,
      email: email || account.email,
      businessName: account.role === 'admin' ? account.businessName : businessName,
      businessAddress: account.role === 'admin' ? account.businessAddress : businessAddress,
      businessLogoData: account.role === 'admin' ? account.businessLogoData : businessLogoData,
    }).where(eq(users.id, account.id)).returning();

    res.json({ success: true, user: publicUserPayload(updated) });
  } catch (err: any) {
    sendRuleError(res, err, 'Unable to update profile.');
  }
});



// Current business package, quota usage, purchase history and six-month billing report.
app.get('/api/billing/summary', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Billing summary is for business accounts.' });
    const [access, availablePackages, history, monthlyUsage] = await Promise.all([
      getPackageAccessSummary(req.user!.id),
      db.select().from(subscriptionPackages).where(eq(subscriptionPackages.isActive, true)).orderBy(subscriptionPackages.packageType, subscriptionPackages.pricePaise),
      db.select({
        id: userSubscriptions.id, status: userSubscriptions.status, startsAt: userSubscriptions.startsAt, endsAt: userSubscriptions.endsAt,
        createdAt: userSubscriptions.createdAt, pricePaise: userSubscriptions.pricePaiseSnapshot, messageLimit: userSubscriptions.messageLimitSnapshot,
        packageId: subscriptionPackages.id, packageName: subscriptionPackages.name, packageType: subscriptionPackages.packageType,
      }).from(userSubscriptions).innerJoin(subscriptionPackages, eq(userSubscriptions.packageId, subscriptionPackages.id))
        .where(eq(userSubscriptions.userId, req.user!.id)).orderBy(desc(userSubscriptions.createdAt)),
      monthlyMessageUsage(req.user!.id, 6),
    ]);
    res.json({ access, packages: availablePackages, history, monthlyUsage });
  } catch (err: any) { sendRuleError(res, err, 'Unable to load billing information.'); }
});

app.post('/api/billing/purchase', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Use a business account to request a package.' });
    const packageId = Number(req.body?.packageId);
    const [pkg] = await db.select().from(subscriptionPackages).where(and(eq(subscriptionPackages.id, packageId), eq(subscriptionPackages.isActive, true))).limit(1);
    if (!pkg) return res.status(404).json({ error: 'Package is not available.' });
    const [existingPending] = await db.select().from(userSubscriptions).where(and(
      eq(userSubscriptions.userId, req.user!.id), eq(userSubscriptions.packageId, packageId), eq(userSubscriptions.status, 'PENDING')
    )).limit(1);
    if (existingPending) return res.status(409).json({ error: 'This package request is already pending admin approval.' });

    const now = new Date();
    const currentAccess = await getPackageAccessSummary(req.user!.id);
    if (pkg.packageType === 'MESSAGE_ADDON' && !currentAccess.active) {
      return res.status(409).json({ error: 'Activate a base package before purchasing a message add-on.' });
    }
    let status = pkg.pricePaise <= 0 ? 'ACTIVE' : 'PENDING';
    let startsAt: Date | null = null;
    let endsAt: Date | null = null;
    if (status === 'ACTIVE') {
      startsAt = now;
      if (pkg.packageType === 'MESSAGE_ADDON' && currentAccess.active && currentAccess.endsAt) {
        const requestedEnd = addMonthsUtc(now, pkg.durationMonths);
        endsAt = requestedEnd < currentAccess.endsAt ? requestedEnd : currentAccess.endsAt;
      } else {
        endsAt = addMonthsUtc(now, pkg.durationMonths);
      }
      if (pkg.packageType === 'BASE') {
        await db.update(userSubscriptions).set({ status: 'CANCELLED', updatedAt: now }).where(and(
          eq(userSubscriptions.userId, req.user!.id), eq(userSubscriptions.status, 'ACTIVE')
        ));
      }
    }
    const [row] = await db.insert(userSubscriptions).values({
      userId: req.user!.id, packageId: pkg.id, status, startsAt, endsAt,
      pricePaiseSnapshot: pkg.pricePaise, messageLimitSnapshot: pkg.messageLimit,
      notes: status === 'ACTIVE' ? 'Auto-activated free package.' : 'Awaiting admin payment/activation confirmation.',
    }).returning();
    await createNotification({userId:req.user!.id,targetRole:'BUSINESS',type:'BILLING',title:status === 'ACTIVE' ? 'Package active' : 'Billing pending',message:status === 'ACTIVE' ? `${pkg.name} is active.` : `${pkg.name} is waiting for payment or administrator confirmation.`,entityType:'SUBSCRIPTION',entityId:row.id});
    await createNotification({ targetRole: 'ADMIN', type: 'BILLING', title: 'Package request', message: `${req.user!.name} requested ${pkg.name}.`, entityType: 'SUBSCRIPTION', entityId: row.id });
    res.status(201).json({ success: true, subscription: row, status, message: status === 'ACTIVE' ? 'Package activated.' : 'Package request submitted for admin approval.' });
  } catch (err: any) { sendRuleError(res, err, 'Unable to request package.'); }
});

app.get('/api/profile/monthly-analysis', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.json({});
    const { start, end } = istMonthRange();
    const [[sent], [delivered], [read], [failed], [scheduled], [contactsAdded]] = await Promise.all([
      db.select({ val: count() }).from(messages).where(and(eq(messages.ownerUserId, req.user!.id), inArray(messages.status,['SENT','DELIVERED','READ']), gte(messages.createdAt,start), lte(messages.createdAt,end))),
      db.select({ val: count() }).from(messages).where(and(eq(messages.ownerUserId, req.user!.id), inArray(messages.status,['DELIVERED','READ']), gte(messages.createdAt,start), lte(messages.createdAt,end))),
      db.select({ val: count() }).from(messages).where(and(eq(messages.ownerUserId, req.user!.id), eq(messages.status,'READ'), gte(messages.createdAt,start), lte(messages.createdAt,end))),
      db.select({ val: count() }).from(messages).where(and(eq(messages.ownerUserId, req.user!.id), eq(messages.status,'FAILED'), gte(messages.createdAt,start), lte(messages.createdAt,end))),
      db.select({ val: count() }).from(automations).where(and(eq(automations.ownerUserId, req.user!.id), gte(automations.createdAt,start), lte(automations.createdAt,end))),
      db.select({ val: count() }).from(contacts).where(and(eq(contacts.ownerUserId, req.user!.id), gte(contacts.createdAt,start), lte(contacts.createdAt,end))),
    ]);
    res.json({
      month: start.toISOString().slice(0,7), sent: Number(sent?.val||0), delivered: Number(delivered?.val||0), read: Number(read?.val||0),
      failed: Number(failed?.val||0), automations: Number(scheduled?.val||0), contactsAdded: Number(contactsAdded?.val||0),
    });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Unable to load monthly analysis.' }); }
});

app.get('/api/account/status',requireAuth,async(req:AuthRequest,res)=>{
  try{const [account]=await db.select().from(users).where(eq(users.id,req.user!.id)).limit(1);if(!account)return res.status(401).json({error:'Account unavailable.'});
    const access=await getPackageAccessSummary(account.id);res.json({status:account.approvalStatus,isActive:account.isActive,billingPending:access.pending.length>0,packageActive:access.active,pushConfigured:Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)});
  }catch(e:any){res.status(500).json({error:'Unable to load account status.'});}
});
app.post('/api/push/devices',requireAuth,async(req:AuthRequest,res)=>{
  const token=String(req.body?.token||'');if(token.length<20||token.length>4096)return res.status(400).json({error:'Invalid device token.'});
  try{await pool.query('INSERT INTO push_devices(token,user_id) VALUES($1,$2) ON CONFLICT(token) DO UPDATE SET user_id=EXCLUDED.user_id,updated_at=NOW()',[token,req.user!.id]);res.json({success:true});}catch{res.status(500).json({error:'Unable to register device.'});}
});
app.delete('/api/push/devices',requireAuth,async(req:AuthRequest,res)=>{
  try{await pool.query('DELETE FROM push_devices WHERE user_id=$1 AND token=$2',[req.user!.id,String(req.body?.token||'')]);res.json({success:true});}catch{res.status(500).json({error:'Unable to unregister device.'});}
});

app.post('/api/account/deactivate', requireAuth, async(req:AuthRequest,res)=>{
  try {
    if(req.user!.role==='admin')return res.status(403).json({error:'The platform administrator cannot be deactivated here.'});
    const [account]=await db.select().from(users).where(eq(users.id,req.user!.id)).limit(1);
    if(!account?.passwordHash||!verifyPassword(String(req.body?.password||''),account.passwordHash))return res.status(401).json({error:'Enter your correct current password.'});
    const now=new Date();
    await db.transaction(async tx=>{
      await tx.update(users).set({isActive:false,approvalStatus:'DEACTIVATED',deletionRequestedAt:null,purgeAfter:null}).where(eq(users.id,req.user!.id));
      await tx.update(refreshSessions).set({revokedAt:now}).where(eq(refreshSessions.userId,req.user!.id));
      await tx.update(automations).set({status:'CANCELLED',errorMessage:'Account deactivated.',updatedAt:now}).where(and(eq(automations.ownerUserId,req.user!.id),inArray(automations.status,['SCHEDULED','PAUSED'])));
    });
    await pool.query('UPDATE biometric_credentials SET revoked_at=NOW() WHERE user_id=$1',[req.user!.id]);
    await pool.query('DELETE FROM push_devices WHERE user_id=$1',[req.user!.id]);
    await db.insert(auditLogs).values({action:'ACCOUNT_DEACTIVATED',actor:req.user!.phone||String(req.user!.id),details:{userId:req.user!.id,dataRetained:true}});
    await createNotification({targetRole:'ADMIN',type:'ACCOUNT',title:'Business account deactivated',message:`${account.businessName||account.name} deactivated their account. Data is retained; administrator reactivation is available.`,entityType:'BUSINESS',entityId:req.user!.id});
    res.json({success:true,status:'DEACTIVATED',message:'Account deactivated. Business data is retained. Contact support to reactivate.'});
  }catch(e:any){sendRuleError(res,e,'Unable to deactivate account.');}
});

// Password-confirmed account deletion. Business data is retained for at most 30 days,
// then permanently purged by the scheduled cleanup above. Access is disabled immediately.
app.post('/api/account/delete', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
    if (req.user.role === 'admin') return res.status(403).json({ error: 'The platform administrator account cannot be deleted from the mobile app.' });
    const password = String(req.body?.password || '');
    if (!password) return res.status(400).json({ error: 'Enter your current password to delete the account.' });
    const [account] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
    if (!account || !account.passwordHash || !verifyPassword(password, account.passwordHash)) {
      return res.status(401).json({ code: 'INVALID_PASSWORD', error: 'The password is incorrect.' });
    }
    const now = new Date();
    // Schedule slightly before the 30-day boundary; the hourly purge keeps retention at or below 30 days while the service is running.
    const purgeAfter = new Date(now.getTime() + (29 * 24 + 23) * 60 * 60 * 1000);
    await db.update(users).set({
      isActive: false,
      approvalStatus: 'DELETION_PENDING',
      deletionRequestedAt: now,
      purgeAfter,
    }).where(eq(users.id, req.user.id));
    await db.update(refreshSessions).set({ revokedAt: now }).where(and(eq(refreshSessions.userId, req.user.id), isNull(refreshSessions.revokedAt)));
    await db.update(automations).set({ status: 'CANCELLED', errorMessage: 'Account deletion requested.', updatedAt: now }).where(and(eq(automations.ownerUserId, req.user.id), inArray(automations.status, ['SCHEDULED','PROCESSING'])));
    await pool.query('UPDATE biometric_credentials SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
    await db.insert(auditLogs).values({ action: 'ACCOUNT_DELETION_REQUESTED', actor: req.user.phone || String(req.user.id), details: { userId: req.user.id, purgeAfter: purgeAfter.toISOString() } });
    await createNotification({ targetRole: 'ADMIN', type: 'ACCOUNT', title: 'Business account deletion requested', message: `Business user ${req.user.name || req.user.id} requested account deletion. Data is scheduled for permanent deletion by ${purgeAfter.toISOString().slice(0,10)}.`, entityType: 'BUSINESS', entityId: req.user.id });
    res.json({ success: true, status: 'DELETION_PENDING', deletionRequestedAt: now.toISOString(), purgeAfter: purgeAfter.toISOString(), message: 'Your account is disabled immediately. GreetSync will retain the account data for no longer than 30 days before permanent deletion.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unable to delete account.' });
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



app.get('/api/admin/packages', requireAuth, requireAdmin, async (_req, res) => {
  try { res.json(await db.select().from(subscriptionPackages).orderBy(desc(subscriptionPackages.createdAt))); }
  catch (err:any) { res.status(500).json({ error: err.message || 'Failed to load packages.' }); }
});

app.post('/api/admin/packages', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const name=String(req.body?.name||'').trim(), packageType=String(req.body?.packageType||'BASE').toUpperCase();
    const benefits=Array.isArray(req.body?.benefits)?req.body.benefits.map((v:any)=>String(v).trim()).filter(Boolean):[];
    const messageLimit=Math.max(0,Number(req.body?.messageLimit||0)), contactLimit=Math.max(0,Number(req.body?.contactLimit||0)), automationLimit=Math.max(0,Number(req.body?.automationLimit||0));
    const pricePaise=Math.max(0,Number(req.body?.pricePaise||0)), durationMonths=Math.max(1,Math.min(60,Number(req.body?.durationMonths||1)));
    if(name.length<2) return res.status(400).json({error:'Package name is required.'});
    if(!['BASE','MESSAGE_ADDON'].includes(packageType)) return res.status(400).json({error:'Package type must be BASE or MESSAGE_ADDON.'});
    if(packageType==='MESSAGE_ADDON' && messageLimit<=0) return res.status(400).json({error:'A message add-on must add at least one message.'});
    const [row]=await db.insert(subscriptionPackages).values({name,description:String(req.body?.description||'').trim()||null,packageType,benefits,messageLimit,contactLimit,automationLimit,pricePaise,durationMonths,isActive:req.body?.isActive!==false}).returning();
    await db.insert(auditLogs).values({action:'PACKAGE_CREATED',actor:req.user!.phone,details:{packageId:row.id,name}});
    res.status(201).json(row);
  } catch(e:any){res.status(500).json({error:e.message||'Failed to create package.'});}
});

app.put('/api/admin/packages/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id=Number(req.params.id); const [old]=await db.select().from(subscriptionPackages).where(eq(subscriptionPackages.id,id)).limit(1);
    if(!old) return res.status(404).json({error:'Package not found.'});
    const packageType=String(req.body?.packageType??old.packageType).toUpperCase();
    const values:any={updatedAt:new Date()};
    if(req.body?.name!==undefined) values.name=String(req.body.name).trim();
    if(req.body?.description!==undefined) values.description=String(req.body.description||'').trim()||null;
    if(req.body?.packageType!==undefined) values.packageType=packageType;
    if(req.body?.benefits!==undefined) values.benefits=Array.isArray(req.body.benefits)?req.body.benefits.map((v:any)=>String(v).trim()).filter(Boolean):[];
    for(const k of ['messageLimit','contactLimit','automationLimit','pricePaise']) if(req.body?.[k]!==undefined) values[k]=Math.max(0,Number(req.body[k]||0));
    if(req.body?.durationMonths!==undefined) values.durationMonths=Math.max(1,Math.min(60,Number(req.body.durationMonths||1)));
    if(req.body?.isActive!==undefined) values.isActive=Boolean(req.body.isActive);
    if(values.name!==undefined && values.name.length<2) return res.status(400).json({error:'Package name is required.'});
    const finalMessage=values.messageLimit??old.messageLimit;
    if(packageType==='MESSAGE_ADDON' && Number(finalMessage)<=0) return res.status(400).json({error:'A message add-on must add at least one message.'});
    const [row]=await db.update(subscriptionPackages).set(values).where(eq(subscriptionPackages.id,id)).returning();
    await db.insert(auditLogs).values({action:'PACKAGE_UPDATED',actor:req.user!.phone,details:{packageId:id}});
    res.json(row);
  } catch(e:any){res.status(500).json({error:e.message||'Failed to update package.'});}
});

app.delete('/api/admin/packages/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try { const id=Number(req.params.id); const [row]=await db.update(subscriptionPackages).set({isActive:false,updatedAt:new Date()}).where(eq(subscriptionPackages.id,id)).returning(); if(!row)return res.status(404).json({error:'Package not found.'}); res.json({success:true,package:row}); }
  catch(e:any){res.status(500).json({error:e.message||'Failed to disable package.'});}
});

app.get('/api/admin/subscriptions', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows=await db.select({
      id:userSubscriptions.id,userId:userSubscriptions.userId,status:userSubscriptions.status,startsAt:userSubscriptions.startsAt,endsAt:userSubscriptions.endsAt,createdAt:userSubscriptions.createdAt,
      pricePaise:userSubscriptions.pricePaiseSnapshot,messageLimit:userSubscriptions.messageLimitSnapshot,notes:userSubscriptions.notes,
      packageId:subscriptionPackages.id,packageName:subscriptionPackages.name,packageType:subscriptionPackages.packageType,durationMonths:subscriptionPackages.durationMonths,
      userName:users.name,businessName:users.businessName,phone:users.phone,email:users.email,businessAddress:users.businessAddress,businessStatus:users.approvalStatus,
    }).from(userSubscriptions).innerJoin(subscriptionPackages,eq(userSubscriptions.packageId,subscriptionPackages.id)).innerJoin(users,eq(userSubscriptions.userId,users.id)).orderBy(desc(userSubscriptions.createdAt));
    res.json(rows);
  } catch(e:any){res.status(500).json({error:e.message||'Failed to load subscriptions.'});}
});

app.post('/api/admin/subscriptions/:id/activate', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id=Number(req.params.id);
    const [request]=await db.select({subscription:userSubscriptions,pkg:subscriptionPackages}).from(userSubscriptions).innerJoin(subscriptionPackages,eq(userSubscriptions.packageId,subscriptionPackages.id)).where(eq(userSubscriptions.id,id)).limit(1);
    if(!request) return res.status(404).json({error:'Subscription request not found.'});
    const now=new Date(); let endsAt=addMonthsUtc(now,request.pkg.durationMonths);
    if(request.pkg.packageType==='BASE') {
      await db.update(userSubscriptions).set({status:'CANCELLED',updatedAt:now}).where(and(eq(userSubscriptions.userId,request.subscription.userId),eq(userSubscriptions.status,'ACTIVE')));
    } else {
      const current=await getPackageAccessSummary(request.subscription.userId);
      if(!current.active||!current.endsAt) return res.status(409).json({error:'Activate a base package before a message add-on.'});
      const requestedEnd=addMonthsUtc(now,request.pkg.durationMonths);
      endsAt=requestedEnd<current.endsAt?requestedEnd:current.endsAt;
    }
    const [row]=await db.update(userSubscriptions).set({status:'ACTIVE',startsAt:now,endsAt,approvedById:req.user!.id,pricePaiseSnapshot:request.pkg.pricePaise,messageLimitSnapshot:request.pkg.messageLimit,notes:String(req.body?.notes||'').trim()||'Activated by admin.',updatedAt:now}).where(eq(userSubscriptions.id,id)).returning();
    await createNotification({userId:request.subscription.userId,targetRole:'BUSINESS',type:'BILLING',title:'Package activated',message:`${request.pkg.name} is now active until ${endsAt.toISOString().slice(0,10)}.`,entityType:'SUBSCRIPTION',entityId:id});
    res.json({success:true,subscription:row});
  } catch(e:any){sendRuleError(res,e,'Failed to activate package.');}
});

app.post('/api/admin/subscriptions/:id/reject', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try { const id=Number(req.params.id); const [row]=await db.update(userSubscriptions).set({status:'REJECTED',notes:String(req.body?.notes||'').trim()||'Rejected by admin.',updatedAt:new Date()}).where(eq(userSubscriptions.id,id)).returning(); if(!row)return res.status(404).json({error:'Subscription request not found.'}); await createNotification({userId:row.userId,targetRole:'BUSINESS',type:'BILLING',title:'Package request rejected',message:'Your package request was not activated. Contact the administrator for details.',entityType:'SUBSCRIPTION',entityId:id}); res.json({success:true,subscription:row}); }
  catch(e:any){res.status(500).json({error:e.message||'Failed to reject package.'});}
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
    business:{id:business.id,businessId:business.id,name:business.name,ownerName:business.name,phone:business.phone,mobile:business.phone,email:business.email,businessName:business.businessName,businessAddress:business.businessAddress,businessLogoData:business.businessLogoData,isActive:business.isActive,createdAt:business.createdAt,approvedAt:business.approvedAt,lastLoginAt:business.lastLoginAt,status:business.approvalStatus==='APPROVED'?'ACTIVE':business.approvalStatus==='PENDING'?'PENDING_APPROVAL':business.approvalStatus},
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
const adminSetBusinessStatus = (target:string) => async (req:any,res:any) => {
  try {
    const id=Number(req.params.id);
    const [b]=await db.select().from(users).where(eq(users.id,id)).limit(1);
    if(!b||b.role==='admin') return res.status(404).json({error:'Business not found.'});
    const [updated]=await db.update(users).set({
      approvalStatus:target,
      isActive:!['REJECTED','SUSPENDED'].includes(target),
      approvedAt:target==='ACTIVE'?new Date():b.approvedAt,
      approvedById:target==='ACTIVE'?req.user?.id:b.approvedById,
    }).where(eq(users.id,id)).returning();
    const title = target === 'ACTIVE' ? 'Account approved' : target === 'REJECTED' ? 'Account rejected' : target === 'SUSPENDED' ? 'Account suspended' : 'Account status updated';
    const message = target === 'ACTIVE'
      ? 'Your GreetSync business account is approved. You can now sign in and start configuring WhatsApp automation.'
      : target === 'REJECTED'
        ? 'Your GreetSync business registration was rejected. Contact the administrator if you need help.'
        : target === 'SUSPENDED'
          ? 'Your GreetSync business account has been suspended by the administrator.'
          : 'Your GreetSync business account status was updated.';
    await createNotification({ userId:id, targetRole:'BUSINESS', type:'ACCOUNT', title, message, entityType:'BUSINESS', entityId:id });
    res.json(updated);
  } catch(e:any){res.status(500).json({error:e.message||'Failed to update business status.'});}
};
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
    const statusTitle = normalizedStatus === 'ACTIVE' ? 'Account approved' : normalizedStatus === 'REJECTED' ? 'Account rejected' : normalizedStatus === 'SUSPENDED' ? 'Account suspended' : 'Account status updated';
    await createNotification({
      userId: id,
      targetRole: 'BUSINESS',
      type: 'ACCOUNT',
      title: statusTitle,
      message: normalizedStatus === 'ACTIVE'
        ? 'Your GreetSync business account has been approved. You can now use all business features.'
        : `Your GreetSync account status is now ${normalizedStatus.replaceAll('_',' ').toLowerCase()}.`,
      entityType: 'BUSINESS',
      entityId: id,
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
        qualityRating: wa.qualityRating, metaBusinessId: wa.metaBusinessId, wabaName: wa.wabaName, metaBusinessName: wa.metaBusinessName, businessProfile: wa.businessProfile, lastTestedAt: wa.lastTestedAt,
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
  try { const rows=await db.select({id:messageTemplates.id,name:messageTemplates.name,language:messageTemplates.language,category:messageTemplates.category,status:messageTemplates.status,components:messageTemplates.components,variableCount:messageTemplates.variableCount,metaTemplateId:messageTemplates.metaTemplateId,createdAt:messageTemplates.createdAt,updatedAt:messageTemplates.updatedAt,businessId:users.id,businessName:users.businessName,ownerName:users.name,ownerPhone:users.phone,ownerEmail:users.email,businessAddress:users.businessAddress}).from(messageTemplates).leftJoin(users,eq(messageTemplates.ownerUserId,users.id)).orderBy(desc(messageTemplates.updatedAt)); res.json(rows); }
  catch(e:any){res.status(500).json({error:e.message||'Failed to load admin templates.'});}
});

app.get('/api/admin/template-suggestions', requireAuth, requireAdmin, async (_req,res)=>{
  try {
    const rows = await db.select().from(templateSuggestions).orderBy(desc(templateSuggestions.updatedAt));
    res.json(rows);
  } catch(e:any) { res.status(500).json({error:e.message||'Failed to load template suggestions.'}); }
});

app.post('/api/admin/template-suggestions', requireAuth, requireAdmin, async (req:AuthRequest,res)=>{
  try {
    const title=String(req.body?.title||'').trim();
    const festival=String(req.body?.festival||'').trim();
    const description=String(req.body?.description||'').trim();
    const templateName=String(req.body?.templateName||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_').replace(/_+/g,'_');
    const language=String(req.body?.language||'en_US');
    const category=String(req.body?.category||'MARKETING').toUpperCase();
    const header=String(req.body?.header||'').trim();
    const body=String(req.body?.body||'').trim();
    const footer=String(req.body?.footer||'').trim();
    const buttons=Array.isArray(req.body?.buttons)?req.body.buttons:[];
    if(title.length<2) return res.status(400).json({error:'Suggestion title is required.'});
    if(!/^[a-z0-9_]{3,512}$/.test(templateName)) return res.status(400).json({error:'Template name must use lowercase letters, numbers and underscores.'});
    if(!['MARKETING','UTILITY','AUTHENTICATION'].includes(category)) return res.status(400).json({error:'Invalid template category.'});
    if(body.length<5||body.length>1024) return res.status(400).json({error:'Body must be 5-1024 characters.'});
    if(header.length>60||footer.length>60) return res.status(400).json({error:'Header and footer can contain at most 60 characters.'});
    if(buttons.length>10) return res.status(400).json({error:'A template can contain at most 10 buttons.'});
    const [row]=await db.insert(templateSuggestions).values({
      createdById:req.user!.id,title,festival:festival||null,description:description||null,templateName,language,category,
      header:header||null,body,footer:footer||null,buttons,isActive:req.body?.isActive!==false,
      activeFrom:req.body?.activeFrom?new Date(req.body.activeFrom):null,
      activeUntil:req.body?.activeUntil?new Date(req.body.activeUntil):null,
      updatedAt:new Date(),
    }).returning();
    res.status(201).json(row);
  } catch(e:any){res.status(500).json({error:e.message||'Failed to create template suggestion.'});}
});

app.put('/api/admin/template-suggestions/:id', requireAuth, requireAdmin, async (req:AuthRequest,res)=>{
  try {
    const id=Number(req.params.id);
    const [existing]=await db.select().from(templateSuggestions).where(eq(templateSuggestions.id,id)).limit(1);
    if(!existing) return res.status(404).json({error:'Template suggestion not found.'});
    const update:any={updatedAt:new Date()};
    for(const key of ['title','festival','description','language','header','body','footer'] as const) if(req.body?.[key]!==undefined) update[key]=String(req.body[key]||'').trim()||null;
    if(req.body?.templateName!==undefined){
      const n=String(req.body.templateName||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_').replace(/_+/g,'_');
      if(!/^[a-z0-9_]{3,512}$/.test(n)) return res.status(400).json({error:'Template name must use lowercase letters, numbers and underscores.'});
      update.templateName=n;
    }
    if(req.body?.category!==undefined){
      const c=String(req.body.category).toUpperCase(); if(!['MARKETING','UTILITY','AUTHENTICATION'].includes(c)) return res.status(400).json({error:'Invalid template category.'}); update.category=c;
    }
    if(req.body?.buttons!==undefined){ if(!Array.isArray(req.body.buttons)||req.body.buttons.length>10)return res.status(400).json({error:'Buttons must be a list with at most 10 items.'}); update.buttons=req.body.buttons; }
    if(req.body?.isActive!==undefined) update.isActive=req.body.isActive===true;
    if(req.body?.activeFrom!==undefined) update.activeFrom=req.body.activeFrom?new Date(req.body.activeFrom):null;
    if(req.body?.activeUntil!==undefined) update.activeUntil=req.body.activeUntil?new Date(req.body.activeUntil):null;
    const nextBody=String(update.body??existing.body??''); const nextHeader=String(update.header??existing.header??''); const nextFooter=String(update.footer??existing.footer??'');
    if(nextBody.length<5||nextBody.length>1024) return res.status(400).json({error:'Body must be 5-1024 characters.'});
    if(nextHeader.length>60||nextFooter.length>60) return res.status(400).json({error:'Header and footer can contain at most 60 characters.'});
    const [row]=await db.update(templateSuggestions).set(update).where(eq(templateSuggestions.id,id)).returning();
    res.json(row);
  } catch(e:any){res.status(500).json({error:e.message||'Failed to update template suggestion.'});}
});

app.delete('/api/admin/template-suggestions/:id', requireAuth, requireAdmin, async (req:AuthRequest,res)=>{
  try { const id=Number(req.params.id); const rows=await db.delete(templateSuggestions).where(eq(templateSuggestions.id,id)).returning({id:templateSuggestions.id}); if(!rows.length)return res.status(404).json({error:'Template suggestion not found.'}); res.json({success:true}); }
  catch(e:any){res.status(500).json({error:e.message||'Failed to delete template suggestion.'});}
});

app.get('/api/admin/scheduled-messages', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await messageMonitor(req.query, pool)); }
  catch (err:any) { res.status(/Invalid|Use a valid|Start date/.test(err.message) ? 400 : 500).json({error:err.message || 'Unable to load scheduled messages.'}); }
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
app.post('/api/admin/businesses/:id/whatsapp/test', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
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

app.post('/api/admin/businesses/:id/templates/sync', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
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
      const [existingTemplate] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.ownerUserId, businessId), eq(messageTemplates.metaTemplateId, t.id))).limit(1);
      const mergedComponents = mergeTemplateLocalMetadata(existingTemplate?.components, t.components as any[]);
      const varCount = extractVariableCount(mergedComponents);
      await db.insert(messageTemplates).values({
        ownerUserId: businessId, metaTemplateId: t.id, name: t.name, displayName: t.name, language: t.language, category: t.category,
        status: t.status, components: mergedComponents, variableCount: varCount, lastSyncedAt: new Date(), updatedAt: new Date(),
      }).onConflictDoUpdate({ target: messageTemplates.metaTemplateId, set: {
        ownerUserId: businessId, name: t.name, language: t.language, category: t.category, status: t.status,
        components: mergedComponents, variableCount: varCount, lastSyncedAt: new Date(), updatedAt: new Date(),
      }});
      syncedCount++;
    }
    await db.insert(auditLogs).values({ action: 'ADMIN_TEMPLATE_SYNC', actor: req.user?.phone || 'admin', details: { userId: businessId, syncedCount } });
    res.json({ success: true, syncedCount });
  } catch (e:any) { res.status(500).json({ error: e.message || 'Failed to sync business templates.' }); }
});

app.post('/api/admin/automations/:id/:action', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
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
      db.select({id:users.id,name:users.name,businessName:users.businessName,status: users.approvalStatus, isActive: users.isActive, createdAt:users.createdAt}).from(users).where(sql`${users.role} <> 'admin'`),
      db.select({ownerUserId: contacts.ownerUserId, createdAt:contacts.createdAt}).from(contacts),
      db.select({ownerUserId: automations.ownerUserId, status: automations.status, createdAt:automations.createdAt}).from(automations),
      db.select({ownerUserId: messages.ownerUserId, status: messages.status, sentAt:messages.sentAt, createdAt:messages.createdAt}).from(messages),
      db.select({ownerUserId: messageTemplates.ownerUserId, status: messageTemplates.status, category:messageTemplates.category, createdAt:messageTemplates.createdAt}).from(messageTemplates),
    ]);
    const countStatus=(rows:any[], key:string, value:string)=>rows.filter(r=>String(r[key]||'').toUpperCase()===value).length;
    const dateKey=(value:any)=>{ const d=new Date(value || 0); if(Number.isNaN(d.getTime())) return ''; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    const trendDays:any[]=[];
    for(let i=6;i>=0;i--){
      const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i); const key=dateKey(d);
      const rows=messageRows.filter((m:any)=>dateKey(m.sentAt||m.createdAt)===key);
      trendDays.push({
        date:key,
        label:d.toLocaleDateString('en-US',{weekday:'short'}),
        sent:rows.filter((m:any)=>['SENT','DELIVERED','READ'].includes(String(m.status).toUpperCase())).length,
        delivered:countStatus(rows,'status','DELIVERED')+countStatus(rows,'status','READ'),
        read:countStatus(rows,'status','READ'),
        failed:countStatus(rows,'status','FAILED'),
      });
    }
    const businessMessageCounts = new Map<number,number>();
    for(const m of messageRows){ if(m.ownerUserId) businessMessageCounts.set(m.ownerUserId,(businessMessageCounts.get(m.ownerUserId)||0)+1); }
    const topBusinesses = businesses.map((b:any)=>({ id:b.id, name:b.businessName||b.name||`Business ${b.id}`, messages:businessMessageCounts.get(b.id)||0 }))
      .sort((a:any,b:any)=>b.messages-a.messages).slice(0,5);
    const categories=['MARKETING','UTILITY','AUTHENTICATION'].map(category=>({category,count:templateRows.filter((t:any)=>String(t.category).toUpperCase()===category).length}));
    res.json({
      businesses: { total: businesses.length, active: businesses.filter((b:any)=>b.isActive && ['ACTIVE','APPROVED'].includes(String(b.status).toUpperCase())).length, pending: businesses.filter((b:any)=>['PENDING','PENDING_APPROVAL'].includes(String(b.status).toUpperCase())).length, suspended: countStatus(businesses,'status','SUSPENDED'), rejected: countStatus(businesses,'status','REJECTED') },
      contacts: { total: contactRows.length },
      automations: { total: automationRows.length, scheduled: countStatus(automationRows,'status','SCHEDULED'), sent: countStatus(automationRows,'status','SENT'), failed: countStatus(automationRows,'status','FAILED'), paused:countStatus(automationRows,'status','PAUSED'), cancelled:countStatus(automationRows,'status','CANCELLED') },
      messages: { total: messageRows.length, sent: messageRows.filter((m:any)=>['SENT','DELIVERED','READ'].includes(String(m.status).toUpperCase())).length, delivered: messageRows.filter((m:any)=>['DELIVERED','READ'].includes(String(m.status).toUpperCase())).length, read: countStatus(messageRows,'status','READ'), failed: countStatus(messageRows,'status','FAILED') },
      templates: { total: templateRows.length, approved: countStatus(templateRows,'status','APPROVED'), pending: templateRows.filter((t:any)=>String(t.status).toUpperCase().includes('PENDING')).length, rejected: countStatus(templateRows,'status','REJECTED') },
      trends: { messages: trendDays },
      templateCategories: categories,
      topBusinesses,
    });
  } catch (e:any) { res.status(500).json({error:e.message||'Failed to load reports.'}); }
});

/* =========================================================================
   NOTIFICATIONS
   ========================================================================= */
app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = req.user?.role === 'admin'
      ? await db.select().from(notifications).where(eq(notifications.targetRole, 'ADMIN')).orderBy(desc(notifications.createdAt)).limit(100)
      : await db.select().from(notifications).where(and(eq(notifications.targetRole, 'BUSINESS'), eq(notifications.userId, req.user!.id))).orderBy(desc(notifications.createdAt)).limit(100);
    res.json(rows);
  } catch (err:any) { res.status(500).json({ error: err.message || 'Failed to load notifications.' }); }
});

app.post('/api/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const condition = req.user?.role === 'admin'
      ? and(eq(notifications.id,id), eq(notifications.targetRole,'ADMIN'))
      : and(eq(notifications.id,id), eq(notifications.userId,req.user!.id), eq(notifications.targetRole,'BUSINESS'));
    const [row] = await db.update(notifications).set({ readAt:new Date() }).where(condition).returning();
    if (!row) return res.status(404).json({ error:'Notification not found.' });
    res.json(row);
  } catch (err:any) { res.status(500).json({ error: err.message || 'Failed to update notification.' }); }
});

app.post('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const condition = req.user?.role === 'admin'
      ? eq(notifications.targetRole,'ADMIN')
      : and(eq(notifications.targetRole,'BUSINESS'), eq(notifications.userId,req.user!.id));
    await db.update(notifications).set({ readAt:new Date() }).where(condition);
    res.json({ success:true });
  } catch (err:any) { res.status(500).json({ error: err.message || 'Failed to update notifications.' }); }
});


/* =========================================================================
   2. BUSINESS DASHBOARD STATS
   ========================================================================= */

app.get('/api/dashboard/stats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const ownerUserId = req.user!.id;
    const { start: todayStart, end: todayEnd } = istDayRange();
    const creds = await resolveWhatsAppCredentials(ownerUserId);
    const [[contactCount], [scheduledCount], [sentCount], [failedCount], [deliveredCount], [readCount], approvedTemplateRows, [groupCount], accountRows, upcoming, recentMessages, packageAccess] = await Promise.all([
      db.select({ val: count() }).from(contacts).where(and(eq(contacts.ownerUserId, ownerUserId), gte(contacts.createdAt,todayStart), lte(contacts.createdAt,todayEnd))),
      db.select({ val: count() }).from(automations).where(and(eq(automations.ownerUserId, ownerUserId), eq(automations.status, 'SCHEDULED'), gte(automations.scheduledAt,todayStart), lte(automations.scheduledAt,todayEnd))),
      db.select({ val: count() }).from(messages).where(and(eq(messages.ownerUserId, ownerUserId), inArray(messages.status, ['SENT', 'DELIVERED', 'READ']), gte(messages.createdAt,todayStart), lte(messages.createdAt,todayEnd))),
      db.select({ val: count() }).from(messages).where(and(eq(messages.ownerUserId, ownerUserId), eq(messages.status, 'FAILED'), gte(messages.createdAt,todayStart), lte(messages.createdAt,todayEnd))),
      db.select({ val: count() }).from(messages).where(and(eq(messages.ownerUserId, ownerUserId), inArray(messages.status, ['DELIVERED','READ']), gte(messages.createdAt,todayStart), lte(messages.createdAt,todayEnd))),
      db.select({ val: count() }).from(messages).where(and(eq(messages.ownerUserId, ownerUserId), eq(messages.status, 'READ'), gte(messages.createdAt,todayStart), lte(messages.createdAt,todayEnd))),
      db.select().from(messageTemplates).where(and(eq(messageTemplates.ownerUserId, ownerUserId), eq(messageTemplates.status,'APPROVED'))),
      db.select({ val: count() }).from(contactGroups).where(eq(contactGroups.ownerUserId, ownerUserId)),
      db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, ownerUserId)).limit(1),
      db.select({
        id: automations.id, contactId: automations.contactId, templateId: automations.templateId,
        scheduledAt: automations.scheduledAt, timezone: automations.timezone, status: automations.status,
        variables: automations.variables, executedAt: automations.executedAt, errorMessage: automations.errorMessage,
        contactName: contacts.name, contactPhone: contacts.phone, contactOptIn: contacts.optIn,
        templateName: messageTemplates.name, templateLanguage: messageTemplates.language, templateStatus: messageTemplates.status,
        templateComponents: messageTemplates.components,
      }).from(automations)
        .innerJoin(contacts, eq(automations.contactId, contacts.id))
        .innerJoin(messageTemplates, eq(automations.templateId, messageTemplates.id))
        .where(and(eq(automations.ownerUserId, ownerUserId), eq(automations.status, 'SCHEDULED'), gte(automations.scheduledAt,todayStart), lte(automations.scheduledAt,todayEnd)))
        .orderBy(automations.scheduledAt).limit(10),
      db.select({
        id: messages.id, status:messages.status, templateName:messages.templateName, content:messages.content, sentAt:messages.sentAt, createdAt:messages.createdAt,
        contactName:contacts.name, contactPhone:contacts.phone,
      }).from(messages).leftJoin(contacts,eq(messages.contactId,contacts.id))
        .where(and(eq(messages.ownerUserId,ownerUserId), gte(messages.createdAt,todayStart), lte(messages.createdAt,todayEnd))).orderBy(desc(messages.createdAt)).limit(10),
      getPackageAccessSummary(ownerUserId),
    ]);
    const account = accountRows[0];
    res.json({
      period: { type: 'TODAY', date: todayStart.toISOString().slice(0,10), timezone: 'Asia/Kolkata' },
      connection: {
        configured: creds.status === 'CONNECTED', hasToken: creds.hasToken, hasPhoneId: creds.hasPhoneId,
        credentialsSaved: Boolean(account), tokenSource: creds.tokenSource, status: creds.status,
        displayPhoneNumber: account?.displayPhoneNumber || null, verifiedName: account?.verifiedName || null,
        qualityRating: account?.qualityRating || null, lastTestedAt: account?.lastTestedAt || null,
      },
      stats: {
        totalContacts: Number(contactCount?.val || 0), scheduledMessages: Number(scheduledCount?.val || 0),
        messagesSent: Number(sentCount?.val || 0), failedMessages: Number(failedCount?.val || 0),
        deliveredMessages: Number(deliveredCount?.val || 0), readMessages: Number(readCount?.val || 0),
        approvedTemplates: approvedTemplateRows.filter(row => Boolean(row.metaTemplateId)).length, contactGroups: Number(groupCount?.val || 0),
      },
      package: packageAccess,
      upcoming,
      recentMessages,
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
      onboardingMode: acc?.onboardingMode || 'CLOUD_API', coexistenceSyncStatus: acc?.coexistenceSyncStatus || 'NOT_REQUIRED',
      connectionStatus: acc?.connectionStatus || creds.status, exists: Boolean(acc),
      configured: creds.isFullyConfigured, hasToken: creds.hasToken, hasPhoneId: creds.hasPhoneId,
      id: acc?.id || null, metaAppId: creds.metaAppId, metaAppSecretMasked: maskSecret(creds.metaAppSecret),
      businessAccountId: creds.businessAccountId, phoneNumberId: creds.phoneNumberId,
      businessPhone: acc?.businessPhone || '', metaBusinessId: acc?.metaBusinessId || '',
      wabaName:acc?.wabaName||null,metaBusinessName:acc?.metaBusinessName||null,businessProfile:acc?.businessProfile||null,
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
  const railwayDomain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  const environmentCandidate = String(
    process.env.PUBLIC_BASE_URL ||
    process.env.META_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (railwayDomain ? `https://${railwayDomain}` : '')
  ).trim().replace(/\/$/, '');

  // A permanent production URL must override an old ngrok/database value. This
  // prevents Meta callbacks from silently continuing to point at a local tunnel.
  if (process.env.NODE_ENV === 'production' && /^https:\/\//i.test(environmentCandidate)) {
    return { url: environmentCandidate, source: 'environment' };
  }

  const direct = String(configuredUrl || '').trim().replace(/\/$/, '');
  if (/^https:\/\//i.test(direct)) return { url: direct, source: 'database' };

  if (/^https:\/\//i.test(environmentCandidate)) return { url: environmentCandidate, source: 'environment' };

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
      webhookCallbackUrl: resolvedPublic.url ? `${resolvedPublic.url}/webhooks/whatsapp` : '',
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
    if (publicBaseUrl && !/^https:\/\//i.test(publicBaseUrl)) return res.status(400).json({ error: 'If provided, the Meta callback/backend URL must start with https://. For local development you can leave it blank and run ngrok; GreetSync will detect the tunnel automatically.' });
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
    res.json({ success: true, configured: true, metaAppId: appId, appSecretMasked: maskSecret(appSecret), embeddedSignupConfigId: configId, apiVersion, publicBaseUrl, detectedPublicBaseUrl: resolvedPublic.url, detectedPublicBaseUrlSource: resolvedPublic.source, oauthRedirectUri: '', embeddedSignupOrigin: resolvedPublic.url || '', embeddedSignupHostname: metaPublicHostname(resolvedPublic.url), webhookCallbackUrl: resolvedPublic.url ? `${resolvedPublic.url}/webhooks/whatsapp` : '', webhookVerifyToken, source: 'database' });
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
    res.json({ success: true, webhookVerifyToken: generated, webhookCallbackUrl: resolvedPublic.url ? `${resolvedPublic.url}/webhooks/whatsapp` : '' });
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
        error: 'Save the GreetSync Meta App ID, App Secret and Embedded Signup Configuration ID first.',
      });
    }
    const tokenUrl = `https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/oauth/access_token?client_id=${encodeURIComponent(cfg.appId)}&client_secret=${encodeURIComponent(cfg.appSecret)}&grant_type=client_credentials`;
    const response = await fetch(tokenUrl);
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) {
      return res.status(400).json({
        success: false,
        code: 'META_APP_CREDENTIALS_INVALID',
        error: body?.error?.message || 'Meta rejected the App ID/App Secret. Check the GreetSync Meta Developer App credentials.',
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
      message: resolvedPublic.url ? `GreetSync Meta credentials are valid. Meta signup URL detected: ${resolvedPublic.url}` : 'GreetSync Meta credentials are valid. Start ngrok on port 3000 for local Meta/Facebook login.',
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
        ? 'GreetSync Meta platform setup is incomplete. Ask the Super Admin to save the Meta App ID, App Secret and Embedded Signup Configuration ID.'
        : 'No HTTPS Meta callback is available. For local development start ngrok with: ngrok http 3000. GreetSync will detect it automatically.',
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
  const response = await fetch(url, {...init,signal:init.signal || AbortSignal.timeout(25000)});
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
  const appAccessToken=await getMetaAppAccessToken(cfg);
  const debug=await metaGraphJson(`https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/debug_token?input_token=${encodeURIComponent(accessToken)}`,{headers:{Authorization:`Bearer ${appAccessToken}`}});
  return discoverSignupAssets({appId:cfg.appId,debug,hints,requireCoexistence:Boolean(hints.requireCoexistence || hints.onboardingEvent==='FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'),
    graph:async(path,params={})=>metaGraphJson(`https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}${path}?${new URLSearchParams(params)}`,{headers:{Authorization:`Bearer ${accessToken}`}}),
  });
}

async function initiateCoexistenceSync(userId:number,phoneId:string,accessToken:string,apiVersion:string) {
  const client=await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1,$2)',[7301,userId]);
    const rows=await client.query('SELECT coexistence_sync_requests FROM whatsapp_accounts WHERE owner_user_id=$1',[userId]);
    const requests=rows.rows[0]?.coexistence_sync_requests||{};
    for(const type of ['smb_app_state_sync','history']) {
      if(requests[type])continue;
      const result:any=await metaGraphJson(`https://graph.facebook.com/${apiVersion}/${phoneId}/smb_app_data`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',sync_type:type})});
      requests[type]=String(result.request_id||'accepted');
      await client.query("UPDATE whatsapp_accounts SET coexistence_sync_requests=$2,coexistence_sync_status='REQUESTED',updated_at=NOW() WHERE owner_user_id=$1",[userId,JSON.stringify(requests)]);
    }
  }catch(e:any){await client.query("UPDATE whatsapp_accounts SET coexistence_sync_status='SYNC_ERROR',last_connection_error=$2 WHERE owner_user_id=$1",[userId,String(e.message)]);throw new Error('Coexistence connected, but data synchronization needs attention. Retry sync from GreetSync within 24 hours. '+e.message);}
  finally{await client.query('SELECT pg_advisory_unlock($1,$2)',[7301,userId]);client.release();}
}
app.post('/api/whatsapp/coexistence/sync',requireAuth,async(req:AuthRequest,res)=>{
  try{const [account]=await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId,req.user!.id)).limit(1);
    if(account?.onboardingMode!=='COEXISTENCE')return res.status(400).json({error:'This account is not connected through Coexistence.'});
    const creds=await resolveWhatsAppCredentials(req.user!.id);await initiateCoexistenceSync(req.user!.id,account.phoneNumberId,creds.accessToken,account.apiVersion);
    await db.update(whatsappAccounts).set({connectionStatus:'CONNECTED',status:'CONNECTED',lastConnectionError:null}).where(eq(whatsappAccounts.id,account.id));res.json({success:true});
  }catch(e:any){sendRuleError(res,e,'Coexistence sync failed.');}
});

async function finishMetaEmbeddedSignup(user: any, code: string, cfg: any, options: any = {}) {
  const accessToken = options.pendingAccessToken || (await exchangeMetaEmbeddedSignupCode(cfg, code, options.redirectUri)).accessToken;
  let assets:Awaited<ReturnType<typeof discoverMetaWhatsappAssets>>;
  try {assets=await discoverMetaWhatsappAssets(cfg, accessToken, options);}
  catch(error:any){if(error.code==='META_ASSET_SELECTION_REQUIRED')error.signupAccessToken=accessToken;throw error;}
  // Coexistence is confirmed by the authorized phone's Meta API state, even
  // when browser session logging is delayed or absent. Never trust an event name
  // alone or register/migrate an existing Business app number through /register.
  const isCoexistence=assets.isCoexistence;
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
    wabaName: assets.wabaName || null, metaBusinessName: assets.businessName || null, businessProfile: assets.businessProfile,
    apiVersion: cfg.apiVersion,
    ...enc,
    businessPhone: details.phoneNumber || '',
    onboardingMode: isCoexistence ? 'COEXISTENCE' : 'CLOUD_API',
    coexistenceSyncStatus: isCoexistence ? 'NOT_STARTED' : 'NOT_REQUIRED',
    connectionStatus: 'CONNECTING',
    status: 'CONNECTING',
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

  if(isCoexistence) await pool.query("UPDATE whatsapp_accounts SET coexistence_sync_requests='{}'::jsonb WHERE owner_user_id=$1",[user.id]);
  let subscribed = false;
  try {
    await metaGraphJson(
      `https://graph.facebook.com/${encodeURIComponent(cfg.apiVersion)}/${encodeURIComponent(assets.wabaId)}/subscribed_apps`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type':'application/json' }, body:JSON.stringify(cfg.publicBaseUrl?{override_callback_uri:cfg.publicBaseUrl+'/webhooks/whatsapp',verify_token:decryptSecret(enc.webhookVerifyToken)||cfg.webhookVerifyToken}:{}) },
    );
    subscribed = true;
  } catch (e: any) {
    await db.update(whatsappAccounts).set({connectionStatus:'CONNECTION_ERROR',lastConnectionError:'Webhook subscription failed. Reconnect before automation.'}).where(eq(whatsappAccounts.ownerUserId,user.id));
    throw new Error('Meta webhook subscription failed. Connection is not ready for Coexistence. '+e.message);
  }
  let syncWarning:string|null=null;
  if(isCoexistence) {
    try { await initiateCoexistenceSync(user.id,assets.phoneNumberId,accessToken,cfg.apiVersion); }
    catch { syncWarning='WhatsApp is connected, but shared contacts/history synchronization needs attention. Open WhatsApp Business in GreetSync to retry the permitted sync.'; }
  }
  await db.update(whatsappAccounts).set({connectionStatus:'CONNECTED',status:'CONNECTED',lastConnectionError:syncWarning,updatedAt:new Date()}).where(eq(whatsappAccounts.ownerUserId,user.id));

  // Pull the business's real templates immediately so the account is ready for
  // automation as soon as onboarding finishes.
  try {
    const templateResult = await WhatsAppService.fetchTemplates(assets.wabaId, accessToken, cfg.apiVersion);
    if (templateResult.success && Array.isArray(templateResult.templates)) {
      for (const tpl of templateResult.templates) {
        const metaId = String((tpl as any).id || '').trim() || `${user.id}:${(tpl as any).name}:${(tpl as any).language}`;
        let components = Array.isArray((tpl as any).components) ? (tpl as any).components : [];
        const bodyText = String(components.find((c:any)=>String(c?.type||'').toUpperCase()==='BODY')?.text || '');
        const variableCount = Math.max(0, ...Array.from(bodyText.matchAll(/\{\{(\d+)\}\}/g)).map((m:any)=>Number(m[1])||0));
        const existingTpl = await db.select().from(messageTemplates).where(and(eq(messageTemplates.ownerUserId, user.id), eq(messageTemplates.metaTemplateId, metaId))).limit(1);
        components=mergeTemplateLocalMetadata(existingTpl[0]?.components,components);
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
    onboardingMode: isCoexistence ? 'COEXISTENCE' : 'CLOUD_API',
    coexistenceSyncStatus: isCoexistence ? (syncWarning ? 'SYNC_ERROR' : 'REQUESTED') : 'NOT_REQUIRED',
    warning:syncWarning, wabaName:assets.wabaName, metaBusinessName:assets.businessName, metaBusinessId:assets.metaBusinessId, businessProfile:assets.businessProfile,
  };
}

app.post('/api/whatsapp/embedded-signup/session', requireAuth, async (req:AuthRequest,res)=>{
  try {
    if(req.user?.role==='admin') return res.status(403).json({error:'Embedded Signup is available only for business accounts.'});
    const cfg=await metaPlatformConfig();
    if(!cfg.appId || !cfg.appSecret || !cfg.configId) return res.status(503).json({code:'META_PLATFORM_NOT_CONFIGURED',error:'GreetSync Meta platform setup is incomplete. The Super Admin must save the Meta App ID, App Secret and Embedded Signup Configuration ID once before business owners can use Meta login.'});
    const resolvedPublic = await resolveMetaPublicBaseUrl(cfg.publicBaseUrl);
    if (!resolvedPublic.url) return res.status(503).json({code:'META_TUNNEL_REQUIRED',error:'Meta Embedded Signup requires an HTTPS page. For local development run `ngrok http 3000`; GreetSync will detect the active HTTPS tunnel automatically.'});

    await pool.query("UPDATE meta_embedded_signup_sessions SET pending_access_token=NULL,selection_options=NULL WHERE expires_at<NOW() AND pending_access_token IS NOT NULL");
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
    // through the official Facebook SDK with the Builder configuration ID and
    // Business App Coexistence session logging.
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
    if(new Date(row.expires_at).getTime()<Date.now() && ['PENDING','SELECT_ACCOUNT'].includes(row.status)) {
      await pool.query(`UPDATE meta_embedded_signup_sessions SET status='EXPIRED',pending_access_token=NULL,selection_options=NULL,error_message='This Meta signup session expired. Start again.',updated_at=NOW() WHERE session_id=$1`,[sessionId]);
      row.status='EXPIRED'; row.error_message='This Meta signup session expired. Start again.';
    }
    return res.json({sessionId:row.session_id,status:row.status,error:row.error_message||null,wabaId:row.waba_id||null,phoneNumberId:row.phone_number_id||null,displayPhoneNumber:row.display_phone_number||null,verifiedName:row.verified_name||null,completedAt:row.completed_at||null});
  } catch(e:any){return res.status(500).json({error:e.message||'Could not read Meta signup status.'});}
});

app.get('/meta/embedded-signup/start', async (req,res)=>{
  try {
    const sessionId=String(req.query.session||'').trim();
    if(!sessionId) return res.status(400).type('html').send('<h2>Missing GreetSync signup session.</h2>');
    const sessionResult=await pool.query(`SELECT session_id,status,expires_at FROM meta_embedded_signup_sessions WHERE session_id=$1 LIMIT 1`,[sessionId]);
    const session:any=sessionResult.rows?.[0];
    if(!session) return res.status(404).type('html').send('<h2>GreetSync signup session not found.</h2><p>Return to GreetSync and start again.</p>');
    if(!['PENDING','SELECT_ACCOUNT'].includes(session.status)) return res.status(409).type('html').send(`<h2>Signup session is ${escapeHtml(session.status)}.</h2><p>Return to GreetSync to see the current connection status.</p><a href="greetsync://meta-connected">Return to GreetSync</a>`);
    if(new Date(session.expires_at).getTime()<Date.now()) {
      await pool.query(`UPDATE meta_embedded_signup_sessions SET status='EXPIRED',pending_access_token=NULL,selection_options=NULL,error_message='Session expired',updated_at=NOW() WHERE session_id=$1`,[sessionId]);
      return res.status(410).type('html').send('<h2>Meta signup session expired.</h2><p>Return to GreetSync and start again.</p>');
    }
    const cfg=await metaPlatformConfig();
    if(!cfg.appId || !cfg.configId) return res.status(503).type('html').send('<h2>GreetSync Meta configuration is incomplete.</h2><p>Ask the Super Admin to configure the Meta App ID and Embedded Signup Configuration ID.</p>');

    const bridge=renderMetaSignupBridge({sessionId,appId:cfg.appId,configId:cfg.configId,apiVersion:cfg.apiVersion,resumeSelection:session.status==='SELECT_ACCOUNT'});
    for(const [name,value] of Object.entries(bridge.headers))res.setHeader(name,value);
    return res.type('html').send(bridge.html);
  } catch(e:any) {
    return res.status(500).type('html').send(`<h2>Could not prepare Meta Embedded Signup.</h2><p>${escapeHtml(e.message||e)}</p>`);
  }
});

// Browser reload can resume a cached selection only with the original launch
// secret. The encrypted token is never returned to the browser.
app.post('/meta/embedded-signup/selection',async(req,res)=>{
  try{
    const sessionId=String(req.body?.sessionId||''),launchToken=String(req.body?.launchToken||'');
    if(!sessionId||!launchToken)return res.status(401).json({error:'Open the secure connection link from GreetSync.'});
    const rows=await pool.query("SELECT selection_options FROM meta_embedded_signup_sessions WHERE session_id=$1 AND state_hash=$2 AND status='SELECT_ACCOUNT' AND expires_at>NOW() LIMIT 1",[sessionId,hashMetaSignupState(launchToken)]);
    const choices=rows.rows?.[0]?.selection_options;
    if(!Array.isArray(choices))return res.status(410).json({error:'This account selection expired. Start again from GreetSync.'});
    return res.json({choices});
  }catch{return res.status(500).json({error:'Could not resume the authorized number selection.'});}
});

app.post('/meta/embedded-signup/complete', async (req,res)=>{
  let claimedSessionId='';
  try {
    const sessionId=String(req.body?.sessionId||'').trim();
    const launchToken=String(req.body?.launchToken||'').trim();
    const code=String(req.body?.code||'').trim();
    if(!sessionId || !launchToken) return res.status(400).json({error:'Meta signup session, secure launch token and authorization code are required.'});
    const stateHash=hashMetaSignupState(launchToken);
    const sessionResult=await pool.query(`SELECT session_id,user_id,status,expires_at,pending_access_token,selection_options FROM meta_embedded_signup_sessions WHERE session_id=$1 AND state_hash=$2 LIMIT 1`,[sessionId,stateHash]);
    const session:any=sessionResult.rows?.[0];
    if(!session) return res.status(401).json({error:'GreetSync could not validate this Meta signup session. Start again from the app.'});
    if(new Date(session.expires_at).getTime()<Date.now()) {
      await pool.query(`UPDATE meta_embedded_signup_sessions SET status='EXPIRED',pending_access_token=NULL,selection_options=NULL,error_message='Session expired',updated_at=NOW() WHERE session_id=$1`,[sessionId]);
      return res.status(410).json({error:'This Meta signup session expired. Start again from GreetSync.'});
    }
    if(session.status==='CONNECTED') {
      const existing=await pool.query(`SELECT waba_id,phone_number_id,display_phone_number,verified_name FROM meta_embedded_signup_sessions WHERE session_id=$1 LIMIT 1`,[sessionId]);
      const row:any=existing.rows?.[0]||{};
      return res.json({success:true,alreadyConnected:true,wabaId:row.waba_id||null,phoneNumberId:row.phone_number_id||null,displayPhoneNumber:row.display_phone_number||null,verifiedName:row.verified_name||null});
    }
    if(!['PENDING','SELECT_ACCOUNT'].includes(session.status)) return res.status(409).json({error:`This Meta signup session is ${session.status}. Start a new connection from GreetSync.`});

    const selectedWaba=String(req.body?.wabaId||'').trim(),selectedPhone=String(req.body?.phoneNumberId||'').trim();
    if(session.status==='SELECT_ACCOUNT') {
      if(!Array.isArray(session.selection_options)||!session.selection_options.some((choice:any)=>choice.wabaId===selectedWaba&&choice.phoneNumberId===selectedPhone))return res.status(400).json({error:'Choose one of the WhatsApp numbers authorized in this connection.'});
      if(!decryptSecret(session.pending_access_token))return res.status(400).json({error:'This connection must be restarted from GreetSync.'});
    }else if(!code)return res.status(400).json({error:'The Meta authorization code is missing.'});
    const claimed=await pool.query("UPDATE meta_embedded_signup_sessions SET status='CONNECTING',updated_at=NOW() WHERE session_id=$1 AND status IN ('PENDING','SELECT_ACCOUNT') RETURNING session_id",[sessionId]);
    if(!claimed.rowCount)return res.status(409).json({error:'This connection is already being completed. Return to GreetSync to check its status.'});
    claimedSessionId=sessionId;
    const userResult=await db.select().from(users).where(eq(users.id,Number(session.user_id))).limit(1);
    const user:any=userResult[0];
    if(!user || user.role==='admin') throw new Error('Business account not found for this signup session.');
    const cfg=await metaPlatformConfig();
    const result=await finishMetaEmbeddedSignup(user,code,cfg,{
      // Builder/JS SDK code exchange should not be coupled to our legacy OAuth
      // callback URI. The WABA/phone hints come from the official session event.
      redirectUri:'', pendingAccessToken:session.status==='SELECT_ACCOUNT'?decryptSecret(session.pending_access_token):'',
      wabaId:String(req.body?.wabaId||'').trim(),
      phoneNumberId:String(req.body?.phoneNumberId||'').trim(),
      onboardingEvent:String(req.body?.onboardingEvent||''),requireCoexistence:true,
    });
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='CONNECTED',pending_access_token=NULL,selection_options=NULL,waba_id=$2,phone_number_id=$3,display_phone_number=$4,verified_name=$5,completed_at=NOW(),updated_at=NOW() WHERE session_id=$1`,[sessionId,result.wabaId,result.phoneNumberId,result.displayPhoneNumber||null,result.verifiedName||null]);
    return res.json(result);
  } catch(e:any) {
    const sessionId=claimedSessionId;
    if(sessionId&&e?.code==='META_ASSET_SELECTION_REQUIRED'&&e?.signupAccessToken&&Array.isArray(e?.choices)){
      try {
        await pool.query("UPDATE meta_embedded_signup_sessions SET status='SELECT_ACCOUNT',pending_access_token=$2,selection_options=$3,updated_at=NOW() WHERE session_id=$1 AND status='CONNECTING'",[sessionId,encryptSecret(e.signupAccessToken),JSON.stringify(e.choices)]);
        return res.json({success:false,selectionRequired:true,choices:e.choices});
      }catch{return res.status(500).json({error:'Could not save the secure account selection. Start again from GreetSync.'});}
    }
    const message=String(e?.message||e);
    if(sessionId) {
      try { await pool.query(`UPDATE meta_embedded_signup_sessions SET status='FAILED',pending_access_token=NULL,selection_options=NULL,error_message=$2,updated_at=NOW() WHERE session_id=$1 AND status IN ('PENDING','CONNECTING')`,[sessionId,message]); } catch {}
    }
    return res.status(Number(e?.statusCode)||500).json({error:message,code:e?.code||null});
  }
});

// Convenience URL retained for old bookmarks. New builds create a secure
// business-specific session first, then open /meta/embedded-signup/start.
app.get('/meta/embedded-signup', async (_req,res)=>{
  return res.status(410).type('html').send('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Arial;padding:28px"><h2>Start Meta signup from GreetSync</h2><p>Return to the GreetSync app and tap Continue with Meta. GreetSync will open the Embedded Signup Builder flow linked to your business account.</p></div>');
});

app.get('/meta/embedded-signup/callback', async (req,res)=>{
  const state=String(req.query.state||'').trim();
  const stateHash=hashMetaSignupState(state);
  const sessionResult=await pool.query(`SELECT session_id,user_id,status,redirect_uri,expires_at FROM meta_embedded_signup_sessions WHERE state_hash=$1 LIMIT 1`,[stateHash]);
  const session:any=sessionResult.rows?.[0];
  if(!session) return res.status(401).type('html').send('<h2>Meta signup session not found.</h2><p>Return to GreetSync and start again.</p>');
  if(new Date(session.expires_at).getTime()<Date.now()) {
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='EXPIRED',pending_access_token=NULL,selection_options=NULL,error_message='Session expired',updated_at=NOW() WHERE session_id=$1`,[session.session_id]);
    return res.status(400).type('html').send('<h2>Meta signup session expired.</h2><p>Return to GreetSync and start again.</p>');
  }
  const error=String(req.query.error_description||req.query.error_message||req.query.error||'').trim();
  if(error) {
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='FAILED',error_message=$2,updated_at=NOW() WHERE session_id=$1`,[session.session_id,error]);
    return res.status(400).type('html').send(`<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Arial;padding:28px"><h2>Meta connection was not completed</h2><p>${error.replace(/[<>&]/g,'')}</p><a href="greetsync://meta-connected">Return to GreetSync</a></div>`);
  }
  const code=String(req.query.code||'').trim();
  if(!code) {
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='FAILED',error_message='Meta did not return an authorization code.',updated_at=NOW() WHERE session_id=$1`,[session.session_id]);
    return res.status(400).type('html').send('<h2>Meta did not return an authorization code.</h2><p>Return to GreetSync and try again.</p>');
  }
  try {
    const userResult=await db.select().from(users).where(eq(users.id,Number(session.user_id))).limit(1);
    const user:any=userResult[0];
    if(!user || user.role==='admin') throw new Error('Business account not found for this signup session.');
    const cfg=await metaPlatformConfig();
    const result=await finishMetaEmbeddedSignup(user,code,cfg,{redirectUri:String(session.redirect_uri||'')});
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='CONNECTED',waba_id=$2,phone_number_id=$3,display_phone_number=$4,verified_name=$5,completed_at=NOW(),updated_at=NOW() WHERE session_id=$1`,[session.session_id,result.wabaId,result.phoneNumberId,result.displayPhoneNumber||null,result.verifiedName||null]);
    const phone=String(result.displayPhoneNumber||''); const name=String(result.verifiedName||'WhatsApp Business');
    return res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;background:#f4fbf7;margin:0;padding:28px;color:#10231a}.card{max-width:520px;margin:40px auto;background:#fff;border-radius:22px;padding:26px;border:1px solid #dfece5;text-align:center}.ok{font-size:52px;color:#079455}.btn{display:block;margin-top:22px;padding:15px;border-radius:14px;background:#079455;color:#fff;text-decoration:none;font-weight:700}.muted{color:#667085}</style></head><body><div class="card"><div class="ok">✓</div><h2>WhatsApp Business Connected</h2><p><b>${name.replace(/[<>&]/g,'')}</b></p><p>${phone.replace(/[<>&]/g,'')}</p><p>GreetSync securely stored this business's WABA ID, Phone Number ID and encrypted access token. Approved templates are being synchronized and automations can now use this account.</p><p class="muted">You can close this browser if GreetSync does not open automatically.</p><a class="btn" href="greetsync://meta-connected">Return to GreetSync</a></div><script>setTimeout(()=>{location.href='greetsync://meta-connected'},900)</script></body></html>`);
  } catch(e:any) {
    const message=String(e?.message||e);
    await pool.query(`UPDATE meta_embedded_signup_sessions SET status='FAILED',error_message=$2,updated_at=NOW() WHERE session_id=$1`,[session.session_id,message]);
    return res.status(500).type('html').send(`<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Arial;padding:28px"><h2>Meta connection could not be completed</h2><p>${message.replace(/[<>&]/g,'')}</p><p>Return to GreetSync, correct the Meta app/configuration if necessary, and try again.</p><a href="greetsync://meta-connected">Return to GreetSync</a></div>`);
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
    const cfg=await metaPlatformConfig();
    // Saved, unverified identifiers must not reveal another business's events.
    const tracking=acc?.connectionStatus==='CONNECTED'?await deliveryHealth(creds.businessAccountId,creds.phoneNumberId):acc?{lastStatusReceivedAt:null,pendingEvents:0,processingError:null}:null;
    res.json({
      exists:Boolean(acc), credentialsStatus:acc?'SAVED':'NOT_SAVED', connectionStatus:acc?.connectionStatus||'NOT_CONNECTED', metaConnectionStatus:acc?.connectionStatus==='CONNECTED'?'CONNECTED':acc?.connectionStatus==='CONNECTION_ERROR'?'ERROR':'NOT_CHECKED',
      metaAppId:creds.metaAppId,businessAccountId:creds.businessAccountId,phoneNumberId:creds.phoneNumberId,businessPhone:acc?.businessPhone||'',metaBusinessId:acc?.metaBusinessId||'',apiVersion:creds.apiVersion,
      accessTokenMasked:maskSecret(creds.accessToken),appSecretMasked:maskSecret(creds.metaAppSecret),webhookVerifyTokenMasked:maskSecret(creds.webhookVerifyToken),displayPhoneNumber:acc?.displayPhoneNumber||null,verifiedName:acc?.verifiedName||null,qualityRating:acc?.qualityRating||null,lastSyncedAt:acc?.lastTestedAt||null,lastConnectionError:acc?.lastConnectionError||null,
      onboardingMode:acc?.onboardingMode,coexistenceSyncStatus:acc?.coexistenceSyncStatus,
      wabaName:acc?.wabaName||null,metaBusinessName:acc?.metaBusinessName||null,businessProfile:acc?.businessProfile||null,
      deliveryTracking:tracking?{...tracking,signatureConfigured:Boolean(creds.metaAppSecret||(creds.metaAppId===cfg.appId&&cfg.appSecret)),callbackUrl:cfg.publicBaseUrl?cfg.publicBaseUrl+'/webhooks/whatsapp':null}:null,
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
    let webhookSetup:Awaited<ReturnType<typeof ensureDeliverySubscription>>|null=null;
    if(result.success){
      try {
        const cfg=await metaPlatformConfig();
        if(!creds.metaAppSecret&&!(creds.metaAppId===cfg.appId&&cfg.appSecret))throw new Error('Add the matching Meta App Secret to this connection or platform settings to verify delivery webhooks.');
        if(!creds.webhookVerifyToken&&!cfg.webhookVerifyToken)throw new Error('Add a Webhook Verify Token to this connection or platform settings and configure the messages webhook in Meta.');
        if(!cfg.publicBaseUrl)throw new Error('Set PUBLIC_BASE_URL to the permanent HTTPS backend URL before testing delivery updates.');
        webhookSetup=await ensureDeliverySubscription({...creds,metaAppSecret:creds.metaAppSecret||(creds.metaAppId===cfg.appId?cfg.appSecret:'')},{url:cfg.publicBaseUrl+'/webhooks/whatsapp',verifyToken:creds.webhookVerifyToken||cfg.webhookVerifyToken});
        if(webhookSetup.appWebhook.state==='ACTION_REQUIRED')throw new Error(webhookSetup.appWebhook.warning);
      }catch(error:any){result.success=false;result.error=error.message||'WhatsApp delivery subscription failed.';}
    }
    await db.update(whatsappAccounts).set({connectionStatus:result.success?'CONNECTED':'CONNECTION_ERROR',status:result.success?'CONNECTED':'ERROR',lastConnectionError:result.success?null:(result.error||'Connection test failed.'),displayPhoneNumber:result.phoneNumber||acc.displayPhoneNumber,verifiedName:result.verifiedName||acc.verifiedName,qualityRating:result.qualityRating||acc.qualityRating,lastTestedAt:new Date(),updatedAt:new Date()}).where(eq(whatsappAccounts.id,acc.id));
    if(!result.success) return res.status(400).json({success:false,connectionStatus:'CONNECTION_ERROR',error:result.error||'Connection test failed. Saved credentials were kept.'});
    res.json({success:true,connectionStatus:'CONNECTED',displayPhoneNumber:result.phoneNumber,verifiedName:result.verifiedName,qualityRating:result.qualityRating,deliveryUpdatesSubscribed:true,webhookSetup,message:webhookSetup?.appWebhook.state==='READY'?'WhatsApp verified. Callback URL and the app messages field are confirmed.':'WABA callback confirmed. '+(webhookSetup?.appWebhook.warning||'Check the app messages field in Meta App Dashboard.')});
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
async function ownedGroupIds(ownerUserId: number, values: unknown): Promise<number[]> {
  if (!Array.isArray(values)) return [];
  const requested = [...new Set(values.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!requested.length) return [];
  const rows = await db.select({ id: contactGroups.id }).from(contactGroups)
    .where(and(eq(contactGroups.ownerUserId, ownerUserId), inArray(contactGroups.id, requested)));
  return rows.map((row) => row.id);
}

function validIsoBirthDate(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw Object.assign(new Error('Date of birth must use YYYY-MM-DD format.'), { statusCode: 400 });
  }
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date > new Date()) {
    throw Object.assign(new Error('Enter a valid date of birth.'), { statusCode: 400 });
  }
  return text;
}

app.get('/api/contacts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const list = req.user?.role === 'admin'
      ? await db.select().from(contacts).orderBy(asc(contacts.name), asc(contacts.id))
      : await db.select().from(contacts).where(eq(contacts.ownerUserId, req.user!.id)).orderBy(asc(contacts.name), asc(contacts.id));

    const groupMap = new Map<number, number[]>();
    if (req.user?.role !== 'admin' && list.length) {
      const memberships = await db.select({
        contactId: contactGroupMembers.contactId,
        groupId: contactGroupMembers.groupId,
      }).from(contactGroupMembers)
        .innerJoin(contactGroups, eq(contactGroupMembers.groupId, contactGroups.id))
        .where(eq(contactGroups.ownerUserId, req.user!.id));
      for (const membership of memberships) {
        const ids = groupMap.get(membership.contactId) || [];
        ids.push(membership.groupId);
        groupMap.set(membership.contactId, ids);
      }
    }
    const enriched = list.map((contact) => ({ ...contact, name: contactName(contact.name), groupIds: groupMap.get(contact.id) || [] }));
    const filtered = search
      ? enriched.filter((contact) =>
          contact.name.toLowerCase().includes(search) ||
          contact.phone.toLowerCase().includes(search) ||
          String(contact.email || '').toLowerCase().includes(search))
      : enriched;
    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load contacts.' });
  }
});

app.post('/api/contacts', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Create contacts from a business account.' });
    const { name, phone, email, optIn, notes, dob, birthdayAutomationEnabled, groupIds, avatarData } = req.body || {};
    const cleanName = contactName(name);
    if (!cleanName || !phone) return res.status(400).json({ error: 'Full Name and WhatsApp phone number are required.' });
    if (!isValidPersonName(cleanName)) return res.status(400).json({ error: 'Full Name may contain letters, spaces, apostrophes, periods and hyphens only.' });
    const cleanNotes = notes == null ? '' : String(notes).trim();
    if (cleanNotes.length > 128) return res.status(400).json({ error: 'Notes can contain at most 128 characters.' });

    await assertContactCapacity(req.user!.id, 1);
    const phoneValidation = validateInternationalPhone(phone);
    if (!phoneValidation.ok) return res.status(400).json({ error: phoneValidation.error });
    const normalizedPhone = phoneValidation.normalized!;

    const cleanEmail = email ? String(email).trim() : '';
    if (cleanEmail && !isValidEmailSyntax(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (cleanEmail && !(await hasResolvableEmailDomain(cleanEmail))) {
      return res.status(400).json({ error: 'The email domain could not be found. Check the email address and try again.' });
    }

    const [duplicate] = await db.select({ id: contacts.id }).from(contacts)
      .where(and(eq(contacts.ownerUserId, req.user!.id), eq(contacts.phone, normalizedPhone))).limit(1);
    if (duplicate) return res.status(409).json({ error: 'This phone number is already saved in GreetSync.' });

    const selectedGroups = await ownedGroupIds(req.user!.id, groupIds);
    if (Array.isArray(groupIds) && selectedGroups.length !== [...new Set(groupIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))].length) {
      return res.status(400).json({ error: 'One or more selected groups are invalid.' });
    }

    const [newContact] = await db.insert(contacts).values({
      ownerUserId: req.user!.id,
      name: cleanName,
      phone: normalizedPhone,
      email: cleanEmail || null,
      optIn: optIn !== false,
      dob: validIsoBirthDate(dob),
      birthdayAutomationEnabled: birthdayAutomationEnabled !== false,
      notes: cleanNotes || null,
      avatarData: validateImageData(avatarData, 900_000),
    }).returning();

    for (const groupId of selectedGroups) {
      await db.insert(contactGroupMembers).values({ groupId, contactId: newContact.id }).onConflictDoNothing();
    }

    let birthdaySchedule: any = null;
    if (newContact.dob && newContact.birthdayAutomationEnabled !== false) {
      birthdaySchedule = await WishflowService.syncContactBirthdayAutomation(newContact.id);
    }
    res.status(201).json({ ...newContact, groupIds: selectedGroups, birthdaySchedule });
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'This phone number is already saved in GreetSync.' });
    sendRuleError(res, err, 'Failed to create contact.');
  }
});

app.put('/api/contacts/:id', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const ownerCondition = req.user?.role === 'admin'
      ? eq(contacts.id, id)
      : and(eq(contacts.id, id), eq(contacts.ownerUserId, req.user!.id));
    const [existing] = await db.select().from(contacts).where(ownerCondition).limit(1);
    if (!existing) return res.status(404).json({ error: 'Contact not found.' });

    const { name, phone, email, optIn, notes, dob, birthdayAutomationEnabled, groupIds, avatarData } = req.body || {};
    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) {
      const cleanName = contactName(name);
      if (!isValidPersonName(cleanName)) return res.status(400).json({ error: 'Full Name may contain letters, spaces, apostrophes, periods and hyphens only.' });
      updateData.name = cleanName;
    }
    if (phone !== undefined) {
      const validation = validateInternationalPhone(String(phone));
      if (!validation.ok) return res.status(400).json({ error: validation.error });
      const [duplicate] = await db.select({ id: contacts.id }).from(contacts).where(and(
        eq(contacts.ownerUserId, existing.ownerUserId),
        eq(contacts.phone, validation.normalized!),
        sql`${contacts.id} <> ${id}`,
      )).limit(1);
      if (duplicate) return res.status(409).json({ error: 'This phone number is already saved in GreetSync.' });
      updateData.phone = validation.normalized;
    }
    if (email !== undefined) {
      const cleanEmail = email ? String(email).trim() : '';
      if (cleanEmail && !isValidEmailSyntax(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (cleanEmail && !(await hasResolvableEmailDomain(cleanEmail))) {
        return res.status(400).json({ error: 'The email domain could not be found. Check the email address and try again.' });
      }
      updateData.email = cleanEmail || null;
    }
    if (typeof optIn === 'boolean') updateData.optIn = optIn;
    if (notes !== undefined) {
      const cleanNotes = notes == null ? '' : String(notes).trim();
      if (cleanNotes.length > 128) return res.status(400).json({ error: 'Notes can contain at most 128 characters.' });
      updateData.notes = cleanNotes || null;
    }
    if (dob !== undefined) updateData.dob = validIsoBirthDate(dob);
    if (typeof birthdayAutomationEnabled === 'boolean') updateData.birthdayAutomationEnabled = birthdayAutomationEnabled;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'avatarData')) updateData.avatarData = validateImageData(avatarData, 900_000);

    let selectedGroups: number[] | null = null;
    if (Array.isArray(groupIds) && req.user?.role !== 'admin') {
      selectedGroups = await ownedGroupIds(req.user!.id, groupIds);
      const requested = [...new Set(groupIds.map(Number).filter((groupId: number) => Number.isInteger(groupId) && groupId > 0))];
      if (selectedGroups.length !== requested.length) return res.status(400).json({ error: 'One or more selected groups are invalid.' });
    }

    const [updated] = await db.update(contacts).set(updateData).where(ownerCondition).returning();
    if (!updated) return res.status(404).json({ error: 'Contact not found.' });

    if (selectedGroups != null) {
      await db.delete(contactGroupMembers).where(eq(contactGroupMembers.contactId, updated.id));
      for (const groupId of selectedGroups) {
        await db.insert(contactGroupMembers).values({ groupId, contactId: updated.id }).onConflictDoNothing();
      }
    }
    let birthdaySchedule: any = null;
    if (updated.dob && updated.birthdayAutomationEnabled !== false) {
      birthdaySchedule = await WishflowService.syncContactBirthdayAutomation(updated.id);
    }
    res.json({ ...updated, groupIds: selectedGroups ?? undefined, birthdaySchedule });
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'This phone number is already saved in GreetSync.' });
    sendRuleError(res, err, 'Failed to update contact.');
  }
});

app.delete('/api/contacts/:id', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
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

// CSV/Excel import. Name and Phone are mandatory; the remaining columns are optional.
app.post('/api/contacts/import', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Import contacts from a business account.' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'No contact rows were provided. Name and Phone are mandatory columns.' });
    if (rows.length > 10000) return res.status(400).json({ error: 'CSV/Excel imports are limited to 10,000 contact rows per file.' });
    const groupName = importGroupName(req.body?.createGroupName);
    const importedContactIds: number[] = [];

    let imported = 0, skipped = 0, failed = 0;
    const errors: any[] = [];
    const birthdayContactIds: number[] = [];
    const group = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(45872, ${req.user!.id})`);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || {};
        const name = contactName(row.name);
        const rawPhoneValue = String(row.phone || '').trim();
        if (!name || !rawPhoneValue) {
          failed++;
          errors.push({ row: i + 2, error: !name && !rawPhoneValue ? 'Missing mandatory Name and Phone fields' : !name ? 'Missing mandatory Name field' : 'Missing mandatory Phone field' });
          continue;
        }
        if (!isValidPersonName(name)) {
          failed++;
          errors.push({ row: i + 2, error: 'Invalid contact name' });
          continue;
        }
        const country = String(row.country_code || '').replace(/\D/g, '');
        let rawPhone = rawPhoneValue;
        if (!rawPhoneValue.startsWith('+')) {
          const national = rawPhoneValue.replace(/\D/g, '');
          rawPhone = country ? `+${country}${national}` : (national.length === 10 ? `+91${national}` : `+${national}`);
        }
        const check = validateInternationalPhone(rawPhone);
        if (!check.ok) { failed++; errors.push({ row: i + 2, error: check.error }); continue; }

        const [dupe] = await tx.select({ id: contacts.id }).from(contacts)
          .where(and(eq(contacts.ownerUserId, req.user!.id), eq(contacts.phone, check.normalized!))).limit(1);
        if (dupe) { skipped++; importedContactIds.push(dupe.id); continue; }

        const email = String(row.email || '').trim();
        if (email && !isValidEmailSyntax(email)) { failed++; errors.push({ row: i + 2, error: 'Invalid email format' }); continue; }
        const rawNotes = String(row.notes || '').trim();
        if (rawNotes.length > 128) { failed++; errors.push({ row: i + 2, error: 'Notes exceed 128 characters' }); continue; }
        const rawOptIn = String(row.opt_in ?? '').trim().toLowerCase();
        const importedOptIn = rawOptIn === '' ? true : ['true','1','yes','y','on'].includes(rawOptIn);
        let importedDob: string | null = null;
        try { importedDob = validIsoBirthDate(row.date_of_birth); } catch (error: any) {
          failed++; errors.push({ row: i + 2, error: error.message || 'Invalid date of birth' }); continue;
        }
        const [insertedContact] = await tx.insert(contacts).values({
          ownerUserId: req.user!.id,
          name,
          phone: check.normalized!,
          email: email || null,
          dob: importedDob,
          optIn: importedOptIn,
          birthdayAutomationEnabled: true,
          notes: rawNotes || null,
        }).returning({ id: contacts.id, dob: contacts.dob });
        importedContactIds.push(insertedContact.id);
        if (insertedContact?.id && insertedContact.dob) birthdayContactIds.push(insertedContact.id);
        imported++;
      }
      // Count the contacts already inserted in this transaction exactly once.
      await assertContactCapacity(req.user!.id, 0, tx);
      return await attachImportedGroup(tx, req.user!.id, groupName, importedContactIds);
    });
    let birthdayScheduled = 0;
    let birthdaySchedulingQueued = 0;
    const birthdayErrors: Array<{contactId:number; error:string}> = [];
    const scheduleBirthdayIds = async (ids: number[]) => {
      for (const contactId of ids) {
        try {
          const scheduled = await WishflowService.syncContactBirthdayAutomation(contactId);
          if (scheduled.scheduled) birthdayScheduled++;
          else if (scheduled.message && !/already (scheduled|completed)/i.test(scheduled.message)) birthdayErrors.push({ contactId, error: scheduled.message });
        } catch (error: any) {
          birthdayErrors.push({ contactId, error: error?.message || 'Birthday scheduling failed' });
        }
      }
    };
    // Keep small imports synchronous so the user immediately sees the result.
    // Large imports are queued after the response so a 10,000-row import cannot
    // time out while birthday jobs are being generated.
    if (birthdayContactIds.length <= 50) {
      await scheduleBirthdayIds(birthdayContactIds);
    } else {
      birthdaySchedulingQueued = birthdayContactIds.length;
      setImmediate(() => scheduleBirthdayIds(birthdayContactIds).catch((error) => console.warn('Birthday import scheduling notice:', error?.message)));
    }
    res.json({ success: true, imported, skipped, failed, group, birthdayScheduled, birthdaySchedulingQueued, birthdayErrors: birthdayErrors.slice(0, 25), errors: errors.slice(0, 100) });
  } catch (err: any) { sendRuleError(res, err, 'Contact import failed.'); }
});

app.post('/api/contacts/import-device', requireAuth, requireActiveBusinessPackage, async (req:AuthRequest,res)=>{
  try {
    if(req.user?.role==='admin') return res.status(403).json({error:'Import contacts from a business account.'});
    const rows=Array.isArray(req.body?.rows)?req.body.rows:[];
    if(!rows.length) return res.status(400).json({error:'Select at least one phone contact.'});
    if(rows.length>10000) return res.status(400).json({error:'You can import at most 10,000 contacts at once.'});
    const groupName = importGroupName(req.body?.createGroupName);
    const importedContactIds: number[] = [];
    let imported=0,skipped=0,failed=0; const errors:any[]=[];
    const group = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(45872, ${req.user!.id})`);
      for(let i=0;i<rows.length;i++){
        const row=rows[i]||{};
        const name=contactName(row.name)||'Phone contact';
        const check=validateInternationalPhone(String(row.phone||''));
        if(!check.ok){failed++;errors.push({row:i+1,name,error:check.error});continue;}
        const [dupe]=await tx.select({id:contacts.id}).from(contacts).where(and(eq(contacts.ownerUserId,req.user!.id),eq(contacts.phone,check.normalized!))).limit(1);
        if(dupe){skipped++;importedContactIds.push(dupe.id);continue;}
        let avatarData: string | null = null;
        try { avatarData = validateImageData(row.avatarData, 900_000); } catch (error: any) {
          errors.push({row:i+1,name,error:error.message||'Invalid contact photo'}); failed++; continue;
        }
        const [insertedContact] = await tx.insert(contacts).values({
          ownerUserId:req.user!.id,
          name,
          phone:check.normalized!,
          optIn:true,
          birthdayAutomationEnabled:false,
          avatarData,
          notes:'Imported from device contacts. WhatsApp opt-in is enabled by default and can be changed from contact settings.',
        }).returning({id:contacts.id});
        importedContactIds.push(insertedContact.id);
        imported++;
      }
      // Count the contacts already inserted in this transaction exactly once.
      await assertContactCapacity(req.user!.id, 0, tx);
      return await attachImportedGroup(tx, req.user!.id, groupName, importedContactIds);
    });
    res.json({success:true,imported,skipped,failed,group,errors:errors.slice(0,100)});
  } catch(err:any){sendRuleError(res,err,'Device contact import failed.');}
});

app.get('/api/contact-groups', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.json([]);
    const search = String(req.query?.search || '').trim().toLowerCase();
    const groups = await db.select().from(contactGroups)
      .where(eq(contactGroups.ownerUserId, req.user!.id))
      .orderBy(desc(contactGroups.createdAt));
    const filtered = search ? groups.filter((group) => group.name.toLowerCase().includes(search)) : groups;
    const out = [];
    for (const group of filtered) {
      const [memberCount] = await db.select({ val: count() }).from(contactGroupMembers).where(eq(contactGroupMembers.groupId, group.id));
      out.push({ ...group, memberCount: Number(memberCount?.val || 0) });
    }
    res.json(out);
  } catch (err: any) { res.status(500).json({ error: err.message || 'Failed to load groups.' }); }
});

app.post('/api/contact-groups', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Create groups from a business account.' });
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const contactIds: number[] = Array.isArray(req.body?.contactIds)
      ? Array.from(new Set<number>(
          req.body.contactIds
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isInteger(value) && value > 0),
        ))
      : [];
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Group name must contain 2-80 characters.' });
    const [duplicate] = await db.select({ id: contactGroups.id }).from(contactGroups)
      .where(and(eq(contactGroups.ownerUserId, req.user!.id), sql`lower(${contactGroups.name}) = lower(${name})`)).limit(1);
    if (duplicate) return res.status(409).json({ error: 'A group with this name already exists.' });
    const [group] = await db.insert(contactGroups).values({ ownerUserId: req.user!.id, name, description: description || null }).returning();
    if (contactIds.length) {
      const owned = await db.select({id: contacts.id}).from(contacts)
        .where(and(eq(contacts.ownerUserId, req.user!.id), inArray(contacts.id, contactIds)));
      for (const contact of owned) await db.insert(contactGroupMembers).values({ groupId: group.id, contactId: contact.id }).onConflictDoNothing();
    }
    res.status(201).json(group);
  } catch (err: any) {
    if (err?.code === '23505') return res.status(409).json({ error: 'A group with this name already exists.' });
    sendRuleError(res, err, 'Failed to create group.');
  }
});

app.get('/api/contact-groups/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [group] = await db.select().from(contactGroups).where(and(eq(contactGroups.id,id), eq(contactGroups.ownerUserId, req.user!.id))).limit(1);
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    const members = await db.select({
      id: contacts.id,
      name: contacts.name,
      phone: contacts.phone,
      optIn: contacts.optIn,
      dob: contacts.dob,
      avatarData: contacts.avatarData,
    }).from(contactGroupMembers).innerJoin(contacts, eq(contactGroupMembers.contactId, contacts.id))
      .where(eq(contactGroupMembers.groupId,id));
    res.json({ group, members: members.map(member=>({...member,name:contactName(member.name)})) });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Failed to load group.' }); }
});

app.put('/api/contact-groups/:id', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [group] = await db.select().from(contactGroups)
      .where(and(eq(contactGroups.id,id),eq(contactGroups.ownerUserId,req.user!.id))).limit(1);
    if(!group) return res.status(404).json({error:'Group not found.'});
    const name=String(req.body?.name ?? group.name).trim();
    const description=String(req.body?.description ?? group.description ?? '').trim();
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Group name must contain 2-80 characters.' });
    const [duplicate] = await db.select({ id: contactGroups.id }).from(contactGroups).where(and(
      eq(contactGroups.ownerUserId, req.user!.id),
      sql`lower(${contactGroups.name}) = lower(${name})`,
      sql`${contactGroups.id} <> ${id}`,
    )).limit(1);
    if (duplicate) return res.status(409).json({ error: 'A group with this name already exists.' });

    await db.update(contactGroups).set({name,description:description||null,updatedAt:new Date()}).where(eq(contactGroups.id,id));
    if(Array.isArray(req.body?.contactIds)){
      await db.delete(contactGroupMembers).where(eq(contactGroupMembers.groupId,id));
      const ids: number[] = Array.from(new Set<number>(
        req.body.contactIds
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value > 0),
      ));
      if(ids.length){
        const owned=await db.select({id:contacts.id}).from(contacts)
          .where(and(eq(contacts.ownerUserId,req.user!.id),inArray(contacts.id,ids)));
        for(const contact of owned) await db.insert(contactGroupMembers).values({groupId:id,contactId:contact.id}).onConflictDoNothing();
      }
    }
    res.json({success:true});
  } catch(err:any){sendRuleError(res,err,'Failed to update group.');}
});

app.delete('/api/contact-groups/:id', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest,res)=>{
  try{
    const id=Number(req.params.id);
    const deleted=await db.delete(contactGroups).where(and(eq(contactGroups.id,id),eq(contactGroups.ownerUserId,req.user!.id))).returning({id:contactGroups.id});
    if(!deleted.length)return res.status(404).json({error:'Group not found.'});
    res.json({success:true});
  }catch(err:any){res.status(500).json({error:err.message||'Failed to delete group.'});}
});

/* =========================================================================
   5. TEMPLATES (OFFICIAL META SYNC & LISTING)
   ========================================================================= */

// Template helpers. WhatsApp placeholders are represented by {{1}}, {{2}}, ...
// GreetSync also counts named placeholders for local drafts so the details screen
// never incorrectly reports zero variables.
function extractVariableTokens(components: any[]): string[] {
  const tokens = new Set<string>();
  if (!Array.isArray(components)) return [];
  for (const component of components) {
    const text = String(component?.text || '');
    for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      const token = String(match[1] || '').trim();
      if (token) tokens.add(token);
    }
  }
  return [...tokens];
}

function extractVariableCount(components: any[]): number {
  if (!Array.isArray(components)) return 0;
  let total = 0;
  for (const component of components) {
    const seen = new Set<string>();
    const text = String(component?.text || '');
    for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      const token = String(match[1] || '').trim();
      if (token) seen.add(token);
    }
    total += seen.size;
  }
  return total;
}

function extractTemplateVariableRequirements(components: any[]): Array<{section:'HEADER'|'BODY';token:string;meaning:string}> {
  const requirements: Array<{section:'HEADER'|'BODY';token:string;meaning:string}> = [];
  if (!Array.isArray(components)) return requirements;
  for (const component of components) {
    const section=String(component?.type||'').toUpperCase();
    if(section!=='HEADER'&&section!=='BODY') continue;
    const text=String(component?.text||'');
    const meanings=component?.greetsync_variable_meanings && typeof component.greetsync_variable_meanings==='object' ? component.greetsync_variable_meanings as Record<string,unknown> : {};
    const seen=new Set<string>();
    for(const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)){
      const token=String(match[1]||'').trim();
      if(!token||seen.has(token)) continue;
      seen.add(token);
      requirements.push({section:section as 'HEADER'|'BODY',token,meaning:String(meanings[token]||'CUSTOM').toUpperCase()});
    }
  }
  return requirements;
}

function calculateAgeOnDate(dob: unknown, referenceDate: Date): string | null {
  const raw = String(dob ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (!year || !month || !day) return null;
  let age = referenceDate.getFullYear() - year;
  const beforeBirthday = (referenceDate.getMonth() + 1) < month || ((referenceDate.getMonth() + 1) === month && referenceDate.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? String(age) : null;
}

function formatTemplateDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function automaticTemplateVariableValue(meaning: string, contact: any, referenceDate: Date, business?: any): string | null {
  const normalized = String(meaning || '').toUpperCase();
  if(normalized.startsWith('BUSINESS_')) return businessVariableValue(normalized,business);
  const fullName = String(contact?.name || '').trim();
  switch (normalized) {
    case 'CONTACT_NAME': return fullName || null;
    case 'FIRST_NAME': return fullName ? fullName.split(/\s+/)[0] : null;
    case 'AGE': return calculateAgeOnDate(contact?.dob, referenceDate);
    case 'PHONE': return String(contact?.phone || '').trim() || null;
    case 'EMAIL': return String(contact?.email || '').trim() || null;
    case 'BIRTHDAY_DATE': return formatTemplateDate(contact?.dob);
    case 'SCHEDULED_DATE': return `${String(referenceDate.getDate()).padStart(2,'0')}-${String(referenceDate.getMonth()+1).padStart(2,'0')}-${referenceDate.getFullYear()}`;
    case 'SCHEDULED_TIME': return `${String(referenceDate.getHours()).padStart(2,'0')}:${String(referenceDate.getMinutes()).padStart(2,'0')}`;
    case 'SCHEDULED_DATE_TIME': return `${String(referenceDate.getDate()).padStart(2,'0')}-${String(referenceDate.getMonth()+1).padStart(2,'0')}-${referenceDate.getFullYear()} ${String(referenceDate.getHours()).padStart(2,'0')}:${String(referenceDate.getMinutes()).padStart(2,'0')}`;
    default: return null;
  }
}

function resolveTemplateVariablesForContact(components:any[], supplied:unknown, contact:any, referenceDate:Date=new Date(), business?:any):Record<string,string>{
  const input=supplied&&typeof supplied==='object'&&!Array.isArray(supplied)?supplied as Record<string,unknown>:{};
  const result:Record<string,string>={};
  const contactName=String(contact?.name||'').trim();
  const markerValues:Record<string,string>={
    name:contactName,
    first_name:contactName ? contactName.split(/\s+/)[0] : '',
    age:calculateAgeOnDate(contact?.dob,referenceDate)||'',
    phone:String(contact?.phone||'').trim(),
    email:String(contact?.email||'').trim(),
    birthday:formatTemplateDate(contact?.dob)||'',
  };
  for(const [key,value] of Object.entries(input)){
    let text=String(value??'').trim();
    for(const [marker,replacement] of Object.entries(markerValues)) text=text.replace(new RegExp(`\{\{${marker}\}\}`,'gi'),replacement);
    if(text) result[String(key)]=text;
  }
  for(const requirement of extractTemplateVariableRequirements(components)){
    const key=requirement.section==='HEADER'?`header_${requirement.token}`:requirement.token;
    if(!result[key]){
      const automatic=automaticTemplateVariableValue(requirement.meaning,contact,referenceDate,business);
      if(automatic) result[key]=automatic;
    }
    if(!result[key]) throw Object.assign(new Error(`Template variable {{${requirement.token}}} (${requirement.section.toLowerCase()}) requires ${requirement.meaning.replaceAll('_',' ').toLowerCase()} information for ${contactName || 'the selected contact'}.`),{statusCode:400});
  }
  return result;
}

function mergeTemplateLocalMetadata(localComponents:any, metaComponents:any[]):any[]{
  const local=Array.isArray(localComponents)?localComponents:[];
  return (Array.isArray(metaComponents)?metaComponents:[]).map((remote:any)=>{
    const out={...remote};
    const type=String(remote?.type||'').toUpperCase();
    const matching=local.find((item:any)=>String(item?.type||'').toUpperCase()===type);
    if(matching?.greetsync_variable_meanings) out.greetsync_variable_meanings=matching.greetsync_variable_meanings;
    if(matching?.greetsync_location) out.greetsync_location=matching.greetsync_location;
    if(matching?.greetsync_media_preview) out.greetsync_media_preview=matching.greetsync_media_preview;
    return out;
  });
}

async function validatePublishedFlows(userId:number,components:any[]) {
  const flows=components.find(c=>c.type==='BUTTONS')?.buttons?.filter((b:any)=>b.type==='FLOW')||[];
  if(!flows.length)return;
  const creds=await resolveWhatsAppCredentials(userId);
  for(const flow of flows){
    const value:any=await metaGraphJson(`https://graph.facebook.com/${creds.apiVersion}/${encodeURIComponent(flow.flow_id)}?fields=id,status,whatsapp_business_account`,{headers:{Authorization:`Bearer ${creds.accessToken}`}});
    if(value.status!=='PUBLISHED')throw Object.assign(new Error('Publish your WhatsApp Flow in Meta before submitting a Flow template.'),{statusCode:400});
    if(value.whatsapp_business_account?.id && String(value.whatsapp_business_account.id)!==String(creds.businessAccountId))throw Object.assign(new Error('Choose a Flow from your own WhatsApp Business Account.'),{statusCode:400});
  }
}

function validateTemplateCategory(value: unknown): string {
  const category = String(value || 'MARKETING').toUpperCase();
  if (!['MARKETING','UTILITY'].includes(category)) {
    throw Object.assign(new Error('Invalid template category.'), { statusCode: 400 });
  }
  return category;
}

app.get('/api/template-suggestions', requireAuth, async (req:AuthRequest,res)=>{
  try {
    if(req.user?.role==='admin') return res.json([]);
    const now=new Date();
    const rows=await db.select().from(templateSuggestions).where(eq(templateSuggestions.isActive,true)).orderBy(desc(templateSuggestions.updatedAt));
    res.json(rows.filter((row:any)=>{
      const from=row.activeFrom?new Date(row.activeFrom):null; const until=row.activeUntil?new Date(row.activeUntil):null;
      return (!from||from<=now)&&(!until||until>=now);
    }));
  } catch(e:any){res.status(500).json({error:e.message||'Failed to load template suggestions.'});}
});

// GET message templates
const getTemplatesHandler = async (req: AuthRequest, res: any) => {
  try {
    if (!isDatabaseConnected) return res.status(503).json({ error: 'Database is not connected.' });
    if (req.user?.role === 'admin') {
      return res.json(await db.select().from(messageTemplates).orderBy(desc(messageTemplates.updatedAt)));
    }
    const list = await db.select().from(messageTemplates).where(eq(messageTemplates.ownerUserId, req.user!.id)).orderBy(desc(messageTemplates.updatedAt));
    // Approved templates are shown only when they are tied to a real Meta template id for this business. Local DRAFT/PENDING/REJECTED rows remain visible.
    // DELETED is an internal archive state used when message history still references a template.
    res.json(list.filter((row:any) => {
      const status=String(row.status||'').toUpperCase();
      if(status==='DELETED') return false;
      return status !== 'APPROVED' || Boolean(String(row.metaTemplateId||'').trim());
    }));
  } catch (err: any) { res.status(500).json({ error: err.message || 'Failed to load templates.' }); }
};

app.get('/api/whatsapp/templates', requireAuth, getTemplatesHandler);
app.get('/api/templates', requireAuth, getTemplatesHandler);

// SYNC templates from the logged-in business user's Meta account.
app.post('/api/whatsapp/templates/sync', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Template sync is performed from a business account.' });
    const creds = await resolveWhatsAppCredentials(req.user!.id);
    if (!creds.businessAccountId || !creds.accessToken) {
      return res.status(400).json({ error: 'Connect your WhatsApp Business account in Settings first.' });
    }
    const metaRes = await WhatsAppService.fetchTemplates(creds.businessAccountId, creds.accessToken, creds.apiVersion);
    if (!metaRes.success || !metaRes.templates) return res.status(400).json({ error: metaRes.error || 'Failed to fetch templates from Meta.' });
    let syncedCount = 0;
    for (const metaTemplate of metaRes.templates) {
      const [existingTemplate] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.ownerUserId, req.user!.id), eq(messageTemplates.metaTemplateId, metaTemplate.id))).limit(1);
      const mergedComponents = mergeTemplateLocalMetadata(existingTemplate?.components, metaTemplate.components as any[]);
      const variableCount = extractVariableCount(mergedComponents);
      await db.insert(messageTemplates).values({
        ownerUserId: req.user!.id,
        metaTemplateId: metaTemplate.id,
        name: metaTemplate.name,
        displayName: metaTemplate.name,
        language: metaTemplate.language,
        category: metaTemplate.category,
        status: metaTemplate.status,
        components: mergedComponents,
        variableCount,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: messageTemplates.metaTemplateId,
        set: {
          ownerUserId: req.user!.id,
          name: metaTemplate.name,
          language: metaTemplate.language,
          category: metaTemplate.category,
          status: metaTemplate.status,
          components: mergedComponents,
          variableCount,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      syncedCount++;
    }
    const metaIds = new Set(metaRes.templates.map((t:any)=>String(t.id||'')).filter(Boolean));
    const approvedLocal = await db.select().from(messageTemplates).where(and(eq(messageTemplates.ownerUserId, req.user!.id), eq(messageTemplates.status,'APPROVED')));
    for (const row of approvedLocal) { if (!row.metaTemplateId || !metaIds.has(String(row.metaTemplateId))) await db.update(messageTemplates).set({status:'DELETED',updatedAt:new Date()}).where(eq(messageTemplates.id,row.id)); }
    res.json({ success: true, syncedCount, message: `Synchronized ${syncedCount} templates from Meta.` });
  } catch (err: any) {
    sendRuleError(res, err, 'Template synchronization failed.');
  }
});

// Upload a template media review sample using Meta's Resumable Upload API.
app.post('/api/whatsapp/templates/media-sample', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Upload template media from a business account.' });
    const fileName=String(req.body?.fileName||'').trim();
    const mimeType=String(req.body?.mimeType||'').trim();
    const dataBase64=String(req.body?.dataBase64||'').trim();
    if(!fileName||!mimeType||!dataBase64) return res.status(400).json({error:'File name, MIME type and file data are required.'});
    const allowed=['image/jpeg','image/png','video/mp4','application/pdf'];
    if(!allowed.includes(mimeType)) return res.status(400).json({error:'Unsupported media sample type.'});
    let bytes:Buffer;
    try{ bytes=decodeMediaFile(dataBase64); }catch{ return res.status(400).json({error:'Invalid media file data.'}); }
    const sampleLimit=mimeType.startsWith('image/')?5*1024*1024:16*1024*1024;
    if(!bytes.length||bytes.length>sampleLimit) return res.status(400).json({error:`Media sample must be between 1 byte and ${sampleLimit/1024/1024} MB.`});
    const creds=await resolveWhatsAppCredentials(req.user!.id);
    await validateMediaFile(bytes,mimeType);
    if(!creds.accessToken) return res.status(400).json({error:'Connect your WhatsApp Business account before uploading a template media sample.'});
    const platform=await metaPlatformConfig();
    if(!platform.appId) return res.status(503).json({error:'Meta App ID is not configured by the GreetSync administrator.'});
    const result=await WhatsAppService.uploadTemplateMediaSample({appId:platform.appId,accessToken:creds.accessToken,apiVersion:creds.apiVersion,fileName,mimeType,bytes});
    if(!result.success||!result.handle) return res.status(400).json({error:result.error||'Meta media upload failed.'});
    res.json({success:true,handle:result.handle});
  } catch(err:any){ sendRuleError(res,err,'Template media upload failed.'); }
});

// Upload media that will be used when an approved media-header template is
// actually sent. A template review header_handle is NOT a send-time media id.
// Meta requires the outgoing template message to include an IMAGE/VIDEO/
// DOCUMENT header parameter with a real media id (or supported public link).
app.post('/api/whatsapp/media/upload', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    if(req.user?.role==='admin') return res.status(403).json({error:'Upload message media from a business account.'});
    const fileName=String(req.body?.fileName||'').trim() || 'greetsync-media';
    const mimeType=String(req.body?.mimeType||'').trim();
    const dataBase64=String(req.body?.dataBase64||'').trim();
    const mediaType=String(req.body?.mediaType||'').trim().toUpperCase();
    if(!mimeType||!dataBase64||!['IMAGE','VIDEO','DOCUMENT'].includes(mediaType)) return res.status(400).json({error:'Media type, MIME type and file data are required.'});
    if(!messageMediaMimeTypes[mediaType]?.includes(mimeType)) return res.status(400).json({error:'The selected file type does not match the required template media.'});
    const limits:Record<string,number>={IMAGE:5*1024*1024,VIDEO:16*1024*1024,DOCUMENT:16*1024*1024};
    let bytes:Buffer;
    try{bytes=decodeMediaFile(dataBase64);}catch{return res.status(400).json({error:'Invalid media file data.'});}
    if(!bytes.length||bytes.length>limits[mediaType]) return res.status(400).json({error:`${mediaType.toLowerCase()} file exceeds GreetSync’s ${limits[mediaType]/1024/1024} MB limit.`});
    await validateMediaFile(bytes,mimeType);
    const creds=await resolveWhatsAppCredentials(req.user!.id);
    if(!creds.phoneNumberId||!creds.accessToken) return res.status(400).json({error:'Connect your WhatsApp Business account before uploading message media.'});
    const result=await WhatsAppService.uploadMessageMedia({phoneNumberId:creds.phoneNumberId,accessToken:creds.accessToken,apiVersion:creds.apiVersion,fileName,mimeType,bytes});
    if(!result.success||!result.mediaId) return res.status(400).json({error:result.error||'WhatsApp media upload failed.'});
    await pool.query('INSERT INTO message_media(media_id,owner_user_id,mime_type,file_name,data_base64) VALUES($1,$2,$3,$4,$5) ON CONFLICT(media_id) DO NOTHING',[result.mediaId,req.user!.id,mimeType,fileName,dataBase64]);
    res.json({success:true,mediaId:result.mediaId,mediaType,mimeType,fileName,uploadedAt:new Date().toISOString()});
  } catch(err:any){ sendRuleError(res,err,'WhatsApp message media upload failed.'); }
});

// Authenticated preview retrieval. Media is never exposed through a public URL.
app.get('/api/whatsapp/media/:id/preview',requireAuth,async(req:AuthRequest,res)=>{
  try{const result=await pool.query('SELECT mime_type,file_name,data_base64 FROM message_media WHERE media_id=$1 AND owner_user_id=$2',[String(req.params.id),req.user!.id]);
    const row=result.rows[0];if(!row)return res.status(404).json({error:'Saved media preview is unavailable. The WhatsApp media ID is still recorded.'});
    res.set('Cache-Control','private, no-store');res.json({mimeType:row.mime_type,fileName:row.file_name,dataBase64:row.data_base64});
  }catch(e:any){res.status(500).json({error:'Unable to load media preview.'});}
});
app.get('/api/admin/message-media/:id/preview',requireAuth,requireAdmin,async(req,res)=>{
  try { const preview=await savedMediaPreview(String(req.params.id),{admin:true},pool);
    if(!preview)return res.status(404).json({error:'Saved media preview is unavailable.'});
    res.set('Cache-Control','private, no-store');res.json(preview);
  }catch(e:any){res.status(500).json({error:'Unable to load media preview.'});}
});
// AI only proposes content. Draft saving and Meta submission require the existing user confirmation flow.
const aiGenerationWindows=new Map<number,{started:number;count:number;busy:boolean}>();
const aiChecks=new Map<number,number>();
function aiFailure(res:any,error:any){
  const reference='ai_'+randomBytes(6).toString('hex');
  const code=error?.code||'AI_UNAVAILABLE';
  // Never log a key, prompt, profile, raw provider message or request URL.
  console.warn('[AI]',JSON.stringify({reference,code,providerStatus:error?.providerStatus||null,networkCode:error?.networkCode||null}));
  res.status(error?.statusCode||502).json({error:`${error?.message||'AI generation failed.'} Reference: ${reference}`,code,reference});
}
app.post('/api/whatsapp/templates/ai-check',requireAuth,requireActiveBusinessPackage,async(req:AuthRequest,res)=>{
  if(req.user?.role==='admin')return res.status(403).json({error:'Check AI from a business account.'});
  const now=Date.now(),id=req.user!.id;
  for(const [owner,time] of aiChecks)if(now-time>60000)aiChecks.delete(owner);
  if(now-(aiChecks.get(id)||0)<10000)return res.status(429).json({error:'Wait ten seconds before checking AI again.'});
  aiChecks.set(id,now);
  try{res.json({...await checkAiConfiguration(),serverBuild:'webhook-fields-dynamic-ai-20261006'});}
  catch(error:any){aiFailure(res,error);}
});
app.post('/api/whatsapp/templates/ai-generate',requireAuth,requireActiveBusinessPackage,async(req:AuthRequest,res)=>{
  if(req.user?.role==='admin')return res.status(403).json({error:'Generate templates from a business account.'});
  const userId=req.user!.id, now=Date.now();
  // Short-lived per-account quota and one in-flight request prevent accidental repeated charges.
  for(const [id,value] of aiGenerationWindows)if(now-value.started>=3600000&&!value.busy)aiGenerationWindows.delete(id);
  const window=aiGenerationWindows.get(userId)||{started:now,count:0,busy:false};
  if(window.busy||window.count>=20)return res.status(429).json({error:window.busy?'A template is already being generated. Please wait.':'AI generation limit reached. Try again in an hour.'});
  window.busy=true;window.count++;aiGenerationWindows.set(userId,window);
  try {
    const [business]=await db.select().from(users).where(eq(users.id,userId)).limit(1);
    if(!business)return res.status(404).json({error:'Business profile not found.'});
    res.json({draft:await generateAiTemplate(req.body,business)});
  }catch(err:any){
    if(['AI_KEY_MISSING','AI_KEY_FORMAT','AI_MODEL_INVALID','AI_KEY_REJECTED','AI_PERMISSION_DENIED','AI_MODEL_UNAVAILABLE','AI_PROJECT_SETUP','AI_REQUEST_REJECTED'].includes(err?.code))window.count=Math.max(0,window.count-1);
    aiFailure(res,err);
  }
  finally{window.busy=false;}
});

app.post('/api/whatsapp/templates/category-check',requireAuth,(req:AuthRequest,res)=>res.json({advice:categoryAdvice(String(req.body?.category),String(req.body?.body||''),req.body?.buttons||[])}));

// Create a local draft and optionally submit it to Meta. The user-facing
// displayName may be Hindi/Unicode; Meta receives a compliant lowercase slug.
app.post('/api/whatsapp/templates', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Create templates from a business account.' });
    const displayName = String(req.body?.displayName ?? req.body?.name ?? '').trim();
    if (displayName.length < 3 || displayName.length > 512) {
      return res.status(400).json({ error: 'Template name must contain 3-512 characters.' });
    }
    const name = toMetaTemplateName(String(req.body?.metaName || displayName), req.user!.id);
    const category = validateTemplateCategory(req.body?.category);
    const language = String(req.body?.language || 'en_US').trim() || 'en_US';
    const header = String(req.body?.header || '').trim();
    const body = String(req.body?.body || '').trim();
    const footer = String(req.body?.footer || '').trim();
    const submitToMeta = req.body?.submitToMeta === true;
    validateTemplateSetup({...req.body,category,language});
    const components = buildTemplateComponents(
      header,
      body,
      footer,
      req.body?.buttons,
      String(req.body?.mediaFormat||'NONE'),
      String(req.body?.mediaHandle||''),
      req.body?.headerSamples,
      req.body?.bodySamples,
      req.body?.headerMeanings,
      req.body?.bodyMeanings,
      req.body?.locationSample,
      req.body?.mediaPreview,
      req.body?.submitToMeta===true,
    );
    if(req.body?.submitToMeta===true) await validatePublishedFlows(req.user!.id,components);
    const variableCount = extractVariableCount(components);

    const [draft] = await db.insert(messageTemplates).values({
      ownerUserId:req.user!.id,
      metaTemplateId:null,
      name,
      displayName,
      language,
      category,
      status:'DRAFT',
      components,
      variableCount,
      lastSyncedAt:new Date(),
      updatedAt:new Date(),
    }).returning();

    if (!submitToMeta) return res.status(201).json(draft);
    const creds=await resolveWhatsAppCredentials(req.user!.id);
    if(!creds.businessAccountId||!creds.accessToken) {
      return res.status(201).json({...draft,submitError:'Template saved as DRAFT. Connect WhatsApp Business before submitting to Meta.'});
    }
    const result=await WhatsAppService.createTemplate({
      businessAccountId:creds.businessAccountId,
      accessToken:creds.accessToken,
      apiVersion:creds.apiVersion,
      name,
      category,
      language,
      components,
    });
    if(!result.success) return res.status(201).json({...draft,submitError:result.error||'Meta submission failed. Draft was kept.'});
    const [updated]=await db.update(messageTemplates).set({
      metaTemplateId:result.id||null,
      category:result.category||category,
      status:result.status||'PENDING',
      updatedAt:new Date(),
      lastSyncedAt:new Date(),
    }).where(eq(messageTemplates.id,draft.id)).returning();
    res.status(201).json(updated);
  } catch (err:any) { sendRuleError(res, err, 'Failed to save template.'); }
});

// Meta-backed edits preserve the template ID and wait for a new approval.
app.put('/api/whatsapp/templates/:id', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Edit templates from a business account.' });
    const id = Number(req.params.id);
    const [existing] = await db.select().from(messageTemplates).where(and(
      eq(messageTemplates.id, id),
      eq(messageTemplates.ownerUserId, req.user!.id),
    )).limit(1);
    if (!existing) return res.status(404).json({ error: 'Template not found.' });

    const currentStatus = String(existing.status || '').toUpperCase();
    if (!['DRAFT','APPROVED','REJECTED','PAUSED'].includes(currentStatus)) return res.status(409).json({error:'Only Draft, Approved, Rejected or Paused templates can be edited. Sync the latest Meta status first.'});
    if (currentStatus.includes('PENDING')) {
      return res.status(409).json({ error: 'A template pending Meta review cannot be edited until review is complete.' });
    }

    const displayName = String(req.body?.displayName ?? req.body?.name ?? existing.displayName ?? existing.name).trim();
    if (displayName.length < 3 || displayName.length > 512) {
      return res.status(400).json({ error: 'Template name must contain 3-512 characters.' });
    }
    let name = toMetaTemplateName(String(req.body?.metaName || displayName), req.user!.id);
    if (existing.metaTemplateId) name = existing.name;
    const category = validateTemplateCategory(req.body?.category ?? existing.category);
    const language = String(req.body?.language ?? existing.language ?? 'en_US').trim() || 'en_US';
    const header = String(req.body?.header || '').trim();
    const body = String(req.body?.body || '').trim();
    const footer = String(req.body?.footer || '').trim();
    const components = buildTemplateComponents(
      header,
      body,
      footer,
      req.body?.buttons,
      String(req.body?.mediaFormat||'NONE'),
      String(req.body?.mediaHandle||''),
      req.body?.headerSamples,
      req.body?.bodySamples,
      req.body?.headerMeanings,
      req.body?.bodyMeanings,
      req.body?.locationSample,
      req.body?.mediaPreview,
      req.body?.submitToMeta===true,
    );
    if(req.body?.submitToMeta===true) await validatePublishedFlows(req.user!.id,components);
    const variableCount = extractVariableCount(components);
    const submitToMeta = req.body?.submitToMeta === true;

    validateTemplateSetup({...req.body,category,language});
    if(existing.metaTemplateId) {
      if(currentStatus==='APPROVED' && category!==existing.category) return res.status(400).json({error:'Meta does not allow changing the category of an approved template. Duplicate this template to create one in another category.'});
      if(language!==existing.language) return res.status(400).json({error:'The language of a Meta template cannot be changed. Duplicate it to use another language.'});
      const variableFormat=(cs:any[])=>cs.some((c:any)=>/\{\{\s*[a-z_]/.test(String(c.text||'')))?'NAMED':'POSITIONAL';
      if(submitToMeta && variableFormat(components)!==variableFormat(existing.components as any[]))return res.status(400).json({error:'A Meta template’s Name/Number variable format cannot be changed. Save a new draft to create a separate template.'});
      if(!submitToMeta) {
        // Preserve the live approved template. Save the proposed edit as a separate draft.
        const [copy]=await db.insert(messageTemplates).values({ownerUserId:req.user!.id,metaTemplateId:null,name:`${existing.name.slice(0,470)}_draft_${Date.now()}`,displayName,language,category,status:'DRAFT',components,variableCount,updatedAt:new Date()}).returning();
        return res.json(copy);
      }
      const editRows=await pool.query('SELECT edit_submissions FROM message_templates WHERE id=$1',[id]);
      const history=(editRows.rows[0]?.edit_submissions||[]).map((v:string)=>new Date(v).getTime()).filter((v:number)=>Number.isFinite(v)&&v>Date.now()-30*86400000);
      if(currentStatus==='APPROVED' && (history.some((v:number)=>v>Date.now()-86400000)||history.length>=10)) return res.status(429).json({error:'Approved template edits are limited to once in 24 hours and 10 times in 30 days. Meta may apply additional restrictions.'});
      // Prevent simultaneous edits of this template across requests.
      const client=await pool.connect();
      try {
        await client.query('SELECT pg_advisory_lock($1)',[id]);
        const latest=await client.query('SELECT status,edit_submissions FROM message_templates WHERE id=$1',[id]);
        if(!['APPROVED','REJECTED','PAUSED'].includes(latest.rows[0]?.status)) return res.status(409).json({error:'The template is already being reviewed. Sync its status before editing.'});
        const latestHistory=(latest.rows[0].edit_submissions||[]).map((v:string)=>new Date(v).getTime()).filter((v:number)=>Number.isFinite(v)&&v>Date.now()-30*86400000);
        if(latest.rows[0].status==='APPROVED'&&(latestHistory.some((v:number)=>v>Date.now()-86400000)||latestHistory.length>=10))return res.status(429).json({error:'Approved template edits are limited to once in 24 hours and 10 times in 30 days.'});
        if(latest.rows[0].status==='APPROVED'&&category!==existing.category)return res.status(409).json({error:'The template was approved while editing. Its category cannot now be changed.'});
        const creds=await resolveWhatsAppCredentials(req.user!.id);
        const result=await WhatsAppService.editTemplate({templateId:existing.metaTemplateId,accessToken:creds.accessToken,apiVersion:creds.apiVersion,category:latest.rows[0].status==='APPROVED'?undefined:category,components});
        if(!result.success) return res.status(400).json({error:result.error||'Meta rejected the edit. The original template was preserved.'});
        await client.query('UPDATE message_templates SET components=$2,category=$3,status=$4,display_name=$5,variable_count=$6,updated_at=NOW(),edit_submissions=edit_submissions || $7::jsonb WHERE id=$1',[id,JSON.stringify(components),result.category||category,result.status||'PENDING',displayName,variableCount,JSON.stringify([new Date().toISOString()])]);
        const [updated]=await db.select().from(messageTemplates).where(eq(messageTemplates.id,id)).limit(1);
        return res.json(updated);
      }finally{await client.query('SELECT pg_advisory_unlock($1)',[id]);client.release();}
    }

    const [draft] = await db.update(messageTemplates).set({
      metaTemplateId: null,
      name,
      displayName,
      language,
      category,
      status:'DRAFT',
      components,
      variableCount,
      updatedAt:new Date(),
      lastSyncedAt:new Date(),
    }).where(eq(messageTemplates.id,id)).returning();

    if (!submitToMeta) return res.json(draft);
    const creds=await resolveWhatsAppCredentials(req.user!.id);
    if(!creds.businessAccountId||!creds.accessToken) {
      return res.json({...draft,submitError:'Template saved as DRAFT. Connect WhatsApp Business before submitting to Meta.'});
    }
    const result=await WhatsAppService.createTemplate({
      businessAccountId:creds.businessAccountId,
      accessToken:creds.accessToken,
      apiVersion:creds.apiVersion,
      name,
      category,
      language,
      components,
    });
    if(!result.success) return res.json({...draft,submitError:result.error||'Meta submission failed. Draft was kept.'});
    const [updated]=await db.update(messageTemplates).set({
      metaTemplateId:result.id||null,
      category:result.category||category,
      status:result.status||'PENDING',
      updatedAt:new Date(),
      lastSyncedAt:new Date(),
    }).where(eq(messageTemplates.id,id)).returning();
    res.json(updated);
  } catch (err:any) { sendRuleError(res, err, 'Failed to update template.'); }
});

app.delete('/api/whatsapp/templates/:id', requireAuth, async (req:AuthRequest,res)=>{
  try{
    if(req.user?.role==='admin') return res.status(403).json({error:'Delete templates from a business account.'});
    const id=Number(req.params.id);
    const [template]=await db.select().from(messageTemplates).where(and(eq(messageTemplates.id,id),eq(messageTemplates.ownerUserId,req.user!.id))).limit(1);
    if(!template) return res.status(404).json({error:'Template not found.'});
    const dependent=await db.select({id:automations.id,status:automations.status}).from(automations).where(and(eq(automations.ownerUserId,req.user!.id),eq(automations.templateId,id)));
    const activeIds=dependent.filter((row:any)=>['SCHEDULED','PROCESSING','PAUSED'].includes(String(row.status||'').toUpperCase())).map((row:any)=>row.id);
    if(activeIds.length) return res.status(409).json({error:'This template is used by scheduled, paused or processing messages. Cancel those messages before deleting it.'});
    if(template.metaTemplateId){
      const creds=await resolveWhatsAppCredentials(req.user!.id);
      if(!creds.businessAccountId||!creds.accessToken) return res.status(400).json({error:'Reconnect the WhatsApp Business account before deleting this Meta template.'});
      const result=await WhatsAppService.deleteTemplate({businessAccountId:creds.businessAccountId,accessToken:creds.accessToken,apiVersion:creds.apiVersion,name:template.name,metaTemplateId:String(template.metaTemplateId)});
      if(!result.success) return res.status(400).json({error:result.error||'Meta template deletion failed.'});
    }
    if(dependent.length){
      // Preserve historical automation/message records. The FK uses cascade, so
      // hard-deleting the row would erase those records. Hide it from the UI
      // with an internal archive state instead.
      await db.update(messageTemplates).set({status:'DELETED',updatedAt:new Date()}).where(eq(messageTemplates.id,id));
      return res.json({success:true,archived:true,cancelledAutomations:activeIds.length});
    }
    await db.delete(messageTemplates).where(eq(messageTemplates.id,id));
    res.json({success:true,archived:false,cancelledAutomations:0});
  }catch(err:any){sendRuleError(res,err,'Failed to delete template.');}
});

// Default/starter templates are disabled. Templates come from the connected Meta account or user-created drafts/review states.
app.post('/api/whatsapp/templates/seed-defaults', requireAuth, (_req: AuthRequest, res) => res.status(410).json({ error: 'Default templates are disabled. Sync templates from your connected Meta account.' }));

/* =========================================================================
   6. AUTOMATIONS & SCHEDULING
   ========================================================================= */

const automationSelect = {
  id: automations.id,
  ownerUserId: automations.ownerUserId,
  contactId: automations.contactId,
  templateId: automations.templateId,
  variables: automations.variables,
  scheduledAt: automations.scheduledAt,
  timezone: automations.timezone,
  status: automations.status,
  templateSnapshot: automations.templateSnapshot,
  sendRequestId: automations.sendRequestId,
  executedAt: automations.executedAt,
  errorMessage: automations.errorMessage,
  createdAt: automations.createdAt,
  contactName: contacts.name,
  contactPhone: contacts.phone,
  contactOptIn: contacts.optIn,
  templateName: messageTemplates.name,
  templateLanguage: messageTemplates.language,
  templateStatus: messageTemplates.status,
  templateComponents: messageTemplates.components,
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

async function retryReference(ownerUserId:number, rawId:unknown, recipientIds:number[],duplicateAcknowledged=false):Promise<string|null> {
  if(rawId==null)return null;
  const id=Number(rawId);
  if(!Number.isInteger(id)||id<=0)throw Object.assign(new Error('Invalid original message ID.'),{statusCode:400});
  const [original]=await db.select().from(automations).where(and(eq(automations.id,id),eq(automations.ownerUserId,ownerUserId))).limit(1);
  assertRetrySource(original,ownerUserId,recipientIds,duplicateAcknowledged);
  const records=await db.select().from(messages).where(and(eq(messages.ownerUserId,ownerUserId),eq(messages.automationId,id)));
  if(records.some(record=>marketingRetryAfter(record))||new Date((original?.variables as any)?.__marketing_retry_after||0)>new Date())throw Object.assign(new Error(marketingLimitMessage),{statusCode:409});
  return String(id);
}

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
    const relatedMessages = await db.select().from(messages).where(and(eq(messages.automationId,id),eq(messages.ownerUserId,item.ownerUserId)));
    let diagnosis=explainDelivery(item,relatedMessages);
    try{
      const [account]=await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId,item.ownerUserId)).limit(1);
      const evidence=account?.connectionStatus==='CONNECTED'&&account.businessAccountId&&account.phoneNumberId
        ? await deliveryEvidence(account.businessAccountId,account.phoneNumberId,item.ownerUserId,id,relatedMessages.map(m=>m.whatsappMessageId).filter((v):v is string=>!!v)):null;
      diagnosis=explainDelivery(item,relatedMessages,evidence,account);
    }catch{diagnosis={...diagnosis,diagnosticsWarning:'Received-callback diagnostics could not be refreshed. Showing the saved send result.'};}
    res.json({ automation: item, messages: relatedMessages, deliveryDiagnosis:diagnosis });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load automation.' });
  }
});

app.post('/api/automations', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === 'admin') return res.status(403).json({ error: 'Create automations from a business account.' });
    const rawIds = Array.isArray(req.body?.contactIds) ? req.body.contactIds : [req.body?.contactId];
    const contactIds: number[] = [...new Set<number>(rawIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0))];
    const tId = Number(req.body?.templateId), variables = req.body?.variables || {}, scheduledAt = req.body?.scheduledAt, timezone = String(req.body?.timezone || 'Asia/Kolkata');
    if (!contactIds.length || !tId || !scheduledAt) return res.status(400).json({ error: 'Audience, template and scheduled date/time are required.' });
    const targetDate = new Date(scheduledAt);
    if (Number.isNaN(targetDate.getTime())) return res.status(400).json({ error: 'Invalid scheduled date or time.' });
    if (targetDate.getTime() <= Date.now()) return res.status(400).json({ error: 'Schedule must be in the future.' });
    const retryOf=await retryReference(req.user!.id,req.body?.retryOfAutomationId,contactIds,req.body?.duplicateAcknowledged===true);
    if(retryOf)Object.assign(variables,{__retry_of:retryOf});
    await assertAutomationCapacity(req.user!.id, contactIds.length);
    await assertMessageCapacity(req.user!.id, contactIds.length, { reserveScheduled: true, scheduledAt: targetDate });
    const [template] = await db.select().from(messageTemplates).where(and(eq(messageTemplates.id,tId),eq(messageTemplates.ownerUserId,req.user!.id))).limit(1);
    if (!template) return res.status(404).json({ error: 'Template not found in your business.' });
    if (template.status !== 'APPROVED') return res.status(400).json({ error: 'Selected template is not Meta-approved yet.' });
    const headerError = templateHeaderError(template.components as any[], variables, targetDate);
    if (headerError) return res.status(400).json({error:headerError});
    const selectedContacts = await db.select().from(contacts).where(and(eq(contacts.ownerUserId,req.user!.id),inArray(contacts.id,contactIds)));
    if (selectedContacts.length !== contactIds.length) return res.status(400).json({ error: 'One or more selected contacts do not belong to your business.' });
    const invalid = selectedContacts.find(c=>!c.optIn);
    if(invalid) return res.status(400).json({ error: `${invalid.name} has not opted in to WhatsApp messages.` });
    // Validate every recipient before writing any jobs; a later missing variable
    // must not leave a partially scheduled batch that repeats when retried.
    const [business]=await db.select().from(users).where(eq(users.id,req.user!.id)).limit(1);
    const jobs=selectedContacts.map(contact => ({ownerUserId:req.user!.id,contactId:contact.id,templateId:template.id,
      templateSnapshot:previewSnapshot(template),variables:resolveTemplateVariablesForContact(template.components as any[], variables, {...contact,name:contactName(contact.name)}, targetDate, business),
      scheduledAt:targetDate,timezone,status:'SCHEDULED'}));
    const created=await db.insert(automations).values(jobs).returning();
    await db.insert(auditLogs).values({action:'AUTOMATION_SCHEDULED',actor:req.user!.phone,details:{automationIds:created.map(x=>x.id),contactIds,templateId:tId,scheduledAt:targetDate.toISOString(),timezone}});
    await createNotification({
      userId: req.user!.id,
      targetRole: 'BUSINESS',
      type: 'AUTOMATION',
      title: 'Automation scheduled',
      message: `${created.length} message${created.length === 1 ? '' : 's'} scheduled using ${template.name}.`,
      entityType: 'AUTOMATION',
      entityId: created[0]?.id || null,
    });
    res.status(201).json({success:true,count:created.length,automations:created,automation:created[0]||null});
  } catch(err:any){sendRuleError(res,err,'Failed to schedule automation.');}
});

app.post('/api/automations/:id/cancel', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const condition = req.user?.role === 'admin' ? eq(automations.id, id) : and(eq(automations.id, id), eq(automations.ownerUserId, req.user!.id));
    const [existing] = await db.select().from(automations).where(condition).limit(1);
    if (!existing) return res.status(404).json({ error: 'Automation not found.' });
    if (['ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'PROCESSING'].includes(existing.status)) return res.status(400).json({ error: `Cannot cancel an automation in ${existing.status} state.` });
    const [updated] = await db.update(automations).set({ status: 'CANCELLED', updatedAt: new Date() }).where(condition).returning();
    res.json({ success: true, automation: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to cancel automation.' });
  }
});

app.post('/api/automations/:id/run', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
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


app.post('/api/automations/:id/pause', requireAuth, requireActiveBusinessPackage, async (req:AuthRequest,res)=>{try{const id=Number(req.params.id);const cond=req.user?.role==='admin'?eq(automations.id,id):and(eq(automations.id,id),eq(automations.ownerUserId,req.user!.id));const [a]=await db.select().from(automations).where(cond).limit(1);if(!a)return res.status(404).json({error:'Automation not found.'});if(!['SCHEDULED','PROCESSING'].includes(a.status))return res.status(409).json({error:`Cannot pause automation in ${a.status} state.`});const [u]=await db.update(automations).set({status:'PAUSED',updatedAt:new Date()}).where(cond).returning();res.json(u);}catch(e:any){res.status(500).json({error:e.message||'Failed to pause automation.'});}});
app.post('/api/automations/:id/run-now', requireAuth, requireActiveBusinessPackage, async (req:AuthRequest,res)=>{try{const id=Number(req.params.id);const cond=req.user?.role==='admin'?eq(automations.id,id):and(eq(automations.id,id),eq(automations.ownerUserId,req.user!.id));const [a]=await db.select().from(automations).where(cond).limit(1);if(!a)return res.status(404).json({error:'Automation not found.'});if(a.status!=='SCHEDULED')return res.status(409).json({error:`Automation is ${a.status}. Only scheduled automations can run now.`});const result=await automationWorker.triggerNow({forceId:id});res.json(result);}catch(e:any){res.status(500).json({error:e.message||'Failed to run automation.'});}});

app.get('/api/messages', requireAuth, async (req:AuthRequest,res)=>{try{const rows=req.user?.role==='admin'?await db.select().from(messages).orderBy(desc(messages.createdAt)):await db.select().from(messages).where(eq(messages.ownerUserId,req.user!.id)).orderBy(desc(messages.createdAt));res.json(rows);}catch(e:any){res.status(500).json({error:e.message||'Failed to load message logs.'});}});
app.get('/api/messages/:id', requireAuth, async (req:AuthRequest,res)=>{try{const id=Number(req.params.id);const cond=req.user?.role==='admin'?eq(messages.id,id):and(eq(messages.id,id),eq(messages.ownerUserId,req.user!.id));const [row]=await db.select().from(messages).where(cond).limit(1);if(!row)return res.status(404).json({error:'Message not found.'});res.json(row);}catch(e:any){res.status(500).json({error:e.message||'Failed to load message.'});}});

app.post('/api/automations/worker/run', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  try { res.json(await automationWorker.triggerNow()); }
  catch (err: any) { res.status(500).json({ error: err.message || 'Worker failed.' }); }
});

/** Direct sends reserve a PROCESSING activity before calling Meta. A stable client
 * request ID prevents re-sending completed recipients after a partial batch/timeout. */
async function sendNowActivity(userId:number, template:any, contact:any, vars:any, creds:any, requestId:string) {
  const owner=await pool.query('SELECT is_active,approval_status FROM users WHERE id=$1',[userId]);
  if(!owner.rows[0]?.is_active||!['ACTIVE','APPROVED'].includes(owner.rows[0].approval_status))throw Object.assign(new Error('Your account is suspended or inactive. Further sending is paused.'),{statusCode:403});
  const now=new Date();
  const [claimed]=await db.insert(automations).values({ownerUserId:userId,contactId:contact.id,templateId:template.id,variables:vars,
    templateSnapshot:previewSnapshot(template),scheduledAt:now,timezone:'Asia/Kolkata',status:'PROCESSING',lockedAt:now,
    sendRequestId:`${userId}:${requestId}:${contact.id}`}).onConflictDoNothing().returning();
  if(!claimed) {
    const [existing]=await db.select().from(automations).where(eq(automations.sendRequestId,`${userId}:${requestId}:${contact.id}`)).limit(1);
    if(existing && (existing.templateId!==template.id || !sameSendVariables(existing.variables as any,vars))) throw Object.assign(new Error('This send request ID was already used with different content. Start a new message.'),{statusCode:409});
    return {contactId:contact.id,name:contact.name,status:existing?.status||'PROCESSING',automationId:existing?.id,replayed:true,error:existing?.errorMessage};
  }
  const tracking=await prepareDeliveryTracking(creds);
  const send=await WhatsAppService.sendTemplateMessage({phoneNumberId:creds.phoneNumberId,accessToken:creds.accessToken,apiVersion:creds.apiVersion,recipientPhone:contact.phone,templateName:template.name,templateLanguage:template.language,variables:vars,templateComponents:template.components,trackingId:`greetsync:${userId}:${claimed.id}`});
  const unknown=send.errorCode==='SEND_OUTCOME_UNKNOWN';
  const status=send.success||unknown?'ACCEPTED':'FAILED';
  const savedVars=unknown?{...vars,__meta_message_status:'unknown',__delivery_note:send.error||'The send outcome is unknown. Check the recipient before creating another attempt.'}:send.success?acceptanceVariables(vars,send.rawResponse,tracking.warning):vars;
  await db.transaction(async tx=>{
    await tx.insert(messages).values({ownerUserId:userId,automationId:claimed.id,contactId:contact.id,direction:'OUTBOUND',messageType:'TEMPLATE',templateName:template.name,templateLanguage:template.language,variables:savedVars,whatsappMessageId:send.whatsappMessageId,status,errorCode:send.errorCode,errorMessage:send.error,sentAt:null,failedAt:status==='FAILED'?new Date():null});
    await tx.update(automations).set({status,variables:savedVars,executedAt:new Date(),errorMessage:send.error||null,updatedAt:new Date()}).where(eq(automations.id,claimed.id));
  });
  return {contactId:contact.id,name:contact.name,status,automationId:claimed.id,error:send.error};
}
const sendNowHandler=async(req:AuthRequest,res:any)=>{
  try {
    if(req.user!.role==='admin')return res.status(403).json({error:'Send messages from a business account.'});
    const userId=req.user!.id;
    let ids:number[]=(Array.isArray(req.body?.contactIds)?req.body.contactIds:[req.body?.contactId]).map(Number).filter((x:number)=>Number.isInteger(x)&&x>0);
    const groupIds:number[]=(Array.isArray(req.body?.groupIds)?req.body.groupIds:[]).map(Number).filter(Boolean);
    if(groupIds.length){const rows=await db.select({id:contactGroupMembers.contactId}).from(contactGroupMembers).innerJoin(contactGroups,eq(contactGroupMembers.groupId,contactGroups.id)).where(and(eq(contactGroups.ownerUserId,userId),inArray(contactGroupMembers.groupId,groupIds)));ids.push(...rows.map(r=>r.id));}
    ids=[...new Set(ids)];if(!ids.length||ids.length>500)return res.status(400).json({error:'Select between 1 and 500 contacts.'});
    const [template]=await db.select().from(messageTemplates).where(and(eq(messageTemplates.id,Number(req.body?.templateId)),eq(messageTemplates.ownerUserId,userId))).limit(1);
    if(!template||template.status!=='APPROVED')return res.status(400).json({error:'Select a Meta-approved template from your business.'});
    const vars={...(req.body?.variables||{}),__send_now:'true'};
    const retryOf=await retryReference(userId,req.body?.retryOfAutomationId,ids,req.body?.duplicateAcknowledged===true);
    if(retryOf)Object.assign(vars,{__retry_of:retryOf});
    const headerError=templateHeaderError(template.components as any[],vars);if(headerError)return res.status(400).json({error:headerError});
    const recipients=await db.select().from(contacts).where(and(eq(contacts.ownerUserId,userId),inArray(contacts.id,ids)));
    if(recipients.length!==ids.length)return res.status(400).json({error:'A selected contact does not belong to your business.'});
    const requestId=String(req.body?.requestId||randomBytes(16).toString('hex'));
    if(!/^[A-Za-z0-9_-]{8,128}$/.test(requestId))return res.status(400).json({error:'Invalid send request ID.'});
    // Resolve the entire batch before sending any recipient.
    const [business]=await db.select().from(users).where(eq(users.id,userId)).limit(1);
    const eligible=recipients.filter(c=>c.optIn).map(contact=>({contact,vars:resolveTemplateVariablesForContact(template.components as any[],vars,{...contact,name:contactName(contact.name)},new Date(),business)}));
    const creds=await resolveWhatsAppCredentials(userId);if(!creds.isFullyConfigured)return res.status(400).json({error:'Connect your WhatsApp Business account first.'});
    const results:any[]=recipients.filter(c=>!c.optIn).map(c=>({contactId:c.id,name:c.name,status:'SKIPPED',error:'No WhatsApp consent'}));
    const recentRestrictions = template.category === 'MARKETING' ? await db.select().from(messages).where(and(
      eq(messages.ownerUserId,userId),inArray(messages.contactId,ids),eq(messages.errorCode,'131049'),
      gte(messages.failedAt,new Date(Date.now()-86400000)))) : [];
    const ready=eligible.filter(row=>{
      const restriction=recentRestrictions.filter(m=>m.contactId===row.contact.id).map(m=>marketingRetryAfter(m)).filter((d):d is Date=>!!d).sort((a,b)=>b.getTime()-a.getTime())[0];
      if(!restriction)return true;
      results.push({contactId:row.contact.id,name:row.contact.name,status:'SKIPPED',error:marketingLimitMessage,retryAfter:restriction.toISOString()});
      return false;
    });
    results.push(...await enqueueSendNowBatch(db,userId,requestId,template,ready,
      (count,tx)=>assertMessageCapacity(userId,count,{reserveScheduled:true,scheduledAt:new Date()},tx)));
    // A normal worker poll executes these durable jobs even after the app closes.
    res.status(202).json({success:true,requestId,total:results.length,queued:results.filter(r=>r.status==='SCHEDULED').length,
      sent:results.filter(r=>['SENT','DELIVERED','READ'].includes(r.status)).length,failed:results.filter(r=>r.status==='FAILED').length,
      accepted:results.filter(r=>r.status==='ACCEPTED').length,processing:results.filter(r=>r.status==='PROCESSING').length,
      skipped:results.filter(r=>r.status==='SKIPPED').length,results});
  }catch(err:any){sendRuleError(res,err,'Unable to send messages.');}
};
app.post('/api/whatsapp/send',requireAuth,requireActiveBusinessPackage,sendNowHandler);
app.post('/api/whatsapp/send-bulk',requireAuth,requireActiveBusinessPackage,sendNowHandler);

/* =========================================================================
   6.5. BIRTHDAY GREETSYNC API
   ========================================================================= */

// GET GreetSync settings
app.get('/api/wishflow/settings', requireAuth, (_req, res) => {
  try {
    const settings = WishflowService.getSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get GreetSync settings' });
  }
});

// UPDATE GreetSync settings
app.post('/api/wishflow/settings', requireAuth, requireActiveBusinessPackage, async (req, res) => {
  try {
    const updated = await WishflowService.updateSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update GreetSync settings' });
  }
});

// GET GreetSync summary (all contacts with birthdays, upcoming countdown, and automation status)
app.get('/api/wishflow/summary', requireAuth, async (req: AuthRequest, res) => {
  try {
    const summary = await WishflowService.getBirthdaySummaryList(req.user?.role === 'admin' ? undefined : req.user!.id);
    res.json(summary);
  } catch (err: any) {
    console.error('Error getting GreetSync summary:', err);
    res.status(500).json({ error: err.message || 'Failed to load birthday summary' });
  }
});

// SYNC ALL BIRTHDAYS (Recalculate & schedule missing birthday automations)
app.post('/api/wishflow/sync', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    const result = await WishflowService.syncAllContactsBirthdays(req.user?.role === 'admin' ? undefined : req.user!.id);
    res.json({ success: true, ...result, message: `Synced ${result.synced} contacts, scheduled ${result.scheduled} birthday messages.` });
  } catch (err: any) {
    console.error('Error syncing birthdays:', err);
    res.status(500).json({ error: err.message || 'Failed to sync birthday automations' });
  }
});

// TOGGLE birthday automation per contact
app.post('/api/wishflow/contacts/:id/toggle', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
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
app.post('/api/wishflow/contacts/:id/send-now', requireAuth, requireActiveBusinessPackage, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if(req.user!.role==='admin')return res.status(403).json({error:'Send birthday wishes from a business account.'});
    const owner=req.user!.id;
    const [contact]=await db.select().from(contacts).where(and(eq(contacts.id,id),eq(contacts.ownerUserId,owner))).limit(1);
    if(!contact)return res.status(404).json({error:'Contact not found.'});
    if(!contact.optIn)return res.status(400).json({error:'This contact has not consented to WhatsApp messages.'});
    if(String(req.body?.customMessage||'').trim())return res.status(400).json({error:'Custom text must be part of a Meta-approved template. Open Send Message to review the approved birthday template.'});
    const approved=await db.select().from(messageTemplates).where(and(eq(messageTemplates.ownerUserId,owner),eq(messageTemplates.status,'APPROVED')));
    const template=approved.find(t=>/birthday|brithday/i.test(t.name));
    if(!template)return res.status(400).json({error:'Select and approve a birthday template in Templates first.'});
    const [business]=await db.select().from(users).where(eq(users.id,owner)).limit(1);
    const supplied:Record<string,string>={__send_now:'true'};
    for(const requirement of extractTemplateVariableRequirements(template.components as any[])){
      const token=requirement.token.toLowerCase();
      const meaning=requirement.meaning==='CUSTOM'?(token==='1'||token.includes('name')?'CONTACT_NAME':token==='2'||token.includes('age')?'AGE':'CUSTOM'):requirement.meaning;
      const value=automaticTemplateVariableValue(meaning,contact,new Date(),business);
      if(value)supplied[requirement.section==='HEADER'?`header_${requirement.token}`:requirement.token]=value;
    }
    const vars=resolveTemplateVariablesForContact(template.components as any[],supplied,contact,new Date(),business);
    const headerError=templateHeaderError(template.components as any[],vars);
    if(headerError)return res.status(400).json({error:headerError+' Open Send Message to select this attachment or location.'});
    const requestId=String(req.body?.requestId||randomBytes(16).toString('hex'));
    if(!/^[A-Za-z0-9_-]{8,128}$/.test(requestId))return res.status(400).json({error:'Invalid send request ID.'});
    const [previous]=await db.select({id:automations.id}).from(automations).where(eq(automations.sendRequestId,`${owner}:${requestId}:${id}`)).limit(1);
    await assertMessageCapacity(owner,previous?0:1,{reserveScheduled:false});
    const creds=await resolveWhatsAppCredentials(owner);
    if(!creds.isFullyConfigured)return res.status(400).json({error:'Connect your WhatsApp Business account first.'});
    const result=await sendNowActivity(owner,template,contact,vars,creds,requestId);
    res.status(result.status==='FAILED'?400:200).json({...result,success:result.status!=='FAILED',requestId});
  } catch (err: any) {
    console.error('Error sending birthday wish now:', err);
    return sendRuleError(res, err, 'Failed to send birthday wish');
  }
});

// EDIT SCHEDULED BIRTHDAY WISH
app.put('/api/wishflow/automations/:id', requireAuth, requireActiveBusinessPackage, async (req, res) => {
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
// Accept the platform token saved in PostgreSQL OR the explicit production
// META_WEBHOOK_VERIFY_TOKEN.  The previous implementation only used the token
// returned by metaPlatformConfig(), which could make a valid Railway env token
// fail whenever a database Meta configuration existed.
async function configuredMetaWebhookVerifyTokens(): Promise<string[]> {
  const tokens = new Set<string>();

  const envToken = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
  if (envToken) tokens.add(envToken);

  try {
    const result = await pool.query('SELECT webhook_verify_token FROM platform_meta_settings WHERE id = 1 LIMIT 1');
    const raw = String(result.rows?.[0]?.webhook_verify_token || '').trim();
    if (raw) {
      const decrypted = String(decryptSecret(raw) || '').trim();
      if (decrypted) tokens.add(decrypted);
      // Legacy plaintext values are supported by decryptSecret, so no separate
      // plaintext branch is required here.
    }
  } catch (err: any) {
    console.warn('[Webhook] Could not read database verify token:', err?.message || err);
  }

  // Manual connections can use a different Meta app and verification token.
  const accounts=await pool.query("SELECT webhook_verify_token FROM whatsapp_accounts WHERE webhook_verify_token IS NOT NULL AND webhook_verify_token <> ''");
  for(const account of accounts.rows){const token=String(decryptSecret(account.webhook_verify_token)||'').trim();if(token)tokens.add(token);}

  return [...tokens];
}

async function verifyMetaWebhookRequest(req: express.Request, res: express.Response) {
  try {
    const mode = String(req.query['hub.mode'] || '').trim();
    const token = String(req.query['hub.verify_token'] || '').trim();
    const challenge = String(req.query['hub.challenge'] || '');
    const expectedTokens = await configuredMetaWebhookVerifyTokens();

    if (expectedTokens.length === 0) {
      console.error('[Webhook] No platform webhook verify token is configured');
      return res.status(503).send('Webhook verify token is not configured');
    }

    if (mode === 'subscribe' && token && expectedTokens.includes(token)) {
      console.log('[Webhook] Platform verification successful');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
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
const whatsappWebhookHandler=async(req:any,res:any)=>{
  try {
    const cfg=await metaPlatformConfig();
    const signature=String(req.headers['x-hub-signature-256']||'');
    const raw=req.rawBody||Buffer.alloc(0);
    if(!matchesWebhookSignature(raw,signature,cfg.appSecret)){
      const ids=Array.isArray(req.body?.entry)?req.body.entry.map((entry:any)=>String(entry.id||'')):[];
      const result=await pool.query('SELECT business_account_id,phone_number_id,meta_app_secret FROM whatsapp_accounts WHERE business_account_id=ANY($1::text[])',[ids]);
      const accounts=result.rows.map((a:any)=>({...a,secret:String(decryptSecret(a.meta_app_secret)||'').trim()}));
      if(!authorizeAccountWebhook(raw,signature,req.body,accounts))return res.status(401).send('Invalid signature or account scope.');
    }
    if(req.body?.object!=='whatsapp_business_account')return res.status(200).send('EVENT_RECEIVED');
    // Persist before acknowledgement, so a crash cannot lose mirrored messages.
    await pool.query('INSERT INTO meta_webhook_inbox(payload) VALUES($1)',[JSON.stringify(req.body)]);
    res.status(200).send('EVENT_RECEIVED');
    void drainWhatsAppWebhookInbox();
  }catch(e:any){if(!res.headersSent)res.status(503).send('Webhook persistence unavailable. Retry later.');}
};
let drainingWebhookInbox=false;
async function drainWhatsAppWebhookInbox(){
  if(drainingWebhookInbox||!isDatabaseConnected)return;drainingWebhookInbox=true;
  let guard:any;
  let locked=false;
  try {
    guard=await pool.connect();
    locked=(await guard.query('SELECT pg_try_advisory_lock(716853901) AS locked')).rows[0]?.locked===true;
    if(!locked)return;
    const rows=await pool.query('SELECT id,payload FROM meta_webhook_inbox WHERE processed_at IS NULL AND next_attempt_at <= NOW() ORDER BY id LIMIT 25');
    for(const row of rows.rows){
      try {for(const entry of row.payload.entry||[])for(const change of entry.changes||[])await digestWhatsAppChange(String(entry.id),change);
        await pool.query('UPDATE meta_webhook_inbox SET processed_at=NOW(),last_error=NULL WHERE id=$1',[row.id]);
      }catch(e:any){await pool.query("UPDATE meta_webhook_inbox SET attempts=attempts+1,last_error=$2,next_attempt_at=NOW()+LEAST(3600,30*(attempts+1))*INTERVAL '1 second' WHERE id=$1",[row.id,String(e.message).slice(0,500)]);}
    }
    await pool.query("DELETE FROM meta_webhook_inbox WHERE processed_at < NOW() - INTERVAL '7 days'");
  }catch(e:any){console.warn('[Webhook] Inbox drain failed:',e.message);}finally{try{if(locked)await guard.query('SELECT pg_advisory_unlock(716853901)');}finally{guard?.release();drainingWebhookInbox=false;}}
}
setInterval(()=>void drainWhatsAppWebhookInbox(),15000).unref();
app.post('/webhooks/whatsapp',whatsappWebhookHandler);
app.post('/api/webhooks/whatsapp',whatsappWebhookHandler);


/* =========================================================================
   8. HEALTH & VITE INTEGRATION
   ========================================================================= */

// Public website policies open from Admin Settings in the external browser.
for (const slug of ['privacy-policy', 'terms-and-conditions']) {
  app.get('/' + slug, (_req, res) => {
    for (const [key, value] of Object.entries(publicPolicyHeaders)) res.setHeader(key, value);
    res.type('html').send(publicPolicyPage(slug));
  });
}

app.get('/api/health', async (_req, res) => {
  try {
    if (!await checkDatabaseConnection()) throw new Error('Database unavailable');
    res.json({status:'ok',timestamp:new Date().toISOString(),service:'whatsapp-automation-backend',
      build:'render-supabase-data-20261023',deploymentCommit:process.env.DEPLOY_COMMIT||null,
      databaseProvider:process.env.DATABASE_PROVIDER||'postgresql',databaseTarget:process.env.DATABASE_TARGET_FINGERPRINT||null});
  } catch {
    res.status(503).json({status:'unavailable',error:'Database connection is not ready.'});
  }
});

// Any unmatched /api route returns 404 JSON instead of falling through to Vite SPA html
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.path}`,
  });
});

async function startServer() {
  await initializeApplicationServices();

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

startServer().catch((error) => {
  console.error('[Startup] GreetSync failed to start:', error?.message || error);
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`[Shutdown] ${signal} received.`);
  try { automationWorker.stop(); } catch {}
  if (accountPurgeTimer) clearInterval(accountPurgeTimer);
  try { await pool.end(); } catch {}
  process.exit(0);
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
