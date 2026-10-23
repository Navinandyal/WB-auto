import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../providers/providers.dart';
import '../widgets/admin_ui.dart';
import '../widgets/common.dart';
import 'admin_template_suggestions_screen.dart';

final adminRecordsProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>(
      (ref, endpoint) async =>
          (await ref.read(apiClientProvider).get(endpoint) as List)
              .whereType<Map>()
              .map((v) => v.cast<String, dynamic>())
              .toList(),
    );

class AdminContactsScreen extends StatelessWidget {
  const AdminContactsScreen({super.key, this.businessId});
  final int? businessId;
  @override
  Widget build(BuildContext context) =>
      _AdminDirectory(templates: false, businessId: businessId);
}

class AdminTemplatesScreen extends StatelessWidget {
  const AdminTemplatesScreen({super.key, this.businessId});
  final int? businessId;
  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 2,
    child: Column(
      children: [
        const TabBar(
          tabs: [
            Tab(text: 'Templates'),
            Tab(text: 'Suggestions'),
          ],
        ),
        Expanded(
          child: TabBarView(
            children: [
              _AdminDirectory(templates: true, businessId: businessId),
              const AdminTemplateSuggestionsScreen(),
            ],
          ),
        ),
      ],
    ),
  );
}

class _AdminDirectory extends ConsumerStatefulWidget {
  const _AdminDirectory({required this.templates, this.businessId});
  final bool templates;
  final int? businessId;
  @override
  ConsumerState<_AdminDirectory> createState() => _AdminDirectoryState();
}

class _AdminDirectoryState extends ConsumerState<_AdminDirectory> {
  String search = '', status = 'ALL';
  int? businessId;
  int page = 0;
  static const pageSize = 40;
  String get endpoint =>
      widget.templates ? '/api/admin/templates' : '/api/admin/contacts';
  @override
  void initState() {
    super.initState();
    businessId = widget.businessId;
  }

