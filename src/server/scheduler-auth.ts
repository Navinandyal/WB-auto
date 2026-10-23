import { createHmac, timingSafeEqual } from 'node:crypto';

// Purpose-separated token, never the user's login signing secret itself.
export function schedulerToken(secret: string): string {
  if (!secret || secret.length < 24) throw new Error('Original authentication key is required for scheduler setup.');
  return createHmac('sha256', secret).update('greetsync:supabase-wake:v1').digest('hex');
}
export function schedulerAuthorized(header: unknown, secret: string | undefined): boolean {
  if (typeof header !== 'string' || !secret || secret.length < 24) return false;
  const match = /^Bearer ([a-f0-9]{64})$/.exec(header);
  if (!match) return false;
  return timingSafeEqual(Buffer.from(match[1]), Buffer.from(schedulerToken(secret)));
}
