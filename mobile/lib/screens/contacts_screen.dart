import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import '../widgets/draft_exit_guard.dart';
import '../widgets/data_image.dart';
import 'device_contacts_screen.dart';
import 'groups_screen.dart';
import 'import_contacts_screen.dart';
import '../widgets/country_phone_field.dart';

class ContactsScreen extends ConsumerStatefulWidget {
  const ContactsScreen({super.key});

  @override
  ConsumerState<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends ConsumerState<ContactsScreen> {
  String query = '';
  int source = 1; // 0 Phone, 1 GreetSync, 2 Groups
  bool showAddActions = false;
  final Set<int> selectedContactIds = <int>{};
  final Set<int> selectedGroupIds = <int>{};

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 10),
          child: Column(
            children: [
              _titleRow(),
              if (ref.watch(editorDraftProvider('contact:new')).valueOrNull !=
                  null)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.edit_note_rounded),
                    title: const Text('Unfinished contact draft'),
                    subtitle: const Text(
                      'Saved on this device; contact has not been added.',
                    ),
                    trailing: TextButton(
                      onPressed: () => _openEditor(),
                      child: const Text('Continue'),
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              if (showAddActions) ...[
                _quickActions(),
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: () => _openEditor(),
                    icon: const Icon(Icons.person_add_alt_1_rounded),
                    label: const Text('Add contact manually'),
                  ),
                ),
                const SizedBox(height: 4),
              ],
              const SizedBox(height: 4),
              _sourceSelector(),
              const SizedBox(height: 12),
              TextField(
                key: ValueKey('contact-search-$source'),
                onChanged: (value) => setState(() => query = value),
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search_rounded),
                  hintText: source == 0
                      ? 'Search phone contacts'
                      : source == 1
                      ? 'Search GreetSync contacts'
                      : 'Search groups',
                  suffixIcon: query.isEmpty
                      ? null
                      : IconButton(
                          onPressed: () => setState(() => query = ''),
                          icon: const Icon(Icons.close_rounded),
                        ),
                ),
              ),
            ],
          ),
        ),
        Expanded(child: _content()),
      ],
    );
  }

  Widget _content() {
    if (source == 0) {
      return DeviceContactsPanel(searchQuery: query, showSearch: false);
    }
    if (source == 2) return _groupsContent();
    return _greetSyncContacts();
  }

  Widget _greetSyncContacts() {
    final async = ref.watch(contactsProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          ErrorState(error, onRetry: () => ref.invalidate(contactsProvider)),
      data: (items) {
        final q = query.toLowerCase().trim();
        final filtered = items
            .where(
              (contact) =>
                  q.isEmpty ||
                  contact.name.toLowerCase().contains(q) ||
                  contact.phone.contains(q) ||
                  (contact.email ?? '').toLowerCase().contains(q),
            )
            .toList();

        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(contactsProvider);
            ref.invalidate(contactGroupsProvider);
            await ref.read(contactsProvider.future);
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 90),
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'GreetSync Contacts',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: BusinessColors.ink,
                      ),
                    ),
                  ),
                  Text(
                    '${filtered.length}',
                    style: const TextStyle(
                      color: BusinessColors.muted,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (selectedContactIds.isNotEmpty) ...[
                _selectionBar(
                  '${selectedContactIds.length} contact(s) selected',
                  () => setState(() => selectedContactIds.clear()),
                  _deleteSelectedContacts,
                ),
                const SizedBox(height: 10),
              ],
              if (filtered.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(28),
                    child: Center(
                      child: Text('No contacts match your search.'),
                    ),
                  ),
                )
              else
                ...filtered.map(
                  (contact) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: InkWell(
                      onTap: () => selectedContactIds.isNotEmpty
                          ? setState(
                              () => selectedContactIds.contains(contact.id)
                                  ? selectedContactIds.remove(contact.id)
                                  : selectedContactIds.add(contact.id),
                            )
                          : _showDetails(contact),
                      onLongPress: () =>
                          setState(() => selectedContactIds.add(contact.id)),
                      borderRadius: BorderRadius.circular(20),
                      child: Ink(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: BusinessColors.line),
                        ),
                        child: Row(
                          children: [
                            if (selectedContactIds.isNotEmpty) ...[
                              Checkbox(
                                value: selectedContactIds.contains(contact.id),
                                onChanged: (v) => setState(
                                  () => v == true
                                      ? selectedContactIds.add(contact.id)
                                      : selectedContactIds.remove(contact.id),
                                ),
                              ),
                              const SizedBox(width: 4),
                            ],
                            DataImageAvatar(
                              data: contact.avatarData,
                              radius: 25,
                              fallbackText: contact.name.isEmpty
                                  ? '?'
                                  : contact.name[0].toUpperCase(),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    contact.name,
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w900,
                                      color: BusinessColors.ink,
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    contact.phone,
                                    style: const TextStyle(
                                      color: BusinessColors.muted,
                                    ),
                                  ),
                                  const SizedBox(height: 7),
                                  Wrap(
                                    spacing: 6,
                                    runSpacing: 5,
                                    children: [
                                      _MiniBadge(
                                        label: contact.optIn
                                            ? 'WhatsApp Opt-in'
                                            : 'No Consent',
                                        color: contact.optIn
                                            ? BusinessColors.green
                                            : Colors.orange,
                                      ),
                                      if (contact.dob != null &&
                                          contact.dob!.isNotEmpty)
                                        const _MiniBadge(
                                          label: 'Birthday',
                                          color: Color(0xFFE83E8C),
                                        )
                                      else
                                        const _MiniBadge(
                                          label: 'Add birth date',
                                          color: Colors.orange,
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            IconButton(
                              tooltip: 'Open WhatsApp chat',
                              onPressed: () =>
                                  _launchWhatsAppChat(context, contact.phone),
                              icon: const _WhatsAppIcon(),
                            ),
                            PopupMenuButton<String>(
                              color: Colors.white,
                              surfaceTintColor: Colors.white,
                              onSelected: (value) {
                                if (value == 'edit') _openEditor(contact);
                                if (value == 'delete') _delete(contact);
                              },
                              itemBuilder: (_) => const [
                                PopupMenuItem(
                                  value: 'edit',
                                  child: Text('Edit contact'),
                                ),
                                PopupMenuItem(
                                  value: 'delete',
                                  child: Text('Delete contact'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _groupsContent() {
    final async = ref.watch(contactGroupsProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ErrorState(
        error,
        onRetry: () => ref.invalidate(contactGroupsProvider),
      ),
      data: (groups) {
        final q = query.trim().toLowerCase();
        final filtered = groups
            .where(
              (group) =>
                  q.isEmpty ||
                  group.name.toLowerCase().contains(q) ||
                  (group.description ?? '').toLowerCase().contains(q),
            )
            .toList();
        return RefreshIndicator(
          onRefresh: () => ref.refresh(contactGroupsProvider.future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 90),
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Contact Groups',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: BusinessColors.ink,
                      ),
                    ),
                  ),
                  Text(
                    '${filtered.length}',
                    style: const TextStyle(
                      color: BusinessColors.muted,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (selectedGroupIds.isNotEmpty) ...[
                _selectionBar(
                  '${selectedGroupIds.length} group(s) selected',
                  () => setState(() => selectedGroupIds.clear()),
                  _deleteSelectedGroups,
                ),
                const SizedBox(height: 10),
              ],
              if (filtered.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(28),
                    child: Center(
                      child: Text('No groups found. Create your first group.'),
                    ),
                  ),
                )
              else
                ...filtered.map(
                  (group) => Card(
                    child: ListTile(
                      leading: const CircleAvatar(
                        child: Icon(Icons.groups_rounded),
                      ),
                      title: Text(
                        group.name,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      subtitle: Text(
                        '${group.memberCount} contact${group.memberCount == 1 ? '' : 's'}'
                        '${group.description?.isNotEmpty == true ? '\n${group.description}' : ''}',
                      ),
                      isThreeLine: group.description?.isNotEmpty == true,
                      trailing: selectedGroupIds.isNotEmpty
                          ? Checkbox(
                              value: selectedGroupIds.contains(group.id),
                              onChanged: (v) => setState(
                                () => v == true
                                    ? selectedGroupIds.add(group.id)
                                    : selectedGroupIds.remove(group.id),
                              ),
                            )
                          : const Icon(Icons.chevron_right_rounded),
                      onLongPress: () =>
                          setState(() => selectedGroupIds.add(group.id)),
                      onTap: () => selectedGroupIds.isNotEmpty
                          ? setState(
                              () => selectedGroupIds.contains(group.id)
                                  ? selectedGroupIds.remove(group.id)
                                  : selectedGroupIds.add(group.id),
                            )
                          : Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const GroupsScreen(),
                              ),
                            ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _titleRow() => Row(
    children: [
      const Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Contacts',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: BusinessColors.ink,
              ),
            ),
            SizedBox(height: 4),
            Text(
              'People, phone contacts and groups in one place.',
              style: TextStyle(color: BusinessColors.muted),
            ),
          ],
        ),
      ),
      FilledButton.icon(
        onPressed: () => setState(() => showAddActions = !showAddActions),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add'),
      ),
    ],
  );

  Widget _quickActions() => Row(
    children: [
      Expanded(
        child: _QuickAction(
          icon: Icons.upload_file_rounded,
          label: 'Import CSV/Excel',
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const ImportContactsScreen()),
          ),
        ),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: _QuickAction(
          icon: Icons.groups_rounded,
          label: 'Manage Groups',
          onTap: () => Navigator.of(
            context,
          ).push(MaterialPageRoute(builder: (_) => const GroupsScreen())),
        ),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: _QuickAction(
          icon: Icons.group_add_rounded,
          label: 'Create Group',
          onTap: () async {
            await GroupsScreen.editGroup(context, ref);
            ref.invalidate(contactGroupsProvider);
          },
        ),
      ),
    ],
  );

  Widget _sourceSelector() => SegmentedButton<int>(
    segments: const [
      ButtonSegment<int>(
        value: 0,
        icon: Icon(Icons.phone_android_outlined),
        label: Text('Phone Contacts'),
      ),
      ButtonSegment<int>(
        value: 1,
        icon: Icon(Icons.cloud_outlined),
        label: Text('GreetSync'),
      ),
      ButtonSegment<int>(
        value: 2,
        icon: Icon(Icons.groups_outlined),
        label: Text('Groups'),
      ),
    ],
    selected: {source},
    showSelectedIcon: false,
    onSelectionChanged: (value) => setState(() {
      source = value.first;
      query = '';
      selectedContactIds.clear();
      selectedGroupIds.clear();
    }),
  );

  Widget _selectionBar(
    String label,
    VoidCallback clear,
    Future<void> Function() remove,
  ) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: const Color(0xFFFFF4F4),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: const Color(0xFFFFC9C9)),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
        ),
        TextButton(onPressed: clear, child: const Text('Cancel')),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: Colors.red),
          onPressed: () => remove(),
          icon: const Icon(Icons.delete_outline_rounded),
          label: const Text('Delete'),
        ),
      ],
    ),
  );

  Future<void> _deleteSelectedContacts() async {
    if (selectedContactIds.isEmpty) return;
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete selected contacts?'),
        content: Text(
          'Delete ${selectedContactIds.length} selected contact(s)?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    final ids = selectedContactIds.toList();
    try {
      for (final id in ids) {
        await ref.read(apiClientProvider).delete('/api/contacts/$id');
      }
      if (!mounted) return;
      setState(() => selectedContactIds.clear());
      ref.invalidate(contactsProvider);
      showAppMessage(context, '${ids.length} contact(s) deleted.');
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    }
  }

  Future<void> _deleteSelectedGroups() async {
    if (selectedGroupIds.isEmpty) return;
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete selected groups?'),
        content: Text(
          'Delete ${selectedGroupIds.length} selected group(s)? Contacts themselves will not be deleted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    final ids = selectedGroupIds.toList();
    try {
      for (final id in ids) {
        await ref.read(apiClientProvider).delete('/api/contact-groups/$id');
      }
      if (!mounted) return;
      setState(() => selectedGroupIds.clear());
      ref.invalidate(contactGroupsProvider);
      showAppMessage(context, '${ids.length} group(s) deleted.');
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    }
  }

  Future<void> _openEditor([Contact? contact]) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => ContactEditorScreen(contact: contact)),
    );
    if (changed == true) ref.invalidate(contactsProvider);
  }

  Future<void> _showDetails(Contact contact) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ContactDetailsScreen(
          contact: contact,
          onEdit: () async {
            Navigator.pop(context);
            await _openEditor(contact);
          },
        ),
      ),
    );
  }

  Future<void> _delete(Contact contact) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete contact?'),
        content: Text('Delete ${contact.name}? This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await ref.read(apiClientProvider).delete('/api/contacts/${contact.id}');
      ref.invalidate(contactsProvider);
    } catch (error) {
      if (mounted) showAppMessage(context, '$error', error: true);
    }
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(14),
    child: Ink(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 11),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: BusinessColors.line),
      ),
      child: Column(
        children: [
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 5),
          Text(
            label,
            maxLines: 2,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800),
          ),
        ],
      ),
    ),
  );
}