  void _change(VoidCallback update) => setState(() {
    update();
    page = 0;
  });
  String _templateStatus(dynamic value) {
    final s = '$value'.toUpperCase();
    return [
          'PENDING',
          'PENDING_APPROVAL',
          'IN_REVIEW',
          'PROCESSING',
        ].contains(s)
        ? 'PROCESSING'
        : s;
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(adminRecordsProvider(endpoint));
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(adminRecordsProvider(endpoint));
        await ref.read(adminRecordsProvider(endpoint).future);
      },
      child: state.when(
        loading: () => ListView(
          children: const [
            SizedBox(height: 100),
            Center(child: CircularProgressIndicator()),
          ],
        ),
        error: (e, _) => ListView(
          children: [
            ErrorState(
              e,
              onRetry: () => ref.invalidate(adminRecordsProvider(endpoint)),
            ),
          ],
        ),
        data: (all) {
          final query = search.trim().toLowerCase();
          final rows = all
              .where(
                (m) =>
                    (businessId == null || m['businessId'] == businessId) &&
                    (status == 'ALL' ||
                        (widget.templates
                                ? _templateStatus(m['status'])
                                : m['optIn'] == true
                                ? 'OPT-IN'
                                : 'NO OPT-IN') ==
                            status) &&
                    (query.isEmpty ||
                        [
                          'name',
                          'phone',
                          'email',
                          'businessName',
                          'ownerName',
                          'category',
                          'language',
                        ].any(
                          (k) => '${m[k] ?? ''}'.toLowerCase().contains(query),
                        )),
              )
              .toList();
          final pages = (rows.length / pageSize).ceil();
          final current = page.clamp(0, pages == 0 ? 0 : pages - 1);
          final visible = rows.skip(current * pageSize).take(pageSize).toList();
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              AdminHeader(
                widget.templates ? 'Business templates' : 'Contact directory',
                widget.templates
                    ? 'Review message content, approval status and the business owner.'
                    : 'Find contacts by business, name or phone number.',
                icon: widget.templates
                    ? Icons.description_outlined
                    : Icons.people_alt_outlined,
              ),
              TextField(
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: widget.templates
                      ? 'Search template or owner'
                      : 'Search contact, phone or owner',
                ),
                onChanged: (v) => _change(() => search = v),
              ),
              const SizedBox(height: 16),
              if (widget.businessId == null) ...[
                AdminBusinessFilter(
                  selected: businessId,
                  onChanged: (v) => _change(() => businessId = v),
                ),
                const SizedBox(height: 14),
              ],
              AdminStatusTabs(
                values: widget.templates
                    ? const [
                        'ALL',
                        'DRAFT',
                        'PROCESSING',
                        'APPROVED',
                        'REJECTED',
                      ]
                    : const ['ALL', 'OPT-IN', 'NO OPT-IN'],
                selected: status,
                onChanged: (v) => _change(() => status = v),
              ),
              const SizedBox(height: 16),
              Text(
                '${rows.length} ${widget.templates ? 'templates' : 'contacts'}',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  color: adminMuted,
                ),
              ),
              const SizedBox(height: 12),
              if (rows.isEmpty)
                const EmptyState('No records match these filters.'),
              ...visible.map(
                (m) => Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => widget.templates
                            ? AdminTemplateDetailScreen(data: m)
                            : AdminContactDetailScreen(data: m),
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              CircleAvatar(
                                backgroundColor: Theme.of(
                                  context,
                                ).colorScheme.primaryContainer,
                                child: Icon(
                                  widget.templates
                                      ? Icons.description_outlined
                                      : Icons.person_outline,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${m['name'] ?? 'Unnamed'}',
                                      style: const TextStyle(
                                        fontSize: 17,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    const SizedBox(height: 5),
                                    Text(
                                      widget.templates
                                          ? '${m['category']} · ${m['language']}'
                                          : '${m['phone'] ?? ''}',
                                      style: const TextStyle(color: adminMuted),
                                    ),
                                  ],
                                ),
                              ),
                              const Icon(
                                Icons.chevron_right,
                                color: adminMuted,
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          Wrap(
                            spacing: 10,
                            runSpacing: 8,
                            children: [
                              AdminBadge(
                                widget.templates
                                    ? _templateStatus(m['status'])
                                    : m['optIn'] == true
                                    ? 'OPT-IN'
                                    : 'NO OPT-IN',
                              ),
                              Text(
                                '${m['businessName'] ?? m['ownerName'] ?? 'Business'}',
                                style: const TextStyle(
                                  color: adminMuted,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                          if (widget.templates) ...[
                            const Divider(height: 24),
                            Text(
                              _body(m),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(height: 1.4),
                            ),
                          ] else if ('${m['email'] ?? ''}'.isNotEmpty) ...[
                            const SizedBox(height: 10),
                            Text(
                              '${m['email']}',
                              style: const TextStyle(color: adminMuted),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              if (pages > 1)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    IconButton(
                      onPressed: current > 0
                          ? () => setState(() => page = current - 1)
                          : null,
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Text('Page ${current + 1} of $pages'),
                    IconButton(
                      onPressed: current + 1 < pages
                          ? () => setState(() => page = current + 1)
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

  String _body(Map m) {
    for (final c in (m['components'] as List? ?? const [])) {
      if (c is Map && '${c['type']}'.toUpperCase() == 'BODY')
        return '${c['text'] ?? ''}';
    }
    return 'Open to view template details';
  }
}

class AdminContactDetailScreen extends StatelessWidget {
  const AdminContactDetailScreen({super.key, required this.data});
  final Map<String, dynamic> data;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Contact details')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        AdminHeader(
          '${data['name']}',
          'Contact profile and business ownership.',
          icon: Icons.person_outline,
        ),
        AdminPanel(
          title: 'Contact',
          children: [
            adminInfo('Name', data['name']),
            adminInfo('Phone', data['phone']),
            adminInfo('Email', data['email']),
            adminInfo('Birthday', data['dob']),
            AdminBadge(data['optIn'] == true ? 'OPT-IN' : 'NO OPT-IN'),
          ],
        ),
        AdminPanel(
          title: 'Business owner',
          children: [
            adminInfo('Business', data['businessName']),
            adminInfo('Owner', data['ownerName']),
            adminInfo('Business ID', data['businessId']),
          ],
        ),
      ],
    ),
  );
}

class AdminTemplateDetailScreen extends StatelessWidget {
  const AdminTemplateDetailScreen({super.key, required this.data});
  final Map<String, dynamic> data;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Template details')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        AdminHeader(
          '${data['name']}',
          'Full template preview, ownership and approval information.',
          icon: Icons.description_outlined,
        ),
        AdminPanel(
          title: 'WhatsApp preview',
          children: [
            AdminTemplatePreview(data),
            const SizedBox(height: 10),
            const Text(
              'Example values are shown for placeholders. A preview does not send a message.',
              style: TextStyle(color: adminMuted, fontSize: 12),
            ),
          ],
        ),
        AdminPanel(
          title: 'Business owner',
          children: [
            adminInfo('Business', data['businessName']),
            adminInfo('Owner', data['ownerName']),
            adminInfo('Owner phone', data['ownerPhone']),
            adminInfo('Owner email', data['ownerEmail']),
            adminInfo('Business address', data['businessAddress']),
            adminInfo('Business ID', data['businessId']),
          ],
        ),
        AdminPanel(
          title: 'Template information',
          trailing: AdminBadge('${data['status']}'),
          children: [
            adminInfo('Name', data['name']),
            adminInfo('Category', data['category']),
            adminInfo('Language', data['language']),
            adminInfo('Header', _header()),
            adminInfo('Variable count', data['variableCount']),
            adminInfo('Meta template ID', data['metaTemplateId']),
            adminInfo('Created', adminDate(data['createdAt'])),
            adminInfo('Updated', adminDate(data['updatedAt'])),
          ],
        ),
      ],
    ),
  );
  String _header() {
    for (final c in data['components'] as List? ?? const []) {
      if (c is Map && '${c['type']}'.toUpperCase() == 'HEADER')
        return '${c['format'] ?? 'TEXT'}';
    }
    return 'None';
  }
}

class AdminAutomationsScreen extends ConsumerStatefulWidget {
  const AdminAutomationsScreen({super.key, this.businessId});
  final int? businessId;
  @override
  ConsumerState<AdminAutomationsScreen> createState() =>
      _AdminAutomationsScreenState();
}

class _AdminAutomationsScreenState
    extends ConsumerState<AdminAutomationsScreen> {
  Map<String, dynamic>? data;
  String? error;
  bool loading = true;
  int page = 1, request = 0;
  int? businessId;
  String search = '', status = 'ALL', range = '7 days';
  DateTimeRange? custom;
  Timer? debounce;
  DateTime get today {
    final t = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));
    return DateTime(t.year, t.month, t.day);
  }

