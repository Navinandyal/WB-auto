import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import 'admin_dashboard_screen.dart';
import 'admin_users_screen.dart';
import 'contacts_screen.dart';
import 'templates_screen.dart';
import 'automations_screen.dart';

class AdminShell extends ConsumerStatefulWidget {
  const AdminShell({super.key});
  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  int index = 0;
  static const pages = <Widget>[AdminDashboardScreen(), AdminUsersScreen(), ContactsScreen(), TemplatesScreen(), AutomationsScreen()];
  static const titles = ['Dashboard','Businesses','Contacts','Templates','Automations'];
  static const icons = [Icons.dashboard_outlined, Icons.business_outlined, Icons.people_alt_outlined, Icons.description_outlined, Icons.settings_suggest_outlined];

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    return Scaffold(
      backgroundColor: const Color(0xFFF5F9FF),
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        title: Text(titles[index], style: const TextStyle(color: Color(0xFF071A63), fontWeight: FontWeight.w800)),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) { if (v == 'logout') ref.read(authProvider.notifier).signOut(); },
            itemBuilder: (_) => [
              PopupMenuItem(enabled: false, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(user?.name ?? 'Admin', style: const TextStyle(fontWeight: FontWeight.w700)), const Text('Super Admin', style: TextStyle(fontSize: 12, color: Color(0xFF667695)))])),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'logout', child: Row(children: [Icon(Icons.logout), SizedBox(width: 8), Text('Logout')]))
            ],
            child: Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: CircleAvatar(backgroundColor: const Color(0xFF3450C9), child: Text((user?.name.isNotEmpty == true ? user!.name[0] : 'A').toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)))),
          ),
        ],
      ),
      drawer: NavigationDrawer(
        selectedIndex: index,
        onDestinationSelected: (v) { setState(() => index = v); Navigator.pop(context); },
        children: [
          const Padding(padding: EdgeInsets.fromLTRB(26, 24, 16, 20), child: Row(children: [CircleAvatar(backgroundColor: Color(0xFF0867FF), child: Icon(Icons.celebration, color: Colors.white)), SizedBox(width: 12), Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('WishFlow', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 19, color: Color(0xFF071A63))), Text('Admin Panel', style: TextStyle(color: Color(0xFF667695)))])])),
          ...List.generate(titles.length, (i) => NavigationDrawerDestination(icon: Icon(icons[i]), label: Text(titles[i]))),
        ],
      ),
      body: SafeArea(child: pages[index]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (v) => setState(() => index = v),
        destinations: List.generate(titles.length, (i) => NavigationDestination(icon: Icon(icons[i]), label: titles[i])),
      ),
    );
  }
}
