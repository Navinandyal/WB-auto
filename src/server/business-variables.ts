/** Business values come from the authenticated owner's saved profile. */
export function businessVariableValue(meaning: string, business: any): string | null {
  const name = String(business?.businessName ?? '').trim();
  const address = String(business?.businessAddress ?? '').trim();
  const values: Record<string, string> = {
    BUSINESS_NAME: name,
    BUSINESS_ADDRESS: address,
    BUSINESS_DETAILS: [name, address].filter(Boolean).join(', '),
    BUSINESS_PHONE: String(business?.phone ?? '').trim(),
    BUSINESS_EMAIL: String(business?.email ?? '').trim(),
  };
  return values[String(meaning).toUpperCase()] || null;
}
