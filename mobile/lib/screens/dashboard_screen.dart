import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  int _i(dynamic value) => int.tryParse('$value') ?? 0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dashboardProvider);
    final birthdays = ref.watch(birthdaysProvider).valueOrNull
            ?.where((item) => item.isToday)
            .toList() ??
        const <BirthdayItem>[];

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(dashboardProvider);
        ref.invalidate(birthdaysProvider);
        ref.invalidate(billingProvider);
        await ref.read(dashboardProvider.future);
      },
      child: async.when(
        loading: () => ListView(
          children: const [
            SizedBox(height: 260),
            Center(child: CircularProgressIndicator()),
          ],
        ),
        error: (error, _) => ListView(
          children: [
            const SizedBox(height: 180),
            ErrorState(error, onRetry: () => ref.invalidate(dashboardProvider)),
          ],
        ),
        data: (data) => _body(context, data, birthdays),
      ),
    );
  }

  Widget _body(
    BuildContext context,
    DashboardData data,
    List<BirthdayItem> birthdays,
  ) {
    final package = data.package;
    final activePackage = package['active'] == true;
    final limit = _i(package['messageLimit']);
    final used = _i(package['messagesUsed']);
    final remaining = !activePackage
        ? 0
        : limit <= 0
            ? null
            : _i(package['messagesRemaining']);
    final now = DateTime.now();

    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 105),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "Today's Analysis",
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      color: BusinessColors.ink,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    DateFormat('EEEE, dd MMMM').format(now),
                    style: const TextStyle(color: BusinessColors.muted),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: data.connectionStatus == 'CONNECTED'
                    ? BusinessColors.greenSoft
                    : const Color(0xFFFFF0D9),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                data.connectionStatus == 'CONNECTED' ? 'WHATSAPP CONNECTED' : 'SETUP',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  color: data.connectionStatus == 'CONNECTED'
                      ? BusinessColors.greenDark
                      : Colors.orange.shade800,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _messageQuotaCard(context, used, remaining),
        const SizedBox(height: 22),
        const SectionTitle("Today's Birthdays"),
        const SizedBox(height: 9),
        if (birthdays.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Row(
                children: [
                  SoftIcon(Icons.cake_outlined, color: Color(0xFFE83E8C)),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'No birthdays today.',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
            ),
          )
        else
          ...birthdays.map(
            (birthday) => Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: const Color(0xFFFFEAF4),
                  child: Text(
                    birthday.contactName.isEmpty
                        ? '?'
                        : birthday.contactName[0].toUpperCase(),
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      color: Color(0xFFE83E8C),
                    ),
                  ),
                ),
                title: Text(
                  birthday.contactName,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                subtitle: const Text('Birthday today'),
                trailing: const Icon(Icons.cake_rounded, color: Color(0xFFE83E8C)),
              ),
            ),
          ),
        const SizedBox(height: 20),
        const SectionTitle("Today's Scheduled Messages"),
        const SizedBox(height: 9),
        if (data.upcoming.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Text('No messages scheduled for today.'),
            ),
          )
        else
          ...data.upcoming.map(
            (automation) => Card(
              child: ListTile(
                leading: const SoftIcon(
                  Icons.message_rounded,
                  color: Color(0xFF2F80ED),
                ),
                title: Text(
                  automation.contactName,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                subtitle: Text(
                  '${automation.templateName}\n${DateFormat('hh:mm a').format(automation.scheduledAt.toLocal())}'
                  '${automation.messagePreview.isEmpty ? '' : ' • ${automation.messagePreview}'}',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
                isThreeLine: true,
                trailing: _Status(automation.status),
              ),
            ),
          ),
      ],
    );
  }

  Widget _messageQuotaCard(
    BuildContext context,
    int used,
    int? remaining,
  ) {
    final primary = Theme.of(context).colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: BusinessColors.line),
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: primary.withOpacity(.10),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(Icons.message_rounded, color: primary),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: _QuotaStat(
              value: '$used',
              label: 'Messages sent',
            ),
          ),
          Container(width: 1, height: 42, color: BusinessColors.line),
          const SizedBox(width: 14),
          Expanded(
            child: _QuotaStat(
              value: remaining == null ? '∞' : '$remaining',
              label: 'Messages available',
            ),
          ),
        ],
      ),
    );
  }
}

class _QuotaStat extends StatelessWidget {
  const _QuotaStat({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: BusinessColors.ink,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 10, color: BusinessColors.muted),
          ),
        ],
      );
}

class _Status extends StatelessWidget {
  const _Status(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    final good = ['SENT', 'DELIVERED', 'READ', 'SCHEDULED'].contains(status);
    final color = good ? BusinessColors.green : Colors.redAccent;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        status,
        style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: color),
      ),
    );
  }
}
