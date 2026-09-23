import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import 'whatsapp_connection_screen.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 90),
      children: [
        Row(children: [
          CircleAvatar(radius: 30, backgroundColor: const Color(0xFFEAF2FF), child: Text(_initials(user?.name ?? 'U'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFF2F80ED)))),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(user?.name ?? 'Business User', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
            const SizedBox(height: 3),
            Text(user?.mobile ?? '', style: const TextStyle(color: BusinessColors.muted)),
            if (user?.businessName.isNotEmpty == true) Text(user!.businessName, style: const TextStyle(color: BusinessColors.greenDark, fontWeight: FontWeight.w700)),
          ])),
        ]),
        const SizedBox(height: 18),
        const Text('Profile & Settings', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
        const SizedBox(height: 14),
        _tile(context, Icons.business_outlined, 'Business Profile', 'View your registered business information', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const BusinessProfileScreen()))),
        _tile(context, Icons.chat_outlined, 'WhatsApp Configuration', 'Connect, verify and manage this business WhatsApp account', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const WhatsAppConnectionScreen()))),
        _tile(context, Icons.cake_outlined, 'Birthday WishFlow', 'Birthday automation settings', () => _showInfo(context, 'Birthday settings are available from the Birthday WishFlow module.')),
        _tile(context, Icons.security_outlined, 'Security', 'Account and credential security', () => _showInfo(context, 'Your login password and WhatsApp secrets are stored securely by the backend.')),
        _tile(context, Icons.help_outline_rounded, 'Help & Support', 'Setup and troubleshooting information', () => _showInfo(context, 'For local Android testing, keep the backend running and use adb reverse tcp:3000 tcp:3000.')),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(foregroundColor: Colors.redAccent, side: const BorderSide(color: Color(0xFFFFCDD5))),
          onPressed: () => _logout(context, ref),
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Logout'),
        ),
      ],
    );
  }

  static String _initials(String s) {
    final p = s.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
    if (p.isEmpty) return 'U';
    return p.length == 1 ? p.first[0].toUpperCase() : '${p.first[0]}${p.last[0]}'.toUpperCase();
  }

  Widget _tile(BuildContext context, IconData icon, String title, String subtitle, VoidCallback onTap) => Padding(
    padding: const EdgeInsets.only(bottom: 9),
    child: Card(child: ListTile(contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8), leading: SoftIcon(icon), title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)), subtitle: Text(subtitle), trailing: const Icon(Icons.chevron_right_rounded), onTap: onTap)),
  );

  void _showInfo(BuildContext context, String text) => showDialog<void>(context: context, builder: (_) => AlertDialog(title: const Text('WishFlow'), content: Text(text), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))]));

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final yes = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Logout?'),
      content: const Text('Are you sure you want to logout from your account?'),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(style: FilledButton.styleFrom(backgroundColor: Colors.red), onPressed: () => Navigator.pop(ctx, true), child: const Text('Logout'))],
    ));
    if (yes == true) await ref.read(authProvider.notifier).signOut();
  }
}

class BusinessProfileScreen extends ConsumerWidget {
  const BusinessProfileScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(authProvider).user;
    return Scaffold(appBar: AppBar(title: const Text('Business Profile')), body: ListView(padding: const EdgeInsets.all(18), children: [
      Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SoftIcon(Icons.business_rounded), const SizedBox(height: 14),
        Text(u?.businessName.isNotEmpty == true ? u!.businessName : 'Business', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
        const SizedBox(height: 18),
        _row('Owner', u?.name ?? ''), _row('Mobile', u?.mobile ?? ''), _row('Email', u?.email.isNotEmpty == true ? u!.email : 'Not provided'), _row('Account Status', u?.approvalStatus ?? ''),
      ]))),
    ]));
  }
  static Widget _row(String a, String b) => Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: Text(a, style: const TextStyle(color: BusinessColors.muted))), Expanded(child: Text(b, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w800)))]));
}

class WhatsAppSettingsPage extends ConsumerWidget {
  const WhatsAppSettingsPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(whatsappAccountProvider);
    return Scaffold(appBar: AppBar(title: const Text('WhatsApp Configuration')), body: a.when(loading: () => const Center(child: CircularProgressIndicator()), error: (e, _) => ErrorState(e, onRetry: () => ref.invalidate(whatsappAccountProvider)), data: (m) => _WhatsAppForm(initial: m)));
  }
}

class _WhatsAppForm extends ConsumerStatefulWidget {
  const _WhatsAppForm({required this.initial});
  final Map<String,dynamic> initial;
  @override
  ConsumerState<_WhatsAppForm> createState() => _WhatsAppFormState();
}

class _WhatsAppFormState extends ConsumerState<_WhatsAppForm> {
  final form = GlobalKey<FormState>();
  late final appId = TextEditingController(text: '${widget.initial['metaAppId'] ?? ''}');
  late final secret = TextEditingController();
  late final waba = TextEditingController(text: '${widget.initial['businessAccountId'] ?? ''}');
  late final phone = TextEditingController(text: '${widget.initial['phoneNumberId'] ?? ''}');
  late final token = TextEditingController();
  late final verify = TextEditingController();
  late final version = TextEditingController(text: '${widget.initial['apiVersion'] ?? 'v21.0'}');
  bool saving = false;
  bool hideToken = true;
  bool hideSecret = true;

