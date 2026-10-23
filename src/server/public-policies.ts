// Existing in-app policy wording, presented as public website pages.
const policies = {
  "privacy-policy": {
    "title": "Privacy Policy",
    "updated": "25 September 2026",
    "intro": "This Privacy Policy explains how GreetSync handles information when businesses use the app for contacts, WhatsApp messaging, templates, campaigns and automations.",
    "sections": [
      {
        "title": "1. Information you provide",
        "text": "GreetSync may process your account name, business name, business address, mobile number, optional email, app preferences, contacts you add or import, contact dates such as birthdays, groups, templates, automation schedules and support information you choose to provide."
      },
      {
        "title": "2. WhatsApp and Meta information",
        "text": "When you connect WhatsApp Business through Meta, GreetSync stores the business connection identifiers required for the integration, such as WABA ID, Phone Number ID, display phone number, template metadata and authorization credentials. Access tokens and other secrets are encrypted before database storage and are isolated per business account."
      },
      {
        "title": "3. Contacts and device permissions",
        "text": "If you allow Contacts permission, GreetSync can read device contacts so you can select or import them. Contacts are not imported automatically merely because permission was granted. Only contacts you choose to save or use are sent to the GreetSync backend."
      },
      {
        "title": "4. Biometric login",
        "text": "Biometric verification is performed by the operating system on your device. GreetSync does not receive or store your fingerprint or face data. When biometric login is enabled, a device-specific login credential is stored in secure device storage and its server-side secret is stored only as a one-way hash."
      },
      {
        "title": "5. How information is used",
        "text": "Information is used to provide account access, business administration, contact management, WhatsApp template synchronization, scheduled and manual messaging, birthday and marketing automations, delivery status tracking, security, troubleshooting and platform administration."
      },
      {
        "title": "6. Data sharing",
        "text": "GreetSync sends data to Meta/WhatsApp only as needed to perform the WhatsApp Business features you request. Information may also be processed by infrastructure providers required to host and operate the service. GreetSync does not make one business account's contacts or WhatsApp credentials available to another business account."
      },
      {
        "title": "7. Security",
        "text": "GreetSync uses authenticated API sessions, encrypted secret storage, tenant isolation and server-side authorization checks. No system can guarantee absolute security, so businesses should also protect their Meta accounts, mobile devices and administrator credentials."
      },
      {
        "title": "8. Retention and account deletion",
        "text": "A business owner can delete the GreetSync account from Settings by confirming the current password. Access is disabled immediately and active sessions and biometric login credentials are revoked. GreetSync retains the account and business data for no longer than 30 days after the deletion request, after which the account data is permanently deleted. If a specific record must be preserved by applicable law, only the legally required record may be retained separately for that required period."
      },
      {
        "title": "9. Your responsibilities",
        "text": "You are responsible for having a lawful basis and, where required, consent to upload contacts and send WhatsApp messages. You should not upload sensitive information that is unnecessary for the purpose of the app."
      },
      {
        "title": "10. Updates",
        "text": "This policy may be updated as GreetSync features, providers or legal requirements change. The app will display the current version and effective date."
      }
    ]
  },
  "terms-and-conditions": {
    "title": "Terms & Conditions",
    "updated": "25 September 2026",
    "intro": "These terms govern use of GreetSync as a business messaging, contact-management and automation platform.",
    "sections": [
      {
        "title": "1. Business account and approval",
        "text": "A new business account may be used only after administrator approval. You must provide accurate registration information, protect your password and keep access to your account under your control."
      },
      {
        "title": "2. WhatsApp Business connection",
        "text": "Each business connects and uses its own Meta/WhatsApp Business assets. GreetSync does not grant ownership of a WABA, phone number or Meta account. You remain responsible for complying with Meta and WhatsApp requirements, business verification, template approval and messaging policies."
      },
      {
        "title": "3. Messaging consent and lawful use",
        "text": "You must send messages only to recipients you are permitted to contact and must respect opt-in, opt-out and applicable marketing rules. GreetSync must not be used for spam, fraud, harassment, deceptive messaging, unlawful products or other prohibited activity."
      },
      {
        "title": "4. Templates and automations",
        "text": "Automations execute based on the schedule, audience and approved template you configure. You are responsible for reviewing recipient selection, variables, timing and content before activation. Delivery can depend on Meta, WhatsApp, network availability, billing status and template/account eligibility."
      },
      {
        "title": "5. Contact data",
        "text": "You represent that you are authorized to upload or process contact information in GreetSync. Bulk imports should contain accurate data and WhatsApp consent settings should reflect the recipient's actual consent."
      },
      {
        "title": "6. Security and credentials",
        "text": "Do not share account passwords, access tokens or administrative credentials. GreetSync may suspend access where necessary to protect accounts, prevent abuse or respond to security concerns."
      },
      {
        "title": "7. Service availability",
        "text": "GreetSync may change, maintain or temporarily interrupt features. Third-party services such as Meta, WhatsApp, mobile operating systems and network providers are outside GreetSync's direct control and can affect messaging or login availability."
      },
      {
        "title": "8. Administrator access",
        "text": "The GreetSync platform administrator can review business account status and operational resources needed to manage the platform. Business-specific WhatsApp sending continues to use that business's own connection and credentials."
      },
      {
        "title": "9. Suspension, termination and deletion",
        "text": "Access may be restricted for policy violations, security risks, unlawful activity, non-payment where applicable, or misuse of Meta/WhatsApp services. A business owner may delete the account from GreetSync by confirming the account password. The account is disabled immediately and its data is retained for a maximum of 30 days before permanent deletion, subject only to any record that applicable law specifically requires to be retained."
      },
      {
        "title": "10. Changes to these terms",
        "text": "These terms may be updated when the product, integrations or applicable requirements change. Continued use after an updated version becomes effective constitutes acceptance of the revised terms where permitted by law."
      }
    ]
  }
} as const;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function publicPolicyPage(slug: string): string | null {
  const page = policies[slug as keyof typeof policies];
  if (!page) return null;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(page.title)} — GreetSync</title><style>body{margin:0;background:#f5f8fb;color:#163653;font:16px/1.7 system-ui,sans-serif}main{max-width:780px;margin:auto;padding:40px 22px}nav{display:flex;gap:20px;flex-wrap:wrap;padding:20px 0}a{color:#087b60}article{background:white;border:1px solid #e0e8ef;border-radius:20px;padding:28px}h1{font-size:clamp(28px,5vw,40px);line-height:1.2}h2{font-size:20px;margin-top:30px}.muted{color:#64778b}footer{margin-top:24px}</style></head><body><main><a href="https://www.aikyamaisystems.com/">GreetSync · AIKYAM AI Systems</a><h1>${escape(page.title)}</h1><p class="muted">Last updated: ${escape(page.updated)}</p><article><p>${escape(page.intro)}</p>${page.sections.map(s=>`<section><h2>${escape(s.title)}</h2><p>${escape(s.text)}</p></section>`).join('')}</article><footer><nav aria-label="Policies"><a href="/privacy-policy">Privacy Policy</a><a href="/terms-and-conditions">Terms & Conditions</a></nav></footer></main></body></html>`;
}
export const publicPolicyHeaders = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
