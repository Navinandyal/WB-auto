import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class CreateAutomationScreen extends ConsumerStatefulWidget {
  const CreateAutomationScreen({super.key});

  @override
  ConsumerState<CreateAutomationScreen> createState() =>
      _CreateAutomationScreenState();
}

class _CreateAutomationScreenState
    extends ConsumerState<CreateAutomationScreen> {
  int step = 0;
  final selectedContacts = <int>{};
  final selectedGroups = <int>{};
  final groupMembers = <int, Set<int>>{};
  final extraVariables = <int, String>{};
  int? templateId;
  DateTime when = DateTime.now().add(const Duration(minutes: 10));
  bool saving = false;
  int? loadingGroupId;

  @override
  Widget build(BuildContext context) {
    final contacts = ref.watch(contactsProvider);
    final templates = ref.watch(templatesProvider);
    final groups = ref.watch(contactGroupsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Create Automation')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 12),
            child: _steps(),
          ),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 180),
              child: _body(contacts, templates, groups),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 14),
              child: Row(
                children: [
                  if (step > 0)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: saving ? null : () => setState(() => step--),
                        child: const Text('Back'),
                      ),
                    ),
                  if (step > 0) const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: saving ? null : _next,
                      child: saving
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : Text(
                              step == 3
                                  ? 'Create ${selectedContacts.length} Automation${selectedContacts.length == 1 ? '' : 's'}'
                                  : 'Next',
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _steps() => Row(
        children: List.generate(4, (i) {
          final active = i <= step;
          return Expanded(
            child: Column(
              children: [
                Row(
                  children: [
                    if (i > 0)
                      Expanded(
                        child: Container(
                          height: 2,
                          color: i <= step
                              ? BusinessColors.green
                              : BusinessColors.line,
                        ),
                      ),
                    CircleAvatar(
                      radius: 14,
                      backgroundColor: active
                          ? BusinessColors.green
                          : const Color(0xFFE7ECF4),
                      child: Text(
                        '${i + 1}',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          color: active ? Colors.white : BusinessColors.muted,
                        ),
                      ),
                    ),
                    if (i < 3)
                      Expanded(
                        child: Container(
                          height: 2,
                          color: i < step
                              ? BusinessColors.green
                              : BusinessColors.line,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  ['Audience', 'Message', 'Schedule', 'Review'][i],
                  style: const TextStyle(
                    fontSize: 10,
                    color: BusinessColors.muted,
                  ),
                ),
              ],
            ),
          );
        }),
      );

  Widget _body(
    AsyncValue<List<Contact>> contacts,
    AsyncValue<List<MessageTemplate>> templates,
    AsyncValue<List<ContactGroup>> groups,
  ) {
    switch (step) {
      case 0:
        return _audience(contacts, groups);
      case 1:
        return _message(templates);
      case 2:
        return _schedule();
      default:
        return _review(contacts, templates, groups);
    }
  }

  Widget _audience(
    AsyncValue<List<Contact>> contactsAsync,
    AsyncValue<List<ContactGroup>> groupsAsync,
  ) {
    return contactsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorState(e),
      data: (rawContacts) {
        final contacts = rawContacts.where((c) => c.optIn).toList();

        return groupsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(e),
          data: (groups) => ListView(
            key: const ValueKey('audience'),
            padding: const EdgeInsets.all(18),
            children: [
              const Text(
                'Step 1: Select Audience',
                style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 5),
              const Text(
                'Choose a complete contact group in one tap, or select individual contacts.',
                style: TextStyle(color: BusinessColors.muted),
              ),
              const SizedBox(height: 14),

              if (groups.isNotEmpty) ...[
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Contact Groups',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    Text(
                      '${selectedGroups.length} selected',
                      style: const TextStyle(color: BusinessColors.muted),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ...groups.map(
                  (g) => Card(
                    child: CheckboxListTile(
                      value: selectedGroups.contains(g.id),
                      onChanged: loadingGroupId == g.id
                          ? null
                          : (v) => _toggleGroup(g, v == true, contacts),
                      secondary: loadingGroupId == g.id
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const CircleAvatar(
                              child: Icon(Icons.groups_rounded),
                            ),
                      title: Text(
                        g.name,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      subtitle: Text(
                        '${g.memberCount} contact${g.memberCount == 1 ? '' : 's'} • Tap once to select all members',
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Divider(),
                const SizedBox(height: 8),
              ],

              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Individual Contacts',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Text(
                    '${selectedContacts.length} selected',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => setState(
                      () => selectedContacts.addAll(contacts.map((e) => e.id)),
                    ),
                    child: const Text('Select All'),
                  ),
                  TextButton(
                    onPressed: () => setState(() {
                      selectedContacts.clear();
                      selectedGroups.clear();
                    }),
                    child: const Text('Clear'),
                  ),
                ],
              ),
              if (contacts.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('No opted-in contacts available.'),
                  ),
                )
              else
                ...contacts.map(
                  (c) => Card(
                    child: CheckboxListTile(
                      value: selectedContacts.contains(c.id),
                      onChanged: (v) => setState(
                        () => v == true
                            ? selectedContacts.add(c.id)
                            : selectedContacts.remove(c.id),
                      ),
                      title: Text(
                        c.name,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      subtitle: Text(c.phone),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _toggleGroup(
    ContactGroup group,
    bool select,
    List<Contact> optedInContacts,
  ) async {
    setState(() => loadingGroupId = group.id);
    try {
      var ids = groupMembers[group.id];
      if (ids == null) {
        final data = await ref
            .read(apiClientProvider)
            .get('/api/contact-groups/${group.id}');
        final members = ((data as Map)['members'] as List? ?? [])
            .whereType<Map>()
            .toList();
        final allowed = optedInContacts.map((e) => e.id).toSet();
        ids = members
            .map((m) => int.tryParse('${m['id']}') ?? 0)
            .where((id) => id > 0 && allowed.contains(id))
            .toSet();
        groupMembers[group.id] = ids;
      }

      if (!mounted) return;
      setState(() {
        if (select) {
          selectedGroups.add(group.id);
          selectedContacts.addAll(ids!);
        } else {
          selectedGroups.remove(group.id);
          selectedContacts.removeAll(ids!);
        }
      });

      if (select && ids.isEmpty && mounted) {
        showAppMessage(
          context,
          'This group has no WhatsApp opted-in contacts.',
          error: true,
        );
      }
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => loadingGroupId = null);
    }
  }

  Widget _message(AsyncValue<List<MessageTemplate>> a) => a.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(e),
        data: (raw) {
          final list = raw.where((t) => t.status == 'APPROVED').toList();
          return ListView(
            key: const ValueKey('message'),
            padding: const EdgeInsets.all(18),
            children: [
              const Text(
                'Step 2: Select Approved Template',
                style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 5),
              const Text(
                'Only approved WhatsApp templates can be used in an automation.',
                style: TextStyle(color: BusinessColors.muted),
              ),
              const SizedBox(height: 14),
              if (list.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'No approved templates. Sync your Meta templates or create one first.',
                    ),
                  ),
                )
              else
                ...list.map(
                  (t) => Card(
                    child: RadioListTile<int>(
                      value: t.id,
                      groupValue: templateId,
                      onChanged: (v) => setState(() => templateId = v),
                      title: Text(
                        t.name,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      subtitle: Text(
                        '${t.category} • ${t.language}\n${t.bodyText}',
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ),
              if (templateId != null) ..._variableFields(list),
            ],
          );
        },
      );

  List<Widget> _variableFields(List<MessageTemplate> list) {
    MessageTemplate? t;
    for (final x in list) {
      if (x.id == templateId) {
        t = x;
        break;
      }
    }
    if (t == null || t.variableCount <= 1) return const [];

    return [
      const SizedBox(height: 12),
      const Text(
        'Template Variables',
        style: TextStyle(fontWeight: FontWeight.w900),
      ),
      const Text(
        '{{1}} is personalized with each contact name.',
        style: TextStyle(color: BusinessColors.muted),
      ),
      ...List.generate(t.variableCount - 1, (i) {
        final n = i + 2;
        return Padding(
          padding: const EdgeInsets.only(top: 10),
          child: TextFormField(
            initialValue: extraVariables[n] ?? '',
            onChanged: (v) => extraVariables[n] = v,
            decoration: InputDecoration(labelText: 'Value for variable $n *'),
          ),
        );
      }),
    ];
  }

  Widget _schedule() => ListView(
        key: const ValueKey('schedule'),
        padding: const EdgeInsets.all(18),
        children: [
          const Text(
            'Step 3: Set Schedule',
            style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 5),
          const Text(
            'Every selected group member/contact will be queued for this date and time.',
            style: TextStyle(color: BusinessColors.muted),
          ),
          const SizedBox(height: 18),
          Card(
            child: ListTile(
              onTap: _pickTime,
              leading: const SoftIcon(
                Icons.calendar_month_rounded,
                color: Color(0xFF2F80ED),
              ),
              title: const Text(
                'Scheduled Date & Time',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: Text(when.toLocal().toString().substring(0, 16)),
              trailing: const Icon(Icons.chevron_right),
            ),
          ),
          const SizedBox(height: 12),
          const Card(
            child: ListTile(
              leading: SoftIcon(
                Icons.public_rounded,
                color: Color(0xFF7C4DFF),
              ),
              title: Text(
                'Time Zone',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: Text('(GMT+05:30) Asia/Kolkata'),
            ),
          ),
        ],
      );

  Widget _review(
    AsyncValue<List<Contact>> ca,
    AsyncValue<List<MessageTemplate>> ta,
    AsyncValue<List<ContactGroup>> ga,
  ) {
    final contacts = ca.valueOrNull ?? const <Contact>[];
    final templates = ta.valueOrNull ?? const <MessageTemplate>[];
    final groups = ga.valueOrNull ?? const <ContactGroup>[];

    MessageTemplate? t;
    for (final x in templates) {
      if (x.id == templateId) {
        t = x;
        break;
      }
    }

    final names = contacts
        .where((c) => selectedContacts.contains(c.id))
        .map((e) => e.name)
        .toList();
    final groupNames = groups
        .where((g) => selectedGroups.contains(g.id))
        .map((e) => e.name)
        .toList();

    return ListView(
      key: const ValueKey('review'),
      padding: const EdgeInsets.all(18),
      children: [
        const Text(
          'Step 4: Review & Create',
          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 18),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                _row('Recipients', '${selectedContacts.length}'),
                if (groupNames.isNotEmpty)
                  _row('Groups', groupNames.join(', ')),
                _row(
                  'Contacts',
                  names.take(3).join(', ') +
                      (names.length > 3 ? ' +${names.length - 3} more' : ''),
                ),
                _row('Template', t?.name ?? ''),
                _row('Schedule', when.toLocal().toString().substring(0, 16)),
                _row('Status after create', 'QUEUE'),
              ],
            ),
          ),
        ),
      ],
    );
  }

  static Widget _row(String a, String b) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                a,
                style: const TextStyle(color: BusinessColors.muted),
              ),
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

  Future<void> _next() async {
    if (step == 0 && selectedContacts.isEmpty) {
      showAppMessage(
        context,
        'Select a group or at least one opted-in contact.',
        error: true,
      );
      return;
    }
    if (step == 1 && templateId == null) {
      showAppMessage(context, 'Select an approved template.', error: true);
      return;
    }
    if (step == 1 && templateId != null) {
      final ts = ref.read(templatesProvider).valueOrNull ??
          const <MessageTemplate>[];
      MessageTemplate? t;
      for (final x in ts) {
        if (x.id == templateId) {
          t = x;
          break;
        }
      }
      if (t != null) {
        for (var n = 2; n <= t.variableCount; n++) {
          if ((extraVariables[n] ?? '').trim().isEmpty) {
            showAppMessage(
              context,
              'Enter a value for template variable $n.',
              error: true,
            );
            return;
          }
        }
      }
    }
    if (step == 2 && !when.isAfter(DateTime.now())) {
      showAppMessage(context, 'Schedule must be in the future.', error: true);
      return;
    }
    if (step < 3) {
      setState(() => step++);
      return;
    }
    await _save();
  }

  Future<void> _pickTime() async {
    final d = await showDatePicker(
      context: context,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 730)),
      initialDate: when,
    );
    if (d == null || !mounted) return;

    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(when),
    );
    if (t == null) return;

    final next = DateTime(d.year, d.month, d.day, t.hour, t.minute);
    if (!next.isAfter(DateTime.now())) {
      if (mounted) {
        showAppMessage(context, 'Schedule must be in the future.', error: true);
      }
      return;
    }
    setState(() => when = next);
  }

  Future<void> _save() async {
    if (selectedContacts.isEmpty || templateId == null) return;

    final contacts =
        ref.read(contactsProvider).valueOrNull ?? const <Contact>[];
    final templates =
        ref.read(templatesProvider).valueOrNull ?? const <MessageTemplate>[];

    MessageTemplate? template;
    for (final t in templates) {
      if (t.id == templateId) {
        template = t;
        break;
      }
    }

    if (template == null || template.status != 'APPROVED') {
      showAppMessage(context, 'Template is not approved.', error: true);
      return;
    }

    setState(() => saving = true);
    try {
      final eligibleIds = selectedContacts.where((id) {
        for (final c in contacts) { if (c.id == id) return c.optIn; }
        return false;
      }).toList();
      final vars = <String, String>{};
      if (template.variableCount > 0) vars['1'] = '{{name}}';
      for (final e in extraVariables.entries) {
        if (e.value.trim().isNotEmpty) vars['${e.key}'] = e.value.trim();
      }
      final result = await ref.read(apiClientProvider).post(
        '/api/automations',
        data: {
          'contactIds': eligibleIds,
          'templateId': template.id,
          'variables': vars,
          'scheduledAt': when.toUtc().toIso8601String(),
          'timezone': 'Asia/Kolkata',
        },
      );
      final created = result is Map ? int.tryParse('${result['count'] ?? eligibleIds.length}') ?? eligibleIds.length : eligibleIds.length;
      ref.invalidate(automationsProvider);
      ref.invalidate(dashboardProvider);
      if (mounted) {
        showAppMessage(context, '$created scheduled message${created == 1 ? '' : 's'} created');
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}
