import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import 'device_contacts_screen.dart';

class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({super.key});
  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen> {
  String query = '';
  int source = 0;

  @override
  Widget build(BuildContext context) {
    if (source == 1) {
      return Column(children: [
        _header(),
        Expanded(child: const DeviceContactsPanel()),
      ]);
    }
    final async = ref.watch(contactsProvider);
    return async.when(
      loading: () => ListView(children: const [SizedBox(height: 260), Center(child: CircularProgressIndicator())]),
      error: (e, _) => ListView(children: [const SizedBox(height: 180), ErrorState(e, onRetry: () => ref.invalidate(contactsProvider))]),
      data: (items) {
        final q = query.toLowerCase().trim();
        final filtered = items.where((c) => q.isEmpty || c.name.toLowerCase().contains(q) || c.phone.contains(q)).toList();
        return RefreshIndicator(
          onRefresh: () => ref.refresh(contactsProvider.future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 90),
            children: [
              _titleRow(),
              const SizedBox(height: 14),
              _sourceSelector(),
              const SizedBox(height: 14),
              TextField(
                onChanged: (v) => setState(() => query = v),
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search saved contacts by name or number'),
              ),
              const SizedBox(height: 14),
              Row(children: [
                _Pill(label: 'Saved (${items.length})', active: true),
                const SizedBox(width: 8),
                _Pill(label: 'Opted in (${items.where((e) => e.optIn).length})'),
              ]),
              const SizedBox(height: 12),
              if (filtered.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(28), child: Center(child: Text('No saved contacts found. Open Phone Contacts to import contacts from this device.'))))
              else
                ...filtered.map((c) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Card(
                        child: ListTile(
                          onTap: () => _showDetails(c),
                          contentPadding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
                          leading: CircleAvatar(
                            radius: 24,
                            backgroundColor: const Color(0xFFEAF2FF),
                            child: Text(c.name.isEmpty ? '?' : c.name[0].toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900, color: Color(0xFF2F80ED))),
                          ),
                          title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            const SizedBox(height: 3),
                            Text(c.phone, style: const TextStyle(color: BusinessColors.muted)),
                            if (c.dob != null && c.dob!.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 5),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(color: const Color(0xFFFFE8EF), borderRadius: BorderRadius.circular(12)),
                                  child: Text('🎂 ${c.dob}', style: const TextStyle(fontSize: 11, color: Color(0xFFB02350))),
                                ),
                              ),
                            if (!c.optIn)
                              const Padding(padding: EdgeInsets.only(top: 4), child: Text('WhatsApp consent not enabled', style: TextStyle(fontSize: 11, color: Colors.orange))),
                          ]),
                          trailing: PopupMenuButton<String>(
                            onSelected: (v) {
                              if (v == 'edit') _openEditor(c);
                              if (v == 'delete') _delete(c);
                            },
                            itemBuilder: (_) => const [
                              PopupMenuItem(value: 'edit', child: Text('Edit contact')),
                              PopupMenuItem(value: 'delete', child: Text('Delete contact')),
                            ],
                          ),
                        ),
                      ),
                    )),
            ],
          ),
        );
      },
    );
  }

  Widget _header() => Padding(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
        child: Column(children: [_titleRow(), const SizedBox(height: 14), _sourceSelector()]),
      );

  Widget _titleRow() => Row(children: [
        const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Contacts', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
          SizedBox(height: 4),
          Text('Saved WishFlow contacts and contacts from your phone.', style: TextStyle(color: BusinessColors.muted)),
        ])),
        if (source == 0) FilledButton.icon(onPressed: () => _openEditor(), icon: const Icon(Icons.add), label: const Text('Add')),
      ]);

  Widget _sourceSelector() => SegmentedButton<int>(
        segments: const [
          ButtonSegment<int>(value: 0, icon: Icon(Icons.cloud_outlined), label: Text('WishFlow')),
          ButtonSegment<int>(value: 1, icon: Icon(Icons.phone_android_outlined), label: Text('Phone Contacts')),
        ],
        selected: {source},
        onSelectionChanged: (value) => setState(() => source = value.first),
      );

  Future<void> _openEditor([Contact? contact]) async {
    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => ContactEditorScreen(contact: contact)));
    if (changed == true) ref.invalidate(contactsProvider);
  }

  Future<void> _showDetails(Contact c) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ContactDetailsScreen(contact: c, onEdit: () async {
      Navigator.pop(context);
      await _openEditor(c);
    })));
  }

  Future<void> _delete(Contact c) async {
    final yes = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Delete contact?'),
      content: Text('Delete ${c.name}? This action cannot be undone.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(style: FilledButton.styleFrom(backgroundColor: Colors.red), onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
      ],
    ));
    if (yes != true) return;
    try {
      await ref.read(apiClientProvider).delete('/api/contacts/${c.id}');
      ref.invalidate(contactsProvider);
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    }
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, this.active = false});
  final String label;
  final bool active;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: active ? BusinessColors.green : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? BusinessColors.green : BusinessColors.line),
        ),
        child: Text(label, style: TextStyle(color: active ? Colors.white : BusinessColors.ink, fontWeight: FontWeight.w700, fontSize: 12)),
      );
}

