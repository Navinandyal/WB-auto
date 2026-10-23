/** Requested sentence case for contact names only; business/group names keep their spelling. */
export function contactName(value: unknown): string {
  const lower = String(value ?? '').trim().normalize('NFC').toLowerCase();
  return lower.replace(/\p{L}/u, letter => letter.toUpperCase());
}
