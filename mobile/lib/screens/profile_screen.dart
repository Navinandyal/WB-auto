import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import '../widgets/data_image.dart';

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
  String? _businessLogoData;
  bool _logoChanged = false;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authProvider).user;
    _name = TextEditingController(text: user?.name ?? '');
    _email = TextEditingController(text: user?.email ?? '');
    _businessName = TextEditingController(text: user?.businessName ?? '');
    _businessAddress = TextEditingController(text: user?.businessAddress ?? '');
    _businessLogoData = user?.businessLogoData;
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

  String? _nameValidator(String? value) {
    final name = value?.trim() ?? '';
    if (name.isEmpty) return 'Full name is required';
    if (name.length < 2 || name.length > 80) return 'Enter a valid full name';
    if (!RegExp(
      r"^[\p{L}][\p{L}\p{M} .'-]{1,79}$",
      unicode: true,
    ).hasMatch(name)) {
      return 'Use letters, spaces, apostrophes, periods and hyphens only';
    }
    return null;
  }

  Future<void> _pickBusinessLogo() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['png', 'jpg', 'jpeg', 'webp'],
      withData: true,
    );
    if (result == null || result.files.single.bytes == null) return;
    final file = result.files.single;
    final bytes = file.bytes!;
    if (bytes.length > 1500000) {
      if (mounted)
        showAppMessage(
          context,
          'Business logo must be 1.5 MB or smaller.',
          error: true,
        );
      return;
    }
    final extension = (file.extension ?? 'png').toLowerCase();
    final mime = extension == 'jpg' || extension == 'jpeg'
        ? 'image/jpeg'
        : extension == 'webp'
        ? 'image/webp'
        : 'image/png';
    setState(() {
      _businessLogoData = 'data:$mime;base64,${base64Encode(bytes)}';
      _logoChanged = true;
    });
  }

  void _removeBusinessLogo() {
    setState(() {
      _businessLogoData = '';
      _logoChanged = true;
    });
  }

  String? _emailValidator(String? value) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return null;
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v))
      return 'Enter a valid email address';
    return null;
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final user = ref.read(authProvider).user;
    if (user == null) return;
    setState(() => _saving = true);
    final ok = await ref
        .read(authProvider.notifier)
        .updateProfile(
          name: _name.text,
          email: _email.text,
          businessName: user.isAdmin ? user.businessName : _businessName.text,
          businessAddress: user.isAdmin
              ? user.businessAddress
              : _businessAddress.text,
          businessLogoData: !user.isAdmin && _logoChanged
              ? (_businessLogoData ?? '')
              : null,
        );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      showAppMessage(context, 'Profile updated successfully.');
    } else {
      showAppMessage(
        context,
        ref.read(authProvider).error ?? 'Unable to update profile.',
        error: true,
      );
    }
  }

  Widget _accountStatusBadge() => ref
      .watch(accountStatusProvider)
      .when(
        loading: () => const SizedBox(
          width: 64,
          height: 22,
          child: LinearProgressIndicator(minHeight: 2),
        ),
        error: (_, __) =>
            const Text('Status unavailable', style: TextStyle(fontSize: 10)),
        data: (data) {
          final status = '${data['status'] ?? ''}'.toUpperCase();
          final label = data['billingPending'] == true
              ? 'Billing pending'
              : status == 'SUSPENDED'
              ? 'Suspended'
              : status == 'DEACTIVATED'
              ? 'Deactivated'
              : ['ACTIVE', 'APPROVED'].contains(status)
              ? 'Active'
              : 'Pending';
          final color = label == 'Active'
              ? BusinessColors.green
              : label == 'Suspended' || label == 'Deactivated'
              ? Colors.red
              : Colors.orange;
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: color.withOpacity(.10),
              border: Border.all(color: color.withOpacity(.25)),
              borderRadius: BorderRadius.circular(5),
            ),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          );
        },
      );

  Widget _accountStatusNotice() => ref
      .watch(accountStatusProvider)
      .when(
        loading: () => const SizedBox.shrink(),
        error: (_, __) => const SizedBox.shrink(),
        data: (data) {
          final status = '${data['status'] ?? ''}'.toUpperCase();
          final suspended = !['ACTIVE', 'APPROVED'].contains(status);
          final pending = data['billingPending'] == true;
          if (!suspended && !pending) return const SizedBox.shrink();
          return Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  suspended
                      ? 'Your account is ${status.toLowerCase()}. Messaging is paused. Contact support for help.'
                      : 'Billing pending: your package request is waiting for payment or confirmation.',
                  style: const TextStyle(fontSize: 12, height: 1.4),
                ),
              ),
            ),
          );
        },
      );

  Widget _businessInfoLine(IconData icon, String value) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Icon(icon, size: 18, color: BusinessColors.muted),
      const SizedBox(width: 8),
      Expanded(
        child: Text(
          value,
          style: const TextStyle(
            fontSize: 15,
            color: BusinessColors.muted,
            height: 1.45,
          ),
        ),
      ),
    ],
  );

  String _initials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((e) => e.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (user == null)
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final accent = Theme.of(context).colorScheme.primary;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(accountStatusProvider);
          await ref.read(accountStatusProvider.future);
        },
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 34),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              user.isAdmin ? 'Super Admin' : 'Business Owner',
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: BusinessColors.muted,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (!user.isAdmin) _accountStatusBadge(),
                        ],
                      ),
                      const SizedBox(height: 18),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          DataImageAvatar(
                            data: user.isAdmin ? null : user.businessLogoData,
                            radius: 38,
                            fallbackText: _initials(user.name),
                            backgroundColor: accent.withOpacity(.12),
                            foregroundColor: accent,
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  user.businessName.isEmpty
                                      ? user.name
                                      : user.businessName,
                                  style: const TextStyle(
                                    fontSize: 24,
                                    fontWeight: FontWeight.w900,
                                    color: BusinessColors.ink,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  user.name,
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                _businessInfoLine(
                                  Icons.phone_outlined,
                                  user.mobile,
                                ),
                                if (user.businessAddress.isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  _businessInfoLine(
                                    Icons.location_on_outlined,
                                    user.businessAddress,
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              _accountStatusNotice(),
              const SizedBox(height: 22),
              const Text(
                'Personal Information',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  color: BusinessColors.ink,
                ),
              ),
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
                        decoration: const InputDecoration(
                          labelText: 'Full name',
                          prefixIcon: Icon(Icons.person_outline_rounded),
                        ),
                        validator: _nameValidator,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(
                          labelText: 'Email address',
                          prefixIcon: Icon(Icons.email_outlined),
                        ),
                        validator: _emailValidator,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        initialValue: user.mobile,
                        readOnly: true,
                        decoration: const InputDecoration(
                          labelText: 'Login mobile number',
                          prefixIcon: Icon(Icons.phone_outlined),
                          helperText:
                              'Your login number is protected from profile edits. Contact the administrator to change it.',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (!user.isAdmin) ...[
                const SizedBox(height: 18),
                const Text(
                  'Business Information',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: BusinessColors.ink,
                  ),
                ),
                const SizedBox(height: 10),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        DataImageAvatar(
                          data: _businessLogoData,
                          radius: 34,
                          fallbackText: _initials(
                            _businessName.text.isEmpty
                                ? user.name
                                : _businessName.text,
                          ),
                        ),
                        const SizedBox(width: 14),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Business Logo',
                                style: TextStyle(fontWeight: FontWeight.w900),
                              ),
                              SizedBox(height: 3),
                              Text(
                                'Shown with your business identity in GreetSync.',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: BusinessColors.muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        PopupMenuButton<String>(
                          onSelected: (value) {
                            if (value == 'upload') _pickBusinessLogo();
                            if (value == 'remove') _removeBusinessLogo();
                          },
                          itemBuilder: (_) => [
                            const PopupMenuItem(
                              value: 'upload',
                              child: Text('Upload / Change logo'),
                            ),
                            if ((_businessLogoData ?? '').isNotEmpty)
                              const PopupMenuItem(
                                value: 'remove',
                                child: Text('Remove logo'),
                              ),
                          ],
                          child: const Padding(
                            padding: EdgeInsets.all(8),
                            child: Icon(Icons.add_a_photo_outlined),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
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
                          decoration: const InputDecoration(
                            labelText: 'Business name',
                            prefixIcon: Icon(Icons.business_outlined),
                          ),
                          validator: (v) => _required(v, 'business name'),
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _businessAddress,
                          minLines: 2,
                          maxLines: 4,
                          textCapitalization: TextCapitalization.sentences,
                          decoration: const InputDecoration(
                            labelText: 'Business address',
                            prefixIcon: Icon(Icons.location_on_outlined),
                          ),
                          validator: (v) =>
                              _required(v, 'business address', min: 3),
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
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(_saving ? 'Saving…' : 'Save Changes'),
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Changes are saved to your GreetSync account and are visible only to authorized users and the platform administrator.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  color: BusinessColors.muted,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
