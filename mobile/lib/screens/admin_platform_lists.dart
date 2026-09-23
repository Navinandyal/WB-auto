import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../core/api_client.dart';
import '../providers/providers.dart';

class AdminContactsScreen extends ConsumerWidget {
  const AdminContactsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => _AdminList(
    title: 'Contacts', subtitle: 'Contacts across all businesses', endpoint: '/api/admin/contacts', icon: Icons.people_alt_outlined,
    builder: (m) => _row('${m['name'] ?? ''}', '${m['phone'] ?? ''}${m['email'] != null ? ' • ${m['email']}' : ''}', '${m['businessName'] ?? 'Unknown business'}', '${m['optIn'] == true ? 'OPT-IN' : 'NO OPT-IN'}'),
  );
}

class AdminTemplatesScreen extends ConsumerWidget {
  const AdminTemplatesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => _AdminList(
    title: 'Templates', subtitle: 'Meta template status by business', endpoint: '/api/admin/templates', icon: Icons.description_outlined,
    builder: (m) => _row('${m['name'] ?? ''}', '${m['category'] ?? ''} • ${m['language'] ?? ''}', '${m['businessName'] ?? 'Unknown business'}', '${m['status'] ?? ''}'),
  );
}

class AdminAutomationsScreen extends ConsumerStatefulWidget {
  const AdminAutomationsScreen({super.key});
  @override
  ConsumerState<AdminAutomationsScreen> createState() => _AdminAutomationsScreenState();
}

class _AdminAutomationsScreenState extends ConsumerState<AdminAutomationsScreen> {
  List<Map<String, dynamic>> rows = [];
  bool loading = true;
  String? error;
  String search = '';
  String status = 'ALL';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    if (mounted) setState(() { loading = true; error = null; });
    try {
      final data = await ref.read(apiClientProvider).get('/api/admin/automations') as List;
      if (mounted) setState(() { rows = data.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList(); loading = false; });
    } catch (e) {
      if (mounted) setState(() { error = e is ApiException ? e.message : '$e'; loading = false; });
    }
  }

  Future<void> _action(Map<String, dynamic> automation, String action) async {
    try {
      await ref.read(apiClientProvider).post('/api/admin/automations/${automation['id']}/$action', data: {});
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Automation ${action.replaceAll('-', ' ')} completed.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : '$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = search.toLowerCase().trim();
    final filtered = rows.where((m) {
      final s = '${m['status'] ?? ''}'.toUpperCase();
      final matchesStatus = status == 'ALL' || s == status;
      final matchesQ = q.isEmpty || m.values.any((v) => '$v'.toLowerCase().contains(q));
      return matchesStatus && matchesQ;
    }).toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Automations', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Color(0xFF071A63))),
        const Text('Monitor and control automations for every business. Sends always use that business’s own WhatsApp credentials.', style: TextStyle(color: Color(0xFF62729B))),
        const SizedBox(height: 16),
        TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search business, contact, template...'), onChanged: (v) => setState(() => search = v)),
        const SizedBox(height: 10),
        SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: ['ALL','SCHEDULED','PROCESSING','PAUSED','SENT','FAILED','CANCELLED'].map((s) => Padding(
          padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text(s), selected: status == s, onSelected: (_) => setState(() => status = s)),
        )).toList())),
        const SizedBox(height: 12),
        if (loading) const Padding(padding: EdgeInsets.all(80), child: Center(child: CircularProgressIndicator()))
        else if (error != null) Card(color: const Color(0xFFFFF1F2), child: Padding(padding: const EdgeInsets.all(14), child: Text(error!)))
        else if (filtered.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(28), child: Center(child: Text('No automations found.'))))
        else ...filtered.map((m) => _automationCard(m)),
      ]),
    );
  }

  Widget _automationCard(Map<String, dynamic> m) {
    final st = '${m['status'] ?? ''}'.toUpperCase();
    return Card(margin: const EdgeInsets.only(bottom: 12), child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        const CircleAvatar(backgroundColor: Color(0xFFE8F1FF), child: Icon(Icons.settings_suggest_outlined, color: Color(0xFF0867FF))),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${m['templateName'] ?? 'Automation'}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
          Text('${m['businessName'] ?? 'Unknown business'} • Owner: ${m['ownerName'] ?? '—'}', style: const TextStyle(color: Color(0xFF62729B))),
          Text('${m['contactName'] ?? ''} ${m['contactPhone'] ?? ''}', style: const TextStyle(color: Color(0xFF7B88A6), fontSize: 12)),
        ])),
        _statusBadge(st),
      ]),
      const SizedBox(height: 10),
      Text('Scheduled: ${_date(m['scheduledAt'])}', style: const TextStyle(fontSize: 12, color: Color(0xFF62729B))),
      if ('${m['errorMessage'] ?? ''}'.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('${m['errorMessage']}', style: const TextStyle(color: Color(0xFFC62828), fontSize: 12))),
      const SizedBox(height: 10),
      Wrap(spacing: 8, runSpacing: 8, children: [
        if (st == 'SCHEDULED') OutlinedButton.icon(onPressed: () => _action(m, 'run-now'), icon: const Icon(Icons.play_arrow), label: const Text('Run Now')),
        if (st == 'SCHEDULED') OutlinedButton.icon(onPressed: () => _action(m, 'pause'), icon: const Icon(Icons.pause), label: const Text('Pause')),
        if (st == 'PAUSED') FilledButton.tonalIcon(onPressed: () => _action(m, 'resume'), icon: const Icon(Icons.play_circle_outline), label: const Text('Resume')),
        if (['SCHEDULED','PAUSED','FAILED'].contains(st)) OutlinedButton.icon(onPressed: () => _action(m, 'cancel'), icon: const Icon(Icons.stop_circle_outlined), label: const Text('Cancel')),
      ]),
    ])));
  }
}