  @override
  void initState() {
    super.initState();
    businessId = widget.businessId;
    _load();
  }

  @override
  void dispose() {
    debounce?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final seq = ++request;
    setState(() {
      loading = true;
      error = null;
    });
    final query = <String, dynamic>{
      'page': page,
      'limit': 40,
      'search': search,
      'status': status,
      if (businessId != null) 'businessId': businessId,
    };
    if (range != 'All time') {
      final end = custom?.end ?? today;
      final start =
          custom?.start ??
          today.subtract(
            Duration(
              days: range == 'Today'
                  ? 0
                  : range == '30 days'
                  ? 29
                  : 6,
            ),
          );
      query['start'] = DateFormat('yyyy-MM-dd').format(start);
      query['end'] = DateFormat('yyyy-MM-dd').format(end);
    }
    try {
      final result = await ref
          .read(apiClientProvider)
          .get('/api/admin/scheduled-messages', query: query);
      if (mounted && seq == request)
        setState(() {
          data = (result as Map).cast<String, dynamic>();
          loading = false;
        });
    } catch (e) {
      if (mounted && seq == request)
        setState(() {
          error = '$e';
          loading = false;
        });
    }
  }

  void _filter(VoidCallback change) {
    change();
    page = 1;
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final summary = data?['summary'] as Map? ?? {};
    final rows = (data?['items'] as List? ?? const [])
        .whereType<Map>()
        .map((v) => v.cast<String, dynamic>())
        .toList();
    final daily = (data?['daily'] as List? ?? const [])
        .whereType<Map>()
        .toList();
    final total = (data?['total'] as num? ?? 0).toInt();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const AdminHeader(
            'Scheduled messages',
            'See scheduled and sent messages by business, recipient and day.',
            icon: Icons.schedule_send_outlined,
          ),
          if (widget.businessId == null) ...[
            AdminBusinessFilter(
              selected: businessId,
              onChanged: (v) => _filter(() => businessId = v),
            ),
            const SizedBox(height: 14),
          ],
          TextField(
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Search business, contact or template',
            ),
            onChanged: (v) {
              search = v;
              debounce?.cancel();
              debounce = Timer(
                const Duration(milliseconds: 350),
                () => _filter(() {}),
              );
            },
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ...['Today', '7 days', '30 days', 'All time'].map(
                (v) => ChoiceChip(
                  label: Text(v),
                  selected: range == v,
                  onSelected: (_) => _filter(() {
                    range = v;
                    custom = null;
                  }),
                ),
              ),
              ActionChip(
                avatar: const Icon(Icons.date_range, size: 17),
                label: Text(
                  range == 'Custom'
                      ? '${DateFormat('dd MMM').format(custom!.start)} – ${DateFormat('dd MMM').format(custom!.end)}'
                      : 'Choose dates',
                ),
                onPressed: () async {
                  final picked = await showDateRangePicker(
                    context: context,
                    firstDate: DateTime(2020),
                    lastDate: today.add(const Duration(days: 3650)),
                    initialDateRange: custom,
                  );
                  if (picked != null && mounted)
                    _filter(() {
                      range = 'Custom';
                      custom = picked;
                    });
                },
              ),
            ],
          ),
          const SizedBox(height: 18),
          if (loading) const LinearProgressIndicator(),
          if (error != null) ErrorState(error!, onRetry: _load),
          if (data != null) ...[
            AdminMetrics({
              'Total messages': summary['total'] ?? 0,
              'Sent': summary['sent'] ?? 0,
              'Failed': summary['failed'] ?? 0,
              'Scheduled': summary['scheduled'] ?? 0,
              'Processing': summary['processing'] ?? 0,
              'Paused / cancelled / simulated': summary['other'] ?? 0,
            }),
            const SizedBox(height: 18),
            AdminPanel(
              title: 'Day-wise tracking',
              trailing: const Text(
                'IST',
                style: TextStyle(color: adminMuted, fontSize: 12),
              ),
              children: [
                if (daily.isEmpty)
                  const Text('No activities in this date range.')
                else
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      columnSpacing: 18,
                      horizontalMargin: 0,
                      columns: const [
                        DataColumn(label: Text('Day')),
                        DataColumn(label: Text('Total'), numeric: true),
                        DataColumn(label: Text('Sent'), numeric: true),
                        DataColumn(label: Text('Failed'), numeric: true),
                        DataColumn(label: Text('Scheduled'), numeric: true),
                        DataColumn(label: Text('Processing'), numeric: true),
                        DataColumn(label: Text('Other'), numeric: true),
                      ],
                      rows: daily
                          .map(
                            (d) => DataRow(
                              cells: [
                                DataCell(Text('${d['day']}')),
                                ...[
                                  'total',
                                  'sent',
                                  'failed',
                                  'scheduled',
                                  'processing',
                                  'other',
                                ].map((k) => DataCell(Text('${d[k]}'))),
                              ],
                            ),
                          )
                          .toList(),
                    ),
                  ),
                const SizedBox(height: 12),
                const Text(
                  'Totals include scheduled messages and Send Now. Days use IST. Sent means WhatsApp accepted the request; open a message for delivery receipts. Other includes paused, cancelled and simulated messages. The daily table shows up to 90 days with activity; use date filters to view earlier days.',
                  style: TextStyle(
                    fontSize: 11,
                    color: adminMuted,
                    height: 1.4,
                  ),
                ),
              ],
            ),
            AdminStatusTabs(
              values: const [
                'ALL',
                'SENT',
                'FAILED',
                'SCHEDULED',
                'PROCESSING',
                'PAUSED',
                'CANCELLED',
                'SIMULATED',
              ],
              selected: status,
              onChanged: (v) => _filter(() => status = v),
            ),
            const SizedBox(height: 14),
            Text(
              '$total matching activities',
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                color: adminMuted,
              ),
            ),
            const SizedBox(height: 12),
            if (rows.isEmpty && !loading)
              const EmptyState('No messages match these filters.'),
            ...rows.map(
              (m) => Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: ListTile(
                  contentPadding: const EdgeInsets.all(16),
                  leading: const Icon(Icons.schedule_send_outlined),
                  title: Text(
                    '${m['templateName'] ?? 'Message'}',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${m['businessName'] ?? m['ownerName'] ?? 'Business'}',
                        ),
                        Text(
                          '${m['contactName'] ?? ''} · ${m['contactPhone'] ?? ''}',
                        ),
                        const SizedBox(height: 8),
                        Text(
                          adminDate(m['activityAt']),
                          style: const TextStyle(
                            color: adminMuted,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 8),
                        AdminBadge('${m['status']}'),
                      ],
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => AdminMessageDetailScreen(data: m),
                    ),
                  ).then((_) => mounted ? _load() : null),
                ),
              ),
            ),
            if (total > 40)
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    onPressed: !loading && page > 1
                        ? () {
                            page--;
                            _load();
                          }
                        : null,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Text('Page $page of ${(total / 40).ceil()}'),
                  IconButton(
                    onPressed: !loading && page * 40 < total
                        ? () {
                            page++;
                            _load();
                          }
                        : null,
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
          ],
        ],
      ),
    );
  }
}