class ContactEditorScreen extends ConsumerStatefulWidget {
  const ContactEditorScreen({super.key, this.contact});
  final Contact? contact;
  @override
  ConsumerState<ContactEditorScreen> createState() => _ContactEditorScreenState();
}

class _ContactEditorScreenState extends ConsumerState<ContactEditorScreen> {
  final formKey = GlobalKey<FormState>();
  late final TextEditingController name;
  late final TextEditingController phone;
  late final TextEditingController dob;
  late final TextEditingController notes;
  bool optIn = true;
  bool birthday = true;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    name = TextEditingController(text: widget.contact?.name ?? '');
    phone = TextEditingController(text: widget.contact?.phone.replaceFirst('+91', '') ?? '');
    dob = TextEditingController(text: widget.contact?.dob ?? '');
    notes = TextEditingController(text: widget.contact?.notes ?? '');
    optIn = widget.contact?.optIn ?? true;
    birthday = widget.contact?.birthdayAutomationEnabled ?? true;
  }

  @override
  void dispose() {
    name.dispose(); phone.dispose(); dob.dispose(); notes.dispose();
    super.dispose();
  }

  String? _nameValidator(String? v) {
    final x = v?.trim() ?? '';
    if (x.isEmpty) return 'Full name is required';
    if (x.length < 2) return 'Enter at least 2 characters';
    if (!RegExp(r"^[a-zA-Z][a-zA-Z .'-]{1,79}$").hasMatch(x)) return 'Enter a valid name';
    return null;
  }

  String? _phoneValidator(String? v) {
    final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return 'Phone number is required';
    if (digits.length != 10) return 'Enter a valid 10-digit Indian mobile number';
    if (!RegExp(r'^[6-9]').hasMatch(digits)) return 'Indian mobile number must start with 6, 7, 8 or 9';
    return null;
  }

  Future<void> _pickDate() async {
    final initial = DateTime.tryParse(dob.text) ?? DateTime(1995, 1, 1);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      dob.text = '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    }
  }

  Future<void> _save() async {
    if (!formKey.currentState!.validate()) return;
    setState(() => saving = true);
    try {
      final digits = phone.text.replaceAll(RegExp(r'\D'), '');
      final payload = {
        'name': name.text.trim(),
        'phone': '+91$digits',
        'dob': dob.text.trim().isEmpty ? null : dob.text.trim(),
        'notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
        'optIn': optIn,
        'birthdayAutomationEnabled': birthday,
      };
      if (widget.contact == null) {
        await ref.read(apiClientProvider).post('/api/contacts', data: payload);
      } else {
        await ref.read(apiClientProvider).put('/api/contacts/${widget.contact!.id}', data: payload);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      setState(() => saving = false);
      if (mounted) showAppMessage(context, '$e', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.contact == null ? 'Add Contact' : 'Edit Contact')),
      body: Form(
        key: formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
          children: [
            Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Basic Information', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
              const SizedBox(height: 16),
              TextFormField(controller: name, textCapitalization: TextCapitalization.words, maxLength: 80, decoration: const InputDecoration(labelText: 'Full Name *', prefixIcon: Icon(Icons.person_outline)), validator: _nameValidator),
              const SizedBox(height: 12),
              TextFormField(
                controller: phone,
                keyboardType: TextInputType.phone,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
                decoration: const InputDecoration(labelText: 'Phone Number *', prefixText: '+91  ', prefixIcon: Icon(Icons.phone_outlined)),
                validator: _phoneValidator,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: dob,
                readOnly: true,
                onTap: _pickDate,
                decoration: InputDecoration(labelText: 'Date of Birth', prefixIcon: const Icon(Icons.calendar_month_outlined), suffixIcon: IconButton(onPressed: _pickDate, icon: const Icon(Icons.calendar_today_outlined))),
              ),
              const SizedBox(height: 12),
              TextFormField(controller: notes, minLines: 3, maxLines: 5, maxLength: 500, decoration: const InputDecoration(labelText: 'Notes (optional)', alignLabelWithHint: true, prefixIcon: Icon(Icons.notes_outlined))),
            ]))),
            const SizedBox(height: 14),
            Card(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6), child: Column(children: [
              SwitchListTile(title: const Text('WhatsApp Consent', style: TextStyle(fontWeight: FontWeight.w800)), subtitle: const Text('Contact has agreed to receive WhatsApp messages.'), value: optIn, onChanged: (v) => setState(() => optIn = v), activeThumbColor: BusinessColors.green),
              const Divider(height: 1),
              SwitchListTile(title: const Text('Birthday Automation', style: TextStyle(fontWeight: FontWeight.w800)), subtitle: const Text('Automatically include this contact in birthday wishes.'), value: birthday, onChanged: (v) => setState(() => birthday = v), activeThumbColor: BusinessColors.green),
            ]))),
            const SizedBox(height: 20),
            FilledButton(onPressed: saving ? null : _save, child: saving ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)) : Text(widget.contact == null ? 'Save Contact' : 'Save Changes')),
            const SizedBox(height: 10),
            OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ],
        ),
      ),
    );
  }
}

