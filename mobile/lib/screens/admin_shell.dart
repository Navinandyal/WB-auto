import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../widgets/admin_ui.dart';
import 'admin_dashboard_screen.dart';
import 'admin_businesses_screen.dart';
import 'admin_platform_lists.dart';
import 'admin_reports_screen.dart';
import 'admin_packages_screen.dart';
import 'admin_settings_screen.dart';
import 'admin_configuration_screen.dart';
import 'notifications_screen.dart';

class AdminShell extends ConsumerStatefulWidget {
  const AdminShell({super.key});
  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  int index = 0;
  final selection = ValueNotifier<int>(0);
  final navigator = GlobalKey<NavigatorState>();
  Widget _page(int page) => switch (page) {
    0 => const AdminDashboardScreen(),
    1 => const AdminBusinessesScreen(),
    2 => const AdminContactsScreen(),
    3 => const AdminTemplatesScreen(),
    _ => const _AdminMoreScreen(),
  };
  void _select(int value) {
    navigator.currentState?.popUntil((r) => r.isFirst);
    setState(() => index = value);
    selection.value = value;
  }

  @override
  void dispose() {
    selection.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    onPopInvokedWithResult: (didPop, result) async {
      if (didPop) return;
      if (await navigator.currentState?.maybePop() == true) return;
      if (index != 0) _select(0);
    },
    child: Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Row(
          children: [
            Image.asset(
              'assets/images/greetsync_logo.png',
              height: 32,
              width: 32,
            ),
            const SizedBox(width: 10),
            const Expanded(
              child: Text(
                'GreetSync Admin',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 19),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => navigator.currentState?.push(
              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
            ),
            icon: const Icon(Icons.notifications_none),
          ),
          IconButton(
            tooltip: 'Profile & settings',
            onPressed: () => navigator.currentState?.push(
              MaterialPageRoute(
                builder: (_) => Scaffold(
                  appBar: AppBar(title: const Text('Settings')),
                  body: const AdminSettingsScreen(),
                ),
              ),
            ),
            icon: const Icon(Icons.account_circle_outlined),
          ),
        ],
      ),
      body: SafeArea(
        bottom: false,
        child: Navigator(
          key: navigator,
          onGenerateRoute: (_) => MaterialPageRoute(
            builder: (_) => ValueListenableBuilder<int>(
              valueListenable: selection,
              builder: (_, v, __) => _page(v),
            ),
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: _select,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.business_outlined),
            selectedIcon: Icon(Icons.business),
            label: 'Businesses',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_alt_outlined),
            selectedIcon: Icon(Icons.people),
            label: 'Contacts',
          ),
          NavigationDestination(
            icon: Icon(Icons.description_outlined),
            selectedIcon: Icon(Icons.description),
            label: 'Templates',
          ),
          NavigationDestination(
            icon: Icon(Icons.grid_view_rounded),
            label: 'More',
          ),
        ],
      ),
    ),
  );
}

class _AdminMoreScreen extends StatelessWidget {
  const _AdminMoreScreen();
  @override
  Widget build(BuildContext context) {
    final destinations = <(String, String, IconData, Widget)>[
      (
        'Scheduled messages',
        'Daily totals, send history and message previews',
        Icons.schedule_send_outlined,
        const AdminAutomationsScreen(),
      ),
      (
        'Packages',
        'Review owners, activation requests and subscription plans',
        Icons.workspace_premium_outlined,
        const AdminPackagesScreen(),
      ),
      (
        'Reports',
        'Business performance and usage reports',
        Icons.bar_chart_outlined,
        const AdminReportsScreen(),
      ),
      (
        'Configuration',
        'WhatsApp, Meta and platform connection settings',
        Icons.tune,
        const AdminConfigurationScreen(),
      ),
      (
        'Settings',
        'Profile, security, appearance and website policies',
        Icons.settings_outlined,
        const AdminSettingsScreen(),
      ),
    ];
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const AdminHeader(
          'Manage platform',
          'Everything you need to manage GreetSync.',
          icon: Icons.grid_view_rounded,
        ),
        ...destinations.map(
          (d) => Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: Icon(d.$3, size: 28),
              title: Text(
                d.$1,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 5),
                child: Text(d.$2),
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => Scaffold(
                    appBar: AppBar(title: Text(d.$1)),
                    body: d.$4,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
