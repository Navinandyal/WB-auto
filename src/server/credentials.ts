import { eq } from 'drizzle-orm';
import { db, isDatabaseConnected } from '../db/index.ts';
import { whatsappAccounts } from '../db/schema.ts';
import { decryptSecret, encryptSecret } from './credential-crypto.ts';

export interface ResolvedWhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
  businessAccountId: string;
  metaAppId: string;
  metaAppSecret: string;
  webhookVerifyToken: string;
  apiVersion: string;
  status: 'CONNECTED' | 'DISCONNECTED';
  hasToken: boolean;
  hasPhoneId: boolean;
  isFullyConfigured: boolean;
  tokenSource: 'database' | 'none';
  phoneIdSource: 'database' | 'none';
  errorNotes?: string;
}

export async function resolveWhatsAppCredentials(ownerUserId: number): Promise<ResolvedWhatsAppCredentials> {
  let acc: any = null;
  if (isDatabaseConnected && ownerUserId > 0) {
    const rows = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.ownerUserId, ownerUserId)).limit(1);
    acc = rows[0] || null;
  }

  const phoneNumberId = acc?.phoneNumberId || '';
  const accessToken = decryptSecret(acc?.accessToken);
  const businessAccountId = acc?.businessAccountId || '';
  const metaAppId = acc?.metaAppId || '';
  const metaAppSecret = decryptSecret(acc?.metaAppSecret);
  const webhookVerifyToken = decryptSecret(acc?.webhookVerifyToken) || '';
  const apiVersion = acc?.apiVersion || 'v21.0';
  const hasToken = Boolean(accessToken && accessToken.length > 5);
  const hasPhoneId = Boolean(phoneNumberId && phoneNumberId.length > 3);
  const isFullyConfigured = hasToken && hasPhoneId;

  return {
    phoneNumberId,
    accessToken,
    businessAccountId,
    metaAppId,
    metaAppSecret,
    webhookVerifyToken,
    apiVersion,
    status: isFullyConfigured ? 'CONNECTED' : 'DISCONNECTED',
    hasToken,
    hasPhoneId,
    isFullyConfigured,
    tokenSource: hasToken ? 'database' : 'none',
    phoneIdSource: hasPhoneId ? 'database' : 'none',
    errorNotes: isFullyConfigured ? undefined : 'Connect your WhatsApp Business account from Settings before using automations.',
  };
}

export function encryptedCredentialValues(values: {
  metaAppSecret?: string;
  accessToken?: string;
  webhookVerifyToken?: string;
}) {
  return {
    ...(values.metaAppSecret !== undefined ? { metaAppSecret: encryptSecret(values.metaAppSecret) } : {}),
    ...(values.accessToken !== undefined ? { accessToken: encryptSecret(values.accessToken) } : {}),
    ...(values.webhookVerifyToken !== undefined ? { webhookVerifyToken: encryptSecret(values.webhookVerifyToken) } : {}),
  };
}