  @override
  void dispose() { for (final c in [appId,secret,waba,phone,token,verify,version]) { c.dispose(); } super.dispose(); }

  String? _digits(String? value, String label, {bool required = false}) {
    final v = value?.trim() ?? '';
    if (required && v.isEmpty) return '$label is required';
    if (v.isNotEmpty && !RegExp(r'^\d{5,30}$').hasMatch(v)) return 'Enter a valid numeric $label';
    return null;
  }

  @override
  Widget build(BuildContext context) => Form(key: form, child: ListView(padding: const EdgeInsets.fromLTRB(18, 12, 18, 28), children: [
    Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(children: [
      const SoftIcon(Icons.chat_rounded), const SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('WhatsApp Connection', style: TextStyle(fontWeight: FontWeight.w900)), const SizedBox(height: 4), Text(widget.initial['configured'] == true ? 'Connected' : 'Setup required', style: TextStyle(color: widget.initial['configured'] == true ? BusinessColors.green : Colors.orange, fontWeight: FontWeight.w700))])),
    ]))),
    const SizedBox(height: 14),
    Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
      TextFormField(controller: phone, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Phone Number ID *', prefixIcon: Icon(Icons.phone_android_outlined)), validator: (v) => _digits(v, 'Phone Number ID', required: true)),
      const SizedBox(height: 12),
      TextFormField(controller: waba, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Business Account ID', prefixIcon: Icon(Icons.business_center_outlined)), validator: (v) => _digits(v, 'Business Account ID')),
      const SizedBox(height: 12),
      TextFormField(controller: appId, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Meta App ID', prefixIcon: Icon(Icons.apps_outlined)), validator: (v) => _digits(v, 'Meta App ID')),
      const SizedBox(height: 12),
      TextFormField(controller: token, obscureText: hideToken, minLines: 1, maxLines: 1, decoration: InputDecoration(labelText: 'Permanent Access Token ${widget.initial['hasToken'] == true ? '(leave blank to keep saved)' : '*'}', prefixIcon: const Icon(Icons.key_outlined), suffixIcon: IconButton(onPressed: () => setState(() => hideToken = !hideToken), icon: Icon(hideToken ? Icons.visibility_outlined : Icons.visibility_off_outlined))), validator: (v) { if (widget.initial['hasToken'] != true && (v == null || v.trim().length < 20)) return 'Enter a valid access token'; if (v != null && v.isNotEmpty && v.trim().length < 20) return 'Access token looks too short'; return null; }),
      const SizedBox(height: 12),
      TextFormField(controller: secret, obscureText: hideSecret, decoration: InputDecoration(labelText: 'Meta App Secret (optional)', prefixIcon: const Icon(Icons.lock_outline), suffixIcon: IconButton(onPressed: () => setState(() => hideSecret = !hideSecret), icon: Icon(hideSecret ? Icons.visibility_outlined : Icons.visibility_off_outlined)))),
      const SizedBox(height: 12),
      TextFormField(controller: verify, decoration: const InputDecoration(labelText: 'Webhook Verify Token (optional)', prefixIcon: Icon(Icons.verified_user_outlined))),
      const SizedBox(height: 12),
      TextFormField(controller: version, decoration: const InputDecoration(labelText: 'Graph API Version', prefixIcon: Icon(Icons.api_outlined)), validator: (v) => RegExp(r'^v\d+\.\d+$').hasMatch(v?.trim() ?? '') ? null : 'Use format like v21.0'),
    ]))),
    const SizedBox(height: 16),
    OutlinedButton.icon(onPressed: _test, icon: const Icon(Icons.wifi_tethering_rounded), label: const Text('Test Connection')),
    const SizedBox(height: 10),
    FilledButton.icon(onPressed: saving ? null : _save, icon: const Icon(Icons.save_outlined), label: Text(saving ? 'Saving...' : 'Save Configuration')),
  ]));

  Future<void> _save() async {
    if (!form.currentState!.validate()) return;
    setState(() => saving = true);
    try {
      await ref.read(apiClientProvider).post('/api/whatsapp/account', data: {'metaAppId': appId.text.trim(), 'metaAppSecret': secret.text.trim(), 'businessAccountId': waba.text.trim(), 'phoneNumberId': phone.text.trim(), 'accessToken': token.text.trim(), 'webhookVerifyToken': verify.text.trim(), 'apiVersion': version.text.trim()});
      ref.invalidate(whatsappAccountProvider); ref.invalidate(dashboardProvider);
      if (mounted) showAppMessage(context, 'WhatsApp configuration saved');
    } catch (e) { if (mounted) showAppMessage(context, '$e', error: true); }
    finally { if (mounted) setState(() => saving = false); }
  }

  Future<void> _test() async {
    if (!form.currentState!.validate()) return;
    try {
      final r = await ref.read(apiClientProvider).post('/api/whatsapp/test', data: {'phoneNumberId': phone.text.trim(), 'accessToken': token.text.trim(), 'apiVersion': version.text.trim()});
      if (mounted) showAppMessage(context, (r is Map ? (r['message'] ?? 'Connection test completed') : 'Connection test completed').toString());
    } catch (e) { if (mounted) showAppMessage(context, '$e', error: true); }
  }
}
