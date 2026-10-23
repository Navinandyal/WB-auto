import '../core/delivery_error.dart';
import 'dart:async';
import '../widgets/whatsapp_message_preview.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import 'create_automation_screen.dart';
import 'whatsapp_connection_screen.dart';

class AutomationsScreen extends ConsumerStatefulWidget {
  const AutomationsScreen({super.key});

  @override
  ConsumerState<AutomationsScreen> createState() => _AutomationsScreenState();
}

class _AutomationsScreenState extends ConsumerState<AutomationsScreen>
    with WidgetsBindingObserver {
  String filter = 'ALL';
  Timer? _statusTimer;
  bool _refreshing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _statusTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => _refreshPending(),
    );
  }

  Future<void> _refreshPending() async {
    if (!mounted ||
        _refreshing ||
        WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed ||
        ModalRoute.of(context)?.isCurrent != true)
      return;
    final list = ref.read(automationsProvider).valueOrNull;
    if (list == null ||
        !list.any(
          (item) => [
            'SCHEDULED',
            'ACCEPTED',
            'PROCESSING',
            'SENT',
            'DELIVERED',
          ].contains(item.status),
        ))
      return;
    _refreshing = true;
    try {
      final refreshed = await ref.refresh(automationsProvider.future);
      if (mounted &&
          refreshed.any(
            (item) => list.any(
              (old) => old.id == item.id && old.status != item.status,
            ),
          ))
        ref.invalidate(dashboardProvider);
    } catch (_) {
      /* Keep the last known status until the next refresh. */
    } finally {
      _refreshing = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshPending();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _statusTimer?.cancel();
    super.dispose();
  }

  static String displayStatus(String status) {
    if (status == 'ACCEPTED') return 'AWAITING DELIVERY';
    if (status == 'SCHEDULED' || status == 'PROCESSING') return 'QUEUE';
    if (status == 'SENT') return 'SENT';
    if (status == 'DELIVERED') return 'DELIVERED';
    if (status == 'READ') return 'READ';
    if (status == 'FAILED') return 'FAILED';
    if (status == 'SIMULATED') return 'SIMULATED';
    if (status == 'PAUSED') return 'PAUSED';
    if (status == 'CANCELLED') return 'CANCELLED';
    return status;
  }

  static bool matchesFilter(Automation item, String filter) =>
      filter == 'ALL' ||
      (filter == 'MESSAGE SENT' &&
          ['SENT', 'DELIVERED', 'READ'].contains(item.status)) ||
      displayStatus(item.status) == filter;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(automationsProvider);
    return async.when(
      skipError: true,
      loading: () => ListView(
        children: const [
          SizedBox(height: 260),
          Center(child: CircularProgressIndicator()),
        ],
      ),
      error: (e, _) => ListView(
        children: [
          const SizedBox(height: 180),
          ErrorState(e, onRetry: () => ref.invalidate(automationsProvider)),
        ],
      ),
      data: (list) {
        // Do not hide PAUSED, CANCELLED or SIMULATED automations. The previous
        // implementation filtered them out, making message history appear lost.
        final visible = List<Automation>.from(list);
        final items = visible.where((e) => matchesFilter(e, filter)).toList();
        final queue = visible
            .where((e) => displayStatus(e.status) == 'QUEUE')
            .length;
        final sent = visible
            .where((e) => ['SENT', 'DELIVERED', 'READ'].contains(e.status))
            .length;
        final failed = visible
            .where((e) => displayStatus(e.status) == 'FAILED')
            .length;
        final primary = Theme.of(context).colorScheme.primary;

        return RefreshIndicator(
          onRefresh: () => ref.refresh(automationsProvider.future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 90),
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Scheduled Messages',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            color: BusinessColors.ink,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Scheduled messages, delivery time and status.',
                          style: TextStyle(color: BusinessColors.muted),
                        ),
                      ],
                    ),
                  ),
                  FilledButton.icon(
                    onPressed: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              const CreateAutomationScreen(initialMode: 1),
                        ),
                      );
                      ref.invalidate(automationsProvider);
                      ref.invalidate(dashboardProvider);
                    },
                    icon: const Icon(Icons.schedule_send_rounded),
                    label: const Text('Schedule'),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [primary, Color.lerp(primary, Colors.black, .22)!],
                  ),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.message_rounded, color: Colors.white),
                        SizedBox(width: 9),
                        Text(
                          'Scheduled Message Center',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: _AutomationMetric(
                            value: '$queue',
                            label: 'In Queue',
                          ),
                        ),
                        Expanded(
                          child: _AutomationMetric(
                            value: '$sent',
                            label: 'Sent',
                          ),
                        ),
                        Expanded(
                          child: _AutomationMetric(
                            value: '$failed',
                            label: 'Failed',
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _chip('ALL', 'All ${visible.length}'),
                    _chip('QUEUE', 'Queue $queue'),
                    _chip(
                      'AWAITING DELIVERY',
                      'Awaiting delivery ${visible.where((e) => e.status == 'ACCEPTED').length}',
                    ),
                    _chip('MESSAGE SENT', 'Sent $sent'),
                    _chip('FAILED', 'Failed $failed'),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              if (items.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(28),
                    child: Center(child: Text('No scheduled messages found.')),
                  ),
                )
              else
                ...items.map(
                  (x) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _automationCard(x),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _automationCard(Automation item) {
    final preview = item.messagePreview.trim();
    final executed = item.executedAt;

    return InkWell(
      onTap: () async {
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AutomationDetailsScreen(item: item),
          ),
        );
        ref.invalidate(automationsProvider);
        ref.invalidate(dashboardProvider);
      },
      borderRadius: BorderRadius.circular(20),
      child: Ink(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: BusinessColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SoftIcon(
                  _statusIcon(item.status),
                  color: _statusColor(item.status),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              item.contactName.isEmpty
                                  ? 'Unnamed contact'
                                  : item.contactName,
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 16,
                              ),
                            ),
                          ),
                          _status(item.status),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        item.contactPhone,
                        style: const TextStyle(
                          fontSize: 12,
                          color: BusinessColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF7F9FC),
                borderRadius: BorderRadius.circular(13),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.chat_bubble_outline_rounded,
                        size: 15,
                        color: BusinessColors.muted,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          item.templateName,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                          ),
                        ),
                      ),
                      Text(
                        item.templateLanguage,
                        style: const TextStyle(
                          fontSize: 10,
                          color: BusinessColors.muted,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 7),
                  Text(
                    preview.isEmpty ? 'Template message' : preview,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      height: 1.35,
                      color: BusinessColors.ink,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 11),
            Row(
              children: [
                const Icon(
                  Icons.schedule_rounded,
                  size: 16,
                  color: BusinessColors.muted,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    '${item.sentNow ? 'Send Now' : 'Scheduled'}: ${DateFormat('dd MMM yyyy • hh:mm a').format(item.scheduledAt.toLocal())}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: BusinessColors.muted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            if (executed != null) ...[
              const SizedBox(height: 5),
              Row(
                children: [
                  const Icon(
                    Icons.send_rounded,
                    size: 15,
                    color: BusinessColors.muted,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Executed: ${DateFormat('dd MMM yyyy • hh:mm a').format(executed.toLocal())}',
                      style: const TextStyle(
                        fontSize: 11,
                        color: BusinessColors.muted,
                      ),
                    ),
                  ),
                ],
              ),
            ],
            if (item.errorMessage != null &&
                item.errorMessage!.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                item.errorMessage!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  color: _statusColor(item.status),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _chip(String value, String label) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: ChoiceChip(
      selected: filter == value,
      label: Text(label),
      onSelected: (_) => setState(() => filter = value),
    ),
  );

  static Color _statusColor(String status) {
    final display = displayStatus(status);
    if (display == 'READ') return const Color(0xFF2F80ED);
    if (display == 'SENT' || display == 'DELIVERED')
      return BusinessColors.green;
    if (display == 'AWAITING DELIVERY') return const Color(0xFF2F80ED);
    if (display == 'FAILED') return Colors.redAccent;
    if (display == 'QUEUE') return const Color(0xFF2F80ED);
    if (display == 'SIMULATED') return Colors.deepPurple;
    if (display == 'PAUSED') return Colors.orange;
    if (display == 'CANCELLED') return Colors.grey;
    return Colors.grey;
  }

  static IconData _statusIcon(String status) {
    final display = displayStatus(status);
    if (display == 'DELIVERED' || display == 'READ')
      return Icons.done_all_rounded;
    if (display == 'SENT') return Icons.check_rounded;
    if (display == 'AWAITING DELIVERY') return Icons.hourglass_top_rounded;
    if (display == 'FAILED') return Icons.error_outline_rounded;
    if (display == 'QUEUE') return Icons.schedule_send_rounded;
    if (display == 'SIMULATED') return Icons.science_outlined;
    if (display == 'PAUSED') return Icons.pause_circle_outline_rounded;
    return Icons.block_outlined;
  }

  static Widget _status(String status) {
    final display = displayStatus(status);
    final color = _statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        display,
        style: TextStyle(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _AutomationMetric extends StatelessWidget {
  const _AutomationMetric({required this.value, required this.label});

  final String value, label;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        value,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 24,
          fontWeight: FontWeight.w900,
        ),
      ),
      Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
    ],
  );
}

