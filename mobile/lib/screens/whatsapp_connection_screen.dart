import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import 'meta_embedded_signup_screen.dart';

class WhatsAppConnectionScreen extends ConsumerWidget {
  const WhatsAppConnectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(whatsappAccountProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('WhatsApp Business')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(e, onRetry: () => ref.invalidate(whatsappAccountProvider)),
        data: (data) => _ConnectionBody(data: data),
      ),
    );
  }
}

class _ConnectionBody extends ConsumerWidget {
  const _ConnectionBody({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = '${data['connectionStatus'] ?? 'NOT_CONNECTED'}'.toUpperCase();
    final exists = data['exists'] == true;
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 14, 18, 30),
      children: [
        _StatusHero(status: status, data: data),
        const SizedBox(height: 16),
        if (!exists) ...[
          const Text('Connect WhatsApp Business', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
          const SizedBox(height: 6),
          const Text('WhatsApp is not required to sign in. Connect it when you are ready to send templates and automations.', style: TextStyle(color: BusinessColors.muted, height: 1.45)),
          const SizedBox(height: 18),
          _ChoiceCard(
            icon: Icons.tune_rounded,
            title: 'Manual Credential Setup',
            subtitle: 'POC mode. Enter this business\'s Meta/WABA credentials. Values are saved first and verified second.',
            button: 'Enter Credentials',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ManualWhatsAppConnectionScreen(initial: data))),
          ),
          const SizedBox(height: 12),
          _ChoiceCard(
            icon: Icons.verified_user_outlined,
            title: 'Meta Embedded Signup',
            subtitle: 'Production onboarding. The business signs in to Meta, selects its portfolio/WABA/number and grants permissions. WishFlow never asks for the Facebook password.',
            button: 'Connect with Meta',
            onTap: () async {
              final connected = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const MetaEmbeddedSignupScreen()));
              if (connected == true) {
                ref.invalidate(whatsappAccountProvider);
                ref.invalidate(dashboardProvider);
              }
            },
          ),
        ] else ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Saved WhatsApp Details', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
                const SizedBox(height: 14),
                _row('Meta App ID', '${data['metaAppId'] ?? ''}'),
                _row('WABA ID', '${data['businessAccountId'] ?? ''}'),
                _row('Phone Number ID', '${data['phoneNumberId'] ?? ''}'),
                _row('Business Number', '${data['businessPhone'] ?? data['displayPhoneNumber'] ?? ''}'),
                _row('Access Token', '${data['accessTokenMasked'] ?? ''}'),
                _row('App Secret', '${data['appSecretMasked'] ?? ''}'),
                _row('Webhook Token', '${data['webhookVerifyTokenMasked'] ?? ''}'),
                _row('Graph API', '${data['apiVersion'] ?? 'v21.0'}'),
              ]),
            ),
          ),
          if ('${data['lastConnectionError'] ?? ''}'.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: const Color(0xFFFFF1F2), borderRadius: BorderRadius.circular(14)),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.error_outline_rounded, color: Colors.redAccent),
                const SizedBox(width: 10),
                Expanded(child: Text('${data['lastConnectionError']}', style: const TextStyle(color: Color(0xFF8F1D2C)))),
              ]),
            ),
          ],
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: () => _test(context, ref),
            icon: const Icon(Icons.verified_rounded),
            label: Text(status == 'CONNECTED' ? 'Re-check Meta Connection' : 'Verify with Meta'),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ManualWhatsAppConnectionScreen(initial: data))),
            icon: const Icon(Icons.edit_outlined),
            label: const Text('Edit Saved Details'),
          ),
          const SizedBox(height: 10),
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
            onPressed: () => _disconnect(context, ref),
            icon: const Icon(Icons.link_off_rounded),
            label: const Text('Disconnect WhatsApp'),
          ),
        ],
      ],
    );
  }

  static Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(label, style: const TextStyle(color: BusinessColors.muted))),
          Expanded(child: Text(value.isEmpty ? '—' : value, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w800))),
        ]),
      );

  Future<void> _test(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(apiClientProvider).post('/api/whatsapp/connection/test', data: {});
      ref.invalidate(whatsappAccountProvider);
      ref.invalidate(dashboardProvider);
      if (context.mounted) showAppMessage(context, 'WhatsApp Business verified with Meta');
    } catch (e) {
      ref.invalidate(whatsappAccountProvider);
      if (context.mounted) showAppMessage(context, e is ApiException ? e.message : '$e', error: true);
    }
  }

  Future<void> _disconnect(BuildContext context, WidgetRef ref) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Disconnect WhatsApp?'),
        content: const Text('This removes the saved WhatsApp connection for this business. Existing contacts and automations are not deleted.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: Colors.redAccent), onPressed: () => Navigator.pop(ctx, true), child: const Text('Disconnect')),
        ],
      ),
    );
    if (yes != true) return;
    await ref.read(apiClientProvider).delete('/api/whatsapp/connection');
    ref.invalidate(whatsappAccountProvider);
    ref.invalidate(dashboardProvider);
  }

  void _showEmbeddedSignupInfo(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: const [
            Text('Meta Embedded Signup', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            SizedBox(height: 12),
            Text('1. Tap Connect WhatsApp Business.\n2. Meta opens its own secure Business Login.\n3. The business authenticates directly with Meta.\n4. Select/create Business Portfolio and WABA.\n5. Select/register the WhatsApp number.\n6. Grant requested permissions.\n7. Meta returns authorization to the WishFlow backend.\n8. WishFlow stores the WABA/Phone Number mapping for this logged-in business.\n9. The screen changes to Connected after verification.', style: TextStyle(height: 1.55)),
            SizedBox(height: 12),
            Text('WishFlow never collects the Facebook password. Embedded Signup requires a production Meta App configuration before the live button can be enabled.', style: TextStyle(color: BusinessColors.muted, height: 1.45)),
          ]),
        ),
      ),
    );
  }
}

