import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import 'admin_dashboard_screen.dart';
import 'admin_businesses_screen.dart';
import 'admin_platform_lists.dart';
import 'admin_messages_screen.dart';
import 'admin_reports_screen.dart';
import 'admin_settings_screen.dart';

class AdminShell extends ConsumerStatefulWidget {
  const AdminShell({super.key});
  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  int index = 0;
  static const pages = <Widget>[
    AdminDashboardScreen(), AdminBusinessesScreen(), AdminContactsScreen(), AdminTemplatesScreen(),
    AdminAutomationsScreen(), AdminMessagesScreen(), AdminReportsScreen(), AdminSettingsScreen(),
  ];
  static const titles = ['Dashboard','Businesses','Contacts','Templates','Automations','Messages','Reports','Settings'];
  static const icons = [Icons.dashboard_outlined,Icons.business_outlined,Icons.people_alt_outlined,Icons.description_outlined,Icons.settings_suggest_outlined,Icons.chat_bubble_outline,Icons.analytics_outlined,Icons.settings_outlined];

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    return Scaffold(
      backgroundColor: const Color(0xFFF5F9FF),
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        title: Text(titles[index], style: const TextStyle(color: Color(0xFF071A63), fontWeight: FontWeight.w900)),
        actions: [
          IconButton(onPressed: () {}, icon: const Badge(label: Text(''), child: Icon(Icons.notifications_none_rounded))),
          PopupMenuButton<String>(
            onSelected: (v) { if (v == 'profile') setState(() => index = 7); if (v == 'logout') ref.read(authProvider.notifier).signOut(); },
            itemBuilder: (_) => [
              PopupMenuItem(enabled: false, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(user?.name ?? 'Admin', style: const TextStyle(fontWeight: FontWeight.w800)), const Text('Super Admin', style: TextStyle(fontSize: 12, color: Color(0xFF667695)))])),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'profile', child: Row(children: [Icon(Icons.person_outline), SizedBox(width: 8), Text('Admin Profile')])),
              const PopupMenuItem(value: 'logout', child: Row(children: [Icon(Icons.logout), SizedBox(width: 8), Text('Logout')]))
            ],
            child: Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: CircleAvatar(backgroundColor: const Color(0xFF3450C9), child: Text((user?.name.isNotEmpty == true ? user!.name[0] : 'A').toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)))),
          ),
        ],
      ),
      drawer: Drawer(
        backgroundColor: const Color(0xFF0C2746),
        child: SafeArea(child: Column(children: [
          const Padding(padding: EdgeInsets.fromLTRB(22, 22, 16, 20), child: Row(children: [CircleAvatar(backgroundColor: Color(0xFF0867FF), child: Icon(Icons.celebration, color: Colors.white)), SizedBox(width: 12), Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('WishFlow', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: Colors.white)), Text('Admin Panel', style: TextStyle(color: Color(0xFFB8C8DA)))])])),
          Expanded(child: ListView.builder(itemCount: titles.length, itemBuilder: (_,i) => Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
            child: ListTile(
              selected: index == i, selectedTileColor: const Color(0xFF155EB9), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              leading: Icon(icons[i], color: index == i ? Colors.white : const Color(0xFFD3E0ED)),
              title: Text(titles[i], style: TextStyle(color: Colors.white, fontWeight: index == i ? FontWeight.w800 : FontWeight.w500)),
              onTap: () { setState(() => index = i); Navigator.pop(context); },
            ),
          ))),
          const Padding(padding: EdgeInsets.all(18), child: Card(color: Color(0xFF123B67), child: Padding(padding: EdgeInsets.all(14), child: Row(children:[Icon(Icons.workspace_premium_outlined,color:Color(0xFF67B7FF)),SizedBox(width:10),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('Super Admin',style:TextStyle(color:Colors.white,fontWeight:FontWeight.w800)),Text('Full platform control',style:TextStyle(color:Color(0xFFB8C8DA),fontSize:12))]))])))),
        ])),
      ),
      body: SafeArea(child: IndexedStack(index: index, children: pages)),
      bottomNavigationBar: MediaQuery.sizeOf(context).width < 700 ? NavigationBar(
        selectedIndex: index > 4 ? 4 : index,
        onDestinationSelected: (v) { if (v < 4) setState(() => index = v); else showModalBottomSheet(context: context, builder: (_) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: List.generate(titles.length-4, (j) { final i=j+4; return ListTile(leading: Icon(icons[i]), title: Text(titles[i]), onTap:(){Navigator.pop(context);setState(()=>index=i);}); })))); },
        destinations: const [NavigationDestination(icon:Icon(Icons.dashboard_outlined),label:'Home'),NavigationDestination(icon:Icon(Icons.business_outlined),label:'Businesses'),NavigationDestination(icon:Icon(Icons.people_alt_outlined),label:'Contacts'),NavigationDestination(icon:Icon(Icons.description_outlined),label:'Templates'),NavigationDestination(icon:Icon(Icons.grid_view_rounded),label:'More')],
      ) : null,
    );
  }
}