class AutomationDetailsScreen extends ConsumerStatefulWidget {
  const AutomationDetailsScreen({super.key, required this.item});

  final Automation item;

  @override
  ConsumerState<AutomationDetailsScreen> createState() =>
      _AutomationDetailsScreenState();
}

class _AutomationDetailsScreenState
    extends ConsumerState<AutomationDetailsScreen>
    with WidgetsBindingObserver {
  late Future<Map<String, dynamic>> _detailFuture;
  Timer? _deliveryTimer;
  bool _loadingDelivery = false;
  Map<String, dynamic>? _lastDetails;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _detailFuture = _loadDetails();
    _deliveryTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (mounted &&
          !_loadingDelivery &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed &&
          ModalRoute.of(context)?.isCurrent == true)
        _reloadDetails();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _deliveryTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted && !_loadingDelivery)
      _reloadDetails();
  }

  Future<Map<String, dynamic>> _loadDetails() async {
    _loadingDelivery = true;
    try {
      final result = await ref
          .read(apiClientProvider)
          .get('/api/automations/${widget.item.id}');
      if (result is Map) {
        final status = '${result['automation']?['status'] ?? ''}';
        if (['READ', 'FAILED', 'CANCELLED', 'PAUSED'].contains(status))
          _deliveryTimer?.cancel();
        _lastDetails = result.cast<String, dynamic>();
        return _lastDetails!;
      }
      return <String, dynamic>{};
    } finally {
      _loadingDelivery = false;
    }
  }

  void _reloadDetails() {
    setState(() => _detailFuture = _loadDetails());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Automation Details'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _reloadDetails,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _detailFuture,
        builder: (context, snapshot) {
          Automation item = widget.item;
          List<Map<String, dynamic>> messageRecords = const [];

          final details = snapshot.data ?? _lastDetails;
          if (details != null) {
            final automationJson = details['automation'];
            if (automationJson is Map) {
              item = Automation.fromJson(
                automationJson.cast<String, dynamic>(),
              );
            }
            messageRecords = ((details['messages'] as List?) ?? const [])
                .whereType<Map>()
                .map((e) => e.cast<String, dynamic>())
                .toList();
          }

          final diagnosis = details?['deliveryDiagnosis'];
          final queued = item.status == 'SCHEDULED';

          return RefreshIndicator(
            onRefresh: () async {
              _reloadDetails();
              await _detailFuture;
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
              children: [
                if (snapshot.connectionState == ConnectionState.waiting)
                  const LinearProgressIndicator(minHeight: 2),
                if (snapshot.hasError)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      'Could not refresh message history. Showing saved automation information.',
                      style: TextStyle(
                        color: Colors.red.shade700,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Row(
                      children: [
                        SoftIcon(
                          _AutomationsScreenState._statusIcon(item.status),
                          color: _AutomationsScreenState._statusColor(
                            item.status,
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.contactName.isEmpty
                                    ? 'Unnamed contact'
                                    : item.contactName,
                                style: const TextStyle(
                                  fontSize: 19,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                item.contactPhone,
                                style: const TextStyle(
                                  color: BusinessColors.muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        _AutomationsScreenState._status(item.status),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.message_outlined, size: 20),
                            SizedBox(width: 8),
                            Text(
                              'Message',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          item.templateName,
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 8),
                        if (item.variables['__legacy_preview'] == 'true')
                          const Text(
                            'Older send: original template version was not saved. This preview uses the available template content.',
                            style: TextStyle(
                              fontSize: 11,
                              color: BusinessColors.muted,
                            ),
                          ),
                        WhatsAppMessagePreview(
                          components: item.templateComponents,
                          variables: item.variables,
                        ),
                        if (item.variables.entries
                            .where((e) => !e.key.startsWith('_'))
                            .isNotEmpty) ...[
                          const SizedBox(height: 12),
                          const Text(
                            'Template values',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 6),
                          ...item.variables.entries
                              .where((e) => !e.key.startsWith('_'))
                              .map(
                                (e) => Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 2,
                                  ),
                                  child: Text(
                                    '{{${e.key}}}: ${e.value}',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: BusinessColors.muted,
                                    ),
                                  ),
                                ),
                              ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Automation Information',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 12),
                        _info(
                          item.sentNow ? 'Send Now' : 'Scheduled',
                          DateFormat(
                            'dd MMM yyyy, hh:mm a',
                          ).format(item.scheduledAt.toLocal()),
                        ),
                        _info('Time Zone', item.timezone),
                        _info(
                          'Template',
                          '${item.templateName} • ${item.templateLanguage}',
                        ),
                        _info('Recipient', item.contactPhone),
                        _info(
                          'Status',
                          _AutomationsScreenState.displayStatus(item.status),
                        ),
                        if (item.executedAt != null)
                          _info(
                            'Executed',
                            DateFormat(
                              'dd MMM yyyy, hh:mm a',
                            ).format(item.executedAt!.toLocal()),
                          ),
                        if (item.errorMessage != null &&
                            item.errorMessage!.isNotEmpty &&
                            diagnosis is! Map)
                          _info('Error', item.errorMessage!),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                _messageHistoryCard(
                  item,
                  messageRecords,
                  snapshot.connectionState,
                ),
                const SizedBox(height: 18),
                if (diagnosis is Map &&
                    [
                      'ACCEPTED',
                      'SENT',
                      'FAILED',
                      'PROCESSING',
                    ].contains(item.status))
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${diagnosis['title'] ?? 'Delivery reason'}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '${diagnosis['message'] ?? ''}',
                            style: const TextStyle(height: 1.4),
                          ),
                          if (diagnosis['metaErrorCode'] != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: SelectableText(
                                'Meta / send error: ${diagnosis['metaErrorCode']}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                          if (diagnosis['retryAfter'] != null)
                            Text(
                              'Try after: ${DateFormat('dd MMM yyyy, hh:mm a').format(DateTime.parse('${diagnosis['retryAfter']}').toLocal())}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          if (diagnosis['messageId'] != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: SelectableText(
                                'WhatsApp message ID: ${diagnosis['messageId']}',
                                style: const TextStyle(fontSize: 11),
                              ),
                            ),
                          if (diagnosis['receiptReference'] != null)
                            Text(
                              'Callback reference: ${diagnosis['receiptReference']}',
                              style: const TextStyle(fontSize: 11),
                            ),
                          const SizedBox(height: 8),
                          Text(
                            '${diagnosis['action'] ?? ''}',
                            style: const TextStyle(
                              fontSize: 12,
                              color: BusinessColors.muted,
                              height: 1.4,
                            ),
                          ),
                          if (diagnosis['diagnosticsWarning'] != null)
                            Text(
                              '${diagnosis['diagnosticsWarning']}',
                              style: const TextStyle(fontSize: 12),
                            ),
                        ],
                      ),
                    ),
                  ),
                if (item.status == 'ACCEPTED' &&
                    item.variables['__delivery_note'] != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      item.variables['__delivery_note']!,
                      style: TextStyle(
                        color: Colors.orange.shade800,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                if (item.status == 'ACCEPTED' &&
                    item.variables['__delivery_tracking_warning'] != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      'Delivery tracking needs attention: ${item.variables['__delivery_tracking_warning']}',
                      style: TextStyle(color: Colors.orange.shade800),
                    ),
                  ),
                if (item.status == 'ACCEPTED') ...[
                  const Text(
                    'Awaiting a status update from Meta. If the message has arrived but this status stays pending, check the WhatsApp delivery connection. Refreshing checks GreetSync’s recorded updates.',
                    style: TextStyle(color: BusinessColors.muted, height: 1.4),
                  ),
                  OutlinedButton.icon(
                    onPressed: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const WhatsAppConnectionScreen(),
                        ),
                      );
                      if (mounted) _reloadDetails();
                    },
                    icon: const Icon(Icons.settings_ethernet_rounded),
                    label: const Text('Check delivery connection'),
                  ),
                  const SizedBox(height: 12),
                ],
                if (queued) ...[
                  FilledButton.icon(
                    onPressed: () => _run(context, item),
                    icon: const Icon(Icons.play_arrow_rounded),
                    label: const Text('Run Automation'),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () => _cancel(context, item),
                    icon: const Icon(Icons.cancel_outlined),
                    label: const Text('Cancel Queue'),
                  ),
                ] else if (item.status != 'ACCEPTED' || diagnosis is! Map)
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: _AutomationsScreenState._statusColor(
                        item.status,
                      ).withOpacity(.08),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          _AutomationsScreenState._statusIcon(item.status),
                          color: _AutomationsScreenState._statusColor(
                            item.status,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            item.status == 'ACCEPTED' &&
                                    item.variables['__meta_message_status'] ==
                                        'unknown'
                                ? 'The send result is unknown. Waiting for a WhatsApp update.'
                                : _stateMessage(item.status),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ),
                  ),
                if ((item.status == 'FAILED' ||
                        ['ACCEPTED', 'SENT'].contains(item.status)) &&
                    !(diagnosis is Map && diagnosis['canRetry'] == false)) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => _sendAgain(item),
                    icon: const Icon(Icons.send_outlined),
                    label: const Text('Review & send again'),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _messageHistoryCard(
    Automation item,
    List<Map<String, dynamic>> records,
    ConnectionState state,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'WhatsApp Message Activity',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                  ),
                ),
                if (state == ConnectionState.waiting)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (records.isEmpty)
              Text(
                item.status == 'SCHEDULED'
                    ? 'This message is waiting in the queue. A delivery record will appear here after execution.'
                    : 'No outbound WhatsApp message record is available yet.',
                style: const TextStyle(
                  color: BusinessColors.muted,
                  height: 1.4,
                ),
              )
            else
              ...records.map(_messageRecord),
          ],
        ),
      ),
    );
  }

  Widget _messageRecord(Map<String, dynamic> record) {
    final status = (record['status'] ?? '').toString();
    final content = (record['content'] ?? '').toString().trim();
    final error = deliveryError(record['errorMessage'], record['errorCode']);
    final wamid = (record['whatsappMessageId'] ?? '').toString().trim();
    final variables = record['variables'];

    String fallbackContent = '';
    if (content.isEmpty &&
        variables is Map &&
        variables['_customMessage'] != null) {
      fallbackContent = variables['_customMessage'].toString();
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F9FC),
        borderRadius: BorderRadius.circular(13),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  (record['templateName'] ?? 'Template').toString(),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              _AutomationsScreenState._status(status),
            ],
          ),
          if (content.isNotEmpty || fallbackContent.isNotEmpty) ...[
            const SizedBox(height: 7),
            Text(
              content.isNotEmpty ? content : fallbackContent,
              style: const TextStyle(height: 1.4),
            ),
          ],
          const SizedBox(height: 8),
          if (_formatApiTime(record['sentAt']) != null)
            _activityLine(
              Icons.send_rounded,
              'Sent',
              _formatApiTime(record['sentAt'])!,
            ),
          if (_formatApiTime(record['deliveredAt']) != null)
            _activityLine(
              Icons.done_all_rounded,
              'Delivered',
              _formatApiTime(record['deliveredAt'])!,
            ),
          if (_formatApiTime(record['readAt']) != null)
            _activityLine(
              Icons.mark_chat_read_outlined,
              'Read',
              _formatApiTime(record['readAt'])!,
            ),
          if (_formatApiTime(record['failedAt']) != null)
            _activityLine(
              Icons.error_outline_rounded,
              'Failed',
              _formatApiTime(record['failedAt'])!,
            ),
          if (wamid.isNotEmpty) ...[
            const SizedBox(height: 5),
            Text(
              'Message ID: $wamid',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10, color: BusinessColors.muted),
            ),
          ],
          if (error.isNotEmpty) ...[
            const SizedBox(height: 5),
            Text(
              '${record['errorCode'] != null ? 'Meta error ${record['errorCode']}: ' : ''}$error',
              style: TextStyle(
                fontSize: 11,
                color: Colors.red.shade700,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }

  static Widget _activityLine(IconData icon, String label, String time) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Icon(icon, size: 14, color: BusinessColors.muted),
            const SizedBox(width: 6),
            Text(
              '$label: $time',
              style: const TextStyle(fontSize: 11, color: BusinessColors.muted),
            ),
          ],
        ),
      );

  static String? _formatApiTime(dynamic raw) {
    if (raw == null) return null;
    final parsed = DateTime.tryParse(raw.toString());
    if (parsed == null) return null;
    return DateFormat('dd MMM yyyy • hh:mm a').format(parsed.toLocal());
  }

  static String _stateMessage(String status) {
    if (status == 'ACCEPTED')
      return 'Request accepted — waiting for WhatsApp’s delivery update. This is not a failure notification. See the reason above or check the delivery connection.';
    final display = _AutomationsScreenState.displayStatus(status);
    if (display == 'SENT')
      return 'WhatsApp confirms this message was sent. Recipient delivery is still being tracked.';
    if (display == 'DELIVERED')
      return 'WhatsApp confirms this message was delivered to the recipient.';
    if (display == 'READ')
      return 'WhatsApp confirms the recipient read this message.';
    if (display == 'FAILED') {
      return 'This automation failed. Review the error and message activity above.';
    }
    if (display == 'SIMULATED') {
      return 'This automation ran in simulation mode and was not delivered to a real phone.';
    }
    if (display == 'PAUSED') return 'This automation is paused.';
    if (display == 'CANCELLED') return 'This automation was cancelled.';
    return 'This automation is no longer in the queue.';
  }

  static Widget _info(String a, String b) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(a, style: const TextStyle(color: BusinessColors.muted)),
        ),
        Expanded(
          child: Text(
            b,
            textAlign: TextAlign.right,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
      ],
    ),
  );

  Future<void> _sendAgain(Automation item) async {
    try {
      final response = await ref
          .read(apiClientProvider)
          .get('/api/automations/${item.id}');
      if (!mounted || response is! Map || response['automation'] is! Map)
        return;
      final latest = Automation.fromJson(
        (response['automation'] as Map).cast<String, dynamic>(),
      );
      if (!['FAILED', 'ACCEPTED', 'SENT'].contains(latest.status)) {
        showAppMessage(
          context,
          'This message is now ${latest.status.toLowerCase()}. Refresh its delivery activity before sending again.',
          error: true,
        );
        _reloadDetails();
        return;
      }
      final pending = latest.status != 'FAILED';
      if (pending &&
          (latest.executedAt == null ||
              DateTime.now().difference(latest.executedAt!) <
                  const Duration(minutes: 5))) {
        showAppMessage(
          context,
          'Wait five minutes for Meta delivery updates before creating another attempt.',
          error: true,
        );
        return;
      }
      if (pending &&
          [
            'held_for_quality_assessment',
            'paused',
          ].contains(latest.variables['__meta_message_status'])) {
        showAppMessage(
          context,
          'Meta is holding or pausing this delivery. Check WhatsApp Manager before creating another attempt.',
          error: true,
        );
        return;
      }
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Review another send attempt?'),
          content: Text(
            pending
                ? 'The original message might already have arrived or may still arrive later. Check with ${latest.contactName} first. Continuing accepts the risk of a duplicate. You will review the template, values and media before sending.'
                : 'Fix the delivery error first. You will review this recipient, template, values and media, then create a separate send attempt. The original activity stays in history.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(
                pending ? 'I checked — review again' : 'Review message',
              ),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
      final values = Map<String, String>.from(latest.variables)
        ..removeWhere(
          (key, _) => [
            '__retry_of',
            '__marketing_retry_after',
            '__send_retry_count',
            '__send_retry_reason',
            '__meta_message_status',
            '__delivery_note',
            '__delivery_tracking_warning',
          ].contains(key),
        );
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => CreateAutomationScreen(
            initialMode: 1,
            preferredTemplateId: latest.templateId,
            preselectedContactIds: [latest.contactId],
            initialSendNow: true,
            initialVariables: values,
            reviewFailedMessage: true,
            retryOfAutomationId: latest.id,
            duplicateAcknowledged: pending,
          ),
        ),
      );
      ref.invalidate(automationsProvider);
      if (mounted) _reloadDetails();
    } catch (error) {
      if (mounted) showAppMessage(context, '$error', error: true);
    }
  }

  Future<void> _run(BuildContext context, Automation item) async {
    try {
      final result = await ref
          .read(apiClientProvider)
          .post('/api/automations/${item.id}/run', data: {});
      ref.invalidate(automationsProvider);
      ref.invalidate(dashboardProvider);
      if (mounted) {
        final message = result is Map && result['message'] != null
            ? result['message'].toString()
            : 'Automation processed.';
        showAppMessage(
          context,
          message,
          error: result is Map && (result['failureCount'] ?? 0) > 0,
        );
        _reloadDetails();
      }
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    }
  }

  Future<void> _cancel(BuildContext context, Automation item) async {
    try {
      await ref
          .read(apiClientProvider)
          .post('/api/automations/${item.id}/cancel', data: {});
      ref.invalidate(automationsProvider);
      ref.invalidate(dashboardProvider);
      if (mounted) _reloadDetails();
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    }
  }
}