class AdminMessageDetailScreen extends ConsumerStatefulWidget {
  const AdminMessageDetailScreen({super.key, required this.data});
  final Map<String, dynamic> data;
  @override
  ConsumerState<AdminMessageDetailScreen> createState() =>
      _AdminMessageDetailScreenState();
}

class _AdminMessageDetailScreenState
    extends ConsumerState<AdminMessageDetailScreen> {
  bool busy = false;
  Future<void> _action(String action) async {
    if (!await adminConfirm(
          context,
          '${adminLabel(action)} message?',
          'This changes the scheduled message for ${widget.data['contactName']}. ${action == 'run-now' ? 'The message will be sent now using this business’s WhatsApp connection.' : ''}',
        ) ||
        !mounted)
      return;
    setState(() => busy = true);
    try {
      await ref
          .read(apiClientProvider)
          .post(
            '/api/admin/automations/${widget.data['automationId']}/$action',
            data: {},
          );
      if (mounted) {
        showAppMessage(context, 'Message updated.');
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
    final m = widget.data;
    final vars = (m['variables'] as Map? ?? {}).map(
      (k, v) => MapEntry('$k', '$v'),
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Scheduled message details')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          AdminHeader(
            '${m['templateName'] ?? 'Message'}',
            'Recipient, original message preview and sending record.',
            icon: Icons.schedule_send,
          ),
          AdminPanel(
            title: 'Message preview',
            trailing: AdminBadge('${m['status']}'),
            children: [
              AdminTemplatePreview({
                'components': m['components'] ?? [],
              }, variables: vars),
            ],
          ),
          AdminPanel(
            title: 'Business & recipient',
            children: [
              adminInfo('Business', m['businessName']),
              adminInfo('Business owner', m['ownerName']),
              adminInfo('Recipient', m['contactName']),
              adminInfo('Phone', m['contactPhone']),
            ],
          ),
          AdminPanel(
            title: 'Send details',
            children: [
              adminInfo('Status', adminLabel('${m['status']}')),
              adminInfo('Meta / backend status', m['rawStatus']),
              adminInfo('Scheduled', adminDate(m['scheduledAt'])),
              adminInfo('Send activity', adminDate(m['activityAt'])),
              adminInfo('Sent receipt', adminDate(m['sentAt'])),
              adminInfo('Delivered receipt', adminDate(m['deliveredAt'])),
              adminInfo('Read receipt', adminDate(m['readAt'])),
              adminInfo('WhatsApp message ID', m['whatsappMessageId']),
              if (m['errorMessage'] != null)
                adminInfo('Error', m['errorMessage']),
              if (m['errorCode'] != null)
                adminInfo('Error code', m['errorCode']),
            ],
          ),
          if (m['automationId'] != null)
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                if (m['rawStatus'] == 'SCHEDULED')
                  ...['run-now', 'pause'].map(
                    (a) => OutlinedButton(
                      onPressed: busy ? null : () => _action(a),
                      child: Text(adminLabel(a)),
                    ),
                  ),
                if (m['rawStatus'] == 'PAUSED')
                  FilledButton(
                    onPressed: busy ? null : () => _action('resume'),
                    child: const Text('Resume'),
                  ),
                if (['SCHEDULED', 'PAUSED'].contains(m['rawStatus']))
                  OutlinedButton(
                    onPressed: busy ? null : () => _action('cancel'),
                    child: const Text('Cancel schedule'),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}
