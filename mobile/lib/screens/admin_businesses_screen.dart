import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import '../widgets/admin_ui.dart';
import '../widgets/common.dart';
import 'admin_platform_lists.dart';

class AdminBusinessesScreen extends ConsumerStatefulWidget {
  const AdminBusinessesScreen({super.key});
  @override
  ConsumerState<AdminBusinessesScreen> createState() =>
      _AdminBusinessesScreenState();
}

class _AdminBusinessesScreenState extends ConsumerState<AdminBusinessesScreen> {
  String search = '', filter = 'ALL';
  int page = 0;
  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: () async => ref.refresh(businessUsersProvider.future),
    child: ref
        .watch(businessUsersProvider)
        .when(
          loading: () => ListView(
            children: const [
              SizedBox(height: 140),
              Center(child: CircularProgressIndicator()),
            ],
          ),
          error: (e, _) => ListView(
            children: [
              ErrorState(
                e,
                onRetry: () => ref.invalidate(businessUsersProvider),
              ),
            ],
          ),
          data: (all) {
            final q = search.trim().toLowerCase();
            final items = all
                .where(
                  (u) =>
                      (filter == 'ALL' ||
                          (u.isPending
                                  ? 'PENDING_APPROVAL'
                                  : u.approvalStatus == 'APPROVED'
                                  ? 'ACTIVE'
                                  : u.approvalStatus) ==
                              filter) &&
                      (q.isEmpty ||
                          [
                            u.businessName,
                            u.name,
                            u.email,
                            u.mobile,
                          ].any((v) => v.toLowerCase().contains(q))),
                )
                .toList();
            final pages = (items.length / 40).ceil();
            final p = page.clamp(0, pages == 0 ? 0 : pages - 1);
            return ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const AdminHeader(
                  'Businesses',
                  'Get to know every owner, review registrations and manage business activity.',
                  icon: Icons.business_outlined,
                ),
                AdminMetrics({
                  'Registered': all.length,
                  'Awaiting approval': all.where((u) => u.isPending).length,
                }),
                const SizedBox(height: 20),
                TextField(
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    hintText: 'Search business, owner, phone or email',
                  ),
                  onChanged: (v) => setState(() {
                    search = v;
                    page = 0;
                  }),
                ),
                const SizedBox(height: 14),
                AdminStatusTabs(
                  values: const [
                    'ALL',
                    'PENDING_APPROVAL',
                    'ACTIVE',
                    'REJECTED',
                    'SUSPENDED',
                  ],
                  selected: filter,
                  onChanged: (v) => setState(() {
                    filter = v;
                    page = 0;
                  }),
                ),
                const SizedBox(height: 18),
                Text(
                  '${items.length} businesses',
                  style: const TextStyle(
                    color: adminMuted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                if (items.isEmpty)
                  const EmptyState('No businesses match these filters.'),
                ...items.skip(p * 40).take(40).map((u) {
                  final name = u.businessName.isEmpty ? u.name : u.businessName;
                  return Card(
                    margin: const EdgeInsets.only(bottom: 14),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AdminBusinessDetailScreen(user: u),
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                CircleAvatar(
                                  radius: 26,
                                  backgroundColor: Theme.of(
                                    context,
                                  ).colorScheme.primaryContainer,
                                  child: Text(
                                    name.isEmpty ? 'B' : name[0].toUpperCase(),
                                    style: const TextStyle(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        name,
                                        style: const TextStyle(
                                          fontSize: 19,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                      Text(
                                        'Owner · ${u.name}',
                                        style: const TextStyle(
                                          color: adminMuted,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const Icon(Icons.chevron_right),
                              ],
                            ),
                            const Divider(height: 28),
                            Wrap(
                              spacing: 12,
                              runSpacing: 10,
                              children: [
                                AdminBadge(
                                  u.isPending
                                      ? 'PENDING_APPROVAL'
                                      : u.approvalStatus,
                                ),
                                Text(
                                  u.mobile,
                                  style: const TextStyle(color: adminMuted),
                                ),
                              ],
                            ),
                            if (u.email.isNotEmpty) ...[
                              const SizedBox(height: 10),
                              Text(
                                u.email,
                                style: const TextStyle(
                                  color: adminMuted,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  );
                }),
                if (pages > 1)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      IconButton(
                        onPressed: p > 0
                            ? () => setState(() => page = p - 1)
                            : null,
                        icon: const Icon(Icons.chevron_left),
                      ),
                      Text('Page ${p + 1} of $pages'),
                      IconButton(
                        onPressed: p + 1 < pages
                            ? () => setState(() => page = p + 1)
                            : null,
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ],
                  ),
              ],
            );
          },
        ),
  );
}

class AdminBusinessDetailScreen extends ConsumerStatefulWidget {
  const AdminBusinessDetailScreen({super.key, required this.user});
  final BusinessUser user;
  @override
  ConsumerState<AdminBusinessDetailScreen> createState() =>
      _AdminBusinessDetailScreenState();
}

class _AdminBusinessDetailScreenState
    extends ConsumerState<AdminBusinessDetailScreen>
    with SingleTickerProviderStateMixin {
  late final tabs = TabController(length: 6, vsync: this);
  Map<String, dynamic>? detail, resources;
  String? error;
  bool loading = true, busy = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await Future.wait([
        ref
            .read(apiClientProvider)
            .get('/api/admin/businesses/${widget.user.id}'),
        ref
            .read(apiClientProvider)
            .get('/api/admin/businesses/${widget.user.id}/resources'),
      ]);
      if (mounted)
        setState(() {
          detail = (result[0] as Map).cast<String, dynamic>();
          resources = (result[1] as Map).cast<String, dynamic>();
          loading = false;
        });
    } catch (e) {
      if (mounted)
        setState(() {
          error = '$e';
          loading = false;
        });
    }
  }

  Future<void> _action(String action) async {
    if (busy ||
        !await adminConfirm(
          context,
          '${adminLabel(action)} business?',
          'Update the account status for ${widget.user.businessName.isEmpty ? widget.user.name : widget.user.businessName}?',
        ) ||
        !mounted)
      return;
    setState(() => busy = true);
    try {
      await ref
          .read(apiClientProvider)
          .post('/api/admin/businesses/${widget.user.id}/$action', data: {});
      ref.invalidate(businessUsersProvider);
      ref.invalidate(adminOverviewProvider);
      await _load();
      if (mounted) showAppMessage(context, 'Business status updated.');
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _whatsappAction(String action) async {
    setState(() => busy = true);
    try {
      await ref
          .read(apiClientProvider)
          .post(
            action == 'test'
                ? '/api/admin/businesses/${widget.user.id}/whatsapp/test'
                : '/api/admin/businesses/${widget.user.id}/templates/sync',
            data: {},
          );
      ref.invalidate(adminRecordsProvider('/api/admin/templates'));
      await _load();
      if (mounted)
        showAppMessage(
          context,
          action == 'test' ? 'Connection verified.' : 'Templates synced.',
        );
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Business details'),
      actions: [
        IconButton(
          onPressed: loading ? null : _load,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : error != null
        ? ErrorState(error!, onRetry: _load)
        : _body(),
  );
  Widget _body() {
    final b = (resources?['business'] as Map? ?? {}).cast<String, dynamic>();
    final wa = (resources?['whatsapp'] as Map? ?? {}).cast<String, dynamic>();
    final counts = detail?['counts'] as Map? ?? {};
    final status = '${b['status'] ?? widget.user.approvalStatus}';
    final name = '${b['businessName'] ?? widget.user.businessName}';
    return NestedScrollView(
      headerSliverBuilder: (c, scrolled) => [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AdminPanel(
                  title: name.isEmpty ? widget.user.name : name,
                  trailing: AdminBadge(status),
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        CircleAvatar(
                          radius: 30,
                          backgroundColor: Theme.of(
                            context,
                          ).colorScheme.primaryContainer,
                          child: const Icon(Icons.business, size: 30),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${b['ownerName'] ?? widget.user.name}',
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                '${b['mobile'] ?? widget.user.mobile}',
                                style: const TextStyle(color: adminMuted),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                '${b['email'] ?? widget.user.email}',
                                style: const TextStyle(color: adminMuted),
                              ),
                              const SizedBox(height: 12),
                              AdminBadge('${wa['status'] ?? 'NOT_CONNECTED'}'),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                AdminMetrics({
                  'Contacts': counts['contacts'] ?? 0,
                  'Templates': counts['templates'] ?? 0,
                  'Schedules': counts['automations'] ?? 0,
                  'Messages': counts['messages'] ?? 0,
                }),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    if (['PENDING', 'PENDING_APPROVAL'].contains(status))
                      ...['approve', 'reject'].map(
                        (a) => FilledButton.tonal(
                          onPressed: busy ? null : () => _action(a),
                          child: Text(adminLabel(a)),
                        ),
                      ),
                    if (['ACTIVE', 'APPROVED'].contains(status))
                      OutlinedButton(
                        onPressed: busy ? null : () => _action('suspend'),
                        child: const Text('Suspend business'),
                      ),
                    if (status == 'SUSPENDED')
                      FilledButton(
                        onPressed: busy ? null : () => _action('reactivate'),
                        child: const Text('Reactivate business'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
        SliverPersistentHeader(
          pinned: true,
          delegate: _BusinessTabs(
            TabBar(
              controller: tabs,
              isScrollable: true,
              tabAlignment: TabAlignment.start,
              tabs: const [
                Tab(text: 'Overview'),
                Tab(text: 'WhatsApp'),
                Tab(text: 'Contacts'),
                Tab(text: 'Templates'),
                Tab(text: 'Scheduled messages'),
                Tab(text: 'Activity'),
              ],
            ),
            Theme.of(context).colorScheme.surface,
          ),
        ),
      ],
      body: TabBarView(
        controller: tabs,
        children: [
          _overview(b),
          _whatsapp(wa),
          AdminContactsScreen(businessId: widget.user.id),
          AdminTemplatesScreen(businessId: widget.user.id),
          AdminAutomationsScreen(businessId: widget.user.id),
          _activity(),
        ],
      ),
    );
  }

  Widget _overview(Map<String, dynamic> b) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      AdminPanel(
        title: 'Owner information',
        children: [
          adminInfo('Full name', b['ownerName'] ?? widget.user.name),
          adminInfo('Phone', b['mobile'] ?? widget.user.mobile),
          adminInfo('Email', b['email'] ?? widget.user.email),
        ],
      ),
      AdminPanel(
        title: 'Business information',
        children: [
          adminInfo('Business name', b['businessName']),
          adminInfo('Address', b['businessAddress']),
          adminInfo('Account status', adminLabel('${b['status']}')),
          adminInfo('Registered', adminDate(b['createdAt'])),
          adminInfo('Approved', adminDate(b['approvedAt'])),
          adminInfo('Last login', adminDate(b['lastLoginAt'])),
        ],
      ),
    ],
  );
  Widget _whatsapp(Map<String, dynamic> wa) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      AdminPanel(
        title: 'WhatsApp connection',
        trailing: AdminBadge('${wa['status']}'),
        children: [
          adminInfo('Verified business', wa['verifiedName']),
          adminInfo(
            'WhatsApp number',
            wa['displayPhoneNumber'] ?? wa['businessPhone'],
          ),
          adminInfo('Quality rating', wa['qualityRating']),
          adminInfo('Last checked', adminDate(wa['lastTestedAt'])),
        ],
      ),
      AdminPanel(
        title: 'Meta account details',
        children: [
          adminInfo('App ID', wa['metaAppId']),
          adminInfo('Business ID', wa['metaBusinessId']),
          adminInfo('Meta business name', wa['metaBusinessName']),
          adminInfo('WABA ID', wa['wabaId'] ?? wa['businessAccountId']),
          adminInfo('WABA name', wa['wabaName']),
          adminInfo('Phone number ID', wa['phoneNumberId']),
        ],
      ),
      AdminPanel(
        title: 'Secure connection',
        children: [
          ...{
            'Credentials': 'credentialsStored',
            'Access token': 'accessTokenStored',
            'App secret': 'appSecretStored',
            'Webhook token': 'webhookTokenStored',
          }.entries.map(
            (e) => adminInfo(
              e.key,
              wa[e.value] == true ? 'Stored securely' : 'Not configured',
            ),
          ),
          if ('${wa['lastConnectionError'] ?? ''}'.isNotEmpty)
            adminInfo('Connection error', wa['lastConnectionError']),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              FilledButton.icon(
                onPressed: busy || wa['credentialsStored'] != true
                    ? null
                    : () => _whatsappAction('test'),
                icon: const Icon(Icons.verified_outlined),
                label: const Text('Test connection'),
              ),
              OutlinedButton.icon(
                onPressed: busy || wa['credentialsStored'] != true
                    ? null
                    : () => _whatsappAction('sync'),
                icon: const Icon(Icons.sync),
                label: const Text('Sync templates'),
              ),
            ],
          ),
        ],
      ),
    ],
  );
  Widget _activity() {
    final rows = (resources?['activity'] as List? ?? const [])
        .whereType<Map>()
        .toList();
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const AdminHeader(
          'Recent activity',
          'The latest 50 administrative actions for this business.',
          icon: Icons.history,
        ),
        if (rows.isEmpty) const EmptyState('No recorded activity.'),
        ...rows.map(
          (m) => Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: const Icon(Icons.history),
              title: Text(
                adminLabel('${m['action']}'),
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              subtitle: Text(
                '${m['actor'] ?? ''}\n${adminDate(m['createdAt'])}',
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _BusinessTabs extends SliverPersistentHeaderDelegate {
  _BusinessTabs(this.tabs, this.color);
  final TabBar tabs;
  final Color color;
  @override
  double get minExtent => tabs.preferredSize.height;
  @override
  double get maxExtent => minExtent;
  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) => Material(color: color, child: tabs);
  @override
  bool shouldRebuild(_BusinessTabs old) =>
      old.tabs != tabs || old.color != color;
}