class _MiniBadge extends StatelessWidget {
  const _MiniBadge({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: color.withOpacity(.09),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      label,
      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color),
    ),
  );
}

class ContactEditorScreen extends ConsumerStatefulWidget {
  const ContactEditorScreen({super.key, this.contact});
  final Contact? contact;

  @override
  ConsumerState<ContactEditorScreen> createState() =>
      _ContactEditorScreenState();
}

class _ContactEditorScreenState extends ConsumerState<ContactEditorScreen> {
  final exitGuard = GlobalKey<DraftExitGuardState>();
  bool draftLoading = true, completed = false;
  int phoneDraftVersion = 0;
  String initialFingerprint = '';
  String get draftKind =>
      widget.contact == null ? 'contact:new' : 'contact:${widget.contact!.id}';
  final formKey = GlobalKey<FormState>();
  final scrollController = ScrollController();
  final nameFocus = FocusNode();
  final emailFocus = FocusNode();

  late final TextEditingController name;
  late final TextEditingController phone;
  late final TextEditingController email;
  late final TextEditingController dob;
  late final TextEditingController notes;

  String fullPhone = '';
  bool optIn = true;
  bool birthday = true;
  bool saving = false;
  bool dirty = false;
  bool notesLimitReached = false;
  String? avatarData;
  final Set<int> selectedGroupIds = <int>{};

