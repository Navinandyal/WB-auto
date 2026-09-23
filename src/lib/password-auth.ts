import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export type SessionUser = {
  id: number;
  uid: string;
  phone: string;
  email: string;
  name: string;
  role: string;
  businessId?: number | null;
};

const DEV_SECRET = 'change-this-local-auth-secret-before-production';

function authSecret(): string {
  const secret = process.env.AUTH_TOKEN_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_TOKEN_SECRET must be configured in production.');
  }
  return DEV_SECRET;
}

export function normalizeLoginPhone(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!hasPlus && digits.length === 10) digits = `91${digits}`;
  if (digits.length < 8 || digits.length > 15) return '';
  return `+${digits}`;
}

// Uses Node's memory-hard scrypt implementation. Passwords are never stored in plaintext.
// Format is versioned so a future bcrypt/argon2 migration can be performed transparently.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:v1:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const parts = storedHash.split(':');
  let salt = '';
  let expectedHex = '';
  if (parts[0] === 'scrypt' && parts[1] === 'v1' && parts.length === 4) {
    salt = parts[2]; expectedHex = parts[3];
  } else if (parts.length === 2) {
    // legacy compatibility for earlier WishFlow builds
    salt = parts[0]; expectedHex = parts[1];
  } else return false;
  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function b64(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}
function signJwt(input: string): string {
  return createHmac('sha256', authSecret()).update(input).digest('base64url');
}

// Real HS256 JWT access token (header.payload.signature), intentionally short-lived.
export function createAccessToken(user: SessionUser, ttlSeconds = 15 * 60): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({
    sub: String(user.id), uid: user.uid, phone: user.phone, email: user.email,
    name: user.name, role: user.role, businessId: user.businessId ?? (user.role === 'admin' ? null : user.id), token_type: 'access', iat: now, exp: now + ttlSeconds,
  }));
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${signJwt(unsigned)}`;
}

export function verifySessionToken(token: string): SessionUser | null {
  const [header, payload, signature] = String(token || '').split('.', 3);
  if (!header || !payload || !signature) return null;
  const unsigned = `${header}.${payload}`;
  const expected = signJwt(unsigned);
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsedHeader?.alg !== 'HS256' || p?.token_type !== 'access' || !p?.sub || !p?.exp || Number(p.exp) <= Math.floor(Date.now() / 1000)) return null;
    return { id: Number(p.sub), uid: String(p.uid || `user_${p.sub}`), phone: String(p.phone || ''), email: String(p.email || ''), name: String(p.name || ''), role: String(p.role || 'BUSINESS_OWNER'), businessId: p.businessId == null ? (String(p.role || '') === 'admin' ? null : Number(p.sub)) : Number(p.businessId) };
  } catch { return null; }
}

// compatibility with earlier call sites
export const createSessionToken = createAccessToken;

export function createRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}


// Short-lived signed tokens used only for in-app Meta Embedded Signup browser sessions.
// They are purpose-bound and cannot be used as normal API access tokens.
export function createPurposeToken(user: SessionUser, purpose: string, ttlSeconds = 10 * 60): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({
    sub: String(user.id), uid: user.uid, phone: user.phone, email: user.email,
    name: user.name, role: user.role, token_type: 'purpose', purpose, iat: now, exp: now + ttlSeconds,
  }));
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${signJwt(unsigned)}`;
}

export function verifyPurposeToken(token: string, expectedPurpose: string): SessionUser | null {
  const [header, payload, signature] = String(token || '').split('.', 3);
  if (!header || !payload || !signature) return null;
  const unsigned = `${header}.${payload}`;
  const expected = signJwt(unsigned);
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const h = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (h?.alg !== 'HS256' || p?.token_type !== 'purpose' || p?.purpose !== expectedPurpose || !p?.sub || !p?.exp || Number(p.exp) <= Math.floor(Date.now() / 1000)) return null;
    return { id: Number(p.sub), uid: String(p.uid || `user_${p.sub}`), phone: String(p.phone || ''), email: String(p.email || ''), name: String(p.name || ''), role: String(p.role || 'business_user'), businessId: p.businessId == null ? Number(p.sub) : Number(p.businessId) };
  } catch { return null; }
}
