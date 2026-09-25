import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class SecuritySettingsScreen extends ConsumerWidget {
  const SecuritySettingsScreen({super.key});

  Future<void> _setBiometric(BuildContext context, WidgetRef ref, bool enable) async {
    if (enable) {
      final ok = await ref.read(authProvider.notifier).enableBiometricLogin(deviceLabel: 'Android phone');
      if (!context.mounted) return;
      showAppMessage(
        context,
        ok
            ? 'Biometric login enabled. You can now sign in without entering your password on this device.'
            : (ref.read(authProvider).error ?? 'Biometric setup was cancelled or failed.'),
        error: !ok,
      );
    } else {
      await ref.read(authProvider.notifier).disableBiometricLogin();
      if (!context.mounted) return;
      showAppMessage(context, 'Biometric login disabled for this device.');
    }
    ref.invalidate(biometricPreferenceProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final biometric = ref.watch(biometricPreferenceProvider);
    final accent = Theme.of(context).colorScheme.primary;

    return Scaffold(
      appBar: AppBar(title: const Text('Security')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 32),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SoftIcon(Icons.fingerprint_rounded),
                  const SizedBox(width: 14),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Biometric Login', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                        SizedBox(height: 5),
                        Text(
                          'Use fingerprint or device biometrics to bypass mobile-number/password entry on this phone. Your password is never stored for biometric login.',
                          style: TextStyle(color: BusinessColors.muted, height: 1.4),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          biometric.when(
            loading: () => const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))),
            error: (e, _) => Card(child: ListTile(leading: const Icon(Icons.error_outline, color: Colors.redAccent), title: const Text('Unable to check biometrics'), subtitle: Text('$e'))),
            data: (status) => Card(
              child: Column(
                children: [
                  SwitchListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    secondary: Icon(Icons.fingerprint_rounded, color: status.available ? accent : BusinessColors.muted),
                    title: const Text('Enable biometric login', style: TextStyle(fontWeight: FontWeight.w900)),
                    subtitle: Text(
                      !status.available
                          ? 'Biometrics are not available or not enrolled on this device.'
                          : status.enabled
                              ? 'Enabled on ${status.deviceLabel.isEmpty ? 'this device' : status.deviceLabel}.'
                              : 'Authenticate once to enable biometric sign-in.',
                    ),
                    value: status.enabled,
                    onChanged: status.available ? (v) => _setBiometric(context, ref, v) : null,
                  ),
                  const Divider(height: 1),
                  const ListTile(
                    leading: Icon(Icons.password_rounded),
                    title: Text('Password login remains available', style: TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text('Disabling biometrics does not change your account password.'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Card(
            color: const Color(0xFFF5F8FC),
            child: const Padding(
              padding: EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.security_rounded, color: BusinessColors.ink),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'How it works: after your device biometric check succeeds, WishFlow uses a device-specific server credential stored in secure storage to create a fresh app session. The credential can be revoked from this page and is separate from your Meta/WhatsApp credentials.',
                      style: TextStyle(color: BusinessColors.muted, height: 1.45),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
