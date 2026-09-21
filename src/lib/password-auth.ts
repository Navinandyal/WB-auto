import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export type SessionUser = {
  id: number;
  uid: string;
  phone: string;
  email: string;
  name: string;
  role: string;
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

  // Convenience for the application's primary India use case.
  if (!hasPlus && digits.length === 10) digits = `91${digits}`;
  if (digits.length < 8 || digits.length > 15) return '';
  return `+${digits}`;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':', 2);
  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function sign(encodedPayload: string): string {
  return createHmac('sha256', authSecret()).update(encodedPayload).digest('base64url');
}

export function createSessionToken(user: SessionUser, ttlSeconds = 60 * 60 * 24 * 30): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(user.id),
    uid: user.uid,
    phone: user.phone,
    email: user.email,
    name: user.name,
    role: user.role,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string): SessionUser | null {
  const [encoded, signature] = String(token || '').split('.', 2);
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload?.sub || !payload?.exp || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    return {
      id: Number(payload.sub),
      uid: String(payload.uid || `local_${payload.sub}`),
      phone: String(payload.phone || ''),
      email: String(payload.email || ''),
      name: String(payload.name || ''),
      role: String(payload.role || 'business_user'),
    };
  } catch {
    return null;
  }
}
