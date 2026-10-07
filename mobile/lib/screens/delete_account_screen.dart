import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class DeactivateAccountScreen extends ConsumerStatefulWidget {
  const DeactivateAccountScreen({super.key});
  @override
  ConsumerState<DeactivateAccountScreen> createState() =>
      _DeactivateAccountScreenState();
}

class _DeactivateAccountScreenState
    extends ConsumerState<DeactivateAccountScreen> {
  final _password = TextEditingController();
  bool _hide = true;
  bool _deleting = false;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    if (_password.text.isEmpty) {
      showAppMessage(context, 'Enter your current password.', error: true);
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Deactivate GreetSync account?'),
        content: const Text(
          'Your account will be disabled and you will be signed out. Your business data stays saved. Contact support to reactivate your account.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Deactivate Account'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _deleting = true);
    try {
      await ref
          .read(apiClientProvider)
          .post('/api/account/deactivate', data: {'password': _password.text});
      await ref.read(authProvider.notifier).completeAccountDeletion();
    } catch (e) {
      if (mounted) {
        setState(() => _deleting = false);
        showAppMessage(
          context,
          e is ApiException ? e.message : '$e',
          error: true,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Deactivate Account')),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 30),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF2F2),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: const Color(0xFFFFD4D4)),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                backgroundColor: Color(0xFFFFDFDF),
                child: Icon(
                  Icons.pause_circle_outline,
                  color: Colors.redAccent,
                ),
              ),
              SizedBox(height: 12),
              Text(
                'Deactivate your account',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: BusinessColors.ink,
                ),
              ),
              SizedBox(height: 8),
              Text(
                'Deactivation stops access and queued automations. Your contacts, groups, templates, message history and business configuration are retained for reactivation.',
                style: TextStyle(color: BusinessColors.muted, height: 1.5),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Card(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Before you continue',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
                ),
                SizedBox(height: 10),
                _DeletePoint(
                  'Your login and biometric credentials are revoked immediately.',
                ),
                _DeletePoint(
                  'Scheduled automations stop because the account becomes inactive.',
                ),
                _DeletePoint(
                  'Your saved business data is retained; this does not request deletion.',
                ),
                _DeletePoint(
                  'Contact support to reactivate. Cancelled messages must be scheduled again.',
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _password,
          obscureText: _hide,
          decoration: InputDecoration(
            labelText: 'Current password',
            prefixIcon: const Icon(Icons.lock_outline_rounded),
            suffixIcon: IconButton(
              onPressed: () => setState(() => _hide = !_hide),
              icon: Icon(
                _hide
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          style: FilledButton.styleFrom(
            backgroundColor: Colors.redAccent,
            minimumSize: const Size.fromHeight(54),
          ),
          onPressed: _deleting ? null : _delete,
          icon: _deleting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.pause_circle_outline),
          label: Text(_deleting ? 'Deactivating…' : 'Deactivate My Account'),
        ),
      ],
    ),
  );
}

class _DeletePoint extends StatelessWidget {
  const _DeletePoint(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 9),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(
          Icons.check_circle_outline_rounded,
          size: 18,
          color: Colors.redAccent,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(color: BusinessColors.muted, height: 1.4),
          ),
        ),
      ],
    ),
  );
}