Widget _row(String title, String subtitle, String business, String status) => Card(child: ListTile(
  leading: CircleAvatar(backgroundColor: const Color(0xFFE8F1FF), child: Text((business.isNotEmpty ? business : 'B')[0].toUpperCase(), style: const TextStyle(color: Color(0xFF0867FF), fontWeight: FontWeight.w900))),
  title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: Text('$business\n$subtitle'), isThreeLine: true,
  trailing: _statusBadge(status),
));

Widget _statusBadge(String value) {
  final s = value.toUpperCase();
  final color = ['ACTIVE','APPROVED','SENT','DELIVERED','READ','CONNECTED','OPT-IN'].contains(s) ? const Color(0xFF0F9D67)
      : ['FAILED','REJECTED','SUSPENDED','CANCELLED','NO OPT-IN'].contains(s) ? const Color(0xFFE5484D)
      : const Color(0xFFF59E0B);
  return Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5), decoration: BoxDecoration(color: color.withOpacity(.10), borderRadius: BorderRadius.circular(20)), child: Text(value.replaceAll('_',' '), style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w900)));
}

String _date(dynamic v) { final d = DateTime.tryParse('${v ?? ''}'); return d == null ? '—' : DateFormat('dd MMM yyyy, hh:mm a').format(d.toLocal()); }

class _AdminList extends ConsumerStatefulWidget {
  const _AdminList({required this.title, required this.subtitle, required this.endpoint, required this.icon, required this.builder});
  final String title, subtitle, endpoint; final IconData icon; final Widget Function(Map<String, dynamic>) builder;
  @override ConsumerState<_AdminList> createState() => _AdminListState();
}

class _AdminListState extends ConsumerState<_AdminList> {
  List<Map<String, dynamic>> rows = []; bool loading = true; String search = ''; String? error;
  @override void initState() { super.initState(); _load(); }
  Future<void> _load() async { try { final d = await ref.read(apiClientProvider).get(widget.endpoint) as List; if (mounted) setState(() { rows = d.whereType<Map>().map((e) => e.cast<String,dynamic>()).toList(); loading = false; error = null; }); } catch(e) { if (mounted) setState(() { error = e is ApiException ? e.message : '$e'; loading = false; }); } }
  @override Widget build(BuildContext context) {
    final q = search.toLowerCase(); final list = rows.where((m) => q.isEmpty || m.values.any((v) => '$v'.toLowerCase().contains(q))).toList();
    return RefreshIndicator(onRefresh: _load, child: loading ? ListView(children: const [SizedBox(height: 250), Center(child: CircularProgressIndicator())]) : ListView(padding: const EdgeInsets.all(16), children: [
      Text(widget.title, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Color(0xFF071A63))), Text(widget.subtitle, style: const TextStyle(color: Color(0xFF62729B))), const SizedBox(height: 16),
      if (error != null) Card(color: const Color(0xFFFFF1F2), child: Padding(padding: const EdgeInsets.all(12), child: Text(error!))),
      TextField(decoration: InputDecoration(prefixIcon: Icon(widget.icon), hintText: 'Search ${widget.title.toLowerCase()}...'), onChanged: (v) => setState(() => search = v)), const SizedBox(height: 12),
      if (list.isEmpty) Card(child: Padding(padding: const EdgeInsets.all(28), child: Center(child: Text('No ${widget.title.toLowerCase()} found.')))) else ...list.take(250).map(widget.builder),
    ]));
  }
}
