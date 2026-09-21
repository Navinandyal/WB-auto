import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(adminOverviewProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.refresh(adminOverviewProvider.future),
      child: overview.when(
        loading: () => ListView(children: const [SizedBox(height: 240), Center(child: CircularProgressIndicator())]),
        error: (e, _) => ListView(padding: const EdgeInsets.all(20), children: [const SizedBox(height: 140), const Icon(Icons.error_outline, size: 50, color: Colors.red), const SizedBox(height: 12), Text('$e', textAlign: TextAlign.center)]),
        data: (d) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 30),
          children: [
            const Text('Dashboard', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: Color(0xFF071A63))),
            const SizedBox(height: 4),
            const Text("Platform overview from live database data", style: TextStyle(color: Color(0xFF62729B))),
            const SizedBox(height: 18),
            Wrap(spacing: 12, runSpacing: 12, children: [
              _metric('Businesses', d.totalBusinesses, Icons.business_outlined, const Color(0xFF0867FF)),
              _metric('Pending Approval', d.pendingApprovals, Icons.hourglass_top_rounded, const Color(0xFFF59E0B)),
              _metric('Contacts', d.totalContacts, Icons.people_alt_outlined, const Color(0xFF7C3AED)),
              _metric('Automations', d.totalAutomations, Icons.settings_suggest_outlined, const Color(0xFFEC4899)),
              _metric('Messages', d.totalMessages, Icons.send_outlined, const Color(0xFF10B981)),
            ]),
            const SizedBox(height: 22),
            Card(
              color: const Color(0xFFF4F8FF),
              elevation: 0,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: Color(0xFFDDE8FA))),
              child: const Padding(
                padding: EdgeInsets.all(18),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  CircleAvatar(backgroundColor: Color(0xFFE2EEFF), child: Icon(Icons.shield_outlined, color: Color(0xFF0867FF))),
                  SizedBox(width: 14),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Admin Approval Control', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: Color(0xFF071A63))),
                    SizedBox(height: 6),
                    Text('New business accounts cannot sign in until you approve them. WhatsApp credentials are owned by each business and are not shared globally.', style: TextStyle(color: Color(0xFF526487), height: 1.45)),
                  ])),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _metric(String label, int value, IconData icon, Color color) => SizedBox(
    width: 170,
    child: Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: Color(0xFFE2EAF7))),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 42, height: 42, decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: color)),
          const SizedBox(height: 14),
          Text('$value', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: Color(0xFF071A63))),
          Text(label, style: const TextStyle(color: Color(0xFF617096))),
        ]),
      ),
    ),
  );
}
