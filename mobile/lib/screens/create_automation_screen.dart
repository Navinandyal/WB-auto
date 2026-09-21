import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class CreateAutomationScreen extends ConsumerStatefulWidget {
  const CreateAutomationScreen({super.key});

  @override
  ConsumerState<CreateAutomationScreen> createState() => _CreateAutomationScreenState();
}

class _CreateAutomationScreenState extends ConsumerState<CreateAutomationScreen> {
  int step = 0;
  int? contactId;
  int? templateId;
  DateTime when = DateTime.now().add(const Duration(minutes: 10));
  bool saving = false;

  @override
  Widget build(BuildContext context) {
    final contacts = ref.watch(contactsProvider);
    final templates = ref.watch(templatesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Create Automation')),
      body: Column(
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(18, 8, 18, 12), child: _steps()),
          Expanded(child: AnimatedSwitcher(duration: const Duration(milliseconds: 180), child: _body(contacts, templates))),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 14),
              child: Row(
                children: [
                  if (step > 0) Expanded(child: OutlinedButton(onPressed: saving ? null : () => setState(() => step--), child: const Text('Back'))),
                  if (step > 0) const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: saving ? null : _next,
                      child: saving
                          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : Text(step == 3 ? 'Create Automation' : 'Next'),
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
                    if (i > 0) Expanded(child: Container(height: 2, color: i <= step ? BusinessColors.green : BusinessColors.line)),
                    CircleAvatar(
                      radius: 14,
                      backgroundColor: active ? BusinessColors.green : const Color(0xFFE7ECF4),
                      child: Text('${i + 1}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: active ? Colors.white : BusinessColors.muted)),
                    ),
                    if (i < 3) Expanded(child: Container(height: 2, color: i < step ? BusinessColors.green : BusinessColors.line)),
                  ],
                ),
                const SizedBox(height: 4),
                Text(['Audience', 'Message', 'Schedule', 'Review'][i], style: const TextStyle(fontSize: 10, color: BusinessColors.muted)),
              ],
            ),
          );
        }),
      );

  Widget _body(AsyncValue<List<Contact>> contacts, AsyncValue<List<MessageTemplate>> templates) {
    switch (step) {
      case 0:
        return _audience(contacts);
      case 1:
        return _message(templates);
      case 2:
        return _schedule();
      default:
        return _review(contacts, templates);
    }
  }

  Widget _audience(AsyncValue<List<Contact>> async) => async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(e),
        data: (raw) {
          final list = raw.where((c) => c.optIn).toList();
          return ListView(
            key: const ValueKey('audience'),
            padding: const EdgeInsets.all(18),
            children: [
              const Text('Step 1: Select Contact', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
              const SizedBox(height: 5),
              const Text('Only contacts with WhatsApp consent can receive automated messages.', style: TextStyle(color: BusinessColors.muted)),
              const SizedBox(height: 14),
              if (list.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(24), child: Text('No opted-in contacts are available. Add a contact or enable WhatsApp consent first.')))
              else
                ...list.map(
                  (c) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Card(
                      child: RadioListTile<int>(
                        value: c.id,
                        groupValue: contactId,
                        onChanged: (v) => setState(() => contactId = v),
                        title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text(c.phone),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      );

  List<MessageTemplate> _allowedTemplates(List<MessageTemplate> list) {
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

  String _templateLabel(MessageTemplate t) {
    final n = t.name.toLowerCase();
    if (n == 'hello_world' || n == 'hello world') return 'Hello World';
    if (n.contains('birthday')) return 'Birthday';
    return t.name;
  }

  Widget _message(AsyncValue<List<MessageTemplate>> async) => async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(e),
        data: (raw) {
          final list = _allowedTemplates(raw);
          return ListView(
            key: const ValueKey('message'),
            padding: const EdgeInsets.all(18),
            children: [
              const Text('Step 2: Select Template', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
              const SizedBox(height: 5),
              const Text('WishFlow uses only Hello World and Birthday templates for this flow.', style: TextStyle(color: BusinessColors.muted)),
              const SizedBox(height: 14),
              if (list.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(24), child: Text('No Hello World or Birthday template is available. Sync templates from the Templates page.')))
              else
                ...list.map((t) {
                  final approved = t.status == 'APPROVED';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Card(
                      child: RadioListTile<int>(
                        value: t.id,
                        groupValue: templateId,
                        onChanged: approved ? (v) => setState(() => templateId = v) : null,
                        title: Row(children: [
                          Expanded(child: Text(_templateLabel(t), style: const TextStyle(fontWeight: FontWeight.w800))),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: approved ? BusinessColors.greenSoft : const Color(0xFFFFF3D9), borderRadius: BorderRadius.circular(10)),
                            child: Text(approved ? 'APPROVED' : t.status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: approved ? BusinessColors.greenDark : Colors.orange.shade800)),
                          ),
                        ]),
                        subtitle: Text('${t.category} • ${t.language}\n${t.bodyText}', maxLines: 3, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                  );
                }),
              const SizedBox(height: 8),
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(14),
                  child: Row(children: [
                    Icon(Icons.info_outline, color: BusinessColors.greenDark),
                    SizedBox(width: 10),
                    Expanded(child: Text('For the Birthday template, WishFlow automatically uses the selected contact name for the first template variable.')),
                  ]),
                ),
              ),
            ],
          );
        },
      );

  Widget _schedule() => ListView(
        key: const ValueKey('schedule'),
        padding: const EdgeInsets.all(18),
        children: [
          const Text('Step 3: Set Schedule', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
          const SizedBox(height: 5),
          const Text('Choose when this queued automation should be sent.', style: TextStyle(color: BusinessColors.muted)),
          const SizedBox(height: 18),
          Card(
            child: ListTile(
              onTap: _pickTime,
              leading: const SoftIcon(Icons.calendar_month_rounded, color: Color(0xFF2F80ED)),
              title: const Text('Scheduled Date & Time', style: TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(when.toLocal().toString().substring(0, 16)),
              trailing: const Icon(Icons.chevron_right),
            ),
          ),
          const SizedBox(height: 12),
          const Card(
            child: ListTile(
              leading: SoftIcon(Icons.public_rounded, color: Color(0xFF7C4DFF)),
              title: Text('Time Zone', style: TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text('(GMT+05:30) Asia/Kolkata'),
            ),
          ),
        ],
      );

  Widget _review(AsyncValue<List<Contact>> contacts, AsyncValue<List<MessageTemplate>> templates) {
    Contact? contact;
    MessageTemplate? template;
    final contactList = contacts.valueOrNull ?? const <Contact>[];
    final templateList = templates.valueOrNull ?? const <MessageTemplate>[];
    for (final c in contactList) {
      if (c.id == contactId) contact = c;
    }
    for (final t in templateList) {
      if (t.id == templateId) template = t;
    }
    return ListView(
      key: const ValueKey('review'),
      padding: const EdgeInsets.all(18),
      children: [
        const Text('Step 4: Review & Create', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
        const SizedBox(height: 5),
        const Text('After creation the status is Queue until the backend worker sends it.', style: TextStyle(color: BusinessColors.muted)),
        const SizedBox(height: 18),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(children: [
              _row('Recipient', contact?.name ?? 'Selected contact'),
              _row('Phone', contact?.phone ?? ''),
              _row('Template', template == null ? 'Selected template' : _templateLabel(template)),
              _row('Schedule', when.toLocal().toString().substring(0, 16)),
              _row('Status after create', 'QUEUE'),
            ]),
          ),
        ),
      ],
    );
  }

  static Widget _row(String a, String b) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(children: [
          Expanded(child: Text(a, style: const TextStyle(color: BusinessColors.muted))),
          Expanded(child: Text(b, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w800))),
        ]),
      );

  Future<void> _next() async {
    if (step == 0 && contactId == null) {
      showAppMessage(context, 'Select an opted-in contact.', error: true);
      return;
    }
    if (step == 1 && templateId == null) {
      showAppMessage(context, 'Select an approved Hello World or Birthday template.', error: true);
      return;
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
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(when));
    if (t == null) return;
    final next = DateTime(d.year, d.month, d.day, t.hour, t.minute);
    if (!next.isAfter(DateTime.now())) {
      if (mounted) showAppMessage(context, 'Schedule must be in the future.', error: true);
      return;
    }
    setState(() => when = next);
  }

  Future<void> _save() async {
    if (contactId == null || templateId == null) return;
    final contacts = ref.read(contactsProvider).valueOrNull ?? const <Contact>[];
    final templates = ref.read(templatesProvider).valueOrNull ?? const <MessageTemplate>[];
    Contact? contact;
    MessageTemplate? template;
    for (final c in contacts) {
      if (c.id == contactId) contact = c;
    }
    for (final t in templates) {
      if (t.id == templateId) template = t;
    }
    if (contact == null || template == null) {
      showAppMessage(context, 'Selected contact or template is no longer available. Refresh and try again.', error: true);
      return;
    }
    if (!contact.optIn) {
      showAppMessage(context, 'This contact has not enabled WhatsApp consent.', error: true);
      return;
    }
    if (template.status != 'APPROVED') {
      showAppMessage(context, 'The selected template is not approved by Meta.', error: true);
      return;
    }

    final vars = <String, String>{};
    if (template.variableCount > 0) vars['1'] = contact.name;

    setState(() => saving = true);
    try {
      await ref.read(apiClientProvider).post('/api/automations', data: {
        'contactId': contact.id,
        'templateId': template.id,
        'variables': vars,
        'scheduledAt': when.toUtc().toIso8601String(),
        'timezone': 'Asia/Kolkata',
      });
      ref.invalidate(automationsProvider);
      ref.invalidate(dashboardProvider);
      if (mounted) {
        showAppMessage(context, 'Automation added to queue successfully');
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}
