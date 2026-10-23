import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../providers/providers.dart';
import '../widgets/admin_ui.dart';
import '../widgets/common.dart';

class AdminPackagesScreen extends ConsumerStatefulWidget {
  const AdminPackagesScreen({super.key});
  @override
  ConsumerState<AdminPackagesScreen> createState() =>
      _AdminPackagesScreenState();
}

class _AdminPackagesScreenState extends ConsumerState<AdminPackagesScreen> {
  final searchController = TextEditingController();
  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  String search = '';
  int? businessId;
  int _i(dynamic value) => int.tryParse('$value') ?? 0;
  String _money(dynamic value) => NumberFormat.currency(
    locale: 'en_IN',
    symbol: '₹',
    decimalDigits: 2,
  ).format(_i(value) / 100);
  @override
  Widget build(BuildContext context) {
    final packages = ref.watch(adminPackagesProvider),
        subscriptions = ref.watch(adminSubscriptionsProvider);
    return DefaultTabController(
      length: 3,
      child: Column(
        children: [
          const TabBar(
            tabs: [
              Tab(text: 'Requests'),
              Tab(text: 'Plans'),
              Tab(text: 'History'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                _subscriptions(subscriptions, true),
                RefreshIndicator(
                  onRefresh: () async =>
                      ref.refresh(adminPackagesProvider.future),
                  child: ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      AdminHeader(
                        'Subscription plans',
                        'Set pricing, validity and limits for business owners.',
                        icon: Icons.workspace_premium_outlined,
                        action: FilledButton.icon(
                          onPressed: () => _editor(),
                          icon: const Icon(Icons.add),
                          label: const Text('Create plan'),
                        ),
                      ),
                      packages.when(
                        loading: () => const LinearProgressIndicator(),
                        error: (e, _) => ErrorState(
                          e,
                          onRetry: () => ref.invalidate(adminPackagesProvider),
                        ),
                        data: (rows) => Column(
                          children: [
                            if (rows.isEmpty)
                              const EmptyState('No plans created yet.'),
                            ...rows.map(_packageCard),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                _subscriptions(subscriptions, false),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _subscriptions(
    AsyncValue<List<Map<String, dynamic>>> state,
    bool pending,
  ) => RefreshIndicator(
    onRefresh: () async => ref.refresh(adminSubscriptionsProvider.future),
    child: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        AdminHeader(
          pending ? 'Package requests' : 'Subscription history',
          pending
              ? 'Open a request to review business and owner details before making a decision.'
              : 'Track each business’s activated, rejected and expired subscriptions.',
          icon: Icons.receipt_long_outlined,
        ),
        AdminBusinessFilter(
          selected: businessId,
          onChanged: (v) => setState(() => businessId = v),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: searchController,
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            hintText: 'Search business, owner or plan',
          ),
          onChanged: (v) => setState(() => search = v),
        ),
        const SizedBox(height: 18),
        state.when(
          loading: () => const LinearProgressIndicator(),
          error: (e, _) => ErrorState(
            e,
            onRetry: () => ref.invalidate(adminSubscriptionsProvider),
          ),
          data: (all) {
            final q = search.toLowerCase().trim();
            final rows = all
                .where(
                  (r) =>
                      (('${r['status']}' == 'PENDING') == pending) &&
                      (businessId == null || r['userId'] == businessId) &&
                      (q.isEmpty ||
                          [
                            'businessName',
                            'userName',
                            'phone',
                            'packageName',
                          ].any(
                            (k) => '${r[k] ?? ''}'.toLowerCase().contains(q),
                          )),
                )
                .toList();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${rows.length} ${pending ? 'requests' : 'subscriptions'}',
                  style: const TextStyle(
                    color: adminMuted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                if (rows.isEmpty)
                  const EmptyState('No matching subscriptions.'),
                ...rows.map(
                  (r) => Card(
                    margin: const EdgeInsets.only(bottom: 14),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () => _review(r),
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.business_outlined, size: 28),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    '${r['businessName'] ?? r['userName'] ?? 'Business'}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 18,
                                    ),
                                  ),
                                ),
                                const Icon(Icons.chevron_right),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Text(
                              'Owner · ${r['userName'] ?? '—'}',
                              style: const TextStyle(color: adminMuted),
                            ),
                            const Divider(height: 26),
                            Text(
                              '${r['packageName']} · ${_money(r['pricePaise'])}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 12,
                              runSpacing: 8,
                              children: [
                                AdminBadge('${r['status']}'),
                                Text(
                                  pending
                                      ? 'Review owner & request'
                                      : 'Valid until ${adminDate(r['endsAt'])}',
                                  style: const TextStyle(
                                    color: adminMuted,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ],
    ),
  );
  Widget _packageCard(Map<String, dynamic> p) => AdminPanel(
    title: '${p['name']}',
    trailing: AdminBadge(p['isActive'] != false ? 'AVAILABLE' : 'DISABLED'),
    children: [
      Text(
        _money(p['pricePaise']),
        style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 5),
      Text(
        '${p['durationMonths']} month(s) · ${p['packageType'] == 'MESSAGE_ADDON' ? 'Message add-on' : 'Base plan'}',
        style: const TextStyle(color: adminMuted),
      ),
      if ('${p['description'] ?? ''}'.isNotEmpty) ...[
        const SizedBox(height: 10),
        Text('${p['description']}'),
      ],
      const SizedBox(height: 14),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          _quota(p['messageLimit'], 'messages'),
          if (p['packageType'] != 'MESSAGE_ADDON') ...[
            _quota(p['contactLimit'], 'contacts'),
            _quota(p['automationLimit'], 'active schedules'),
          ],
        ],
      ),
      const SizedBox(height: 12),
      ...(p['benefits'] as List? ?? const []).map(
        (b) => Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.check_circle_outline, size: 17),
              const SizedBox(width: 8),
              Expanded(child: Text('$b')),
            ],
          ),
        ),
      ),
      const SizedBox(height: 14),
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          OutlinedButton.icon(
            onPressed: () => _editor(existing: p),
            icon: const Icon(Icons.edit_outlined),
            label: const Text('Edit plan'),
          ),
          if (p['isActive'] != false)
            TextButton(
              onPressed: () => _disable(p),
              child: const Text('Disable plan'),
            ),
        ],
      ),
    ],
  );
  Widget _quota(dynamic value, String unit) =>
      Chip(label: Text(_i(value) <= 0 ? 'Unlimited $unit' : '$value $unit'));
  Future<void> _editor({Map<String, dynamic>? existing}) async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => AdminPackageEditorScreen(existing: existing),
      ),
    );
    if (changed == true) ref.invalidate(adminPackagesProvider);
  }

  Future<void> _disable(Map p) async {
    if (!await adminConfirm(
          context,
          'Disable ${p['name']}?',
          'This plan will no longer be available for new requests.',
        ) ||
        !mounted)
      return;
    try {
      await ref
          .read(apiClientProvider)
          .delete('/api/admin/packages/${p['id']}');
      ref.invalidate(adminPackagesProvider);
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    }
  }

  Future<void> _review(Map<String, dynamic> r) async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => AdminPackageReviewScreen(request: r)),
    );
    ref.invalidate(adminSubscriptionsProvider);
  }
}