class ContactDetailsScreen extends StatelessWidget {
  const ContactDetailsScreen({super.key, required this.contact, required this.onEdit});
  final Contact contact;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Contact Details')),
        body: ListView(padding: const EdgeInsets.fromLTRB(18, 10, 18, 24), children: [
          Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(children: [
            CircleAvatar(radius: 44, backgroundColor: const Color(0xFFEAF2FF), child: Text(contact.name.isEmpty ? '?' : contact.name[0].toUpperCase(), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Color(0xFF2F80ED)))),
            const SizedBox(height: 12),
            Text(contact.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
            const SizedBox(height: 5),
            Text(contact.phone, style: const TextStyle(color: BusinessColors.muted)),
            const SizedBox(height: 16),
            SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: onEdit, icon: const Icon(Icons.edit_outlined), label: const Text('Edit Contact'))),
          ]))),
          const SizedBox(height: 14),
          Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Contact Information', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            _row(Icons.phone_outlined, 'Phone Number', contact.phone),
            if (contact.dob != null && contact.dob!.isNotEmpty) _row(Icons.calendar_month_outlined, 'Date of Birth', contact.dob!),
            _row(Icons.verified_outlined, 'WhatsApp Consent', contact.optIn ? 'Opted in' : 'Not opted in'),
            _row(Icons.cake_outlined, 'Birthday Automation', contact.birthdayAutomationEnabled ? 'Enabled' : 'Disabled'),
            if (contact.notes != null && contact.notes!.isNotEmpty) _row(Icons.notes_outlined, 'Notes', contact.notes!),
          ]))),
        ]),
      );

  static Widget _row(IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 20, color: BusinessColors.muted),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(fontSize: 12, color: BusinessColors.muted)),
            const SizedBox(height: 2),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w700, color: BusinessColors.ink)),
          ])),
        ]),
      );
}