class _StatusHero extends StatelessWidget {
  const _StatusHero({required this.status, required this.data});
  final String status;
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final connected = status == 'CONNECTED';
    final error = status == 'CONNECTION_ERROR';
    final saved = status == 'SAVED';
    final color = connected ? BusinessColors.green : error ? Colors.redAccent : saved ? Colors.orange : BusinessColors.muted;
    final icon = connected ? Icons.check_circle_rounded : error ? Icons.error_rounded : saved ? Icons.save_rounded : Icons.link_off_rounded;
    final title = connected ? 'WhatsApp Connected' : error ? 'Connection Error' : saved ? 'Credentials Saved' : 'WhatsApp Business not connected';
    final subtitle = connected
        ? '${data['verifiedName'] ?? 'Verified business'}${data['displayPhoneNumber'] != null ? ' • ${data['displayPhoneNumber']}' : ''}'
        : saved
            ? 'Meta connection has not been verified yet.'
            : error
                ? 'Your saved credentials are still kept. Fix the issue and verify again.'
                : 'Connect WhatsApp Business to enable automation.';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          CircleAvatar(radius: 27, backgroundColor: color.withOpacity(.12), child: Icon(icon, color: color, size: 30)),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
            const SizedBox(height: 5),
            Text(subtitle, style: const TextStyle(color: BusinessColors.muted, height: 1.4)),
            if (connected && data['qualityRating'] != null) ...[
              const SizedBox(height: 6),
              Text('Quality: ${data['qualityRating']}', style: TextStyle(color: color, fontWeight: FontWeight.w800)),
            ],
          ])),
        ]),
      ),
    );
  }
}

class _ChoiceCard extends StatelessWidget {
  const _ChoiceCard({required this.icon, required this.title, required this.subtitle, required this.button, required this.onTap});
  final IconData icon;
  final String title, subtitle, button;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SoftIcon(icon),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text(subtitle, style: const TextStyle(color: BusinessColors.muted, height: 1.45)),
            const SizedBox(height: 14),
            SizedBox(width: double.infinity, child: FilledButton(onPressed: onTap, child: Text(button))),
          ]),
        ),
      );
}

class ManualWhatsAppConnectionScreen extends ConsumerStatefulWidget {
  const ManualWhatsAppConnectionScreen({super.key, required this.initial});
  final Map<String, dynamic> initial;
  @override
  ConsumerState<ManualWhatsAppConnectionScreen> createState() => _ManualWhatsAppConnectionScreenState();
}