class AdminPackageReviewScreen extends ConsumerStatefulWidget {
  const AdminPackageReviewScreen({super.key, required this.request});
  final Map<String, dynamic> request;
  @override
  ConsumerState<AdminPackageReviewScreen> createState() =>
      _AdminPackageReviewScreenState();
}

class _AdminPackageReviewScreenState
    extends ConsumerState<AdminPackageReviewScreen> {
  bool busy = false;
  final notes = TextEditingController();
  @override
  void dispose() {
    notes.dispose();
    super.dispose();
  }

  Future<void> _decide(String action) async {
    final r = widget.request;
    if (!await adminConfirm(
          context,
          action == 'activate'
              ? 'Activate this package?'
              : 'Reject this request?',
          '${r['packageName']} for ${r['businessName'] ?? r['userName']} (${r['userName']}). ${action == 'activate' ? 'Confirm that payment and the owner details have been reviewed.' : 'The owner will be notified of this decision.'}',
        ) ||
        !mounted)
      return;
    setState(() => busy = true);
    try {
      await ref
          .read(apiClientProvider)
          .post(
            '/api/admin/subscriptions/${r['id']}/$action',
            data: {'notes': notes.text.trim()},
          );
      ref.invalidate(adminSubscriptionsProvider);
      if (mounted) {
        showAppMessage(
          context,
          action == 'activate' ? 'Package activated.' : 'Request rejected.',
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.request;
    return Scaffold(
      appBar: AppBar(title: const Text('Review package request')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          AdminHeader(
            '${r['businessName'] ?? r['userName']}',
            'Business owner and requested subscription.',
            icon: Icons.workspace_premium_outlined,
          ),
          AdminPanel(
            title: 'Business owner',
            children: [
              adminInfo('Owner name', r['userName']),
              adminInfo('Phone', r['phone']),
              adminInfo('Email', r['email']),
              adminInfo('Business name', r['businessName']),
              adminInfo('Address', r['businessAddress']),
              adminInfo('Business status', r['businessStatus']),
              adminInfo('Business ID', r['userId']),
            ],
          ),
          AdminPanel(
            title: 'Requested plan',
            trailing: AdminBadge('${r['status']}'),
            children: [
              adminInfo('Plan', r['packageName']),
              adminInfo(
                'Price',
                NumberFormat.currency(
                  locale: 'en_IN',
                  symbol: '₹',
                ).format((r['pricePaise'] as num? ?? 0) / 100),
              ),
              adminInfo('Plan type', r['packageType']),
              adminInfo('Validity', '${r['durationMonths']} month(s)'),
              adminInfo(
                'Message allowance',
                (r['messageLimit'] as num? ?? 0) <= 0
                    ? 'Unlimited'
                    : '${r['messageLimit']}',
              ),
              adminInfo('Requested', adminDate(r['createdAt'])),
              adminInfo('Starts', adminDate(r['startsAt'])),
              adminInfo('Ends', adminDate(r['endsAt'])),
              if ('${r['notes'] ?? ''}'.isNotEmpty)
                adminInfo('Request notes', r['notes']),
            ],
          ),
          if (r['status'] == 'PENDING') ...[
            TextField(
              controller: notes,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Decision notes (optional)',
                hintText: 'Payment reference or reason for the decision',
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Review the business owner and payment details before activating the plan.',
              style: TextStyle(color: adminMuted, fontSize: 12),
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                OutlinedButton(
                  onPressed: busy ? null : () => _decide('reject'),
                  child: const Text('Reject request'),
                ),
                FilledButton.icon(
                  onPressed: busy ? null : () => _decide('activate'),
                  icon: const Icon(Icons.check_circle_outline),
                  label: Text(busy ? 'Saving…' : 'Activate package'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class AdminPackageEditorScreen extends ConsumerStatefulWidget {
  const AdminPackageEditorScreen({super.key, this.existing});
  final Map<String, dynamic>? existing;
  @override
  ConsumerState<AdminPackageEditorScreen> createState() =>
      _AdminPackageEditorScreenState();
}

class _AdminPackageEditorScreenState
    extends ConsumerState<AdminPackageEditorScreen> {
  final form = GlobalKey<FormState>();
  late final TextEditingController name,
      desc,
      benefits,
      messages,
      contacts,
      automations,
      price,
      duration;
  late String type;
  late bool active;
  bool saving = false;
  int _i(dynamic v) => int.tryParse('$v') ?? 0;
  @override
  void initState() {
    super.initState();
    final p = widget.existing ?? {};
    name = TextEditingController(text: '${p['name'] ?? ''}');
    desc = TextEditingController(text: '${p['description'] ?? ''}');
    benefits = TextEditingController(
      text: (p['benefits'] as List? ?? const []).join('\n'),
    );
    messages = TextEditingController(text: '${p['messageLimit'] ?? 1000}');
    contacts = TextEditingController(text: '${p['contactLimit'] ?? 10000}');
    automations = TextEditingController(
      text: '${p['automationLimit'] ?? 1000}',
    );
    price = TextEditingController(
      text: (_i(p['pricePaise']) / 100).toStringAsFixed(
        _i(p['pricePaise']) % 100 == 0 ? 0 : 2,
      ),
    );
    duration = TextEditingController(text: '${p['durationMonths'] ?? 1}');
    type = '${p['packageType'] ?? 'BASE'}';
    active = p['isActive'] != false;
  }

  @override
  void dispose() {
    for (final c in [
      name,
      desc,
      benefits,
      messages,
      contacts,
      automations,
      price,
      duration,
    ])
      c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.existing == null ? 'Create Package' : 'Edit Package'),
    ),
    body: Form(
      key: form,
      child: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const AdminHeader(
            'Plan details',
            'Set benefits, quotas, price and validity.',
            icon: Icons.workspace_premium_outlined,
          ),
          TextFormField(
            controller: name,
            decoration: const InputDecoration(labelText: 'Package name *'),
            validator: (v) =>
                (v ?? '').trim().length < 2 ? 'Enter package name' : null,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: type,
            decoration: const InputDecoration(labelText: 'Package type'),
            items: const [
              DropdownMenuItem(value: 'BASE', child: Text('Base Package')),
              DropdownMenuItem(
                value: 'MESSAGE_ADDON',
                child: Text('Message Add-on'),
              ),
            ],
            onChanged: (v) => setState(() => type = v ?? 'BASE'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: desc,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Description'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: benefits,
            minLines: 4,
            maxLines: 8,
            decoration: const InputDecoration(
              labelText: 'Benefits',
              helperText: 'One benefit per line',
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _number(
                  messages,
                  'Message limit',
                  min: type == 'MESSAGE_ADDON' ? 1 : 0,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(child: _number(contacts, 'Contact limit')),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _number(automations, 'Active automation limit')),
              const SizedBox(width: 10),
              Expanded(child: _number(duration, 'Validity (months)', min: 1)),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: price,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Price (₹) *',
              prefixText: '₹ ',
            ),
            validator: (v) => double.tryParse((v ?? '').trim()) == null
                ? 'Enter valid price'
                : null,
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Package enabled',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            value: active,
            onChanged: (v) => setState(() => active = v),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: saving ? null : _save,
            child: saving
                ? const CircularProgressIndicator(color: Colors.white)
                : Text(
                    widget.existing == null ? 'Create Package' : 'Save Changes',
                  ),
          ),
        ],
      ),
    ),
  );
  Widget _number(TextEditingController c, String label, {int min = 0}) =>
      TextFormField(
        controller: c,
        keyboardType: TextInputType.number,
        decoration: InputDecoration(
          labelText: label,
          helperText: min == 0 ? '0 = unlimited' : null,
        ),
        validator: (v) {
          final n = int.tryParse((v ?? '').trim());
          if (n == null || n < min)
            return 'Enter ${min == 0 ? '0 or more' : 'at least $min'}';
          return null;
        },
      );
  Future<void> _save() async {
    if (!(form.currentState?.validate() ?? false)) return;
    setState(() => saving = true);
    try {
      final payload = {
        'name': name.text.trim(),
        'description': desc.text.trim(),
        'packageType': type,
        'benefits': benefits.text
            .split('\n')
            .map((e) => e.trim())
            .where((e) => e.isNotEmpty)
            .toList(),
        'messageLimit': int.parse(messages.text),
        'contactLimit': int.parse(contacts.text),
        'automationLimit': int.parse(automations.text),
        'pricePaise': (double.parse(price.text) * 100).round(),
        'durationMonths': int.parse(duration.text),
        'isActive': active,
      };
      if (widget.existing == null)
        await ref
            .read(apiClientProvider)
            .post('/api/admin/packages', data: payload);
      else
        await ref
            .read(apiClientProvider)
            .put(
              '/api/admin/packages/${widget.existing!['id']}',
              data: payload,
            );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
      if (mounted) setState(() => saving = false);
    }
  }
}
