import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import '../widgets/draft_exit_guard.dart';
import '../widgets/template_media_preview.dart';
import '../widgets/whatsapp_message_preview.dart';
import 'location_picker_screen.dart';

class CreateAutomationScreen extends ConsumerStatefulWidget {
  const CreateAutomationScreen({
    super.key,
    this.initialMode = 0,
    this.preferredTemplateId,
    this.preselectedContactIds = const [],
    this.initialSendNow = false,
    this.initialVariables = const {},
    this.reviewFailedMessage = false,
    this.retryOfAutomationId,
    this.duplicateAcknowledged = false,
  });

  /// 0 = Individual WhatsApp chat, 1 = Bulk scheduled-message flow.
  final int initialMode;
  final int? preferredTemplateId;
  final List<int> preselectedContactIds;
  final bool initialSendNow;
  final Map<String, String> initialVariables;
  final bool reviewFailedMessage;
  final int? retryOfAutomationId;
  final bool duplicateAcknowledged;

  @override
  ConsumerState<CreateAutomationScreen> createState() =>
      _CreateAutomationScreenState();
}

class _CreateAutomationScreenState
    extends ConsumerState<CreateAutomationScreen> {
  final exitGuard = GlobalKey<DraftExitGuardState>();
  bool draftLoading = true, completed = false;
  String initialFingerprint = '';
  String get draftKind => widget.retryOfAutomationId == null
      ? 'message:new'
      : 'message:retry:${widget.retryOfAutomationId}';
  int step = 0;
  final selectedContacts = <int>{};
  final selectedGroups = <int>{};
  final groupMembers = <int, Set<int>>{};
  final templateVariableValues = <String, String>{};
  int? templateId;
  DateTime when = DateTime.now().add(const Duration(minutes: 10));
  bool saving = false;
  int? loadingGroupId;
  int mode = 1;
  String individualQuery = '';
  String audienceQuery = '';
  String? headerMediaBase64;
  String? headerMediaMimeType;
  String? headerMediaFileName;
  String? headerMediaId;
  String? headerMediaLink;
  String? headerMediaUploadedAt;
  bool sendNow = false;
  String? locationLatitude, locationLongitude, locationTitle, locationAddress;
  final locationNameInput = TextEditingController();
  final locationAddressInput = TextEditingController();
  String requestId = 'send_${DateTime.now().microsecondsSinceEpoch}';

  @override
  void initState() {
    super.initState();
    mode = 1;
    selectedContacts.addAll(widget.preselectedContactIds);
    sendNow = widget.initialSendNow;
    if (sendNow) when = DateTime.now();
    templateId = widget.preferredTemplateId;
    final values = widget.initialVariables;
    templateVariableValues.addAll(
      Map.fromEntries(values.entries.where((e) => !e.key.startsWith('_'))),
    );
    headerMediaId = values['__header_media_id'];
    headerMediaLink = values['__header_media_link'];
    headerMediaUploadedAt = values['__header_media_uploaded_at'];
    headerMediaFileName = values['__header_media_filename'];
    locationLatitude = values['__header_location_latitude'];
    locationLongitude = values['__header_location_longitude'];
    locationTitle = values['__header_location_name'];
    locationAddress = values['__header_location_address'];
    locationNameInput.text = locationTitle ?? '';
    locationAddressInput.text = locationAddress ?? '';
    if (widget.reviewFailedMessage) step = 1;
    initialFingerprint = jsonEncode(_draftSnapshot());
    WidgetsBinding.instance.addPostFrameCallback((_) => _restoreDraft());
  }

  Map<String, dynamic> _draftSnapshot() => {
    'mode': mode,
    'step': step,
    'contacts': selectedContacts.toList()..sort(),
    'groups': selectedGroups.toList()..sort(),
    'groupMembers': {
      for (final e in groupMembers.entries)
        '${e.key}': e.value.toList()..sort(),
    },
    'templateId': templateId,
    'variables': templateVariableValues,
    'when': when.toUtc().toIso8601String(),
    'sendNow': sendNow,
    'requestId': requestId,
    'mediaBase64': headerMediaBase64,
    'mediaMimeType': headerMediaMimeType,
    'mediaFileName': headerMediaFileName,
    'mediaId': headerMediaId,
    'mediaLink': headerMediaLink,
    'mediaUploadedAt': headerMediaUploadedAt,
    'latitude': locationLatitude,
    'longitude': locationLongitude,
    'locationName': locationNameInput.text,
    'locationAddress': locationAddressInput.text,
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
          mode = int.tryParse('${saved['mode']}') == 0 ? 0 : 1;
          step = (int.tryParse('${saved['step']}') ?? 0).clamp(0, 3).toInt();
          selectedContacts
            ..clear()
            ..addAll(
              (saved['contacts'] as List? ?? const [])
                  .map((v) => int.tryParse('$v'))
                  .whereType<int>(),
            );
          selectedGroups
            ..clear()
            ..addAll(
              (saved['groups'] as List? ?? const [])
                  .map((v) => int.tryParse('$v'))
                  .whereType<int>(),
            );
          groupMembers.clear();
          final groups = saved['groupMembers'];
          if (groups is Map)
            for (final e in groups.entries) {
              final id = int.tryParse('${e.key}');
              if (id != null && e.value is List)
                groupMembers[id] = (e.value as List)
                    .map((v) => int.tryParse('$v'))
                    .whereType<int>()
                    .toSet();
            }
          templateId = int.tryParse('${saved['templateId']}');
          templateVariableValues.clear();
          final vars = saved['variables'];
          if (vars is Map)
            templateVariableValues.addAll(
              vars.map((k, v) => MapEntry('$k', '$v')),
            );
          when = DateTime.tryParse('${saved['when']}')?.toLocal() ?? when;
          sendNow = saved['sendNow'] == true;
          final id = '${saved['requestId'] ?? ''}';
          if (RegExp(r'^[A-Za-z0-9_-]{8,128}$').hasMatch(id)) requestId = id;
          headerMediaBase64 = saved['mediaBase64'] as String?;
          headerMediaMimeType = saved['mediaMimeType'] as String?;
          headerMediaFileName = saved['mediaFileName'] as String?;
          headerMediaId = saved['mediaId'] as String?;
          headerMediaLink = saved['mediaLink'] as String?;
          headerMediaUploadedAt = saved['mediaUploadedAt'] as String?;
          locationLatitude = saved['latitude'] as String?;
          locationLongitude = saved['longitude'] as String?;
          locationTitle = saved['locationName'] as String?;
          locationAddress = saved['locationAddress'] as String?;
          locationNameInput.text = locationTitle ?? '';
          locationAddressInput.text = locationAddress ?? '';
        });
      if (mounted) initialFingerprint = jsonEncode(_draftSnapshot());
    } catch (error) {
      if (error is EditorDraftSelectionCancelled) {
        await exitGuard.currentState?.finish();
        return;
      }
      if (mounted)
        showAppMessage(context, 'Could not restore draft: $error', error: true);
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
        'Message draft saved on this device. No message was sent or scheduled.',
      );
  }

  Future<void> _discardDraft() async {
    await ref.read(editorDraftStoreProvider).remove(draftKind);
    ref.invalidate(editorDraftProvider(draftKind));
  }

  @override
  void dispose() {
    locationNameInput.dispose();
    locationAddressInput.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final contacts = ref.watch(contactsProvider);
    final templates = ref.watch(templatesProvider);
    final groups = ref.watch(contactGroupsProvider);

    return DraftExitGuard(
      key: exitGuard,
      title: 'message',
      hasChanges: () =>
          !completed && jsonEncode(_draftSnapshot()) != initialFingerprint,
      isBusy: () => draftLoading || saving || loadingGroupId != null,
      saveDraft: _stashDraft,
      discardDraft: _discardDraft,
      child: Scaffold(
        appBar: AppBar(title: const Text('Send Message')),
        body: draftLoading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 8, 18, 10),
                    child: SegmentedButton<int>(
                      segments: const [
                        ButtonSegment<int>(
                          value: 0,
                          icon: Icon(Icons.person_outline_rounded),
                          label: Text('WhatsApp chat'),
                        ),
                        ButtonSegment<int>(
                          value: 1,
                          icon: Icon(Icons.groups_rounded),
                          label: Text('Template message'),
                        ),
                      ],
                      selected: {mode},
                      showSelectedIcon: false,
                      onSelectionChanged: (value) =>
                          setState(() => mode = value.first),
                    ),
                  ),
                  if (mode == 0)
                    Expanded(child: _individual(contacts))
                  else ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 2, 18, 12),
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
                                  onPressed: saving
                                      ? null
                                      : () => setState(() => step--),
                                  child: const Text('Back'),
                                ),
                              ),
                            if (step > 0) const SizedBox(width: 10),
                            Expanded(
                              child: FilledButton.icon(
                                onPressed: saving ? null : _next,
                                icon: saving
                                    ? const SizedBox.shrink()
                                    : const Icon(Icons.send_rounded),
                                label: saving
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
                                            ? '${sendNow ? 'Send' : 'Schedule'} ${selectedContacts.length} Message${selectedContacts.length == 1 ? '' : 's'}'
                                            : 'Next',
                                      ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
      ),
    );
  }

  Widget _individual(AsyncValue<List<Contact>> contactsAsync) {
    return contactsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          ErrorState(error, onRetry: () => ref.invalidate(contactsProvider)),
      data: (contacts) {
        final q = individualQuery.trim().toLowerCase();
        final filtered = contacts.where((contact) {
          return q.isEmpty ||
              contact.name.toLowerCase().contains(q) ||
              contact.phone.contains(q);
        }).toList();

        return RefreshIndicator(
          onRefresh: () => ref.refresh(contactsProvider.future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 6, 18, 24),
            children: [
              const Text(
                'Send an Individual Message',
                style: TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w900,
                  color: BusinessColors.ink,
                ),
              ),
              const SizedBox(height: 5),
              const Text(
                'Choose a GreetSync contact and open the WhatsApp chat directly.',
                style: TextStyle(color: BusinessColors.muted),
              ),
              const SizedBox(height: 14),
              TextField(
                onChanged: (value) => setState(() => individualQuery = value),
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search_rounded),
                  hintText: 'Search GreetSync contacts',
                ),
              ),
              const SizedBox(height: 12),
              if (filtered.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: Text('No GreetSync contacts found.')),
                  ),
                )
              else
                ...filtered.map(
                  (contact) => Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      leading: CircleAvatar(
                        backgroundColor: BusinessColors.greenSoft,
                        child: Text(
                          contact.name.isEmpty
                              ? '?'
                              : contact.name[0].toUpperCase(),
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            color: BusinessColors.greenDark,
                          ),
                        ),
                      ),
                      title: Text(
                        contact.name,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      subtitle: Text(contact.phone),
                      trailing: IconButton(
                        tooltip: 'Open WhatsApp chat',
                        onPressed: () => _openWhatsApp(contact.phone),
                        icon: const _WhatsAppActionIcon(),
                      ),
                      onTap: () => _openWhatsApp(contact.phone),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _openWhatsApp(String phone) async {
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) {
      showAppMessage(context, 'No valid WhatsApp number found.', error: true);
      return;
    }
    final opened = await launchUrl(
      Uri.parse('https://wa.me/$digits'),
      mode: LaunchMode.externalApplication,
    );
    if (!opened && mounted) {
      showAppMessage(context, 'Unable to open WhatsApp.', error: true);
    }
  }

  Widget _steps() {
    const labels = ['Audience', 'Message', 'Timing', 'Review'];
    const icons = [
      Icons.people_outline,
      Icons.chat_bubble_outline,
      Icons.schedule,
      Icons.fact_check_outlined,
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  'STEP ${step + 1} OF 4',
                  style: const TextStyle(
                    color: BusinessColors.green,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Spacer(),
                Text(
                  '${selectedContacts.length} selected',
                  style: const TextStyle(
                    color: BusinessColors.muted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: List.generate(
                4,
                (i) => Expanded(
                  child: InkWell(
                    onTap: !saving && i < step
                        ? () => setState(() => step = i)
                        : null,
                    child: Column(
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 180),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: i <= step
                                ? BusinessColors.greenSoft
                                : const Color(0xFFF1F4F8),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            i < step ? Icons.check : icons[i],
                            size: 21,
                            color: i <= step
                                ? BusinessColors.green
                                : BusinessColors.muted,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          labels[i],
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: i == step
                                ? FontWeight.w900
                                : FontWeight.w500,
                            color: i <= step
                                ? BusinessColors.ink
                                : BusinessColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: (step + 1) / 4,
                minHeight: 4,
                backgroundColor: BusinessColors.line,
              ),
            ),
          ],
        ),
      ),
    );
  }

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
        final audienceQ = audienceQuery.trim().toLowerCase();
        final visibleContacts = contacts
            .where(
              (c) =>
                  audienceQ.isEmpty ||
                  c.name.toLowerCase().contains(audienceQ) ||
                  c.phone.contains(audienceQ),
            )
            .toList();

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
                  (g) => _recipientTile(
                    name: g.name,
                    detail:
                        '${g.memberCount} contacts • Select the whole group',
                    icon: Icons.groups_rounded,
                    selected: selectedGroups.contains(g.id),
                    busy: loadingGroupId == g.id,
                    onChanged: (v) => _toggleGroup(g, v, contacts),
                  ),
                ),
                const SizedBox(height: 16),
                const Divider(),
                const SizedBox(height: 8),
              ],

              TextFormField(
                initialValue: audienceQuery,
                onChanged: (value) => setState(() => audienceQuery = value),
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search_rounded),
                  hintText: 'Search contacts by name or mobile number',
                ),
              ),
              const SizedBox(height: 12),
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
                      () => selectedContacts.addAll(
                        visibleContacts.map((e) => e.id),
                      ),
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
              if (visibleContacts.isEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      audienceQ.isEmpty
                          ? 'No opted-in contacts available.'
                          : 'No contacts match your search.',
                    ),
                  ),
                )
              else
                ...visibleContacts.map(
                  (c) => _recipientTile(
                    name: c.name,
                    detail: c.phone,
                    icon: Icons.person_outline_rounded,
                    selected: selectedContacts.contains(c.id),
                    onChanged: (v) => setState(
                      () => v
                          ? selectedContacts.add(c.id)
                          : selectedContacts.remove(c.id),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _recipientTile({
    required String name,
    required String detail,
    required IconData icon,
    required bool selected,
    required ValueChanged<bool> onChanged,
    bool busy = false,
  }) {
    final accent = Theme.of(context).colorScheme.primary;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: selected ? accent.withOpacity(.06) : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: selected ? accent.withOpacity(.5) : BusinessColors.line,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: busy ? null : () => onChanged(!selected),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: accent.withOpacity(.10),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: busy
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(icon, color: accent),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      detail,
                      style: const TextStyle(
                        color: BusinessColors.muted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Checkbox(
                value: selected,
                onChanged: busy ? null : (v) => onChanged(v == true),
              ),
            ],
          ),
        ),
      ),
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
          if (widget.reviewFailedMessage) ...[
            const Card(
              child: Padding(
                padding: EdgeInsets.all(14),
                child: Text(
                  'Send again: check the original recipient and saved values. This new attempt uses the currently approved template. Update missing location details or expired attachments before sending.',
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
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
                margin: const EdgeInsets.only(bottom: 12),
                color: templateId == t.id
                    ? Theme.of(context).colorScheme.primary.withOpacity(.06)
                    : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(
                    color: templateId == t.id
                        ? Theme.of(context).colorScheme.primary.withOpacity(.5)
                        : BusinessColors.line,
                  ),
                ),
                child: RadioListTile<int>(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  secondary: const Icon(Icons.chat_bubble_outline_rounded),
                  value: t.id,
                  groupValue: templateId,
                  onChanged: (v) => setState(() {
                    templateId = v;
                    templateVariableValues.clear();
                    headerMediaId = null;
                    headerMediaLink = null;
                    headerMediaUploadedAt = null;
                    locationLatitude = t.locationPreview?['latitude']
                        ?.toString();
                    locationLongitude = t.locationPreview?['longitude']
                        ?.toString();
                    locationTitle = t.locationPreview?['name']?.toString();
                    locationAddress = t.locationPreview?['address']?.toString();
                    locationNameInput.text = locationTitle ?? '';
                    locationAddressInput.text = locationAddress ?? '';
                    headerMediaBase64 = t.mediaPreview?['dataBase64']
                        ?.toString();
                    headerMediaMimeType = t.mediaPreview?['mimeType']
                        ?.toString();
                    headerMediaFileName = t.mediaPreview?['fileName']
                        ?.toString();
                  }),
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
          if (templateId != null) ..._mediaFields(list),
          if (templateId != null) ..._variableFields(list),
          if (templateId != null) ..._personalizedPreview(list),
        ],
      );
    },
  );

  MessageTemplate? _selectedTemplate(List<MessageTemplate> list) {
    for (final item in list) {
      if (item.id == templateId) return item;
    }
    return null;
  }

  void _applyStoredMediaPreview(MessageTemplate template) {
    if (!template.hasMediaHeader ||
        headerMediaBase64 != null ||
        headerMediaId != null ||
        headerMediaLink != null)
      return;
    final preview = template.mediaPreview;
    if (preview == null) return;
    final base64 = '${preview['dataBase64'] ?? ''}'.trim();
    final mime = '${preview['mimeType'] ?? ''}'.trim();
    if (base64.isEmpty || mime.isEmpty) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted ||
          templateId != template.id ||
          headerMediaBase64 != null ||
          headerMediaId != null ||
          headerMediaLink != null)
        return;
      setState(() {
        headerMediaBase64 = base64;
        headerMediaMimeType = mime;
        headerMediaFileName = '${preview['fileName'] ?? 'template-media'}';
      });
    });
  }

  List<Widget> _mediaFields(List<MessageTemplate> list) {
    final template = _selectedTemplate(list);
    if (template == null) return const [];
    if (template.hasMediaHeader) {
      _applyStoredMediaPreview(template);
      return [
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      template.headerFormat == 'IMAGE'
                          ? Icons.image_outlined
                          : template.headerFormat == 'VIDEO'
                          ? Icons.video_file_outlined
                          : Icons.description_outlined,
                      color: BusinessColors.green,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${template.headerFormat.toLowerCase()} header required',
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'Videos need H.264 video and AAC audio (if present). PDFs must be complete and unlocked. Meta requires the actual header media when this approved template is sent. The template review sample alone cannot be sent as a message.',
                  style: TextStyle(color: BusinessColors.muted, height: 1.35),
                ),
                const SizedBox(height: 10),
                if (template.headerFormat == 'DOCUMENT')
                  const Text(
                    'PDF only • up to 16 MB in GreetSync',
                    style: TextStyle(fontSize: 12, color: BusinessColors.muted),
                  ),
                _automationMediaPreview(template.headerFormat),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () => _pickAutomationMedia(template.headerFormat),
                  icon: const Icon(Icons.upload_file_rounded),
                  label: Text(
                    headerMediaBase64 == null
                        ? 'Choose ${template.headerFormat.toLowerCase()}'
                        : 'Change ${template.headerFormat.toLowerCase()}',
                  ),
                ),
              ],
            ),
          ),
        ),
      ];
    }
    if (template.hasLocationHeader) {
      if (locationLatitude == null && template.locationPreview != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted || templateId != template.id || locationLatitude != null)
            return;
          setState(() {
            locationLatitude = template.locationPreview?['latitude']
                ?.toString();
            locationLongitude = template.locationPreview?['longitude']
                ?.toString();
            locationTitle = template.locationPreview?['name']?.toString();
            locationAddress = template.locationPreview?['address']?.toString();
            locationNameInput.text = locationTitle ?? '';
            locationAddressInput.text = locationAddress ?? '';
          });
        });
      }
      return [
        const SizedBox(height: 14),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Location header',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 6),
                Text(
                  locationLatitude == null
                      ? 'Choose the location customers will receive.'
                      : '${locationTitle ?? 'Selected location'}\n$locationLatitude, $locationLongitude',
                ),
                const SizedBox(height: 10),
                TextFormField(
                  key: ValueKey('location-name:${template.id}'),
                  controller: locationNameInput,
                  onChanged: (v) => setState(() => locationTitle = v),
                  maxLength: 120,
                  decoration: const InputDecoration(
                    labelText: 'Shop / location name *',
                  ),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  key: ValueKey('location-address:${template.id}'),
                  controller: locationAddressInput,
                  onChanged: (v) => setState(() => locationAddress = v),
                  maxLines: 2,
                  maxLength: 300,
                  decoration: const InputDecoration(
                    labelText: 'Full street address *',
                    hintText: 'Building, road, area, city and PIN code',
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: () => _chooseMessageLocation(template),
                  icon: const Icon(Icons.map_outlined),
                  label: const Text('Choose on map'),
                ),
              ],
            ),
          ),
        ),
      ];
    }
    return const [];
  }

  Future<void> _chooseMessageLocation(MessageTemplate template) async {
    final result = await Navigator.push<Map<String, double>>(
      context,
      MaterialPageRoute(
        builder: (_) => LocationPickerScreen(
          latitude: double.tryParse(locationLatitude ?? ''),
          longitude: double.tryParse(locationLongitude ?? ''),
        ),
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      locationLatitude = '${result['latitude']}';
      locationLongitude = '${result['longitude']}';
    });
  }

  Map<String, String> _previewVariables(
    MessageTemplate template,
    Contact contact,
  ) {
    final values = <String, String>{};
    for (final r in template.variableRequirements) {
      values[_variableValueKey(r)] = _valueForRequirement(r, contact);
    }
    if (locationLatitude != null)
      values['__header_location_latitude'] = locationLatitude!;
    if (locationLongitude != null)
      values['__header_location_longitude'] = locationLongitude!;
    if (locationTitle != null)
      values['__header_location_name'] = locationTitle!;
    if (locationAddress != null)
      values['__header_location_address'] = locationAddress!;
    if (headerMediaId != null) values['__header_media_id'] = headerMediaId!;
    if (headerMediaLink != null)
      values['__header_media_link'] = headerMediaLink!;
    if (headerMediaFileName != null)
      values['__header_media_filename'] = headerMediaFileName!;
    return values;
  }

  Widget _automationMediaPreview(String type) {
    if (headerMediaBase64 == null && (headerMediaId ?? '').isNotEmpty) {
      return ref
          .watch(savedMediaPreviewProvider(headerMediaId!))
          .when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => Text(
              'Saved attachment: ${headerMediaFileName ?? type.toLowerCase()}. Choose a new file if the saved media has expired.',
            ),
            data: (data) => TemplateMediaPreview(
              type: type,
              dataBase64: '${data['dataBase64'] ?? ''}',
              fileName:
                  '${data['fileName'] ?? headerMediaFileName ?? 'attachment'}',
            ),
          );
    }
    return TemplateMediaPreview(
      type: type,
      dataBase64: headerMediaBase64,
      fileName: headerMediaFileName,
      url: headerMediaLink,
      height: 180,
    );
  }

  Future<void> _pickAutomationMedia(String type) async {
    final extensions = type == 'IMAGE'
        ? const ['jpg', 'jpeg', 'png']
        : type == 'VIDEO'
        ? const ['mp4', '3gp']
        : const ['pdf'];
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: extensions,
      withData: true,
      allowMultiple: false,
    );
    if (picked == null || picked.files.isEmpty) return;
    final file = picked.files.single;
    final bytes =
        file.bytes ??
        (file.path != null ? await File(file.path!).readAsBytes() : null);
    if (bytes == null || bytes.isEmpty) {
      if (mounted)
        showAppMessage(
          context,
          'Could not read the selected media file.',
          error: true,
        );
      return;
    }
    final maxBytes = type == 'IMAGE' ? 5 * 1024 * 1024 : 16 * 1024 * 1024;
    if (bytes.length > maxBytes) {
      if (mounted)
        showAppMessage(
          context,
          '${type.toLowerCase()} must be ${type == 'IMAGE' ? '5 MB' : '16 MB'} or smaller in GreetSync.',
          error: true,
        );
      return;
    }
    final ext = (file.extension ?? '').toLowerCase();
    final mime = type == 'IMAGE'
        ? (ext == 'png' ? 'image/png' : 'image/jpeg')
        : type == 'VIDEO'
        ? (ext == '3gp' ? 'video/3gpp' : 'video/mp4')
        : ext == 'pdf'
        ? 'application/pdf'
        : ext == 'doc'
        ? 'application/msword'
        : ext == 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : ext == 'xls'
        ? 'application/vnd.ms-excel'
        : ext == 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : ext == 'ppt'
        ? 'application/vnd.ms-powerpoint'
        : ext == 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'text/plain';
    if (!mounted) return;
    setState(() {
      headerMediaBase64 = base64Encode(bytes);
      headerMediaMimeType = mime;
      headerMediaFileName = file.name;
      headerMediaId = null;
      headerMediaLink = null;
      headerMediaUploadedAt = null;
    });
  }

  static String _variableValueKey(Map<String, String> requirement) {
    final section = (requirement['section'] ?? 'BODY').toUpperCase();
    final token = requirement['token'] ?? '';
    return section == 'HEADER' ? 'header_$token' : token;
  }

  static String _meaningLabel(String meaning) {
    switch (meaning.toUpperCase()) {
      case 'BUSINESS_NAME':
        return 'Shop / business name';
      case 'BUSINESS_ADDRESS':
        return 'Business address';
      case 'BUSINESS_DETAILS':
        return 'Business name & address';
      case 'BUSINESS_PHONE':
        return 'Business phone';
      case 'BUSINESS_EMAIL':
        return 'Business email';
      case 'CONTACT_NAME':
        return 'Recipient / contact name';
      case 'FIRST_NAME':
        return 'Recipient first name';
      case 'AGE':
        return 'Age calculated from birthday';
      case 'PHONE':
        return 'Recipient mobile number';
      case 'EMAIL':
        return 'Recipient email address';
      case 'BIRTHDAY_DATE':
        return 'Recipient birthday date';
      case 'SCHEDULED_DATE':
        return 'Scheduled date';
      case 'SCHEDULED_TIME':
        return 'Scheduled time';
      case 'SCHEDULED_DATE_TIME':
        return 'Scheduled date & time';
      case 'DATE_TIME':
        return 'Date / time';
      case 'ORDER_ID':
        return 'Order or reference ID';
      case 'AMOUNT':
        return 'Amount / price';
      case 'CODE':
        return 'Code / coupon';
      default:
        return 'Custom information';
    }
  }

  static const _automaticMeanings = <String>{
    'BUSINESS_NAME',
    'BUSINESS_ADDRESS',
    'BUSINESS_DETAILS',
    'BUSINESS_PHONE',
    'BUSINESS_EMAIL',
    'CONTACT_NAME',
    'FIRST_NAME',
    'AGE',
    'PHONE',
    'EMAIL',
    'BIRTHDAY_DATE',
    'SCHEDULED_DATE',
    'SCHEDULED_TIME',
    'SCHEDULED_DATE_TIME',
  };

  bool _isAutomaticRequirement(Map<String, String> requirement) =>
      _automaticMeanings.contains((requirement['meaning'] ?? '').toUpperCase());

  int? _ageFor(Contact contact) {
    final raw = (contact.dob ?? '').trim();
    final parts = raw.split('-');
    if (parts.length != 3) return null;
    final year = int.tryParse(parts[0]);
    final month = int.tryParse(parts[1]);
    final day = int.tryParse(parts[2]);
    if (year == null || month == null || day == null) return null;
    var age = when.year - year;
    if (when.month < month || (when.month == month && when.day < day)) age--;
    return age >= 0 ? age : null;
  }

  String _formatDob(Contact contact) {
    final raw = (contact.dob ?? '').trim();
    final parts = raw.split('-');
    if (parts.length != 3) return '';
    return '${parts[2]}-${parts[1]}-${parts[0]}';
  }

  String _automaticValue(String meaning, Contact contact) {
    final normalized = meaning.toUpperCase();
    switch (normalized) {
      case 'BUSINESS_NAME':
        return ref.read(authProvider).user?.businessName ?? '';
      case 'BUSINESS_ADDRESS':
        return ref.read(authProvider).user?.businessAddress ?? '';
      case 'BUSINESS_DETAILS':
        final user = ref.read(authProvider).user;
        return [
          user?.businessName ?? '',
          user?.businessAddress ?? '',
        ].where((v) => v.trim().isNotEmpty).join(', ');
      case 'BUSINESS_PHONE':
        return ref.read(authProvider).user?.mobile ?? '';
      case 'BUSINESS_EMAIL':
        return ref.read(authProvider).user?.email ?? '';
      case 'CONTACT_NAME':
        return contact.name.trim();
      case 'FIRST_NAME':
        return contact.name.trim().split(RegExp(r'\s+')).first;
      case 'AGE':
        return _ageFor(contact)?.toString() ?? '';
      case 'PHONE':
        return contact.phone.trim();
      case 'EMAIL':
        return (contact.email ?? '').trim();
      case 'BIRTHDAY_DATE':
        return _formatDob(contact);
      case 'SCHEDULED_DATE':
        return '${when.day.toString().padLeft(2, '0')}-${when.month.toString().padLeft(2, '0')}-${when.year}';
      case 'SCHEDULED_TIME':
        return '${when.hour.toString().padLeft(2, '0')}:${when.minute.toString().padLeft(2, '0')}';
      case 'SCHEDULED_DATE_TIME':
        return '${when.day.toString().padLeft(2, '0')}-${when.month.toString().padLeft(2, '0')}-${when.year} ${when.hour.toString().padLeft(2, '0')}:${when.minute.toString().padLeft(2, '0')}';
      default:
        return '';
    }
  }

  String _valueForRequirement(
    Map<String, String> requirement,
    Contact contact,
  ) {
    final meaning = (requirement['meaning'] ?? 'CUSTOM').toUpperCase();
    if (_automaticMeanings.contains(meaning)) {
      final value = _automaticValue(meaning, contact);
      return value.isNotEmpty ? value : 'Required value';
    }
    final key = _variableValueKey(requirement);
    final entered = (templateVariableValues[key] ?? '').trim();
    return entered.isNotEmpty ? entered : 'Required value';
  }

  List<Widget> _personalizedPreview(List<MessageTemplate> list) {
    final template = _selectedTemplate(list);
    if (template == null) return const [];
    final contacts =
        ref.read(contactsProvider).valueOrNull ?? const <Contact>[];
    final selected = contacts
        .where((c) => selectedContacts.contains(c.id))
        .take(3)
        .toList();
    return [
      const SizedBox(height: 14),
      const Text(
        'Customer previews',
        style: TextStyle(fontWeight: FontWeight.w900),
      ),
      const SizedBox(height: 5),
      const Text(
        'Real contact values replace the blanks. Each preview includes the selected attachment.',
        style: TextStyle(fontSize: 12, color: BusinessColors.muted),
      ),
      ...selected.map(
        (contact) => Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                contact.name,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              WhatsAppMessagePreview(
                components: template.components,
                variables: _previewVariables(template, contact),
                mediaBase64: headerMediaBase64,
                mediaName: headerMediaFileName,
              ),
            ],
          ),
        ),
      ),
    ];
  }

  List<Widget> _variableFields(List<MessageTemplate> list) {
    MessageTemplate? template;
    for (final item in list) {
      if (item.id == templateId) {
        template = item;
        break;
      }
    }
    if (template == null) return const [];
    final requirements = template.variableRequirements;
    if (requirements.isEmpty) return const [];

    return [
      const SizedBox(height: 14),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.data_object_rounded,
                    color: BusinessColors.green,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'This template requires ${requirements.length} variable value${requirements.length == 1 ? '' : 's'}',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 5),
              const Text(
                'Customer information comes from each contact. Shop name and business details come from your profile. Check the preview before sending.',
                style: TextStyle(color: BusinessColors.muted),
              ),
              const SizedBox(height: 10),
              ...requirements.map((requirement) {
                final section = (requirement['section'] ?? 'BODY')
                    .toUpperCase();
                final token = requirement['token'] ?? '';
                final meaning = requirement['meaning'] ?? 'CUSTOM';
                final auto = _isAutomaticRequirement(requirement);
                final key = _variableValueKey(requirement);
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(11),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF7F9FC),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE1E7EF)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$section  •  {{$token}}',
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        'Required information: ${_meaningLabel(meaning)}',
                        style: const TextStyle(color: BusinessColors.muted),
                      ),
                      const SizedBox(height: 8),
                      if (auto)
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.auto_awesome_rounded,
                              size: 18,
                              color: BusinessColors.green,
                            ),
                            const SizedBox(width: 7),
                            Expanded(
                              child: Text(
                                'Filled automatically: ${_meaningLabel(meaning)}.',
                              ),
                            ),
                          ],
                        )
                      else
                        TextFormField(
                          initialValue: templateVariableValues[key] ?? '',
                          key: ValueKey('${template!.id}:$key'),
                          onChanged: (v) =>
                              setState(() => templateVariableValues[key] = v),
                          decoration: InputDecoration(
                            labelText: 'Value for {{$token}} *',
                            hintText: _meaningLabel(meaning),
                          ),
                        ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ),
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
      SwitchListTile(
        title: const Text('Send now'),
        subtitle: const Text('Turn off to schedule for a later date and time.'),
        value: sendNow,
        onChanged: (value) => setState(() {
          sendNow = value;
          when = value
              ? DateTime.now()
              : DateTime.now().add(const Duration(minutes: 10));
        }),
      ),
      if (!sendNow)
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
          leading: SoftIcon(Icons.public_rounded, color: Color(0xFF7C4DFF)),
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

    final selectedContactRows = contacts
        .where((c) => selectedContacts.contains(c.id))
        .toList();
    final names = selectedContactRows.map((e) => e.name).toList();
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
                _row('Template', t?.displayTitle ?? ''),
                if (t != null && selectedContactRows.isNotEmpty)
                  _row(
                    'Preview',
                    _renderReviewPreview(t, selectedContactRows.first),
                  ),
                _row(
                  'Schedule',
                  sendNow
                      ? 'Send immediately'
                      : when.toLocal().toString().substring(0, 16),
                ),
                _row(
                  'Status after create',
                  sendNow ? 'Sent / Failed' : 'QUEUE',
                ),
              ],
            ),
          ),
        ),
        if (t != null) ..._personalizedPreview([t]),
      ],
    );
  }

  String _renderReviewPreview(MessageTemplate template, Contact contact) {
    var text = template.bodyText;
    for (final requirement in template.variableRequirements.where(
      (r) => (r['section'] ?? '').toUpperCase() == 'BODY',
    )) {
      final token = requirement['token'] ?? '';
      if (token.isEmpty) continue;
      text = text.replaceAll(
        RegExp('\\{\\{\\s*${RegExp.escape(token)}\\s*\\}\\}'),
        _valueForRequirement(requirement, contact),
      );
    }
    return text;
  }

  static Widget _row(String a, String b) => Padding(
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
      final ts =
          ref.read(templatesProvider).valueOrNull ?? const <MessageTemplate>[];
      MessageTemplate? t;
      for (final x in ts) {
        if (x.id == templateId) {
          t = x;
          break;
        }
      }
      if (t != null) {
        if (t.hasMediaHeader &&
            (headerMediaBase64 ?? '').isEmpty &&
            (headerMediaId ?? '').isEmpty &&
            (headerMediaLink ?? '').isEmpty) {
          showAppMessage(
            context,
            'This template requires a ${t.headerFormat.toLowerCase()} header. Select the media before continuing.',
            error: true,
          );
          return;
        }
        if (t.hasLocationHeader &&
            (locationLatitude == null ||
                locationLongitude == null ||
                (locationTitle ?? '').trim().isEmpty ||
                (locationAddress ?? '').trim().isEmpty)) {
          showAppMessage(
            context,
            'Choose the location and add its shop name and full address.',
            error: true,
          );
          return;
        }
        final contactRows =
            ref.read(contactsProvider).valueOrNull ?? const <Contact>[];
        final selectedRows = contactRows
            .where((c) => selectedContacts.contains(c.id))
            .toList();
        if (selectedRows.length != selectedContacts.length ||
            selectedRows.any((c) => !c.optIn)) {
          showAppMessage(
            context,
            'A selected contact is unavailable or no longer has WhatsApp consent. Return to Audience and choose eligible contacts.',
            error: true,
          );
          return;
        }
        for (final requirement in t.variableRequirements) {
          final meaning = (requirement['meaning'] ?? 'CUSTOM').toUpperCase();
          final key = _variableValueKey(requirement);
          if (_automaticMeanings.contains(meaning)) {
            for (final contact in selectedRows) {
              if (_automaticValue(meaning, contact).trim().isEmpty) {
                final token = requirement['token'] ?? key;
                showAppMessage(
                  context,
                  '${contact.name} is missing ${_meaningLabel(meaning).toLowerCase()} required for {{$token}}.',
                  error: true,
                );
                return;
              }
            }
            continue;
          }
          if ((templateVariableValues[key] ?? '').trim().isEmpty) {
            final token = requirement['token'] ?? key;
            showAppMessage(
              context,
              'Enter ${_meaningLabel(meaning)} for {{$token}}.',
              error: true,
            );
            return;
          }
        }
      }
    }
    if (step == 2 && !sendNow && !when.isAfter(DateTime.now())) {
      showAppMessage(context, 'Schedule must be in the future.', error: true);
      return;
    }
    if (step == 2 && !sendNow && templateId != null) {
      final ts =
          ref.read(templatesProvider).valueOrNull ?? const <MessageTemplate>[];
      final selected = _selectedTemplate(ts);
      if (selected?.hasMediaHeader == true &&
          when.difference(DateTime.now()).inDays >= 29) {
        showAppMessage(
          context,
          'Media-header templates can be scheduled up to 28 days ahead because WhatsApp uploaded media expires after about 30 days. Choose a nearer date.',
          error: true,
        );
        return;
      }
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
        for (final c in contacts) {
          if (c.id == id) return c.optIn;
        }
        return false;
      }).toList();
      final vars = <String, String>{};
      if (template.hasLocationHeader) {
        vars['__header_location_latitude'] = locationLatitude ?? '';
        vars['__header_location_longitude'] = locationLongitude ?? '';
        vars['__header_location_name'] = locationTitle ?? '';
        vars['__header_location_address'] = locationAddress ?? '';
      }
      if (template.hasMediaHeader) {
        if ((headerMediaId ?? '').isEmpty && (headerMediaLink ?? '').isEmpty) {
          if ((headerMediaBase64 ?? '').isEmpty ||
              (headerMediaMimeType ?? '').isEmpty) {
            throw Exception(
              'Select the ${template.headerFormat.toLowerCase()} required by this template.',
            );
          }
          final upload = await ref
              .read(apiClientProvider)
              .post(
                '/api/whatsapp/media/upload',
                data: {
                  'mediaType': template.headerFormat,
                  'fileName': headerMediaFileName ?? 'greetsync-media',
                  'mimeType': headerMediaMimeType,
                  'dataBase64': headerMediaBase64,
                },
              );
          final map = upload is Map ? upload : const {};
          final id = '${map['mediaId'] ?? ''}'.trim();
          if (id.isEmpty)
            throw Exception(
              'WhatsApp did not return a media id. Please choose the media again.',
            );
          headerMediaId = id;
          headerMediaUploadedAt =
              '${map['uploadedAt'] ?? DateTime.now().toUtc().toIso8601String()}';
        }
        vars['__header_media_type'] = template.headerFormat;
        if ((headerMediaId ?? '').isNotEmpty)
          vars['__header_media_id'] = headerMediaId!;
        else
          vars['__header_media_link'] = headerMediaLink!;
        if (headerMediaUploadedAt != null)
          vars['__header_media_uploaded_at'] = headerMediaUploadedAt!;
        if ((headerMediaFileName ?? '').trim().isNotEmpty)
          vars['__header_media_filename'] = headerMediaFileName!.trim();
      }
      for (final requirement in template.variableRequirements) {
        final key = _variableValueKey(requirement);
        if (_isAutomaticRequirement(requirement)) continue;
        final value = (templateVariableValues[key] ?? '').trim();
        if (value.isNotEmpty) vars[key] = value;
      }
      final result = await ref
          .read(apiClientProvider)
          .post(
            sendNow ? '/api/whatsapp/send-bulk' : '/api/automations',
            data: {
              'requestId': requestId,
              if (widget.retryOfAutomationId != null)
                'retryOfAutomationId': widget.retryOfAutomationId,
              if (widget.retryOfAutomationId != null)
                'duplicateAcknowledged': widget.duplicateAcknowledged,
              'contactIds': eligibleIds,
              'templateId': template.id,
              'variables': vars,
              'scheduledAt': when.toUtc().toIso8601String(),
              'timezone': 'Asia/Kolkata',
            },
          );
      final created = result is Map
          ? int.tryParse('${result['count'] ?? eligibleIds.length}') ??
                eligibleIds.length
          : eligibleIds.length;
      ref.invalidate(automationsProvider);
      ref.invalidate(dashboardProvider);
      if (mounted) {
        final failures = result is Map
            ? (result['results'] as List? ?? const [])
                  .whereType<Map>()
                  .where(
                    (row) =>
                        row['status'] == 'FAILED' || row['status'] == 'SKIPPED',
                  )
                  .toList()
            : const <Map>[];
        final failureNote = failures.isNotEmpty
            ? ' ${failures.first['error'] ?? 'Delivery failed.'}'
            : '';
        showAppMessage(
          context,
          sendNow && result is Map
              ? 'Queued ${result['queued'] ?? 0}, accepted ${result['accepted'] ?? 0}, confirmed sent ${result['sent'] ?? 0}, failed ${result['failed'] ?? 0}, skipped ${result['skipped'] ?? 0}. Sending continues on the server. Open Scheduled Messages for results.$failureNote'
              : '$created scheduled message${created == 1 ? '' : 's'} created',
          error: failures.isNotEmpty,
        );
        // Every recipient is recorded in Scheduled Messages, including failures.

        completed = true;
        try {
          await _discardDraft();
        } catch (_) {}
        if (mounted) await exitGuard.currentState?.finish(true);
      }
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}

class _WhatsAppActionIcon extends StatelessWidget {
  const _WhatsAppActionIcon();

  @override
  Widget build(BuildContext context) => Container(
    width: 32,
    height: 32,
    decoration: const BoxDecoration(
      color: Color(0xFF25D366),
      shape: BoxShape.circle,
    ),
    alignment: Alignment.center,
    child: const Icon(Icons.call_rounded, color: Colors.white, size: 18),
  );
}
