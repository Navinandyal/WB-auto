import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import 'create_automation_screen.dart';

class AutomationsScreen extends ConsumerStatefulWidget {
  const AutomationsScreen({super.key});
  @override
  ConsumerState<AutomationsScreen> createState() => _AutomationsScreenState();
}

class _AutomationsScreenState extends ConsumerState<AutomationsScreen> {
  String filter = 'ALL';

  static String displayStatus(String status) {
    if (status == 'SCHEDULED' || status == 'PROCESSING') return 'QUEUE';
    if (status == 'SENT' || status == 'DELIVERED' || status == 'READ') return 'MESSAGE SENT';
    if (status == 'FAILED') return 'FAILED';
    if (status == 'CANCELLED') return 'CANCELLED';
    return status;
  }

  static bool matchesFilter(Automation item, String filter) {
    if (filter == 'ALL') return true;
    return displayStatus(item.status) == filter;
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(automationsProvider);
    return async.when(
      loading: () => ListView(children: const [SizedBox(height: 260), Center(child: CircularProgressIndicator())]),
      error: (e, _) => ListView(children: [const SizedBox(height: 180), ErrorState(e, onRetry: () => ref.invalidate(automationsProvider))]),
      data: (list) {
        final visible = list.where((e) => const {'QUEUE', 'MESSAGE SENT', 'FAILED'}.contains(displayStatus(e.status))).toList();
        final items = visible.where((e) => matchesFilter(e, filter)).toList();
        final queueCount = visible.where((e) => displayStatus(e.status) == 'QUEUE').length;
        final sentCount = visible.where((e) => displayStatus(e.status) == 'MESSAGE SENT').length;
        final failedCount = visible.where((e) => displayStatus(e.status) == 'FAILED').length;
        return RefreshIndicator(
          onRefresh: () => ref.refresh(automationsProvider.future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 90),
            children: [
              Row(children: [
                const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Automations', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
                  SizedBox(height: 4),
                  Text('Queue, sent and failed WhatsApp automations.', style: TextStyle(color: BusinessColors.muted)),
                ])),
                FilledButton.icon(
                  onPressed: () async {
                    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreateAutomationScreen()));
                    ref.invalidate(automationsProvider);
                  },
                  icon: const Icon(Icons.add),
                  label: const Text('Create'),
                ),
              ]),
              const SizedBox(height: 16),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  _chip('ALL', 'All (${visible.length})'),
                  _chip('QUEUE', 'Queue ($queueCount)'),
                  _chip('MESSAGE SENT', 'Sent ($sentCount)'),
                  _chip('FAILED', 'Failed ($failedCount)'),
                ]),
              ),
              const SizedBox(height: 14),
              if (items.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(28), child: Center(child: Text('No automations found.'))))
              else
                ...items.map((x) => Padding(
                      padding: const EdgeInsets.only(bottom: 9),
                      child: Card(
                        child: ListTile(
                          onTap: () async {
                            await Navigator.of(context).push(MaterialPageRoute(builder: (_) => AutomationDetailsScreen(item: x)));
                            ref.invalidate(automationsProvider);
                          },
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                          leading: SoftIcon(_statusIcon(x.status), color: _statusColor(x.status)),
                          title: Text(x.templateName, style: const TextStyle(fontWeight: FontWeight.w900)),
                          subtitle: Text('To: ${x.contactName}\n${DateFormat('dd MMM yyyy, hh:mm a').format(x.scheduledAt.toLocal())}'),
                          isThreeLine: true,
                          trailing: _status(x.status),
                        ),
                      ),
                    )),
            ],
          ),
        );
      },
    );
  }

  Widget _chip(String value, String label) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          selected: filter == value,
          label: Text(label),
          onSelected: (_) => setState(() => filter = value),
          selectedColor: BusinessColors.green,
          labelStyle: TextStyle(color: filter == value ? Colors.white : BusinessColors.ink, fontWeight: FontWeight.w700),
        ),
      );

  static Color _statusColor(String s) {
    final display = displayStatus(s);
    if (display == 'MESSAGE SENT') return BusinessColors.green;
    if (display == 'FAILED') return Colors.redAccent;
    if (display == 'QUEUE') return const Color(0xFF2F80ED);
    return Colors.grey;
  }

  static IconData _statusIcon(String s) {
    final display = displayStatus(s);
    if (display == 'MESSAGE SENT') return Icons.check_circle_outline_rounded;
    if (display == 'FAILED') return Icons.error_outline_rounded;
    if (display == 'QUEUE') return Icons.schedule_send_rounded;
    return Icons.block_outlined;
  }

  static Widget _status(String s) {
    final display = displayStatus(s);
    final color = _statusColor(s);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(color: color.withOpacity(.11), borderRadius: BorderRadius.circular(12)),
      child: Text(display, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }
}