  @override
  void initState() {
    super.initState();
    name = TextEditingController(text: widget.contact?.name ?? '');
    phone = TextEditingController();
    email = TextEditingController(text: widget.contact?.email ?? '');
    fullPhone = widget.contact?.phone ?? '';
    dob = TextEditingController(text: widget.contact?.dob ?? '');
    notes = TextEditingController(text: widget.contact?.notes ?? '');
    avatarData = widget.contact?.avatarData;
    selectedGroupIds.addAll(widget.contact?.groupIds ?? const []);
    optIn = widget.contact?.optIn ?? true;
    birthday = widget.contact?.birthdayAutomationEnabled ?? true;

    for (final controller in [name, email, dob, notes]) {
      controller.addListener(_markDirty);
    }
    initialFingerprint = jsonEncode(_draftSnapshot());
    WidgetsBinding.instance.addPostFrameCallback((_) => _restoreDraft());
  }

  Map<String, dynamic> _draftSnapshot() => {
    'name': name.text,
    'phone': fullPhone,
    'email': email.text,
    'dob': dob.text,
    'notes': notes.text,
    'optIn': optIn,
    'birthday': birthday,
    'avatarData': avatarData,
    'groups': selectedGroupIds.toList()..sort(),
  };
  Future<void> _restoreDraft() async {
    try {
      final saved = await offerEditorDraft(
        context,
        ref.read(editorDraftStoreProvider),
        draftKind,
      );
      if (saved != null && mounted)
        setState(() {
          name.text = '${saved['name'] ?? ''}';
          fullPhone = '${saved['phone'] ?? ''}';
          email.text = '${saved['email'] ?? ''}';
          dob.text = '${saved['dob'] ?? ''}';
          notes.text = '${saved['notes'] ?? ''}';
          optIn = saved['optIn'] == true;
          birthday = saved['birthday'] == true;
          avatarData = saved['avatarData'] as String?;
          selectedGroupIds
            ..clear()
            ..addAll(
              (saved['groups'] as List? ?? const [])
                  .map((v) => int.tryParse('$v'))
                  .whereType<int>(),
            );
          phoneDraftVersion++;
        });
      if (mounted) initialFingerprint = jsonEncode(_draftSnapshot());
    } catch (error) {
      if (error is EditorDraftSelectionCancelled) {
        await exitGuard.currentState?.finish();
        return;
      }
      if (mounted)
        showAppMessage(
          context,
          'Could not restore contact draft: $error',
          error: true,
        );
    } finally {
      if (mounted) {
        ref.invalidate(editorDraftProvider(draftKind));
        setState(() => draftLoading = false);
      }
    }
  }

