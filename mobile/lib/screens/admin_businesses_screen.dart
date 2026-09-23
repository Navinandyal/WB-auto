import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../core/api_client.dart';
import '../models/models.dart';
import '../providers/providers.dart';

class AdminBusinessesScreen extends ConsumerStatefulWidget {
  const AdminBusinessesScreen({super.key});
  @override
  ConsumerState<AdminBusinessesScreen> createState() => _AdminBusinessesScreenState();
}

class _AdminBusinessesScreenState extends ConsumerState<AdminBusinessesScreen> {
  String filter = 'ALL';
  String search = '';

  Future<void> _setStatus(BusinessUser u, String action) async {
    try {
      await ref.read(apiClientProvider).post('/api/admin/businesses/${u.id}/$action', data: {});
      ref.invalidate(businessUsersProvider);
      ref.invalidate(adminOverviewProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${u.businessName.isEmpty ? u.name : u.businessName} updated')));
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
        loading: () => ListView(children: const [SizedBox(height: 260), Center(child: CircularProgressIndicator())]),
        error: (e, _) => ListView(padding: const EdgeInsets.all(20), children: [const SizedBox(height: 160), Text('$e', textAlign: TextAlign.center)]),
        data: (all) {
          final items = all.where((u) {
            final q = search.trim().toLowerCase();
            final matchQ = q.isEmpty || u.businessName.toLowerCase().contains(q) || u.name.toLowerCase().contains(q) || u.mobile.contains(q) || u.email.toLowerCase().contains(q);
            final st = u.isPending ? 'PENDING_APPROVAL' : u.approvalStatus;
            return matchQ && (filter == 'ALL' || st == filter);
          }).toList();
          return ListView(padding: const EdgeInsets.fromLTRB(16, 18, 16, 30), children: [
            const Text('Businesses', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Color(0xFF071A63))),
            const SizedBox(height: 4),
            const Text('View owners, approval state, WhatsApp connection and business activity.', style: TextStyle(color: Color(0xFF62729B))),
            const SizedBox(height: 16),
            TextField(decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: 'Search business, owner, phone or email', filled: true, fillColor: Colors.white, border: OutlineInputBorder(borderRadius: BorderRadius.circular(14))), onChanged: (v) => setState(() => search = v)),
            const SizedBox(height: 10),
            SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: ['ALL','PENDING_APPROVAL','ACTIVE','REJECTED','SUSPENDED'].map((s) => Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text(s == 'ALL' ? 'All' : s.replaceAll('_', ' ')), selected: filter == s, onSelected: (_) => setState(() => filter = s)))).toList())),
            const SizedBox(height: 14),
            if (items.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(28), child: Center(child: Text('No businesses found.'))))
            else ...items.map((u) => _businessCard(u)),
          ]);
        },
      ),
    );
  }

  Widget _businessCard(BusinessUser u) {
    final status = u.isPending ? 'PENDING_APPROVAL' : u.approvalStatus;
    final color = status == 'ACTIVE' || status == 'APPROVED' ? const Color(0xFF0F9D67) : status == 'REJECTED' || status == 'SUSPENDED' ? const Color(0xFFE5484D) : const Color(0xFFF59E0B);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AdminBusinessDetailScreen(user: u))),
        child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(radius: 25, backgroundColor: const Color(0xFFE6F0FF), child: Text((u.businessName.isNotEmpty ? u.businessName : u.name).substring(0,1).toUpperCase(), style: const TextStyle(color: Color(0xFF0867FF), fontWeight: FontWeight.w900))),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(u.businessName.isEmpty ? u.name : u.businessName, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: Color(0xFF071A63))),
              Text('Owner: ${u.name}', style: const TextStyle(color: Color(0xFF62729B))),
              Text(u.mobile, style: const TextStyle(color: Color(0xFF7B88A6), fontSize: 12)),
            ])),
            Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5), decoration: BoxDecoration(color: color.withOpacity(.12), borderRadius: BorderRadius.circular(20)), child: Text(status.replaceAll('_', ' '), style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w900))),
          ]),
          if (u.createdAt != null) ...[const SizedBox(height: 10), Text('Registered ${DateFormat('dd MMM yyyy').format(u.createdAt!)}', style: const TextStyle(color: Color(0xFF7B88A6), fontSize: 12))],
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AdminBusinessDetailScreen(user: u))), child: const Text('View Details'))),
            const SizedBox(width: 8),
            if (u.isPending) Expanded(child: FilledButton(onPressed: () => _setStatus(u, 'approve'), child: const Text('Approve')))
            else if (status == 'ACTIVE' || status == 'APPROVED') Expanded(child: OutlinedButton(onPressed: () => _setStatus(u, 'suspend'), child: const Text('Suspend')))
            else if (status == 'SUSPENDED') Expanded(child: FilledButton(onPressed: () => _setStatus(u, 'reactivate'), child: const Text('Reactivate'))),
          ]),
        ])),
      ),
    );
  }
}