class AutomationDetailsScreen extends ConsumerWidget {
  const AutomationDetailsScreen({super.key, required this.item});
  final Automation item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queued = item.status == 'SCHEDULED';
    return Scaffold(
      appBar: AppBar(title: const Text('Automation Details')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(children: [
                SoftIcon(_AutomationsScreenState._statusIcon(item.status), color: _AutomationsScreenState._statusColor(item.status)),
                const SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(item.templateName, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  Text('To ${item.contactName}', style: const TextStyle(color: BusinessColors.muted)),
                ])),
                _AutomationsScreenState._status(item.status),
              ]),
            ),
          ),
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Automation Information', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                const SizedBox(height: 12),
                _info('Date & Time', DateFormat('dd MMM yyyy, hh:mm a').format(item.scheduledAt.toLocal())),
                _info('Time Zone', item.timezone),
                _info('Recipient', item.contactPhone),
                _info('Status', _AutomationsScreenState.displayStatus(item.status)),
                if (item.errorMessage != null && item.errorMessage!.isNotEmpty) _info('Error', item.errorMessage!),
              ]),
            ),
          ),
          const SizedBox(height: 18),
          if (queued) ...[
            FilledButton.icon(
              onPressed: () => _run(context, ref),
              icon: const Icon(Icons.play_arrow_rounded),
              label: const Text('Run Automation'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _cancel(context, ref),
              icon: const Icon(Icons.cancel_outlined),
              label: const Text('Cancel Queue'),
            ),
          ] else
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: _AutomationsScreenState._statusColor(item.status).withOpacity(.08), borderRadius: BorderRadius.circular(14)),
              child: Row(children: [
                Icon(_AutomationsScreenState._statusIcon(item.status), color: _AutomationsScreenState._statusColor(item.status)),
                const SizedBox(width: 10),
                Expanded(child: Text(
                  _AutomationsScreenState.displayStatus(item.status) == 'MESSAGE SENT'
                      ? 'This automation has already run. It cannot be run again.'
                      : _AutomationsScreenState.displayStatus(item.status) == 'FAILED'
                          ? 'This automation failed. Review the error above; Run Automation is disabled.'
                          : 'This automation is no longer in the queue.',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                )),
              ]),
            ),
        ],
      ),
    );
  }

  static Widget _info(String a, String b) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(a, style: const TextStyle(color: BusinessColors.muted))),
          Expanded(child: Text(b, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w800))),
        ]),
      );

  Future<void> _run(BuildContext context, WidgetRef ref) async {
    try {
      final result = await ref.read(apiClientProvider).post('/api/automations/${item.id}/run', data: {});
      ref.invalidate(automationsProvider);
      ref.invalidate(dashboardProvider);
      if (context.mounted) {
        final message = result is Map && result['message'] != null ? result['message'].toString() : 'Automation processed.';
        showAppMessage(context, message, error: result is Map && (result['failureCount'] ?? 0) > 0);
        Navigator.pop(context);
      }
    } catch (e) {
      if (context.mounted) showAppMessage(context, '$e', error: true);
    }
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(apiClientProvider).post('/api/automations/${item.id}/cancel', data: {});
      ref.invalidate(automationsProvider);
      ref.invalidate(dashboardProvider);
      if (context.mounted) Navigator.pop(context);
    } catch (e) {
      if (context.mounted) showAppMessage(context, '$e', error: true);
    }
  }
}
