import 'package:flutter/material.dart';
import '../theme/business_theme.dart';

class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen({super.key});

  @override
  Widget build(BuildContext context) => const _LegalDocumentScreen(
        title: 'Privacy Policy',
        updated: '25 September 2026',
        intro: 'This Privacy Policy explains how WishFlow handles information when businesses use the app for contacts, WhatsApp messaging, templates, campaigns and automations.',
        sections: [
          _LegalSection('1. Information you provide', 'WishFlow may process your account name, business name, business address, mobile number, optional email, app preferences, contacts you add or import, contact dates such as birthdays, groups, templates, automation schedules and support information you choose to provide.'),
          _LegalSection('2. WhatsApp and Meta information', 'When you connect WhatsApp Business through Meta, WishFlow stores the business connection identifiers required for the integration, such as WABA ID, Phone Number ID, display phone number, template metadata and authorization credentials. Access tokens and other secrets are encrypted before database storage and are isolated per business account.'),
          _LegalSection('3. Contacts and device permissions', 'If you allow Contacts permission, WishFlow can read device contacts so you can select or import them. Contacts are not imported automatically merely because permission was granted. Only contacts you choose to save or use are sent to the WishFlow backend.'),
          _LegalSection('4. Biometric login', 'Biometric verification is performed by the operating system on your device. WishFlow does not receive or store your fingerprint or face data. When biometric login is enabled, a device-specific login credential is stored in secure device storage and its server-side secret is stored only as a one-way hash.'),
          _LegalSection('5. How information is used', 'Information is used to provide account access, business administration, contact management, WhatsApp template synchronization, scheduled and manual messaging, birthday and marketing automations, delivery status tracking, security, troubleshooting and platform administration.'),
          _LegalSection('6. Data sharing', 'WishFlow sends data to Meta/WhatsApp only as needed to perform the WhatsApp Business features you request. Information may also be processed by infrastructure providers required to host and operate the service. WishFlow does not make one business account\'s contacts or WhatsApp credentials available to another business account.'),
          _LegalSection('7. Security', 'WishFlow uses authenticated API sessions, encrypted secret storage, tenant isolation and server-side authorization checks. No system can guarantee absolute security, so businesses should also protect their Meta accounts, mobile devices and administrator credentials.'),
          _LegalSection('8. Retention and deletion', 'Account and business data is retained while needed to provide the service and meet legitimate operational or legal requirements. A business may request account or data deletion subject to records that must be retained for security, billing, dispute resolution or law.'),
          _LegalSection('9. Your responsibilities', 'You are responsible for having a lawful basis and, where required, consent to upload contacts and send WhatsApp messages. You should not upload sensitive information that is unnecessary for the purpose of the app.'),
          _LegalSection('10. Updates', 'This policy may be updated as WishFlow features, providers or legal requirements change. The app will display the current version and effective date.'),
        ],
      );
}

class TermsConditionsScreen extends StatelessWidget {
  const TermsConditionsScreen({super.key});

  @override
  Widget build(BuildContext context) => const _LegalDocumentScreen(
        title: 'Terms & Conditions',
        updated: '25 September 2026',
        intro: 'These terms govern use of WishFlow as a business messaging, contact-management and automation platform.',
        sections: [
          _LegalSection('1. Business account and approval', 'A new business account may be used only after administrator approval. You must provide accurate registration information, protect your password and keep access to your account under your control.'),
          _LegalSection('2. WhatsApp Business connection', 'Each business connects and uses its own Meta/WhatsApp Business assets. WishFlow does not grant ownership of a WABA, phone number or Meta account. You remain responsible for complying with Meta and WhatsApp requirements, business verification, template approval and messaging policies.'),
          _LegalSection('3. Messaging consent and lawful use', 'You must send messages only to recipients you are permitted to contact and must respect opt-in, opt-out and applicable marketing rules. WishFlow must not be used for spam, fraud, harassment, deceptive messaging, unlawful products or other prohibited activity.'),
          _LegalSection('4. Templates and automations', 'Automations execute based on the schedule, audience and approved template you configure. You are responsible for reviewing recipient selection, variables, timing and content before activation. Delivery can depend on Meta, WhatsApp, network availability, billing status and template/account eligibility.'),
          _LegalSection('5. Contact data', 'You represent that you are authorized to upload or process contact information in WishFlow. Bulk imports should contain accurate data and WhatsApp consent settings should reflect the recipient\'s actual consent.'),
          _LegalSection('6. Security and credentials', 'Do not share account passwords, access tokens or administrative credentials. WishFlow may suspend access where necessary to protect accounts, prevent abuse or respond to security concerns.'),
          _LegalSection('7. Service availability', 'WishFlow may change, maintain or temporarily interrupt features. Third-party services such as Meta, WhatsApp, mobile operating systems and network providers are outside WishFlow\'s direct control and can affect messaging or login availability.'),
          _LegalSection('8. Administrator access', 'The WishFlow platform administrator can review business account status and operational resources needed to manage the platform. Business-specific WhatsApp sending continues to use that business\'s own connection and credentials.'),
          _LegalSection('9. Suspension or termination', 'Access may be restricted for policy violations, security risks, unlawful activity, non-payment where applicable, or misuse of Meta/WhatsApp services. You may stop using the service and request closure of your account.'),
          _LegalSection('10. Changes to these terms', 'These terms may be updated when the product, integrations or applicable requirements change. Continued use after an updated version becomes effective constitutes acceptance of the revised terms where permitted by law.'),
        ],
      );
}

class _LegalSection {
  const _LegalSection(this.heading, this.body);
  final String heading;
  final String body;
}

class _LegalDocumentScreen extends StatelessWidget {
  const _LegalDocumentScreen({required this.title, required this.updated, required this.intro, required this.sections});
  final String title;
  final String updated;
  final String intro;
  final List<_LegalSection> sections;

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 32),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.gavel_rounded, color: accent, size: 30),
                const SizedBox(height: 12),
                Text(title, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
                const SizedBox(height: 4),
                Text('Last updated: $updated', style: const TextStyle(color: BusinessColors.muted)),
                const SizedBox(height: 14),
                Text(intro, style: const TextStyle(height: 1.55, color: BusinessColors.ink)),
              ]),
            ),
          ),
          const SizedBox(height: 12),
          ...sections.map((section) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(17),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(section.heading, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
                      const SizedBox(height: 8),
                      Text(section.body, style: const TextStyle(color: BusinessColors.muted, height: 1.55)),
                    ]),
                  ),
                ),
              )),
          const SizedBox(height: 4),
          const Text('These in-app documents are product terms and policy text for WishFlow and should be reviewed by your legal/compliance adviser before public launch.', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: BusinessColors.muted, height: 1.4)),
        ],
      ),
    );
  }
}
