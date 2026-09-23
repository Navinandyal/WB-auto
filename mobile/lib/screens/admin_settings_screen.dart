import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../providers/providers.dart';
import '../widgets/common.dart';

class AdminSettingsScreen extends ConsumerStatefulWidget {
  const AdminSettingsScreen({super.key});
  @override
  ConsumerState<AdminSettingsScreen> createState() => _AdminSettingsScreenState();
}

class _AdminSettingsScreenState extends ConsumerState<AdminSettingsScreen> {
  final appId = TextEditingController();
  final appSecret = TextEditingController();
  final configId = TextEditingController();
  final apiVersion = TextEditingController(text: 'v21.0');
  bool loading = true;
  bool saving = false;
  bool testing = false;
  bool hideSecret = true;
  bool configured = false;
  String source = '';
  String secretMasked = '';
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
        apiVersion.text = '${data['apiVersion'] ?? 'v21.0'}';
        secretMasked = '${data['appSecretMasked'] ?? ''}';
        appSecret.text = secretMasked;
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
    setState(() => saving = true);
    try {
      final data = (await ref.read(apiClientProvider).put('/api/admin/meta-platform-settings', data: {
        'metaAppId': appId.text.trim(),
        'appSecret': appSecret.text.trim(),
        'embeddedSignupConfigId': configId.text.trim(),
        'apiVersion': apiVersion.text.trim(),
      }) as Map).cast<String,dynamic>();
      if (!mounted) return;
      setState(() {
        configured = data['configured'] == true;
        source = '${data['source'] ?? 'database'}';
        secretMasked = '${data['appSecretMasked'] ?? ''}';
        appSecret.text = secretMasked;
      });
      showAppMessage(context, 'Meta platform settings saved securely. Business owners can now use Connect with Meta.');
    } catch (e) {
      if (mounted) showAppMessage(context, e is ApiException ? e.message : '$e', error: true);
    } finally {
      if (mounted) setState(() => saving = false);
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
  void dispose() { appId.dispose(); appSecret.dispose(); configId.dispose(); apiVersion.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final u = ref.watch(authProvider).user;
    if (loading) return const Center(child: CircularProgressIndicator());
    return ListView(padding: const EdgeInsets.all(16), children: [
      const Text('Admin Profile & Settings', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Color(0xFF071A63))),
      const SizedBox(height: 16),
      Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(children: [
        CircleAvatar(radius: 34, backgroundColor: const Color(0xFF3450C9), child: Text((u?.name.isNotEmpty == true ? u!.name[0] : 'A').toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900))),
        const SizedBox(height: 12), Text(u?.name ?? 'Admin', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)), Text(u?.mobile ?? '', style: const TextStyle(color: Color(0xFF62729B))), const SizedBox(height: 8), const Chip(label: Text('SUPER ADMIN')),
      ]))),
      const SizedBox(height: 14),
      Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [const Icon(Icons.hub_outlined, color: Color(0xFF0867FF)), const SizedBox(width: 10), const Expanded(child: Text('Meta Platform Setup', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900))), Chip(label: Text(configured ? 'CONFIGURED' : 'NOT CONFIGURED'), backgroundColor: configured ? const Color(0xFFE2F8EB) : const Color(0xFFFFF0D9))]),
        const SizedBox(height: 6),
        const Text('One-time WishFlow platform setup. These values belong to the WishFlow Meta Developer App and only enable the secure Meta/Facebook login window. Every business owner still connects their own Meta account and receives their own WABA, Phone Number ID and access token.', style: TextStyle(color: Color(0xFF62729B), height: 1.4)),
        const SizedBox(height: 16),
        if (error != null) ...[Text(error!, style: const TextStyle(color: Colors.red)), const SizedBox(height: 12)],
        TextField(controller: appId, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Meta App ID', prefixIcon: Icon(Icons.apps_outlined))),
        const SizedBox(height: 12),
        TextField(controller: appSecret, obscureText: hideSecret, decoration: InputDecoration(labelText: 'Meta App Secret', prefixIcon: const Icon(Icons.lock_outline), helperText: secretMasked.isEmpty ? 'Stored encrypted on the backend.' : 'Existing secret is masked. Enter a new value only to replace it.', suffixIcon: IconButton(onPressed: () => setState(() => hideSecret = !hideSecret), icon: Icon(hideSecret ? Icons.visibility_outlined : Icons.visibility_off_outlined)))),
        const SizedBox(height: 12),
        TextField(controller: configId, decoration: const InputDecoration(labelText: 'Embedded Signup Configuration ID', prefixIcon: Icon(Icons.verified_user_outlined))),
        const SizedBox(height: 12),
        TextField(controller: apiVersion, decoration: const InputDecoration(labelText: 'Graph API Version', hintText: 'v21.0', prefixIcon: Icon(Icons.api_outlined))),
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
