import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../providers/providers.dart';
import '../widgets/admin_ui.dart';
import '../widgets/common.dart';
import 'admin_platform_lists.dart';
import 'admin_packages_screen.dart';

final adminTodayProvider = FutureProvider.autoDispose<Map<String, dynamic>>((
  ref,
) async {
  final today = DateFormat(
    'yyyy-MM-dd',
  ).format(DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30)));
  return (await ref
              .read(apiClientProvider)
              .get(
                '/api/admin/scheduled-messages',
                query: {'start': today, 'end': today, 'limit': 1},
              )
          as Map)
      .cast<String, dynamic>();
});

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(adminOverviewProvider),
        today = ref.watch(adminTodayProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(adminOverviewProvider);
        ref.invalidate(adminTodayProvider);
        await Future.wait([
          ref.read(adminOverviewProvider.future),
          ref.read(adminTodayProvider.future),
        ]);
      },
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          AdminHeader(
            'Hello, ${ref.watch(authProvider).user?.name ?? 'Admin'}',
            'Your businesses, requests and message activity in one place.',
          ),
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF163653), Color(0xFF226E91)],
              ),
              borderRadius: BorderRadius.circular(22),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.business_center_outlined,
                  color: Colors.white,
                  size: 32,
                ),
                SizedBox(height: 14),
                Text(
                  'Business overview',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'Review registrations, support business owners and monitor scheduled sends.',
                  style: TextStyle(color: Colors.white70, height: 1.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          overview.when(
            data: (d) => AdminMetrics({
              'Businesses': d.totalBusinesses,
              'Pending approvals': d.pendingApprovals,
              'Contacts': d.totalContacts,
              'Schedules': d.totalAutomations,
            }),
            loading: () => const LinearProgressIndicator(),
            error: (e, _) => ErrorState(
              e,
              onRetry: () => ref.invalidate(adminOverviewProvider),
            ),
          ),
          const SizedBox(height: 22),
          today.when(
            data: (m) {
              final s = m['summary'] as Map;
              return AdminPanel(
                title: 'Today’s messages',
                trailing: const Text(
                  'IST',
                  style: TextStyle(color: adminMuted),
                ),
                children: [
                  AdminMetrics({
                    'Total messages': s['total'],
                    'Sent': s['sent'],
                    'Failed': s['failed'],
                    'Scheduled / processing':
                        (s['scheduled'] as num) + (s['processing'] as num),
                  }),
                  const SizedBox(height: 14),
                  const Text(
                    'Sent includes requests accepted by WhatsApp. Delivery receipts continue to update.',
                    style: TextStyle(color: adminMuted, fontSize: 12),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.tonalIcon(
                    onPressed: () => _open(
                      context,
                      const AdminAutomationsScreen(),
                      'Scheduled messages',
                    ),
                    icon: const Icon(Icons.schedule_send),
                    label: const Text('View day-wise tracking'),
                  ),
                ],
              );
            },
            loading: () => const LinearProgressIndicator(),
            error: (e, _) => ErrorState(
              e,
              onRetry: () => ref.invalidate(adminTodayProvider),
            ),
          ),
          AdminPanel(
            title: 'Quick access',
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.description_outlined),
                title: const Text('Templates & suggestions'),
                subtitle: const Text('Preview templates from every business'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () =>
                    _open(context, const AdminTemplatesScreen(), 'Templates'),
              ),
              const Divider(),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.workspace_premium_outlined),
                title: const Text('Package requests'),
                subtitle: const Text(
                  'Review business owners before activation',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () =>
                    _open(context, const AdminPackagesScreen(), 'Packages'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _open(BuildContext c, Widget screen, String title) => Navigator.push(
    c,
    MaterialPageRoute(
      builder: (_) => Scaffold(
        appBar: AppBar(title: Text(title)),
        body: screen,
      ),
    ),
  );
}
