import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../models/models.dart';
import '../providers/providers.dart';

class AdminUsersScreen extends ConsumerStatefulWidget {
  const AdminUsersScreen({super.key});
  @override
  ConsumerState<AdminUsersScreen> createState() => _AdminUsersScreenState();
}

class _AdminUsersScreenState extends ConsumerState<AdminUsersScreen> {
  String filter = 'ALL';
  String search = '';

  Future<void> _setApproval(BusinessUser u, String status) async {
    try {
      await ref.read(apiClientProvider).post('/api/admin/users/${u.id}/approval', data: {'status': status});
      ref.invalidate(businessUsersProvider);
      ref.invalidate(adminOverviewProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(status == 'ACTIVE' ? '${u.name} approved' : status == 'SUSPENDED' ? '${u.name} suspended' : '${u.name} rejected')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : '$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(businessUsersProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.refresh(businessUsersProvider.future),
      child: state.when(
        loading: () => ListView(children: const [SizedBox(height: 240), Center(child: CircularProgressIndicator())]),
        error: (e, _) => ListView(padding: const EdgeInsets.all(20), children: [const SizedBox(height: 140), Text('$e', textAlign: TextAlign.center)]),
        data: (all) {
          final items = all.where((u) {
            final matchesStatus = filter == 'ALL' || u.approvalStatus == filter;
            final q = search.trim().toLowerCase();
            final matchesSearch = q.isEmpty || u.name.toLowerCase().contains(q) || u.businessName.toLowerCase().contains(q) || u.mobile.contains(q);
            return matchesStatus && matchesSearch;
          }).toList();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 30),
            children: [
              const Text('Businesses & Users', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Color(0xFF071A63))),
              const SizedBox(height: 4),
              const Text('Review registrations and control business access', style: TextStyle(color: Color(0xFF62729B))),
              const SizedBox(height: 18),
              TextField(
                decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: 'Search business, owner or mobile...', filled: true, fillColor: Colors.white, border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFFDCE6F6)))),
                onChanged: (v) => setState(() => search = v),
              ),
              const SizedBox(height: 12),
              SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: ['ALL','PENDING_APPROVAL','ACTIVE','REJECTED','SUSPENDED'].map((s) => Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text(s == 'ALL' ? 'All' : s[0] + s.substring(1).toLowerCase()), selected: filter == s, onSelected: (_) => setState(() => filter = s)))).toList())),
              const SizedBox(height: 14),
              if (items.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(28), child: Center(child: Text('No matching business accounts.'))))
              else
                ...items.map(_userCard),
            ],
          );
        },
      ),
    );
  }

  Widget _userCard(BusinessUser u) {
    final statusColor = u.isApproved ? const Color(0xFF0F9D67) : u.isRejected ? const Color(0xFFE5484D) : const Color(0xFFF59E0B);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: Color(0xFFE2EAF7))),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            CircleAvatar(radius: 25, backgroundColor: const Color(0xFFE6F0FF), child: Text(u.businessName.isNotEmpty ? u.businessName[0].toUpperCase() : u.name.isNotEmpty ? u.name[0].toUpperCase() : '?', style: const TextStyle(color: Color(0xFF0867FF), fontWeight: FontWeight.w800))),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(u.businessName.isEmpty ? u.name : u.businessName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: Color(0xFF071A63))),
              const SizedBox(height: 3),
              Text('${u.name} • ${u.mobile}', style: const TextStyle(color: Color(0xFF64739B))),
              if (u.businessAddress.isNotEmpty) Text(u.businessAddress, style: const TextStyle(color: Color(0xFF7B88A6), fontSize: 12)),
            ])),
            Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6), decoration: BoxDecoration(color: statusColor.withOpacity(0.12), borderRadius: BorderRadius.circular(30)), child: Text(u.approvalStatus, style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w800))),
          ]),
          if (u.isPending) ...[
            const SizedBox(height: 14),
            Row(children: [
              Expanded(child: OutlinedButton.icon(onPressed: () => _setApproval(u, 'REJECTED'), icon: const Icon(Icons.close), label: const Text('Reject'))),
              const SizedBox(width: 10),
              Expanded(child: FilledButton.icon(style: FilledButton.styleFrom(backgroundColor: const Color(0xFF0867FF)), onPressed: () => _setApproval(u, 'ACTIVE'), icon: const Icon(Icons.check), label: const Text('Approve'))),
            ]),
          ] else ...[
            const SizedBox(height: 12),
            Row(children: [
              Icon(u.isActive ? Icons.check_circle : Icons.block, size: 17, color: u.isActive ? const Color(0xFF0F9D67) : Colors.red),
              const SizedBox(width: 6),
              Text(u.isActive ? 'Login enabled' : 'Login disabled', style: const TextStyle(color: Color(0xFF667695))),
            ]),
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 8, children: [
              if (u.approvalStatus == 'ACTIVE') OutlinedButton.icon(
                onPressed: () => _setApproval(u, 'SUSPENDED'),
                icon: const Icon(Icons.pause_circle_outline),
                label: const Text('Suspend'),
              ),
              if (u.approvalStatus == 'SUSPENDED') FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFF0F9D67)),
                onPressed: () => _setApproval(u, 'ACTIVE'),
                icon: const Icon(Icons.play_circle_outline),
                label: const Text('Reactivate'),
              ),
              if (u.isRejected) TextButton(onPressed: () => _setApproval(u, 'PENDING_APPROVAL'), child: const Text('Move to pending')),
            ]),
          ],
        ]),
      ),
    );
  }
}
