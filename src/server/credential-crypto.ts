import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function key(): Buffer {
  const secret = (process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.AUTH_TOKEN_SECRET || '').trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY or AUTH_TOKEN_SECRET must be configured in production.');
    }
    return createHash('sha256').update('wishflow-local-development-key-change-me').digest();
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string): string {
  if (!value) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (!value.startsWith('enc:v1:')) return value; // legacy plaintext migration compatibility
  const parts = value.split(':');
  if (parts.length !== 5) return '';
  try {
    const iv = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    const ciphertext = Buffer.from(parts[4], 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
