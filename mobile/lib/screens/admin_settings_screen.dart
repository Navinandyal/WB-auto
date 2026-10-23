import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/app_config.dart';
import '../providers/providers.dart';
import '../widgets/admin_ui.dart';
import '../widgets/common.dart';
import 'appearance_screen.dart';
import 'profile_screen.dart';
import 'security_settings_screen.dart';

class AdminSettingsScreen extends ConsumerWidget {
  const AdminSettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(authProvider).user;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const AdminHeader(
          'Profile & settings',
          'Manage your admin account, security and appearance.',
          icon: Icons.settings_outlined,
        ),
        AdminPanel(
          title: 'Administrator',
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: Theme.of(
                    context,
                  ).colorScheme.primaryContainer,
                  child: Text(
                    (u?.name.isNotEmpty == true ? u!.name[0] : 'A')
                        .toUpperCase(),
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        u?.name ?? 'Administrator',
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        u?.mobile ?? '',
                        style: const TextStyle(color: adminMuted),
                      ),
                      const SizedBox(height: 8),
                      const AdminBadge('SUPER ADMIN'),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ProfileScreen()),
              ),
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Edit profile'),
            ),
          ],
        ),
        AdminPanel(
          title: 'Account preferences',
          children: [
            _tile(
              Icons.fingerprint,
              'Security & biometric login',
              'Protect your admin account',
              () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const SecuritySettingsScreen(),
                ),
              ),
            ),
            const Divider(),
            _tile(
              Icons.palette_outlined,
              'Appearance',
              'Choose theme and accent colors',
              () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AppearanceScreen()),
              ),
            ),
          ],
        ),
        AdminPanel(
          title: 'Policies on our website',
          children: [
            _tile(
              Icons.privacy_tip_outlined,
              'Privacy policy',
              'Open the current privacy policy',
              () => _policy(context, AppConfig.privacyPolicyUrl),
            ),
            const Divider(),
            _tile(
              Icons.description_outlined,
              'Terms & conditions',
              'Open the current terms of use',
              () => _policy(context, AppConfig.termsConditionsUrl),
            ),
          ],
        ),
        OutlinedButton.icon(
          onPressed: () => ref.read(authProvider.notifier).signOut(),
          icon: const Icon(Icons.logout),
          label: const Text('Log out'),
        ),
      ],
    );
  }

  Widget _tile(
    IconData icon,
    String title,
    String subtitle,
    VoidCallback onTap,
  ) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(icon),
    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
    subtitle: Text(subtitle),
    trailing: const Icon(Icons.chevron_right),
    onTap: onTap,
  );
  Future<void> _policy(BuildContext context, String url) async {
    try {
      final uri = Uri.parse(url);
      if (uri.scheme != 'https' ||
          uri.host.isEmpty ||
          uri.userInfo.isNotEmpty) {
        throw const FormatException('A public HTTPS policy URL is required.');
      }
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && context.mounted)
        showAppMessage(context, 'Could not open the website.', error: true);
    } catch (e) {
      if (context.mounted)
        showAppMessage(context, 'Could not open the website: $e', error: true);
    }
  }
}
