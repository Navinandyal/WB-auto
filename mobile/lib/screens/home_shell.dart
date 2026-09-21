import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import 'dashboard_screen.dart';
import 'contacts_screen.dart';
import 'templates_screen.dart';
import 'automations_screen.dart';
import 'settings_screen.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});
  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int index = 0;

  final pages = const [
    DashboardScreen(),
    ContactsScreen(),
    TemplatesScreen(),
    AutomationsScreen(),
    SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 10),
              child: BusinessHeader(
                title: user?.businessName.isNotEmpty == true ? user!.businessName : 'WishFlow Business',
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  IconButton(onPressed: () {}, icon: const Icon(Icons.notifications_none_rounded, color: BusinessColors.ink)),
                  CircleAvatar(
                    radius: 20,
                    backgroundColor: const Color(0xFFEAF2FF),
                    child: Text(_initials(user?.name ?? 'U'), style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF2870E8))),
                  ),
                ]),
              ),
            ),
            Expanded(child: IndexedStack(index: index, children: pages)),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        height: 68,
        selectedIndex: index,
        onDestinationSelected: (v) => setState(() => index = v),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: 'Contacts'),
          NavigationDestination(icon: Icon(Icons.description_outlined), selectedIcon: Icon(Icons.description), label: 'Templates'),
          NavigationDestination(icon: Icon(Icons.settings_suggest_outlined), selectedIcon: Icon(Icons.settings_suggest), label: 'Automations'),
          NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view_rounded), label: 'More'),
        ],
      ),
    );
  }

  String _initials(String name) {
    final p = name.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
    if (p.isEmpty) return 'U';
    if (p.length == 1) return p.first.substring(0, 1).toUpperCase();
    return '${p.first[0]}${p.last[0]}'.toUpperCase();
  }
}
