import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api_client.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import 'appearance_screen.dart';
import 'legal_pages.dart';
import 'profile_screen.dart';
import 'security_settings_screen.dart';

class AdminSettingsScreen extends ConsumerStatefulWidget {
  const AdminSettingsScreen({super.key});
  @override
  ConsumerState<AdminSettingsScreen> createState() => _AdminSettingsScreenState();
}

class _AdminSettingsScreenState extends ConsumerState<AdminSettingsScreen> {
  final appId = TextEditingController();
  final appSecret = TextEditingController();
  final configId = TextEditingController();
  final apiVersion = TextEditingController(text: 'v26.0');
  final publicBaseUrl = TextEditingController();
  final webhookToken = TextEditingController();
  bool loading = true;
  bool saving = false;
  bool testing = false;
  bool hideSecret = true;
  bool configured = false;
  String source = '';
  String secretMasked = '';
  String detectedPublicBaseUrl = '';
  String detectedPublicBaseUrlSource = '';
  String embeddedSignupOrigin = '';
  String embeddedSignupHostname = '';
  String webhookCallbackUrl = '';
  String? error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final data = (await ref.read(apiClientProvider).get('/api/admin/meta-platform-settings') as Map).cast<String,dynamic>();
      if (!mounted) return;
      setState(() {
        appId.text = '${data['metaAppId'] ?? ''}';
        configId.text = '${data['embeddedSignupConfigId'] ?? ''}';
        apiVersion.text = '${data['apiVersion'] ?? 'v26.0'}';
        publicBaseUrl.text = '${data['publicBaseUrl'] ?? ''}';
        secretMasked = '${data['appSecretMasked'] ?? ''}';
        appSecret.text = secretMasked;
        detectedPublicBaseUrl = '${data['detectedPublicBaseUrl'] ?? ''}';
        detectedPublicBaseUrlSource = '${data['detectedPublicBaseUrlSource'] ?? ''}';
        embeddedSignupOrigin = '${data['embeddedSignupOrigin'] ?? data['detectedPublicBaseUrl'] ?? ''}';
        embeddedSignupHostname = '${data['embeddedSignupHostname'] ?? ''}';
        webhookCallbackUrl = '${data['webhookCallbackUrl'] ?? ''}';
        webhookToken.text = '${data['webhookVerifyToken'] ?? ''}';
        configured = data['configured'] == true;
        source = '${data['source'] ?? ''}';
        loading = false;
        error = null;
      });
    } catch (e) {
      if (mounted) setState(() { loading = false; error = e is ApiException ? e.message : '$e'; });
    }
  }

  Future<void> _save() async {
    if (appId.text.trim().isEmpty || configId.text.trim().isEmpty || appSecret.text.trim().isEmpty) {
      showAppMessage(context, 'Meta App ID, App Secret and Embedded Signup Configuration ID are required.', error: true);
      return;
    }
    if (publicBaseUrl.text.trim().isNotEmpty && !publicBaseUrl.text.trim().toLowerCase().startsWith('https://')) {
      showAppMessage(context, 'If you enter an Embedded Signup origin override it must start with https://. For local development leave it blank and run ngrok; WishFlow will detect ngrok automatically.', error: true);
      return;
    }
    setState(() => saving = true);
    try {
      final data = (await ref.read(apiClientProvider).put('/api/admin/meta-platform-settings', data: {
        'metaAppId': appId.text.trim(),
        'appSecret': appSecret.text.trim(),
        'embeddedSignupConfigId': configId.text.trim(),
        'apiVersion': apiVersion.text.trim(),
        'publicBaseUrl': publicBaseUrl.text.trim(),
        'webhookVerifyToken': webhookToken.text.trim(),
      }) as Map).cast<String,dynamic>();
      if (!mounted) return;
      setState(() {
        configured = data['configured'] == true;
        source = '${data['source'] ?? 'database'}';
        secretMasked = '${data['appSecretMasked'] ?? ''}';
        appSecret.text = secretMasked;
        detectedPublicBaseUrl = '${data['detectedPublicBaseUrl'] ?? ''}';
        detectedPublicBaseUrlSource = '${data['detectedPublicBaseUrlSource'] ?? ''}';
        embeddedSignupOrigin = '${data['embeddedSignupOrigin'] ?? data['detectedPublicBaseUrl'] ?? ''}';
        embeddedSignupHostname = '${data['embeddedSignupHostname'] ?? ''}';
        webhookCallbackUrl = '${data['webhookCallbackUrl'] ?? ''}';
        webhookToken.text = '${data['webhookVerifyToken'] ?? webhookToken.text}';
      });
      showAppMessage(context, 'Meta platform settings saved securely. Business owners can now use Connect with Meta.');
    } catch (e) {
      if (mounted) showAppMessage(context, e is ApiException ? e.message : '$e', error: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }


  Future<void> _openMetaDevelopers() async {
    final uri = Uri.parse('https://business.facebook.com/business/loginpage/?next=https%3A%2F%2Fdevelopers.facebook.com%2F');
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      showAppMessage(context, 'Could not open Meta for Developers in the browser.', error: true);
    }
  }


  Future<void> _regenerateWebhookToken() async {
    try {
      final data = (await ref.read(apiClientProvider).post('/api/admin/meta-platform-settings/regenerate-webhook-token', data: {}) as Map).cast<String, dynamic>();
      if (!mounted) return;
      setState(() {
        webhookToken.text = '${data['webhookVerifyToken'] ?? ''}';
        webhookCallbackUrl = '${data['webhookCallbackUrl'] ?? webhookCallbackUrl}';
      });
      showAppMessage(context, 'New Meta webhook verify token generated and stored securely. Copy the token into Meta Production Setup.');
    } catch (e) {
      if (mounted) showAppMessage(context, e is ApiException ? e.message : '$e', error: true);
    }
  }

  Future<void> _testMetaSetup() async {
    setState(() => testing = true);
    try {
      final data = (await ref.read(apiClientProvider).post('/api/admin/meta-platform-settings/test', data: {}) as Map).cast<String, dynamic>();
      if (!mounted) return;
      showAppMessage(context, '${data['message'] ?? 'Meta platform setup is ready.'}');
    } catch (e) {
      if (mounted) showAppMessage(context, e is ApiException ? e.message : '$e', error: true);
    } finally {
      if (mounted) setState(() => testing = false);
    }
  }

  @override
  void dispose() { appId.dispose(); appSecret.dispose(); configId.dispose(); apiVersion.dispose(); publicBaseUrl.dispose(); webhookToken.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final u = ref.watch(authProvider).user;
    if (loading) return const Center(child: CircularProgressIndicator());
    return ListView(padding: const EdgeInsets.all(16), children: [
      const Text('Admin Profile & Settings', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Color(0xFF071A63))),
      const SizedBox(height: 16),
      Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(children: [
        CircleAvatar(radius: 34, backgroundColor: Theme.of(context).colorScheme.primary.withOpacity(.12), child: Text((u?.name.isNotEmpty == true ? u!.name[0] : 'A').toUpperCase(), style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: 24, fontWeight: FontWeight.w900))),
        const SizedBox(height: 12), Text(u?.name ?? 'Admin', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)), Text(u?.mobile ?? '', style: const TextStyle(color: Color(0xFF62729B))), const SizedBox(height: 8), const Chip(label: Text('SUPER ADMIN')),
        const SizedBox(height: 10),
        SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen())), icon: const Icon(Icons.edit_outlined), label: const Text('Edit Profile'))),
      ]))),
      const SizedBox(height: 14),
      Card(child: Column(children: [
        ListTile(leading: SoftIcon(Icons.fingerprint_rounded), title: const Text('Security & Biometric Login', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: const Text('Use device biometrics to bypass password entry'), trailing: const Icon(Icons.chevron_right_rounded), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SecuritySettingsScreen()))),
        const Divider(height: 1),
        ListTile(leading: SoftIcon(Icons.palette_outlined), title: const Text('Themes & Colors', style: TextStyle(fontWeight: FontWeight.w900)), subtitle: const Text('Change WishFlow accent colors in one tap'), trailing: const Icon(Icons.chevron_right_rounded), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AppearanceScreen()))),
        const Divider(height: 1),
        ListTile(leading: SoftIcon(Icons.privacy_tip_outlined), title: const Text('Privacy Policy', style: TextStyle(fontWeight: FontWeight.w900)), trailing: const Icon(Icons.chevron_right_rounded), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrivacyPolicyScreen()))),
        const Divider(height: 1),
        ListTile(leading: SoftIcon(Icons.description_outlined), title: const Text('Terms & Conditions', style: TextStyle(fontWeight: FontWeight.w900)), trailing: const Icon(Icons.chevron_right_rounded), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TermsConditionsScreen()))),
      ])),
      const SizedBox(height: 14),
      Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [const Icon(Icons.hub_outlined, color: Color(0xFF0867FF)), const SizedBox(width: 10), const Expanded(child: Text('Meta Platform Setup', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900))), Chip(label: Text(configured ? 'CONFIGURED' : 'NOT CONFIGURED'), backgroundColor: configured ? const Color(0xFFE2F8EB) : const Color(0xFFFFF0D9))]),
        const SizedBox(height: 6),
        const Text('One-time WishFlow platform setup. These values belong to the WishFlow Meta Developer App and only enable the secure Meta/Facebook login window. Every business owner still connects their own Meta account and receives their own WABA, Phone Number ID and access token.', style: TextStyle(color: Color(0xFF62729B), height: 1.4)),
        const SizedBox(height: 12),
        OutlinedButton.icon(onPressed: _openMetaDevelopers, icon: const Icon(Icons.open_in_new_rounded), label: const Text('Open Meta for Developers')),
        const SizedBox(height: 6),
        const Text('Create/configure the WishFlow Meta Developer App there, then paste its App ID, App Secret and Embedded Signup Configuration ID below. Business owners do not use these platform credentials; they connect their own Meta account later.', style: TextStyle(fontSize: 12, color: Color(0xFF7B89A8), height: 1.4)),
        const SizedBox(height: 16),
        if (error != null) ...[Text(error!, style: const TextStyle(color: Colors.red)), const SizedBox(height: 12)],
        TextField(controller: appId, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Meta App ID', prefixIcon: Icon(Icons.apps_outlined))),
        const SizedBox(height: 12),
        TextField(controller: appSecret, obscureText: hideSecret, decoration: InputDecoration(labelText: 'Meta App Secret', prefixIcon: const Icon(Icons.lock_outline), helperText: secretMasked.isEmpty ? 'Stored encrypted on the backend.' : 'Existing secret is masked. Enter a new value only to replace it.', suffixIcon: IconButton(onPressed: () => setState(() => hideSecret = !hideSecret), icon: Icon(hideSecret ? Icons.visibility_outlined : Icons.visibility_off_outlined)))),
        const SizedBox(height: 12),
        TextField(controller: configId, decoration: const InputDecoration(labelText: 'Embedded Signup Configuration ID', prefixIcon: Icon(Icons.verified_user_outlined))),
        const SizedBox(height: 12),
        TextField(controller: apiVersion, decoration: const InputDecoration(labelText: 'Graph API Version', hintText: 'v26.0', prefixIcon: Icon(Icons.api_outlined))),
        const SizedBox(height: 12),
        TextField(controller: publicBaseUrl, keyboardType: TextInputType.url, autocorrect: false, decoration: const InputDecoration(labelText: 'Embedded Signup HTTPS Origin Override (optional)', hintText: 'Leave blank for local ngrok auto-detect', prefixIcon: Icon(Icons.language_outlined), helperText: 'Local development: leave blank and run ngrok http 3000. WishFlow auto-detects the HTTPS origin that hosts the Embedded Signup Builder page. Production: enter your deployed HTTPS backend URL.')),
        const SizedBox(height: 12),
        TextField(controller: webhookToken, readOnly: true, decoration: const InputDecoration(labelText: 'Meta Webhook Verify Token', prefixIcon: Icon(Icons.key_outlined), helperText: 'Copy this exact token into Meta → WhatsApp → Production setup → Configure Webhooks → Verify token.')),
        const SizedBox(height: 8),
        SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: _regenerateWebhookToken, icon: const Icon(Icons.refresh_rounded), label: const Text('Regenerate Webhook Verify Token'))),
        if (webhookCallbackUrl.isNotEmpty) ...[
          const SizedBox(height: 8),
          Container(width: double.infinity, padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0xFFEAF8F0), borderRadius: BorderRadius.circular(12)), child: SelectableText('Meta Webhook Callback URL:\n$webhookCallbackUrl\n\nPaste this exact URL into Meta → Production setup → Configure Webhooks → Callback URL.', style: const TextStyle(color: Color(0xFF087443), fontSize: 12, fontWeight: FontWeight.w600))),
        ],

        if (detectedPublicBaseUrl.isNotEmpty) ...[
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: const Color(0xFFEAF8F0), borderRadius: BorderRadius.circular(12)),
            child: Text('Meta HTTPS URL detected: $detectedPublicBaseUrl${detectedPublicBaseUrlSource.isNotEmpty ? '  ($detectedPublicBaseUrlSource)' : ''}', style: const TextStyle(color: Color(0xFF087443), fontWeight: FontWeight.w700)),
          ),
          if (embeddedSignupOrigin.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: const Color(0xFFF3F6FF), borderRadius: BorderRadius.circular(12)),
              child: SelectableText(
                'Embedded Signup Builder origin:\n$embeddedSignupOrigin\n\n${embeddedSignupHostname.isEmpty ? '' : 'Hostname: $embeddedSignupHostname\n'}Add this HTTPS origin/hostname to the domains allowed for the Facebook JavaScript SDK / App Domains in your Meta Developer App. WishFlow launches the Builder Configuration ID instead of constructing a normal Facebook OAuth URL.',
                style: const TextStyle(color: Color(0xFF29447A), fontSize: 12, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ] else ...[
          const SizedBox(height: 10),
          const Text('Local development: start `ngrok http 3000`. WishFlow will detect the HTTPS tunnel automatically.', style: TextStyle(fontSize: 12, color: Color(0xFF7B89A8))),
        ],
        const SizedBox(height: 14),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: const Color(0xFFFFF8E8), borderRadius: BorderRadius.circular(12)),
          child: const Text('WishFlow uses the Configuration ID from your Meta Embedded Signup Builder. Recommended Builder setup: Login variation = WhatsApp Embedded Signup • Access token = System-user access token • Asset = WhatsApp accounts • Permissions = whatsapp_business_management + whatsapp_business_messaging.', style: TextStyle(fontSize: 12, color: Color(0xFF6D5310), height: 1.4)),
        ),
        const SizedBox(height: 16),
        SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: saving ? null : _save, icon: saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.save_outlined), label: Text(saving ? 'Saving…' : 'Save Meta Setup'))),
        const SizedBox(height: 10),
        SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: (!configured || testing) ? null : _testMetaSetup, icon: testing ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.verified_outlined), label: Text(testing ? 'Checking with Meta…' : 'Validate Meta Setup'))),
        const SizedBox(height: 8),
        Text(configured ? "Stored securely on WishFlow server${source == 'database' ? ' • database' : source == 'environment' ? ' • server configuration' : ''}" : 'Not configured yet. Save the WishFlow Meta Developer App values once to enable business-owner Meta login.', style: const TextStyle(fontSize: 12, color: Color(0xFF7B89A8))),
      ]))),
      const SizedBox(height: 12),
      const Card(child: ListTile(leading: Icon(Icons.security_outlined), title: Text('Secret storage'), subtitle: Text('The Meta App Secret and each business WhatsApp access token are encrypted before database storage. Business credentials are tenant-isolated.'))),
      const SizedBox(height: 14),
      FilledButton.icon(style: FilledButton.styleFrom(backgroundColor: Colors.redAccent), onPressed: () => ref.read(authProvider.notifier).signOut(), icon: const Icon(Icons.logout), label: const Text('Logout')),
    ]);
  }
}
