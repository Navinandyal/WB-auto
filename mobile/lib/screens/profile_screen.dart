import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _email;
  late final TextEditingController _businessName;
  late final TextEditingController _businessAddress;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authProvider).user;
    _name = TextEditingController(text: user?.name ?? '');
    _email = TextEditingController(text: user?.email ?? '');
    _businessName = TextEditingController(text: user?.businessName ?? '');
    _businessAddress = TextEditingController(text: user?.businessAddress ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _businessName.dispose();
    _businessAddress.dispose();
    super.dispose();
  }

  String? _required(String? value, String label, {int min = 2}) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return '$label is required';
    if (v.length < min) return 'Enter a valid $label';
    return null;
  }

  String? _emailValidator(String? value) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return null;
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v)) return 'Enter a valid email address';
    return null;
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final user = ref.read(authProvider).user;
    if (user == null) return;
    setState(() => _saving = true);
    final ok = await ref.read(authProvider.notifier).updateProfile(
          name: _name.text,
          email: _email.text,
          businessName: user.isAdmin ? user.businessName : _businessName.text,
          businessAddress: user.isAdmin ? user.businessAddress : _businessAddress.text,
        );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      showAppMessage(context, 'Profile updated successfully.');
    } else {
      showAppMessage(context, ref.read(authProvider).error ?? 'Unable to update profile.', error: true);
    }
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (user == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final accent = Theme.of(context).colorScheme.primary;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 34),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 42,
                      backgroundColor: accent.withOpacity(.12),
                      child: Text(_initials(user.name), style: TextStyle(color: accent, fontWeight: FontWeight.w900, fontSize: 27)),
                    ),
                    const SizedBox(height: 12),
                    Text(user.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
                    const SizedBox(height: 4),
                    Text(user.mobile, style: const TextStyle(color: BusinessColors.muted)),
                    const SizedBox(height: 10),
                    Chip(label: Text(user.isAdmin ? 'SUPER ADMIN' : 'BUSINESS OWNER')),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text('Personal Information', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
            const SizedBox(height: 10),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    TextFormField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Full name', prefixIcon: Icon(Icons.person_outline_rounded)),
                      validator: (v) => _required(v, 'full name'),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Email address', prefixIcon: Icon(Icons.email_outlined)),
                      validator: _emailValidator,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      initialValue: user.mobile,
                      readOnly: true,
                      decoration: const InputDecoration(
                        labelText: 'Login mobile number',
                        prefixIcon: Icon(Icons.phone_outlined),
                        helperText: 'Your login number is protected from profile edits. Contact the administrator to change it.',
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (!user.isAdmin) ...[
              const SizedBox(height: 18),
              const Text('Business Information', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
              const SizedBox(height: 10),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      TextFormField(
                        controller: _businessName,
                        textCapitalization: TextCapitalization.words,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(labelText: 'Business name', prefixIcon: Icon(Icons.business_outlined)),
                        validator: (v) => _required(v, 'business name'),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _businessAddress,
                        minLines: 2,
                        maxLines: 4,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(labelText: 'Business address', prefixIcon: Icon(Icons.location_on_outlined)),
                        validator: (v) => _required(v, 'business address', min: 3),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.save_outlined),
                label: Text(_saving ? 'Saving…' : 'Save Changes'),
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Changes are saved to your WishFlow account and are visible only to authorized users and the platform administrator.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: BusinessColors.muted, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}
