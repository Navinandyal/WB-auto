import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class BulkSendScreen extends ConsumerStatefulWidget {
  const BulkSendScreen({super.key, this.preselectedContactIds = const [], this.preferredTemplateId});
  final List<int> preselectedContactIds;
  final int? preferredTemplateId;

  @override
  ConsumerState<BulkSendScreen> createState() => _BulkSendScreenState();
}

class _BulkSendScreenState extends ConsumerState<BulkSendScreen> {
  final selected = <int>{};
  final selectedGroups = <int>{};
  final variables = <int, String>{};
  int? templateId;
  bool sending = false;
  String search = '';

  @override
  void initState() {
    super.initState();
    selected.addAll(widget.preselectedContactIds);
    templateId = widget.preferredTemplateId;
  }

  @override
  Widget build(BuildContext context) {
    final contactsAsync = ref.watch(contactsProvider);
    final templatesAsync = ref.watch(templatesProvider);
    final groupsAsync = ref.watch(contactGroupsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Send Bulk Message')),
      body: contactsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(e),
        data: (contacts) => templatesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(e),
          data: (templates) => groupsAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ErrorState(e),
            data: (groups) {
              final approved = templates.where((t) => t.status == 'APPROVED').toList();
              final filtered = contacts.where((c) {
                if (!c.optIn) return false;
                if (search.isEmpty) return true;
                return c.name.toLowerCase().contains(search.toLowerCase()) || c.phone.contains(search);
              }).toList();
              MessageTemplate? chosen;
              for (final t in approved) {
                if (t.id == templateId) {
                  chosen = t;
                  break;
                }
              }

              return ListView(
                padding: const EdgeInsets.all(18),
                children: [
                  const Text('Audience', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  TextField(
                    onChanged: (v) => setState(() => search = v),
                    decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search opted-in contacts'),
                  ),
                  const SizedBox(height: 8),
                  Row(children: [
                    Text('${selected.length} selected', style: const TextStyle(fontWeight: FontWeight.w800)),
                    const Spacer(),
                    TextButton(onPressed: () => setState(() => selected.addAll(filtered.map((e) => e.id))), child: const Text('Select All')),
                    TextButton(onPressed: () => setState(() => selected.clear()), child: const Text('Clear')),
                  ]),
                  ...filtered.map((c) => CheckboxListTile(
                        value: selected.contains(c.id),
                        title: Text(c.name),
                        subtitle: Text(c.phone),
                        onChanged: (v) => setState(() => v == true ? selected.add(c.id) : selected.remove(c.id)),
                      )),
                  if (groups.isNotEmpty) ...[
                    const Divider(),
                    const Text('Or Select Groups', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 6),
                    ...groups.map((g) => CheckboxListTile(
                          value: selectedGroups.contains(g.id),
                          title: Text(g.name),
                          subtitle: Text('${g.memberCount} contacts'),
                          onChanged: (v) => setState(() => v == true ? selectedGroups.add(g.id) : selectedGroups.remove(g.id)),
                        )),
                  ],
                  const Divider(),
                  const Text('Approved Template', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  if (approved.isEmpty)
                    const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No approved templates. Create or sync a template first.')))
                  else
                    ...approved.map((t) => RadioListTile<int>(
                          value: t.id,
                          groupValue: templateId,
                          onChanged: (v) => setState(() => templateId = v),
                          title: Text(t.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text('${t.category} • ${t.bodyText}', maxLines: 3, overflow: TextOverflow.ellipsis),
                        )),
                  if (chosen != null && chosen.variableCount > 1) ...[
                    const SizedBox(height: 16),
                    const Text('Template Variables', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 6),
                    const Text('{{1}} is automatically replaced with each contact name. Enter remaining values below.', style: TextStyle(color: BusinessColors.muted)),
                    ...List.generate(chosen.variableCount - 1, (i) {
                      final n = i + 2;
                      return Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: TextFormField(
                          initialValue: variables[n] ?? '',
                          onChanged: (v) => variables[n] = v,
                          decoration: InputDecoration(labelText: 'Value for variable $n *'),
                        ),
                      );
                    }),
                  ],
                  const SizedBox(height: 16),
                  const Card(
                    color: BusinessColors.greenSoft,
                    child: Padding(
                      padding: EdgeInsets.all(14),
                      child: Text('Use this for birthday wishes, offers, announcements and marketing campaigns. Only contacts with WhatsApp consent are eligible.'),
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: sending ? null : _send,
                    child: sending
                        ? const CircularProgressIndicator(color: Colors.white)
                        : Text(selectedGroups.isEmpty ? 'Send to ${selected.length} Contact${selected.length == 1 ? '' : 's'}' : 'Send Bulk Message'),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _send() async {
    if (selected.isEmpty && selectedGroups.isEmpty) {
      showAppMessage(context, 'Select at least one contact or group.', error: true);
      return;
    }
    if (templateId == null) {
      showAppMessage(context, 'Select an approved template.', error: true);
      return;
    }
    final templates = ref.read(templatesProvider).valueOrNull ?? const <MessageTemplate>[];
    MessageTemplate? chosen;
    for (final t in templates) {
      if (t.id == templateId) { chosen = t; break; }
    }
    if (chosen != null) {
      for (var n = 2; n <= chosen.variableCount; n++) {
        if ((variables[n] ?? '').trim().isEmpty) {
          showAppMessage(context, 'Enter a value for template variable $n.', error: true);
          return;
        }
      }
    }

    setState(() => sending = true);
    try {
      final result = await ref.read(apiClientProvider).post('/api/whatsapp/send-bulk', data: {
        'contactIds': selected.toList(),
        'groupIds': selectedGroups.toList(),
        'templateId': templateId,
        'variables': {for (final e in variables.entries) '${e.key}': e.value.trim()},
      });
      if (mounted) {
        final map = (result as Map);
        showAppMessage(context, 'Sent ${map['sent']}, failed ${map['failed']}, skipped ${map['skipped']}');
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }
}
