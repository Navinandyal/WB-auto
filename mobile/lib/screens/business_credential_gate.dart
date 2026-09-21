import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../providers/providers.dart';
import 'home_shell.dart';

class BusinessCredentialGate extends ConsumerWidget {
  const BusinessCredentialGate({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final account = ref.watch(whatsappAccountProvider);
    return account.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(
        body: Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.cloud_off_outlined, size: 56),
          const SizedBox(height: 16),
          Text('$e', textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(onPressed: () => ref.invalidate(whatsappAccountProvider), child: const Text('Retry')),
        ]))),
      ),
      data: (m) => m['configured'] == true ? const HomeShell() : WhatsAppCredentialOnboarding(initial: m),
    );
  }
}

class WhatsAppCredentialOnboarding extends ConsumerStatefulWidget {
  const WhatsAppCredentialOnboarding({super.key, required this.initial});
  final Map<String,dynamic> initial;
  @override
  ConsumerState<WhatsAppCredentialOnboarding> createState() => _WhatsAppCredentialOnboardingState();
}

class _WhatsAppCredentialOnboardingState extends ConsumerState<WhatsAppCredentialOnboarding> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _appId = TextEditingController(text: '${widget.initial['metaAppId'] ?? ''}');
  late final TextEditingController _secret = TextEditingController();
  late final TextEditingController _waba = TextEditingController(text: '${widget.initial['businessAccountId'] ?? ''}');
  late final TextEditingController _phoneId = TextEditingController(text: '${widget.initial['phoneNumberId'] ?? ''}');
  late final TextEditingController _token = TextEditingController();
  late final TextEditingController _verify = TextEditingController();
  late final TextEditingController _version = TextEditingController(text: '${widget.initial['apiVersion'] ?? 'v21.0'}');
  bool saving = false;
  bool tokenHidden = true;
  bool secretHidden = true;

  @override
  void dispose() {
    for (final c in [_appId,_secret,_waba,_phoneId,_token,_verify,_version]) { c.dispose(); }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => saving = true);
    try {
      await ref.read(apiClientProvider).post('/api/whatsapp/account', data: {
        'metaAppId': _appId.text.trim(),
        'metaAppSecret': _secret.text.trim(),
        'businessAccountId': _waba.text.trim(),
        'phoneNumberId': _phoneId.text.trim(),
        'accessToken': _token.text.trim(),
        'webhookVerifyToken': _verify.text.trim(),
        'apiVersion': _version.text.trim(),
      });
      ref.invalidate(whatsappAccountProvider);
      ref.invalidate(dashboardProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : '$e')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    return Scaffold(
      backgroundColor: const Color(0xFFF5F9FF),
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: const Text('Connect WhatsApp', style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF071A63))),
        actions: [IconButton(tooltip: 'Logout', onPressed: () => ref.read(authProvider.notifier).signOut(), icon: const Icon(Icons.logout))],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: Form(
                key: _form,
                child: Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: const BorderSide(color: Color(0xFFDDE7F6))),
                  child: Padding(
                    padding: const EdgeInsets.all(22),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      const CircleAvatar(radius: 31, backgroundColor: Color(0xFFE4FFF2), child: Icon(Icons.chat_rounded, color: Color(0xFF13A365), size: 34)),
                      const SizedBox(height: 16),
                      Text('Welcome${user?.businessName.isNotEmpty == true ? ', ${user!.businessName}' : ''}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Color(0xFF071A63))),
                      const SizedBox(height: 7),
                      const Text('Before using automations, connect this business\'s own WhatsApp Business Platform credentials.', textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF607096), height: 1.45)),
                      const SizedBox(height: 12),
                      Container(padding: const EdgeInsets.all(13), decoration: BoxDecoration(color: const Color(0xFFF0F6FF), borderRadius: BorderRadius.circular(12)), child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(Icons.lock_outline, color: Color(0xFF0867FF)), SizedBox(width: 10), Expanded(child: Text('Credentials are encrypted on the backend and stored for your account. They are not read from automation .env variables and are not shared with other businesses.', style: TextStyle(color: Color(0xFF42577E))))])),
                      const SizedBox(height: 20),
                      _field(_phoneId, 'Phone Number ID *', Icons.phone_android_outlined, required: true),
                      _field(_token, 'Permanent Access Token *', Icons.key_outlined, required: true, obscure: tokenHidden, suffix: IconButton(onPressed: () => setState(() => tokenHidden = !tokenHidden), icon: Icon(tokenHidden ? Icons.visibility_outlined : Icons.visibility_off_outlined))),
                      _field(_waba, 'WhatsApp Business Account ID', Icons.business_center_outlined),
                      _field(_appId, 'Meta App ID', Icons.apps_outlined),
                      _field(_secret, 'Meta App Secret', Icons.lock_outline, obscure: secretHidden, suffix: IconButton(onPressed: () => setState(() => secretHidden = !secretHidden), icon: Icon(secretHidden ? Icons.visibility_outlined : Icons.visibility_off_outlined))),
                      _field(_verify, 'Webhook Verify Token', Icons.verified_user_outlined),
                      _field(_version, 'Graph API Version', Icons.api_outlined),
                      const SizedBox(height: 8),
                      SizedBox(height: 50, child: FilledButton(style: FilledButton.styleFrom(backgroundColor: const Color(0xFF0867FF)), onPressed: saving ? null : _save, child: saving ? const SizedBox(width:22,height:22,child:CircularProgressIndicator(strokeWidth:2,color:Colors.white)) : const Text('Save & Continue', style: TextStyle(fontWeight: FontWeight.w700)))),
                    ]),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController c, String label, IconData icon, {bool required = false, bool obscure = false, Widget? suffix}) => Padding(
    padding: const EdgeInsets.only(bottom: 13),
    child: TextFormField(
      controller: c,
      obscureText: obscure,
      decoration: InputDecoration(labelText: label, prefixIcon: Icon(icon), suffixIcon: suffix, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
      validator: required ? (v) => (v == null || v.trim().isEmpty) ? 'Required' : null : null,
    ),
  );
}