  Future<void> _stashDraft() async {
    await ref.read(editorDraftStoreProvider).save(draftKind, _draftSnapshot());
    ref.invalidate(editorDraftProvider(draftKind));
    initialFingerprint = jsonEncode(_draftSnapshot());
    if (mounted)
      showAppMessage(
        context,
        'Contact draft saved on this device. The contact has not been added or changed.',
      );
  }

  Future<void> _discardDraft() async {
    await ref.read(editorDraftStoreProvider).remove(draftKind);
    ref.invalidate(editorDraftProvider(draftKind));
  }

  void _markDirty() {
    if (!dirty && mounted) setState(() => dirty = true);
  }

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    email.dispose();
    dob.dispose();
    notes.dispose();
    nameFocus.dispose();
    emailFocus.dispose();
    scrollController.dispose();
    super.dispose();
  }

  String? _nameValidator(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'Full name is required';
    if (text.length < 2 || text.length > 80) return 'Enter a valid full name';
    if (!RegExp(
      r"^[\p{L}][\p{L}\p{M} .'-]{1,79}$",
      unicode: true,
    ).hasMatch(text)) {
      return 'Use letters, spaces, apostrophes, periods and hyphens only';
    }
    return null;
  }

  String? _emailValidator(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return null;
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(text)) {
      return 'Enter a valid email address';
    }
    return null;
  }

  Future<void> _pickAvatar() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['png', 'jpg', 'jpeg', 'webp'],
      withData: true,
    );
    if (result == null || result.files.single.bytes == null) return;
    final file = result.files.single;
    final bytes = file.bytes!;
    if (bytes.length > 600000) {
      if (mounted)
        showAppMessage(
          context,
          'Contact photo must be 600 KB or smaller.',
          error: true,
        );
      return;
    }
    final ext = (file.extension ?? 'jpeg').toLowerCase();
    final mime = ext == 'png'
        ? 'image/png'
        : ext == 'webp'
        ? 'image/webp'
        : 'image/jpeg';
    setState(() {
      avatarData = 'data:$mime;base64,${base64Encode(bytes)}';
      dirty = true;
    });
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
      dob.text =
          '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      dirty = true;
    }
  }

  Future<void> _cancel() async {
    if (await exitGuard.currentState?.confirmLeave() == true && mounted)
      await exitGuard.currentState?.finish();
  }

  Future<bool> _validateAndFocus() async {
    final nameError = _nameValidator(name.text);
    if (nameError != null) {
      formKey.currentState?.validate();
      await scrollController.animateTo(
        0,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
      nameFocus.requestFocus();
      if (mounted) showAppMessage(context, nameError, error: true);
      return false;
    }
    if (fullPhone.trim().isEmpty) {
      if (mounted)
        showAppMessage(context, 'Phone number is required.', error: true);
      return false;
    }
    final emailError = _emailValidator(email.text);
    if (emailError != null) {
      formKey.currentState?.validate();
      await scrollController.animateTo(
        120,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
      emailFocus.requestFocus();
      if (mounted) showAppMessage(context, emailError, error: true);
      return false;
    }
    if (notes.text.length > 500) {
      if (mounted)
        showAppMessage(
          context,
          'Maximum limit of 128 characters reached.',
          error: true,
        );
      return false;
    }
    return formKey.currentState?.validate() ?? false;
  }

  Future<void> _save() async {
    if (!await _validateAndFocus()) return;
    setState(() => saving = true);
    try {
      final payload = {
        'name': name.text.trim(),
        'phone': fullPhone,
        'email': email.text.trim().isEmpty ? null : email.text.trim(),
        'dob': dob.text.trim().isEmpty ? null : dob.text.trim(),
        'notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
        'optIn': optIn,
        'birthdayAutomationEnabled': birthday,
        'groupIds': selectedGroupIds.toList(),
        'avatarData': avatarData ?? '',
      };
      final response = widget.contact == null
          ? await ref
                .read(apiClientProvider)
                .post('/api/contacts', data: payload)
          : await ref
                .read(apiClientProvider)
                .put('/api/contacts/${widget.contact!.id}', data: payload);
      ref.invalidate(contactsProvider);
      ref.invalidate(contactGroupsProvider);
      ref.invalidate(automationsProvider);
      ref.invalidate(birthdaysProvider);
      if (mounted) {
        if (birthday &&
            dob.text.trim().isNotEmpty &&
            response is Map &&
            response['birthdaySchedule'] is Map) {
          final schedule = (response['birthdaySchedule'] as Map)
              .cast<String, dynamic>();
          final scheduled = schedule['scheduled'] == true;
          final message = '${schedule['message'] ?? ''}'.trim();
          showAppMessage(
            context,
            scheduled
                ? 'Contact saved. Birthday message scheduled automatically.'
                : 'Contact saved. ${message.isEmpty ? 'Birthday automation will schedule when an approved birthday template is available.' : message}',
            error: !scheduled,
          );
        }
        completed = true;
        try {
          await _discardDraft();
        } catch (_) {}
        if (mounted) await exitGuard.currentState?.finish(true);
      }
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        showAppMessage(context, '$error', error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final groups = ref.watch(contactGroupsProvider);
    final accent = Theme.of(context).colorScheme.primary;
    return DraftExitGuard(
      key: exitGuard,
      title: 'contact',
      hasChanges: () =>
          !completed && jsonEncode(_draftSnapshot()) != initialFingerprint,
      isBusy: () => draftLoading || saving,
      saveDraft: _stashDraft,
      discardDraft: _discardDraft,
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.contact == null ? 'Add Contact' : 'Edit Contact'),
        ),
        body: draftLoading
            ? const Center(child: CircularProgressIndicator())
            : Form(
                key: formKey,
                child: ListView(
                  controller: scrollController,
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Basic Information',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                                color: BusinessColors.ink,
                              ),
                            ),
                            const SizedBox(height: 16),
                            Row(
                              children: [
                                DataImageAvatar(
                                  data: avatarData,
                                  radius: 30,
                                  fallbackText: name.text.trim().isEmpty
                                      ? '?'
                                      : name.text.trim()[0].toUpperCase(),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: OutlinedButton.icon(
                                    onPressed: _pickAvatar,
                                    icon: const Icon(
                                      Icons.add_a_photo_outlined,
                                    ),
                                    label: Text(
                                      (avatarData ?? '').isEmpty
                                          ? 'Add contact photo'
                                          : 'Change photo',
                                    ),
                                  ),
                                ),
                                if ((avatarData ?? '').isNotEmpty)
                                  IconButton(
                                    tooltip: 'Remove photo',
                                    onPressed: () => setState(() {
                                      avatarData = '';
                                      dirty = true;
                                    }),
                                    icon: const Icon(
                                      Icons.delete_outline_rounded,
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 14),
                            TextFormField(
                              controller: name,
                              focusNode: nameFocus,
                              textCapitalization: TextCapitalization.words,
                              maxLength: 80,
                              decoration: const InputDecoration(
                                labelText: 'Full Name *',
                                prefixIcon: Icon(Icons.person_outline),
                              ),
                              validator: _nameValidator,
                            ),
                            const SizedBox(height: 12),
                            CountryPhoneField(
                              controller: phone,
                              key: ValueKey('contact-phone-$phoneDraftVersion'),
                              initialE164: fullPhone,
                              onChangedE164: (value) {
                                fullPhone = value;
                                dirty = true;
                              },
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: email,
                              focusNode: emailFocus,
                              keyboardType: TextInputType.emailAddress,
                              decoration: const InputDecoration(
                                labelText: 'Email (optional)',
                                prefixIcon: Icon(Icons.email_outlined),
                              ),
                              validator: _emailValidator,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: dob,
                              readOnly: true,
                              onTap: _pickDate,
                              decoration: InputDecoration(
                                labelText: 'Date of Birth',
                                prefixIcon: const Icon(
                                  Icons.calendar_month_outlined,
                                ),
                                suffixIcon: IconButton(
                                  onPressed: _pickDate,
                                  icon: const Icon(
                                    Icons.calendar_today_outlined,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: notes,
                              minLines: 3,
                              maxLines: 5,
                              maxLength: 128,
                              onChanged: (value) => setState(() {
                                dirty = true;
                                notesLimitReached = value.length >= 128;
                              }),
                              decoration: InputDecoration(
                                labelText: 'Notes (optional)',
                                alignLabelWithHint: true,
                                errorText: notesLimitReached
                                    ? 'Maximum limit of 128 characters reached'
                                    : null,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Groups',
                              style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              'Assign this contact to one or more existing groups.',
                              style: TextStyle(
                                fontSize: 12,
                                color: BusinessColors.muted,
                              ),
                            ),
                            const SizedBox(height: 10),
                            groups.when(
                              loading: () => const LinearProgressIndicator(),
                              error: (error, _) => Text(
                                'Unable to load groups: $error',
                                style: const TextStyle(color: Colors.redAccent),
                              ),
                              data: (items) => items.isEmpty
                                  ? const Text(
                                      'No groups yet. Create a group from the Contacts screen.',
                                      style: TextStyle(
                                        color: BusinessColors.muted,
                                      ),
                                    )
                                  : Wrap(
                                      spacing: 7,
                                      runSpacing: 7,
                                      children: items.map((group) {
                                        final selected = selectedGroupIds
                                            .contains(group.id);
                                        return FilterChip(
                                          selected: selected,
                                          label: Text(group.name),
                                          onSelected: (value) => setState(() {
                                            dirty = true;
                                            if (value) {
                                              selectedGroupIds.add(group.id);
                                            } else {
                                              selectedGroupIds.remove(group.id);
                                            }
                                          }),
                                        );
                                      }).toList(),
                                    ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        child: Column(
                          children: [
                            SwitchListTile(
                              title: const Text(
                                'WhatsApp Consent',
                                style: TextStyle(fontWeight: FontWeight.w800),
                              ),
                              subtitle: const Text(
                                'Contact has agreed to receive WhatsApp messages.',
                              ),
                              value: optIn,
                              activeThumbColor: Colors.white,
                              activeTrackColor: accent,
                              onChanged: (value) => setState(() {
                                optIn = value;
                                dirty = true;
                              }),
                            ),
                            const Divider(height: 1),
                            SwitchListTile(
                              title: const Text(
                                'Birthday Automation',
                                style: TextStyle(fontWeight: FontWeight.w800),
                              ),
                              subtitle: const Text(
                                'Automatically include this contact in birthday wishes.',
                              ),
                              value: birthday,
                              activeThumbColor: Colors.white,
                              activeTrackColor: accent,
                              onChanged: (value) => setState(() {
                                birthday = value;
                                dirty = true;
                              }),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: saving ? null : _save,
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
                              widget.contact == null
                                  ? 'Save Contact'
                                  : 'Save Changes',
                            ),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton(
                      onPressed: saving ? null : _cancel,
                      child: const Text('Cancel'),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class ContactDetailsScreen extends StatelessWidget {
  const ContactDetailsScreen({
    super.key,
    required this.contact,
    required this.onEdit,
  });
  final Contact contact;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Contact Details')),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                DataImageAvatar(
                  data: contact.avatarData,
                  radius: 44,
                  fallbackText: contact.name.isEmpty
                      ? '?'
                      : contact.name[0].toUpperCase(),
                  backgroundColor: const Color(0xFFEAF2FF),
                  foregroundColor: const Color(0xFF2F80ED),
                ),
                const SizedBox(height: 12),
                Text(
                  contact.name,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: BusinessColors.ink,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  contact.phone,
                  style: const TextStyle(color: BusinessColors.muted),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: onEdit,
                        icon: const Icon(Icons.edit_outlined),
                        label: const Text('Edit Contact'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () =>
                            _launchWhatsAppChat(context, contact.phone),
                        icon: const _WhatsAppIcon(),
                        label: const Text('WhatsApp'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Contact Information',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 12),
                _row(Icons.phone_outlined, 'Phone Number', contact.phone),
                if (contact.email != null && contact.email!.isNotEmpty)
                  _row(Icons.email_outlined, 'Email', contact.email!),
                _row(
                  Icons.calendar_month_outlined,
                  'Date of Birth',
                  contact.dob != null && contact.dob!.isNotEmpty
                      ? contact.dob!
                      : 'Add birth date',
                ),
                _row(
                  Icons.verified_outlined,
                  'WhatsApp Consent',
                  contact.optIn ? 'Opted in' : 'Not opted in',
                ),
                _row(
                  Icons.cake_outlined,
                  'Birthday Automation',
                  contact.birthdayAutomationEnabled ? 'Enabled' : 'Disabled',
                ),
                if (contact.notes != null && contact.notes!.isNotEmpty)
                  _row(Icons.notes_outlined, 'Notes', contact.notes!),
              ],
            ),
          ),
        ),
      ],
    ),
  );

  static Widget _row(IconData icon, String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: BusinessColors.muted),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 12,
                  color: BusinessColors.muted,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: BusinessColors.ink,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

/// Lightweight WhatsApp-style action icon built only with Flutter primitives.
/// This intentionally avoids font_awesome_flutter so it stays compatible with
/// Flutter SDKs where IconData is final.
class _WhatsAppIcon extends StatelessWidget {
  const _WhatsAppIcon();

  final double size = 22;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: Color(0xFF25D366),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Icon(Icons.call_rounded, color: Colors.white, size: size * 0.58),
    );
  }
}

Future<void> _launchWhatsAppChat(BuildContext context, String phone) async {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) {
    showAppMessage(context, 'No valid WhatsApp number found.', error: true);
    return;
  }
  final uri = Uri.parse('https://wa.me/$digits');
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted)
    showAppMessage(
      context,
      'Unable to open WhatsApp for this contact.',
      error: true,
    );
}
