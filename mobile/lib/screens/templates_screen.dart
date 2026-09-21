import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class TemplatesScreen extends ConsumerStatefulWidget {
  const TemplatesScreen({super.key});
  @override
  ConsumerState<TemplatesScreen> createState() => _TemplatesScreenState();
}

class _TemplatesScreenState extends ConsumerState<TemplatesScreen> {
  String query = '';
  String filter = 'ALL';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(templatesProvider);
    return async.when(
      loading: () => ListView(children: const [SizedBox(height: 260), Center(child: CircularProgressIndicator())]),
      error: (e, _) => ListView(children: [const SizedBox(height: 180), ErrorState(e, onRetry: () => ref.invalidate(templatesProvider))]),
      data: (list) {
        final visible = _businessTemplates(list);
        final q = query.trim().toLowerCase();
        final items = visible.where((t) => (filter == 'ALL' || t.status == filter) && (q.isEmpty || _displayName(t).toLowerCase().contains(q) || t.category.toLowerCase().contains(q))).toList();
        return RefreshIndicator(
          onRefresh: () => ref.refresh(templatesProvider.future),
          child: ListView(padding: const EdgeInsets.fromLTRB(18, 8, 18, 90), children: [
            Row(children: [
              const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Message Templates', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
                SizedBox(height: 4),
                Text('Your WhatsApp templates synced from Meta.', style: TextStyle(color: BusinessColors.muted)),
              ])),
              IconButton.filledTonal(onPressed: _sync, icon: const Icon(Icons.sync)),
            ]),
            const SizedBox(height: 16),
            TextField(onChanged: (v) => setState(() => query = v), decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search templates...')),
            const SizedBox(height: 12),
            SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [
              _filterChip('ALL', 'All (${visible.length})'),
              _filterChip('APPROVED', 'Approved (${visible.where((e) => e.status == 'APPROVED').length})'),
              _filterChip('PENDING', 'Pending (${visible.where((e) => e.status.contains('PENDING')).length})'),
              _filterChip('REJECTED', 'Rejected (${visible.where((e) => e.status == 'REJECTED').length})'),
            ])),
            const SizedBox(height: 14),
            if (items.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(28), child: Center(child: Text('No templates found.'))))
            else
              ...items.map((t) => Padding(
                    padding: const EdgeInsets.only(bottom: 9),
                    child: Card(
                      child: ListTile(
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TemplateDetailsScreen(template: t))),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        leading: SoftIcon(_icon(t.category), color: _color(t.category)),
                        title: Text(_displayName(t), style: const TextStyle(fontWeight: FontWeight.w900)),
                        subtitle: Padding(padding: const EdgeInsets.only(top: 4), child: Text('${t.category} • ${t.language}\n${_preview(t.bodyText)}', maxLines: 2, overflow: TextOverflow.ellipsis)),
                        isThreeLine: true,
                        trailing: _status(t.status),
                      ),
                    ),
                  )),
          ]),
        );
      },
    );
  }

  Widget _filterChip(String value, String label) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(selected: filter == value, label: Text(label), onSelected: (_) => setState(() => filter = value), selectedColor: BusinessColors.green, labelStyle: TextStyle(color: filter == value ? Colors.white : BusinessColors.ink, fontWeight: FontWeight.w700)),
      );


  static List<MessageTemplate> _businessTemplates(List<MessageTemplate> list) {
    MessageTemplate? hello;
    MessageTemplate? birthday;
    for (final t in list) {
      final n = t.name.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
      if (n == 'hello_world') hello ??= t;
      if (n.contains('birthday')) {
        if (birthday == null || (birthday.status != 'APPROVED' && t.status == 'APPROVED')) birthday = t;
      }
    }
    return [if (hello != null) hello, if (birthday != null) birthday];
  }

  static String _displayName(MessageTemplate t) {
    final n = t.name.toLowerCase();
    if (n == 'hello_world' || n == 'hello world') return 'Hello World';
    if (n.contains('birthday')) return 'Birthday';
    return t.name;
  }

  Future<void> _sync() async {
    try {
      await ref.read(apiClientProvider).post('/api/whatsapp/templates/sync');
      ref.invalidate(templatesProvider);
      if (mounted) showAppMessage(context, 'Templates synced successfully');
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    }
  }

  static String _preview(String s) => s.replaceAll('\n', ' ').trim();
  static IconData _icon(String c) => c.toUpperCase() == 'MARKETING' ? Icons.campaign_outlined : c.toUpperCase() == 'UTILITY' ? Icons.description_outlined : Icons.message_outlined;
  static Color _color(String c) => c.toUpperCase() == 'MARKETING' ? const Color(0xFFE83E8C) : c.toUpperCase() == 'UTILITY' ? const Color(0xFF2F80ED) : BusinessColors.green;
  static Widget _status(String s) {
    final color = s == 'APPROVED' ? BusinessColors.green : s == 'REJECTED' ? Colors.redAccent : Colors.orange;
    return Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5), decoration: BoxDecoration(color: color.withOpacity(.11), borderRadius: BorderRadius.circular(12)), child: Text(s, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)));
  }
}

class TemplateDetailsScreen extends StatelessWidget {
  const TemplateDetailsScreen({super.key, required this.template});
  final MessageTemplate template;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Template Details')),
        body: ListView(padding: const EdgeInsets.fromLTRB(18, 10, 18, 24), children: [
          Card(child: Padding(padding: const EdgeInsets.all(18), child: Row(children: [
            SoftIcon(_TemplatesScreenState._icon(template.category), color: _TemplatesScreenState._color(template.category)),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_TemplatesScreenState._displayName(template), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              const SizedBox(height: 4),
              Text('${template.category} • ${template.language}', style: const TextStyle(color: BusinessColors.muted)),
            ])),
            _TemplatesScreenState._status(template.status),
          ]))),
          const SizedBox(height: 14),
          Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Message Content', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 14),
            Container(width: double.infinity, padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: const Color(0xFFF7F9FC), borderRadius: BorderRadius.circular(14)), child: Text(template.bodyText.isEmpty ? 'No body content returned by Meta.' : template.bodyText, style: const TextStyle(height: 1.5))),
          ]))),
          const SizedBox(height: 14),
          Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Template Information', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            _info('Status', template.status),
            _info('Category', template.category),
            _info('Language', template.language),
            _info('Variables', '${template.variableCount}'),
          ]))),
        ]),
      );

  static Widget _info(String a, String b) => Padding(padding: const EdgeInsets.symmetric(vertical: 7), child: Row(children: [Expanded(child: Text(a, style: const TextStyle(color: BusinessColors.muted))), Text(b, style: const TextStyle(fontWeight: FontWeight.w800))]));
}