class AdminBusinessDetailScreen extends ConsumerStatefulWidget {
  const AdminBusinessDetailScreen({super.key, required this.user});
  final BusinessUser user;
  @override
  ConsumerState<AdminBusinessDetailScreen> createState() => _AdminBusinessDetailScreenState();
}

class _AdminBusinessDetailScreenState extends ConsumerState<AdminBusinessDetailScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 7, vsync: this);
  Map<String,dynamic>? detail;
  Map<String,dynamic>? resources;
  bool loading = true;
  String? error;

  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { loading = true; error = null; });
    try {
      final a = (await ref.read(apiClientProvider).get('/api/admin/businesses/${widget.user.id}') as Map).cast<String,dynamic>();
      final b = (await ref.read(apiClientProvider).get('/api/admin/businesses/${widget.user.id}/resources') as Map).cast<String,dynamic>();
      if (mounted) setState(() { detail = a; resources = b; loading = false; });
    } catch(e) { if (mounted) setState(() { error = e is ApiException ? e.message : '$e'; loading = false; }); }
  }

  Future<void> _action(String action) async {
    try {
      await ref.read(apiClientProvider).post('/api/admin/businesses/${widget.user.id}/$action', data: {});
      ref.invalidate(businessUsersProvider); ref.invalidate(adminOverviewProvider); await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Business status updated')));
    } catch(e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : '$e'))); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Business Details')),
      body: loading ? const Center(child: CircularProgressIndicator()) : error != null ? Center(child: Text(error!)) : _body(),
    );
  }

  Widget _body() {
    final b = ((resources?['business'] ?? detail?['business']) as Map?)?.cast<String,dynamic>() ?? {};
    final counts = (detail?['counts'] as Map?)?.cast<String,dynamic>() ?? {};
    final wa = ((resources?['whatsapp'] ?? detail?['whatsapp']) as Map?)?.cast<String,dynamic>() ?? {};
    final status = '${b['status'] ?? widget.user.approvalStatus}';
    return Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(16, 14, 16, 10), child: Column(children: [
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          CircleAvatar(radius: 30, backgroundColor: const Color(0xFFE6F0FF), child: Text('${b['businessName'] ?? widget.user.businessName}'.isNotEmpty ? '${b['businessName'] ?? widget.user.businessName}'[0].toUpperCase() : 'B', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Color(0xFF0867FF)))),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${b['businessName'] ?? widget.user.businessName}', style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900, color: Color(0xFF071A63))),
            Text('${b['ownerName'] ?? widget.user.name}', style: const TextStyle(color: Color(0xFF62729B))),
            const SizedBox(height: 6),
            Wrap(spacing: 8, runSpacing: 6, children: [
              _badge(status, const Color(0xFF0867FF)),
              _badge('WhatsApp ${wa['status'] ?? 'NOT_CONNECTED'}', (wa['status'] == 'CONNECTED') ? const Color(0xFF0F9D67) : const Color(0xFFF59E0B)),
            ]),
          ])),
        ]))),
        const SizedBox(height: 10),
        SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [
          _stat('Contacts', counts['contacts'] ?? (resources?['contacts'] as List?)?.length ?? 0),
          _stat('Templates', counts['templates'] ?? (resources?['templates'] as List?)?.length ?? 0),
          _stat('Automations', counts['automations'] ?? (resources?['automations'] as List?)?.length ?? 0),
          _stat('Messages', counts['messages'] ?? (resources?['messages'] as List?)?.length ?? 0),
        ])),
        const SizedBox(height: 10),
        Row(children: [
          if (status == 'PENDING_APPROVAL' || status == 'PENDING') ...[
            Expanded(child: OutlinedButton(onPressed: () => _action('reject'), child: const Text('Reject'))), const SizedBox(width: 8), Expanded(child: FilledButton(onPressed: () => _action('approve'), child: const Text('Approve'))),
          ] else if (status == 'ACTIVE' || status == 'APPROVED') Expanded(child: OutlinedButton(onPressed: () => _action('suspend'), child: const Text('Suspend Business')))
          else if (status == 'SUSPENDED') Expanded(child: FilledButton(onPressed: () => _action('reactivate'), child: const Text('Reactivate Business'))),
        ]),
      ])),
      TabBar(controller: _tabs, isScrollable: true, tabs: const [Tab(text:'Overview'),Tab(text:'WhatsApp'),Tab(text:'Contacts'),Tab(text:'Templates'),Tab(text:'Automations'),Tab(text:'Messages'),Tab(text:'Activity')]),
      Expanded(child: TabBarView(controller: _tabs, children: [
        _overview(b), _whatsapp(wa), _rawList('Contacts', resources?['contacts']), _rawList('Templates', resources?['templates']), _rawList('Automations', resources?['automations']), _rawList('Messages', resources?['messages']), _activity(resources?['activity']),
      ])),
    ]);
  }

  Widget _overview(Map<String,dynamic> b) => ListView(padding: const EdgeInsets.all(16), children: [
    _section('Owner Details', [
      _row('Owner Name','${b['ownerName'] ?? widget.user.name}'), _row('Mobile','${b['mobile'] ?? widget.user.mobile}'), _row('Email','${b['email'] ?? widget.user.email}'),
    ]),
    const SizedBox(height: 12),
    _section('Business Profile', [
      _row('Business Name','${b['businessName'] ?? widget.user.businessName}'), _row('Address','${b['businessAddress'] ?? widget.user.businessAddress}'), _row('Status','${b['status'] ?? ''}'),
      _row('Registered', _date(b['createdAt'])), _row('Approved', _date(b['approvedAt'])), _row('Last Login', _date(b['lastLoginAt'])),
    ]),
  ]);

  Future<void> _businessWhatsAppAction(String action) async {
    try {
      final path = action == 'test'
          ? '/api/admin/businesses/${widget.user.id}/whatsapp/test'
          : '/api/admin/businesses/${widget.user.id}/templates/sync';
      final result = await ref.read(apiClientProvider).post(path, data: {});
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(action == 'test' ? 'WhatsApp connection verified for this business.' : 'Templates synced for this business.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : '$e')));
    }
  }

  Widget _whatsapp(Map<String,dynamic> wa) => ListView(padding: const EdgeInsets.all(16), children: [
    _section('WhatsApp Connection', [
      _row('Connection Status','${wa['status'] ?? 'NOT_CONNECTED'}'), _row('Verified Name','${wa['verifiedName'] ?? '—'}'), _row('Display Number','${wa['displayPhoneNumber'] ?? wa['businessPhone'] ?? '—'}'),
      _row('Meta App ID','${wa['metaAppId'] ?? '—'}'), _row('Meta Business ID','${wa['metaBusinessId'] ?? '—'}'), _row('WABA ID','${wa['wabaId'] ?? wa['businessAccountId'] ?? '—'}'), _row('Phone Number ID','${wa['phoneNumberId'] ?? '—'}'), _row('Quality','${wa['qualityRating'] ?? '—'}'), _row('Last Verified', _date(wa['lastTestedAt'])),
    ]),
    const SizedBox(height: 12),
    _section('Credential Storage', [
      _row('Credentials','${wa['credentialsStored'] == true ? 'Stored securely' : 'Not configured'}'),
      _row('Access Token','${wa['accessTokenStored'] == true ? 'Encrypted / stored' : 'Not stored'}'),
      _row('App Secret','${wa['appSecretStored'] == true ? 'Encrypted / stored' : 'Not stored'}'),
      _row('Webhook Token','${wa['webhookTokenStored'] == true ? 'Encrypted / stored' : 'Not stored'}'),
    ]),
    if ('${wa['lastConnectionError'] ?? ''}'.isNotEmpty) ...[const SizedBox(height: 12), Card(color: const Color(0xFFFFF1F2), child: Padding(padding: const EdgeInsets.all(14), child: Text('${wa['lastConnectionError']}', style: const TextStyle(color: Color(0xFF8F1D2C)))) )],
    const SizedBox(height: 12),
    Row(children: [
      Expanded(child: FilledButton.icon(onPressed: wa['credentialsStored'] == true ? () => _businessWhatsAppAction('test') : null, icon: const Icon(Icons.verified_outlined), label: const Text('Test Connection'))),
      const SizedBox(width: 8),
      Expanded(child: OutlinedButton.icon(onPressed: wa['credentialsStored'] == true ? () => _businessWhatsAppAction('sync') : null, icon: const Icon(Icons.sync), label: const Text('Sync Templates'))),
    ]),
    const SizedBox(height: 12),
    const Card(child: Padding(padding: EdgeInsets.all(14), child: Text('Admin can monitor and operate this business connection, but raw access tokens/secrets are never displayed. Every send still uses this business’s own encrypted WhatsApp credentials.'))),
  ]);

  Widget _activity(dynamic value) {
    final list = value is List ? value : const [];
    if (list.isEmpty) return const Center(child: Text('No activity recorded yet.'));
    return ListView.builder(padding: const EdgeInsets.all(12), itemCount: list.length, itemBuilder: (_, i) {
      final m = list[i] is Map ? (list[i] as Map).cast<String,dynamic>() : <String,dynamic>{};
      return Card(child: ListTile(leading: const Icon(Icons.history), title: Text('${m['action'] ?? 'Activity'}', style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: Text('${m['actor'] ?? ''}\n${_date(m['createdAt'])}'), isThreeLine: true));
    });
  }

  Widget _rawList(String title, dynamic value) {
    final list = value is List ? value : const [];
    if (list.isEmpty) return Center(child: Text('No $title records.'));
    return ListView.builder(padding: const EdgeInsets.all(12), itemCount: list.length, itemBuilder: (_,i) {
      final m = list[i] is Map ? (list[i] as Map).cast<String,dynamic>() : <String,dynamic>{};
      String primary = '$title #${m['id'] ?? i+1}'; String secondary=''; String trailing='';
      if (title=='Contacts') { primary='${m['name'] ?? ''}'; secondary='${m['phone'] ?? ''}${m['email']!=null?' • ${m['email']}':''}'; trailing='${m['optIn']==true?'OPT-IN':'NO OPT-IN'}'; }
      if (title=='Templates') { primary='${m['name'] ?? ''}'; secondary='${m['category'] ?? ''} • ${m['language'] ?? ''}'; trailing='${m['status'] ?? ''}'; }
      if (title=='Automations') { primary='${m['templateName'] ?? 'Automation'}'; secondary='${m['contactName'] ?? ''} • ${_date(m['scheduledAt'])}'; trailing='${m['status'] ?? ''}'; }
      if (title=='Messages') { primary='${m['templateName'] ?? 'Message'}'; secondary='${m['contactName'] ?? ''} ${m['contactPhone'] ?? ''}'; trailing='${m['status'] ?? ''}'; }
      return Card(child: ListTile(title: Text(primary, style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: Text(secondary), trailing: Text(trailing, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800))));
    });
  }

  Widget _section(String title, List<Widget> children) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF071A63))), const SizedBox(height: 12), ...children])));
  Widget _row(String k,String v)=>Padding(padding: const EdgeInsets.symmetric(vertical: 7), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children:[Expanded(child:Text(k,style:const TextStyle(color:Color(0xFF6C7896)))),Expanded(child:Text(v.isEmpty?'—':v,textAlign:TextAlign.right,style:const TextStyle(fontWeight:FontWeight.w800))) ]));
  Widget _badge(String t, Color c)=>Container(padding:const EdgeInsets.symmetric(horizontal:10,vertical:5),decoration:BoxDecoration(color:c.withOpacity(.1),borderRadius:BorderRadius.circular(20)),child:Text(t.replaceAll('_',' '),style:TextStyle(color:c,fontSize:10,fontWeight:FontWeight.w900)));
  Widget _stat(String label,dynamic value)=>Container(width:118,margin:const EdgeInsets.only(right:8),padding:const EdgeInsets.all(12),decoration:BoxDecoration(color:Colors.white,border:Border.all(color:const Color(0xFFE2EAF7)),borderRadius:BorderRadius.circular(14)),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('$value',style:const TextStyle(fontSize:20,fontWeight:FontWeight.w900,color:Color(0xFF071A63))),Text(label,style:const TextStyle(color:Color(0xFF6C7896),fontSize:12))]));
  String _date(dynamic v){ final d=DateTime.tryParse('${v ?? ''}'); return d==null?'—':DateFormat('dd MMM yyyy, hh:mm a').format(d.toLocal()); }
}
