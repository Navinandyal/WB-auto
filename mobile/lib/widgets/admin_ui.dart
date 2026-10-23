import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import 'whatsapp_message_preview.dart';

const adminInk = Color(0xFF163653);
const adminMuted = Color(0xFF64778B);

class AdminHeader extends StatelessWidget {
  const AdminHeader(
    this.title,
    this.subtitle, {
    super.key,
    this.icon = Icons.space_dashboard_outlined,
    this.action,
  });
  final String title, subtitle;
  final IconData icon;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(11),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                icon,
                color: Theme.of(context).colorScheme.onPrimaryContainer,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          subtitle,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: adminMuted, height: 1.4),
        ),
        if (action != null) ...[const SizedBox(height: 12), action!],
      ],
    ),
  );
}

class AdminPanel extends StatelessWidget {
  const AdminPanel({
    super.key,
    required this.title,
    required this.children,
    this.trailing,
  });
  final String title;
  final List<Widget> children;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 16),
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 17,
                  ),
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    ),
  );
}

class AdminMetrics extends StatelessWidget {
  const AdminMetrics(this.values, {super.key});
  final Map<String, dynamic> values;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (c, constraints) => Wrap(
      spacing: 10,
      runSpacing: 10,
      children: values.entries
          .map(
            (e) => SizedBox(
              width: (constraints.maxWidth - 10) / 2,
              child: Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${e.value}',
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        e.key,
                        style: const TextStyle(color: adminMuted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          )
          .toList(),
    ),
  );
}

class AdminBadge extends StatelessWidget {
  const AdminBadge(this.value, {super.key});
  final String value;
  @override
  Widget build(BuildContext context) {
    final color =
        [
          'ACTIVE',
          'APPROVED',
          'SENT',
          'DELIVERED',
          'READ',
          'CONNECTED',
          'OPT-IN',
          'AVAILABLE',
        ].contains(value.toUpperCase())
        ? const Color(0xFF087B60)
        : [
            'FAILED',
            'REJECTED',
            'SUSPENDED',
            'CANCELLED',
            'NO OPT-IN',
          ].contains(value.toUpperCase())
        ? const Color(0xFFB94343)
        : const Color(0xFF986409);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .09),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        adminLabel(value),
        style: TextStyle(
          fontSize: 10,
          color: color,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

String adminLabel(String value) =>
    value == 'PENDING_APPROVAL' || value == 'PENDING'
    ? 'Processing'
    : value == 'ALL'
    ? 'All'
    : value == 'DRAFT'
    ? 'Draft'
    : value == 'APPROVED'
    ? 'Approved'
    : value == 'REJECTED'
    ? 'Rejected'
    : value
          .replaceAll('_', ' ')
          .toLowerCase()
          .replaceFirstMapped(RegExp(r'^.'), (m) => m[0]!.toUpperCase());

class AdminStatusTabs extends StatelessWidget {
  const AdminStatusTabs({
    super.key,
    required this.values,
    required this.selected,
    required this.onChanged,
  });
  final List<String> values;
  final String selected;
  final ValueChanged<String> onChanged;
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    child: Row(
      children: values
          .map(
            (v) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(adminLabel(v)),
                selected: selected == v,
                onSelected: (_) => onChanged(v),
              ),
            ),
          )
          .toList(),
    ),
  );
}

class AdminBusinessFilter extends ConsumerWidget {
  const AdminBusinessFilter({
    super.key,
    required this.selected,
    required this.onChanged,
  });
  final int? selected;
  final ValueChanged<int?> onChanged;
  @override
  Widget build(BuildContext context, WidgetRef ref) => ref
      .watch(businessUsersProvider)
      .when(
        data: (businesses) => DropdownButtonFormField<int>(
          key: ValueKey(selected),
          initialValue: businesses.any((b) => b.id == selected) ? selected : 0,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Business',
            prefixIcon: Icon(Icons.business_outlined),
          ),
          items: [
            const DropdownMenuItem(value: 0, child: Text('All businesses')),
            ...businesses.map(
              (b) => DropdownMenuItem(
                value: b.id,
                child: Text(
                  '${b.businessName.isEmpty ? b.name : b.businessName} · ${b.name}',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ],
          onChanged: (v) => onChanged(v == 0 ? null : v),
        ),
        loading: () => const LinearProgressIndicator(),
        error: (e, _) => TextButton.icon(
          onPressed: () => ref.invalidate(businessUsersProvider),
          icon: const Icon(Icons.refresh),
          label: Text('Reload businesses: $e'),
        ),
      );
}

Widget adminInfo(String label, dynamic value) => Padding(
  padding: const EdgeInsets.symmetric(vertical: 8),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: const TextStyle(color: adminMuted, fontSize: 12)),
      const SizedBox(height: 3),
      SelectableText(
        value == null || '$value'.isEmpty ? '—' : '$value',
        style: const TextStyle(fontWeight: FontWeight.w600, height: 1.4),
      ),
    ],
  ),
);
String adminDate(dynamic value) {
  var text = '${value ?? ''}';
  if (text.isEmpty) return '—';
  if (!RegExp(r'(Z|[+-]\d{2}:?\d{2})$').hasMatch(text)) text += 'Z';
  final d = DateTime.tryParse(text);
  return d == null
      ? '—'
      : DateFormat('dd MMM yyyy, hh:mm a').format(d.toLocal());
}

Map<String, String> previewValues(MessageTemplate t) {
  final values = <String, String>{};
  for (final r in t.variableRequirements) {
    values['${r['section']!.toLowerCase()}_${r['token']}'] =
        r['sample']!.isEmpty ? '{{${r['token']}}}' : r['sample']!;
  }
  final location = t.locationPreview;
  for (final key in ['latitude', 'longitude', 'name', 'address']) {
    if (location?[key] != null)
      values['__header_location_$key'] = '${location![key]}';
  }
  return values;
}

class AdminTemplatePreview extends StatelessWidget {
  const AdminTemplatePreview(this.data, {super.key, this.variables});
  final Map<String, dynamic> data;
  final Map<String, String>? variables;
  @override
  Widget build(BuildContext context) {
    final t = MessageTemplate.fromJson(data);
    return WhatsAppMessagePreview(
      components: t.components,
      variables: {...previewValues(t), ...?variables},
      mediaBase64: t.mediaPreview?['dataBase64']?.toString(),
      mediaName: t.mediaPreview?['fileName']?.toString(),
    );
  }
}

Future<bool> adminConfirm(BuildContext context, String title, String message) =>
    showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    ).then((v) => v == true);
