export const marketingLimitMessage = 'WhatsApp restricted this marketing message for this recipient (#131049). Wait at least 24 hours after the last restriction before trying again. Delivery after that is still subject to Meta limits. Other recipients can continue.';

/** Deduplicate Meta's title/message/details instead of repeating the same paragraph. */
export function metaErrorText(error: any, fallback = 'WhatsApp delivery failed.'): string {
  if (String(error?.code) === '131049') return marketingLimitMessage;
  const parts = [error?.error_user_msg, error?.title, error?.message, error?.error_data?.details]
    .map(value => String(value ?? '').trim()).filter(Boolean);
  return parts.filter((part, index) => !parts.some((other, j) =>
    j !== index && other.toLowerCase().includes(part.toLowerCase()) &&
    (other.length > part.length || j < index))).join(': ').slice(0, 1400) || fallback;
}

export function marketingRetryAfter(record: any, now = new Date()): Date | null {
  if (String(record?.errorCode ?? record?.error_code) !== '131049') return null;
  const failed = new Date(record.failedAt ?? record.failed_at ?? record.createdAt ?? record.created_at);
  if (!Number.isFinite(failed.getTime())) return null;
  const after = new Date(failed.getTime() + 24 * 60 * 60 * 1000);
  return after > now ? after : null;
}