class _ManualWhatsAppConnectionScreenState extends ConsumerState<ManualWhatsAppConnectionScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _appId = TextEditingController(text: '${widget.initial['metaAppId'] ?? ''}');
  late final TextEditingController _waba = TextEditingController(text: '${widget.initial['businessAccountId'] ?? ''}');
  late final TextEditingController _phoneId = TextEditingController(text: '${widget.initial['phoneNumberId'] ?? ''}');
  late final TextEditingController _businessPhone = TextEditingController(text: '${widget.initial['businessPhone'] ?? ''}');
  late final TextEditingController _token = TextEditingController();
  late final TextEditingController _secret = TextEditingController();
  late final TextEditingController _verify = TextEditingController();
  late final TextEditingController _version = TextEditingController(text: '${widget.initial['apiVersion'] ?? 'v21.0'}');
  bool _saving = false;
  bool _hideToken = true;
  bool _hideSecret = true;

  @override
  void dispose() {
    for (final c in [_appId, _waba, _phoneId, _businessPhone, _token, _secret, _verify, _version]) { c.dispose(); }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final alreadySaved = widget.initial['exists'] == true;
    return Scaffold(
      appBar: AppBar(title: const Text('Manual WhatsApp Setup')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(18),
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: const Color(0xFFEFFAF5), borderRadius: BorderRadius.circular(14)),
              child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.lock_outline_rounded, color: BusinessColors.greenDark),
                SizedBox(width: 10),
                Expanded(child: Text('Save first, verify second. Sensitive values are encrypted on the backend. A failed Meta verification never clears the saved values.')),
              ]),
            ),
            const SizedBox(height: 16),
            _field(_appId, 'Meta App ID', Icons.apps_outlined, digits: true),
            _field(_waba, 'WABA ID', Icons.business_center_outlined, digits: true),
            _field(_phoneId, 'Phone Number ID', Icons.phone_android_outlined, digits: true),
            _field(_businessPhone, 'Business WhatsApp Number', Icons.call_outlined),
            _field(_token, alreadySaved ? 'Permanent Access Token (leave blank to keep saved)' : 'Permanent Access Token', Icons.key_outlined, obscure: _hideToken, suffix: IconButton(onPressed: () => setState(() => _hideToken = !_hideToken), icon: Icon(_hideToken ? Icons.visibility_outlined : Icons.visibility_off_outlined))),
            _field(_secret, alreadySaved ? 'App Secret (leave blank to keep saved)' : 'App Secret', Icons.lock_outline, obscure: _hideSecret, suffix: IconButton(onPressed: () => setState(() => _hideSecret = !_hideSecret), icon: Icon(_hideSecret ? Icons.visibility_outlined : Icons.visibility_off_outlined))),
            _field(_verify, alreadySaved ? 'Webhook Verify Token (leave blank to keep saved)' : 'Webhook Verify Token', Icons.verified_user_outlined),
            _field(_version, 'Graph API Version', Icons.api_outlined, validator: (v) => RegExp(r'^v\d+\.\d+$').hasMatch((v ?? '').trim()) ? null : 'Use format like v21.0'),
            const SizedBox(height: 6),
            FilledButton.icon(onPressed: _saving ? null : _save, icon: const Icon(Icons.save_outlined), label: Text(_saving ? 'Saving...' : 'Save Connection')),
          ],
        ),
      ),
    );
  }

  Widget _field(TextEditingController c, String label, IconData icon, {bool obscure = false, bool digits = false, Widget? suffix, String? Function(String?)? validator}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: c,
          obscureText: obscure,
          keyboardType: digits ? TextInputType.number : TextInputType.text,
          decoration: InputDecoration(labelText: label, prefixIcon: Icon(icon), suffixIcon: suffix),
          validator: validator,
        ),
      );

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await ref.read(apiClientProvider).put('/api/whatsapp/connection', data: {
        'metaAppId': _appId.text.trim(),
        'businessAccountId': _waba.text.trim(),
        'phoneNumberId': _phoneId.text.trim(),
        'businessPhone': _businessPhone.text.trim(),
        'accessToken': _token.text.trim(),
        'appSecret': _secret.text.trim(),
        'webhookVerifyToken': _verify.text.trim(),
        'apiVersion': _version.text.trim(),
      });
      ref.invalidate(whatsappAccountProvider);
      ref.invalidate(dashboardProvider);
      if (mounted) {
        showAppMessage(context, 'WhatsApp Details Saved');
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) showAppMessage(context, e is ApiException ? e.message : '$e', error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}
