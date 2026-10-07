import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/ai_prompt_guide.dart';
import '../widgets/draft_exit_guard.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import '../widgets/template_media_preview.dart';
import 'create_automation_screen.dart';
import 'location_picker_screen.dart';

class TemplatesScreen extends ConsumerStatefulWidget {
  const TemplatesScreen({super.key});

  @override
  ConsumerState<TemplatesScreen> createState() => _TemplatesScreenState();
}

class _TemplatesScreenState extends ConsumerState<TemplatesScreen> {
  final searchController = TextEditingController();
  String query = '';
  String filter = 'ALL';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _sync(silent: true));
  }

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final templates = ref.watch(templatesProvider);
    final suggestions = ref.watch(templateSuggestionsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Message Templates')),
      body: RefreshIndicator(
        onRefresh: () async {
          setState(() {
            query = '';
            filter = 'ALL';
            searchController.clear();
          });
          await _sync(silent: true);
          ref.invalidate(templateSuggestionsProvider);
          await Future.wait([
            ref.read(templatesProvider.future),
            ref.read(templateSuggestionsProvider.future),
          ]);
        },
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 90),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Templates',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                          color: BusinessColors.ink,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Create, edit drafts, submit to Meta and use approved WhatsApp templates.',
                        style: TextStyle(color: BusinessColors.muted),
                      ),
                    ],
                  ),
                ),
                IconButton.filledTonal(
                  onPressed: () => _sync(),
                  icon: const Icon(Icons.sync_rounded),
                  tooltip: 'Sync from Meta',
                ),
                const SizedBox(width: 6),
                FilledButton.icon(
                  onPressed: () => _openCreate(),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Create'),
                ),
              ],
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: () => _openCreate(aiMode: true),
              icon: const Icon(Icons.auto_awesome_rounded),
              label: const Text('AI Template Generator'),
            ),
            const SizedBox(height: 12),
            _suggestionsSection(suggestions),
            const SizedBox(height: 16),
            templates.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (error, _) => ErrorState(
                error,
                onRetry: () => ref.invalidate(templatesProvider),
              ),
              data: _templateList,
            ),
          ],
        ),
      ),
    );
  }

  Widget _suggestionsSection(AsyncValue<List<Map<String, dynamic>>> async) {
    return async.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (rows) {
        if (rows.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.auto_awesome_rounded, color: Color(0xFFF59E0B)),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Suggested for upcoming festivals',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: BusinessColors.ink,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 5),
            const Text(
              'Suggestions are created by the GreetSync admin. You can personalize a copy before sending it to Meta for review.',
              style: TextStyle(color: BusinessColors.muted, fontSize: 12),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 194,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: rows.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (context, index) {
                  final row = rows[index];
                  final title = '${row['title'] ?? 'Template suggestion'}';
                  final body = '${row['body'] ?? ''}';
                  final festival = '${row['festival'] ?? ''}'.trim();
                  return SizedBox(
                    width: 292,
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const SoftIcon(
                                  Icons.celebration_rounded,
                                  color: Color(0xFFF59E0B),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    title,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 15,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            if (festival.isNotEmpty)
                              Text(
                                festival,
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFFB7791F),
                                ),
                              ),
                            const SizedBox(height: 5),
                            Expanded(
                              child: Text(
                                body,
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: BusinessColors.muted,
                                  height: 1.35,
                                ),
                              ),
                            ),
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton.icon(
                                onPressed: () => _openCreate(suggestion: row),
                                icon: const Icon(Icons.edit_note_rounded),
                                label: const Text('Use & edit'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _templateList(List<MessageTemplate> list) {
    final local = ref.watch(editorDraftProvider('template:new')).valueOrNull;
    final localCount = local == null ? 0 : 1;
    final q = query.trim().toLowerCase();
    final localVisible =
        local != null &&
        ['ALL', 'DRAFT'].contains(filter) &&
        (q.isEmpty ||
            '${local['name'] ?? 'Unfinished template'} ${local['body'] ?? ''} ${local['category'] ?? ''}'
                .toLowerCase()
                .contains(q));
    final items = list.where((template) {
      final status = _statusGroup(template.status);
      return (filter == 'ALL' || status == filter) &&
          (q.isEmpty ||
              template.displayTitle.toLowerCase().contains(q) ||
              template.name.toLowerCase().contains(q) ||
              template.category.toLowerCase().contains(q) ||
              template.bodyText.toLowerCase().contains(q));
    }).toList();

    int countStatus(String status) => list
        .where((template) => _statusGroup(template.status) == status)
        .length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                Theme.of(context).colorScheme.primary.withOpacity(.12),
                Theme.of(context).colorScheme.primary.withOpacity(.035),
              ],
            ),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: BusinessColors.line),
          ),
          child: Wrap(
            alignment: WrapAlignment.spaceAround,
            spacing: 8,
            runSpacing: 10,
            children: [
              _TemplateMetric(
                icon: Icons.description_rounded,
                label: 'All',
                value: '${list.length + localCount}',
              ),
              _TemplateMetric(
                icon: Icons.edit_note_rounded,
                label: 'Draft',
                value: '${countStatus('DRAFT') + localCount}',
              ),
              _TemplateMetric(
                icon: Icons.schedule_rounded,
                label: 'Processing',
                value: '${countStatus('PENDING')}',
              ),
              _TemplateMetric(
                icon: Icons.check_circle_rounded,
                label: 'Approved',
                value: '${countStatus('APPROVED')}',
              ),
              _TemplateMetric(
                icon: Icons.cancel_outlined,
                label: 'Rejected',
                value: '${countStatus('REJECTED')}',
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: searchController,
          onChanged: (value) => setState(() => query = value),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search_rounded),
            hintText: 'Search templates or category',
            suffixIcon: query.isEmpty
                ? null
                : IconButton(
                    onPressed: () {
                      searchController.clear();
                      setState(() => query = '');
                    },
                    icon: const Icon(Icons.close_rounded),
                  ),
          ),
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _chip('ALL', 'All'),
              _chip('DRAFT', 'Draft'),
              _chip('PENDING', 'Processing'),
              _chip('APPROVED', 'Approved'),
              _chip('REJECTED', 'Rejected'),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (localVisible)
          Card(
            child: ListTile(
              leading: const Icon(Icons.edit_note_rounded),
              title: Text(
                '${local['name'] ?? ''}'.isEmpty
                    ? 'Unfinished template'
                    : '${local['name']}',
              ),
              subtitle: const Text(
                'Draft • saved on this device; not submitted to Meta',
              ),
              trailing: TextButton(
                onPressed: () =>
                    _openCreate(aiMode: local['usingAiMode'] == true),
                child: const Text('Continue'),
              ),
            ),
          ),
        if (items.isEmpty && !localVisible)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(28),
              child: Center(child: Text('No templates found.')),
            ),
          )
        else
          ...items.map(
            (template) => Padding(
              padding: const EdgeInsets.only(bottom: 11),
              child: InkWell(
                onTap: () async {
                  final changed = await Navigator.push<bool>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => TemplateDetailsScreen(template: template),
                    ),
                  );
                  if (changed == true) ref.invalidate(templatesProvider);
                },
                borderRadius: BorderRadius.circular(20),
                child: Ink(
                  padding: const EdgeInsets.all(15),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: BusinessColors.line),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          SoftIcon(
                            _icon(template.category),
                            color: _color(template.category),
                          ),
                          const SizedBox(width: 11),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  template.displayTitle,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 16,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  '${template.category} • ${template.languageLabel}',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: BusinessColors.muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          _status(template.status),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF7F9FC),
                          borderRadius: BorderRadius.circular(13),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (template.headerText.isNotEmpty) ...[
                              Text(
                                template.headerText,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              const SizedBox(height: 5),
                            ],
                            Text(
                              template.bodyText.isEmpty
                                  ? 'No body content returned by Meta.'
                                  : template.bodyText,
                              maxLines: 4,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                height: 1.45,
                                color: BusinessColors.ink,
                              ),
                            ),
                            if (template.footerText.isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Text(
                                template.footerText,
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: BusinessColors.muted,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text(
                            '${template.variableCount} variable${template.variableCount == 1 ? '' : 's'}',
                            style: const TextStyle(
                              fontSize: 11,
                              color: BusinessColors.muted,
                            ),
                          ),
                          const Spacer(),
                          if (template.status.toUpperCase() == 'APPROVED')
                            TextButton.icon(
                              onPressed: () => Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => CreateAutomationScreen(
                                    initialMode: 1,
                                    preferredTemplateId: template.id,
                                  ),
                                ),
                              ),
                              icon: const Icon(Icons.send_rounded, size: 18),
                              label: const Text('Use Template'),
                            )
                          else if (_isEditable(template.status))
                            TextButton.icon(
                              onPressed: () => _openCreate(existing: template),
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              label: const Text('Edit'),
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
    );
  }

  Widget _chip(String value, String label) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: ChoiceChip(
      selected: filter == value,
      label: Text(label),
      onSelected: (_) {
        searchController.clear();
        setState(() {
          filter = value;
          query = '';
        });
      },
    ),
  );

  Future<void> _openCreate({
    Map<String, dynamic>? suggestion,
    MessageTemplate? existing,
    bool aiMode = false,
    bool duplicate = false,
  }) async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => CreateTemplateScreen(
          suggestion: suggestion,
          aiMode: aiMode,
          existing: existing,
          duplicate: duplicate,
        ),
      ),
    );
    if (!mounted) return;
    ref.invalidate(editorDraftProvider('template:new'));
    if (changed == true) {
      ref.invalidate(templatesProvider);
      ref.invalidate(dashboardProvider);
    }
  }

  Future<void> _sync({bool silent = false}) async {
    try {
      await ref.read(apiClientProvider).post('/api/whatsapp/templates/sync');
      ref.invalidate(templatesProvider);
      ref.invalidate(dashboardProvider);
      if (mounted && !silent)
        showAppMessage(context, 'Templates synced successfully.');
    } catch (error) {
      if (mounted && !silent) showAppMessage(context, '$error', error: true);
    }
  }

  static String _statusGroup(String status) {
    final value = status.toUpperCase();
    if (value.contains('PENDING') ||
        ['IN_REVIEW', 'PROCESSING'].contains(value))
      return 'PENDING';
    return value;
  }

  static bool _isEditable(String status) {
    final value = _statusGroup(status);
    return ['DRAFT', 'REJECTED', 'APPROVED', 'PAUSED'].contains(value);
  }

  static IconData _icon(String category) =>
      category.toUpperCase() == 'MARKETING'
      ? Icons.campaign_rounded
      : category.toUpperCase() == 'UTILITY'
      ? Icons.description_rounded
      : Icons.message_rounded;

  static Color _color(String category) => category.toUpperCase() == 'MARKETING'
      ? const Color(0xFFE83E8C)
      : category.toUpperCase() == 'UTILITY'
      ? const Color(0xFF2F80ED)
      : BusinessColors.green;

  static Widget _status(String status) {
    final value = _statusGroup(status);
    final color = value == 'APPROVED'
        ? BusinessColors.green
        : value == 'REJECTED'
        ? Colors.redAccent
        : value == 'DRAFT'
        ? const Color(0xFF64748B)
        : Colors.orange;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        value == 'PENDING' ? 'PROCESSING' : value,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _TemplateMetric extends StatelessWidget {
  const _TemplateMetric({
    required this.icon,
    required this.label,
    required this.value,
  });
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 58,
    child: Column(
      children: [
        Icon(icon, color: Theme.of(context).colorScheme.primary, size: 21),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
        ),
        Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 9, color: BusinessColors.muted),
        ),
      ],
    ),
  );
}

class TemplateDetailsScreen extends ConsumerWidget {
  const TemplateDetailsScreen({super.key, required this.template});
  final MessageTemplate template;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = _TemplatesScreenState._statusGroup(template.status);
    return Scaffold(
      appBar: AppBar(title: const Text('Template Details')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
                children: [
                  SoftIcon(
                    _TemplatesScreenState._icon(template.category),
                    color: _TemplatesScreenState._color(template.category),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          template.displayTitle,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          '${template.category} • ${template.languageLabel}',
                          style: const TextStyle(color: BusinessColors.muted),
                        ),
                      ],
                    ),
                  ),
                  _TemplatesScreenState._status(template.status),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          _previewCard(
            context,
            template.headerText,
            template.bodyText,
            template.footerText,
            template.buttons,
            mediaType: template.headerFormat,
            mediaBase64:
                '${template.mediaPreview?['dataBase64'] ?? ''}'.trim().isEmpty
                ? null
                : '${template.mediaPreview?['dataBase64']}',
            mediaName:
                '${template.mediaPreview?['fileName'] ?? ''}'.trim().isEmpty
                ? null
                : '${template.mediaPreview?['fileName']}',
            location: template.locationPreview,
            mediaUrl: template.mediaExampleUrl,
          ),
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  _info('Status', status),
                  _info('Category', template.category),
                  _info('Language', template.languageLabel),
                  _info('Variables', '${template.variableCount}'),
                  if (template.variableTokens.isNotEmpty)
                    _info(
                      'Variable fields',
                      template.variableTokens
                          .map((token) => '{{$token}}')
                          .join(', '),
                    ),
                  _info('Buttons', '${template.buttons.length}'),
                  _info('Meta template name', template.name),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (status == 'APPROVED') ...[
            FilledButton.icon(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => CreateAutomationScreen(
                    initialMode: 1,
                    preferredTemplateId: template.id,
                  ),
                ),
              ),
              icon: const Icon(Icons.send_rounded),
              label: const Text('Send to Multiple Contacts'),
            ),
            const SizedBox(height: 10),
            const Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  'Meta reviews content changes. Name and language stay fixed. Approved templates allow one edit per 24 hours and up to 10 edits in 30 days; Meta may apply additional restrictions.',
                ),
              ),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _openEditor(context, ref),
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Edit approved template'),
            ),
          ] else if (_TemplatesScreenState._isEditable(status)) ...[
            FilledButton.icon(
              onPressed: () => _openEditor(context, ref),
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Edit Template'),
            ),
            const SizedBox(height: 10),
          ] else
            const Card(
              child: Padding(
                padding: EdgeInsets.all(14),
                child: Text(
                  'This template is currently under Meta review. Editing is disabled until the review status changes.',
                ),
              ),
            ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
            onPressed: () => _deleteTemplate(context, ref),
            icon: const Icon(Icons.delete_outline_rounded),
            label: const Text('Delete Template'),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteTemplate(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete template?'),
        content: Text(
          template.status.toUpperCase() == 'APPROVED'
              ? 'This approved template will also be deleted from the connected Meta WhatsApp Business Account. Existing scheduled messages that depend on it may no longer send.'
              : 'This template will be removed from GreetSync. If it already exists in Meta, GreetSync will also request deletion there.',
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
    if (confirmed != true || !context.mounted) return;
    try {
      await ref
          .read(apiClientProvider)
          .delete('/api/whatsapp/templates/${template.id}');
      ref.invalidate(templatesProvider);
      ref.invalidate(dashboardProvider);
      if (context.mounted) {
        showAppMessage(context, 'Template deleted.');
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (context.mounted) showAppMessage(context, '$e', error: true);
    }
  }

  Future<void> _openEditor(
    BuildContext context,
    WidgetRef ref, {
    bool duplicate = false,
  }) async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) =>
            CreateTemplateScreen(existing: template, duplicate: duplicate),
      ),
    );
    if (changed == true) {
      ref.invalidate(templatesProvider);
      if (context.mounted) Navigator.pop(context, true);
    }
  }

  static Widget _info(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(color: BusinessColors.muted),
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
      ],
    ),
  );
}

class CreateTemplateScreen extends ConsumerStatefulWidget {
  const CreateTemplateScreen({
    super.key,
    this.suggestion,
    this.existing,
    this.duplicate = false,
    this.aiMode = false,
  });
  final bool aiMode;
  final Map<String, dynamic>? suggestion;
  final MessageTemplate? existing;
  final bool duplicate;

  @override
  ConsumerState<CreateTemplateScreen> createState() =>
      _CreateTemplateScreenState();
}

class _CreateTemplateScreenState extends ConsumerState<CreateTemplateScreen> {
  final form = GlobalKey<FormState>();
  final aiPrompt = TextEditingController();
  final aiChat = <Map<String, String>>[];
  bool aiGenerating = false;
  bool aiHasDraft = false;
  final exitGuard = GlobalKey<DraftExitGuardState>();
  final contentKey = GlobalKey();
  final guideFields = {
    for (final key in const ['campaignTitle', 'offer', 'callToAction', 'date'])
      key: TextEditingController(),
  };
  String aiPurpose = 'BIRTHDAY',
      aiTone = 'Professional',
      aiRecipientType = 'Customer',
      aiLanguageStyle = 'STANDARD',
      aiMediaPreference = 'AUTO';
  bool draftLoading = true, completed = false, aiEditing = false;
  late bool usingAiMode;
  String initialFingerprint = '';
  String get draftKind =>
      isEditing ? 'template:${widget.existing!.id}' : 'template:new';
  String? aiError;
  bool validatingForApproval = true;
  late final TextEditingController name;
  late final TextEditingController header;
  late final TextEditingController body;
  late final TextEditingController footer;
  late final TextEditingController mediaHandle;
  late final TextEditingController locationLatitude;
  late final TextEditingController locationLongitude;
  late final TextEditingController locationName;
  late final TextEditingController locationAddress;
  final Map<String, TextEditingController> variableSamples = {};
  final Map<String, String> variableMeanings = {};
  String category = 'MARKETING';
  String language = 'en_US';
  String variableType = 'NUMBER';
  String mediaSample = 'NONE';
  String templateMode = 'DEFAULT';
  String? mediaFileName;
  String? mediaMimeType;
  String? mediaBase64;
  late bool setupComplete;
  bool saving = false;
  bool uploadingMedia = false;
  bool reviewing = false;
  int? savedDraftId;
  bool get metaIdentityLocked =>
      isEditing && (widget.existing?.metaTemplateId ?? '').isNotEmpty;
  final List<_TemplateButtonDraft> buttons = [];

  @override
  void initState() {
    super.initState();
    usingAiMode = widget.aiMode;
    final existing = widget.existing;
    setupComplete =
        existing != null ||
        widget.duplicate ||
        widget.suggestion != null ||
        usingAiMode;
    final suggestion = widget.suggestion ?? const <String, dynamic>{};
    final initialName = existing != null
        ? '${existing.displayTitle}${widget.duplicate ? ' Copy' : ''}'
        : '${suggestion['templateName'] ?? suggestion['template_name'] ?? suggestion['title'] ?? ''}';
    name = TextEditingController(text: initialName);
    header = TextEditingController(
      text: existing?.headerText ?? '${suggestion['header'] ?? ''}',
    );
    body = TextEditingController(
      text: existing?.bodyText ?? '${suggestion['body'] ?? ''}',
    );
    footer = TextEditingController(
      text: existing?.footerText ?? '${suggestion['footer'] ?? ''}',
    );
    mediaHandle = TextEditingController();
    locationLatitude = TextEditingController();
    locationLongitude = TextEditingController();
    locationName = TextEditingController();
    locationAddress = TextEditingController();
    category = existing?.category ?? '${suggestion['category'] ?? 'MARKETING'}';
    language = existing?.language ?? '${suggestion['language'] ?? 'en_US'}';
    if (!isEditing && !['en_US', 'hi', 'mr'].contains(language))
      language = 'en_US';

    if (existing != null) {
      _hydrateExistingComponentMetadata(existing);
    }
    final rawButtons = existing?.buttons ?? suggestion['buttons'];
    if (rawButtons is List) {
      for (final raw in rawButtons.whereType<Map>()) {
        buttons.add(_TemplateButtonDraft.fromMap(raw.cast<String, dynamic>()));
      }
    }
    if (buttons.any((b) => b.type == 'FLOW')) templateMode = 'FLOW';
    if ([
      ..._tokens(header.text),
      ..._tokens(body.text),
    ].any((t) => int.tryParse(t) == null))
      variableType = 'NAME';
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(_ensureVariableEditors);
      initialFingerprint = jsonEncode(_draftSnapshot());
      _restoreDraft();
    });
  }

  void _hydrateExistingComponentMetadata(MessageTemplate existing) {
    for (final raw in existing.components.whereType<Map>()) {
      final c = raw.cast<dynamic, dynamic>();
      final type = '${c['type'] ?? ''}'.toUpperCase();
      if (type == 'HEADER') {
        final format = '${c['format'] ?? 'TEXT'}'.toUpperCase();
        if (format != 'TEXT' && format.isNotEmpty) mediaSample = format;
        final ex = c['example'];
        if (ex is Map) {
          final handles = ex['header_handle'];
          if (handles is List && handles.isNotEmpty)
            mediaHandle.text = '${handles.first}';
          final samples = ex['header_text'];
          if (samples is List && samples.isNotEmpty) {
            final tokens = _tokens(existing.headerText);
            for (var i = 0; i < tokens.length && i < samples.length; i++) {
              _sampleController('HEADER', tokens[i]).text = '${samples[i]}';
            }
          }
        }
        final named = c['example'] is Map
            ? c['example']['header_text_named_params']
            : null;
        if (named is List)
          for (final sample in named.whereType<Map>()) {
            _sampleController('HEADER', '${sample['param_name']}').text =
                '${sample['example'] ?? ''}';
          }
        final meanings = c['greetsync_variable_meanings'];
        if (meanings is Map) {
          for (final entry in meanings.entries)
            variableMeanings['HEADER:${entry.key}'] = '${entry.value}';
        }
        final loc = c['greetsync_location'];
        if (loc is Map) {
          locationLatitude.text = '${loc['latitude'] ?? ''}';
          locationLongitude.text = '${loc['longitude'] ?? ''}';
          locationName.text = '${loc['name'] ?? ''}';
          locationAddress.text = '${loc['address'] ?? ''}';
        }
        final mediaPreview = c['greetsync_media_preview'];
        if (mediaPreview is Map) {
          mediaBase64 = '${mediaPreview['dataBase64'] ?? ''}'.trim();
          mediaMimeType = '${mediaPreview['mimeType'] ?? ''}'.trim();
          mediaFileName = '${mediaPreview['fileName'] ?? ''}'.trim();
          if (mediaBase64!.isEmpty) mediaBase64 = null;
          if ((mediaMimeType ?? '').isEmpty) mediaMimeType = null;
          if ((mediaFileName ?? '').isEmpty) mediaFileName = null;
        }
      }
      if (type == 'BODY') {
        final ex = c['example'];
        if (ex is Map) {
          final all = ex['body_text'];
          final samples = all is List && all.isNotEmpty && all.first is List
              ? all.first as List
              : const [];
          final tokens = _tokens(existing.bodyText);
          for (var i = 0; i < tokens.length && i < samples.length; i++) {
            _sampleController('BODY', tokens[i]).text = '${samples[i]}';
          }
        }
        final named = c['example'] is Map
            ? c['example']['body_text_named_params']
            : null;
        if (named is List)
          for (final sample in named.whereType<Map>()) {
            _sampleController('BODY', '${sample['param_name']}').text =
                '${sample['example'] ?? ''}';
          }
        final meanings = c['greetsync_variable_meanings'];
        if (meanings is Map) {
          for (final entry in meanings.entries)
            variableMeanings['BODY:${entry.key}'] = '${entry.value}';
        }
      }
    }
  }

  @override
  void dispose() {
    aiPrompt.dispose();
    for (final controller in guideFields.values) controller.dispose();
    name.dispose();
    header.dispose();
    body.dispose();
    footer.dispose();
    mediaHandle.dispose();
    locationLatitude.dispose();
    locationLongitude.dispose();
    locationName.dispose();
    locationAddress.dispose();
    for (final controller in variableSamples.values) controller.dispose();
    for (final button in buttons) button.dispose();
    super.dispose();
  }

  Map<String, dynamic> _guide() => {
    'purpose': AiPromptGuide.purposeCode(aiPurpose),
    'purposeLabel': AiPromptGuide.purposeLabel(aiPurpose),
    'tone': aiTone,
    'recipientType': aiRecipientType,
    'languageStyle': aiLanguageStyle,
    'mediaPreference': aiMediaPreference,
    if (AiPromptGuide.purposeCode(aiPurpose) != 'BIRTHDAY') ...{
      for (final key in ['campaignTitle', 'offer', 'callToAction', 'date'])
        key: guideFields[key]!.text,
    },
  };
  Widget _guideField(String key, String label, int limit) => Padding(
    padding: const EdgeInsets.only(top: 10),
    child: TextField(
      controller: guideFields[key],
      maxLength: limit,
      decoration: InputDecoration(labelText: label),
    ),
  );
  Widget _dynamicAiOption({
    required String label,
    required String value,
    required List<String> suggestions,
    required ValueChanged<String> onChanged,
  }) => Autocomplete<String>(
    initialValue: TextEditingValue(text: value),
    optionsBuilder: (input) => suggestions.where(
      (option) =>
          input.text.trim().isEmpty ||
          option.toLowerCase().contains(input.text.trim().toLowerCase()),
    ),
    onSelected: onChanged,
    fieldViewBuilder: (context, controller, focusNode, onSubmitted) =>
        TextField(
          controller: controller,
          focusNode: focusNode,
          maxLength: 120,
          decoration: InputDecoration(
            labelText: label,
            helperText: 'Type your own or choose a suggestion',
          ),
          onChanged: onChanged,
          onSubmitted: (_) => onSubmitted(),
        ),
    optionsViewBuilder: (context, onSelected, options) => Align(
      alignment: Alignment.topLeft,
      child: Material(
        elevation: 4,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: MediaQuery.sizeOf(context).width - 64,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 210),
            child: ListView(
              padding: EdgeInsets.zero,
              shrinkWrap: true,
              children: options
                  .map(
                    (option) => ListTile(
                      title: Text(option),
                      onTap: () => onSelected(option),
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
      ),
    ),
  );

  Widget _aiChatPanel() {
    final user = ref.watch(authProvider).user;
    final business = user?.businessName.trim().isNotEmpty == true
        ? user!.businessName.trim()
        : user?.name.trim().isNotEmpty == true
        ? user!.name.trim()
        : 'Your business';
    return _sectionCard(
      title: 'Create with AI',
      subtitle:
          'Choose a purpose, add your details and generate a reusable WhatsApp template for your business.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _dynamicAiOption(
            label: 'Template purpose',
            value: AiPromptGuide.purposeLabel(aiPurpose),
            suggestions: AiPromptGuide.purposes.values.toList(),
            onChanged: (value) => setState(() => aiPurpose = value),
          ),
          const SizedBox(height: 10),
          _dropdown<String>(
            label: 'Message language',
            value: aiLanguageStyle == 'BILINGUAL'
                ? '$language-bilingual'
                : language,
            items: const {
              'en_US': 'English',
              'hi': 'Hindi',
              'mr': 'Marathi',
              'mr-bilingual': 'English + Marathi',
              'hi-bilingual': 'English + Hindi',
            },
            onChanged: (value) => setState(() {
              final chosen = value ?? 'en_US';
              aiLanguageStyle = chosen.endsWith('-bilingual')
                  ? 'BILINGUAL'
                  : 'STANDARD';
              language = chosen.replaceAll('-bilingual', '');
            }),
          ),
          if (aiLanguageStyle == 'BILINGUAL')
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text(
                'Bilingual writing uses the selected Marathi or Hindi template language when submitted to Meta.',
                style: TextStyle(fontSize: 11, color: BusinessColors.muted),
              ),
            ),
          const SizedBox(height: 10),
          _dynamicAiOption(
            label: 'Tone',
            value: aiTone,
            suggestions: AiPromptGuide.tones,
            onChanged: (value) => setState(() => aiTone = value),
          ),
          const SizedBox(height: 10),
          _dynamicAiOption(
            label: 'Audience',
            value: aiRecipientType,
            suggestions: AiPromptGuide.recipientTypes,
            onChanged: (value) => setState(() => aiRecipientType = value),
          ),
          if (AiPromptGuide.purposeCode(aiPurpose) != 'BIRTHDAY') ...[
            _guideField(
              'campaignTitle',
              AiPromptGuide.purposeCode(aiPurpose) == 'REMINDER'
                  ? 'Appointment / order / request'
                  : 'Campaign / festival / message goal',
              120,
            ),
            _guideField(
              'offer',
              'Offer or benefit (optional — only supplied facts)',
              180,
            ),
            _guideField('date', 'Relevant date / deadline (optional)', 100),
            _guideField(
              'callToAction',
              'What should the customer do? (optional)',
              140,
            ),
          ],
          const SizedBox(height: 10),
          _dropdown<String>(
            label: 'Attachment',
            value: aiMediaPreference,
            items: const {
              'AUTO': 'AI suggests',
              'NONE': 'Text only',
              'IMAGE': 'Image',
              'VIDEO': 'Video',
              'DOCUMENT': 'PDF document',
              'LOCATION': 'Location',
            },
            onChanged: (value) =>
                setState(() => aiMediaPreference = value ?? aiMediaPreference),
          ),
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: const Text(
              'Example prompt',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  AiPromptGuide.example(aiPurpose, business),
                  style: const TextStyle(fontSize: 12, height: 1.4),
                ),
              ),
            ],
          ),
          if (aiChat.isNotEmpty)
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 160),
              child: ListView(
                shrinkWrap: true,
                children: aiChat
                    .where((m) => m['role'] == 'assistant')
                    .map(
                      (m) => Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F4F7),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(m['text'] ?? ''),
                      ),
                    )
                    .toList(),
              ),
            ),
          TextField(
            controller: aiPrompt,
            enabled: !aiGenerating && !saving,
            minLines: 2,
            maxLines: 4,
            maxLength: 1200,
            decoration: InputDecoration(
              labelText: aiHasDraft
                  ? 'Small change note (optional)'
                  : 'Additional instructions (optional)',
              hintText: aiHasDraft
                  ? 'Example: make it warmer, shorten it, or add our supplied offer.'
                  : 'Example: encourage the student’s confidence and learning.',
            ),
          ),
          FilledButton.icon(
            onPressed: aiGenerating || saving || reviewing || draftLoading
                ? null
                : _generateAiTemplate,
            icon: aiGenerating
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.auto_awesome_rounded),
            label: Text(
              aiGenerating
                  ? 'Generating…'
                  : aiHasDraft
                  ? 'Generate updated template'
                  : 'Generate Template',
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Want a change? Add a short note and generate an updated version, or edit the result below. You can submit it directly after reviewing the preview. Birthday messages use 60–120 words within Meta’s 1,024-character limit. Upload real media or choose the map point before approval.',
            style: TextStyle(
              fontSize: 12,
              color: BusinessColors.muted,
              height: 1.4,
            ),
          ),
          if (aiError != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF1F1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  aiError!,
                  style: const TextStyle(color: Color(0xFF8F1D2C), height: 1.4),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Map<String, dynamic> _draftSnapshot() => {
    'aiEditing': aiEditing,
    'usingAiMode': usingAiMode,
    'aiPurpose': aiPurpose,
    'aiTone': aiTone,
    'aiRecipientType': aiRecipientType,
    'aiLanguageStyle': aiLanguageStyle,
    'aiMediaPreference': aiMediaPreference,
    'guideFields': {
      for (final entry in guideFields.entries) entry.key: entry.value.text,
    },
    'aiPrompt': aiPrompt.text,
    'aiChat': aiChat,
    'aiHasDraft': aiHasDraft,
    'name': name.text,
    'header': header.text,
    'body': body.text,
    'footer': footer.text,
    'category': category,
    'language': language,
    'variableType': variableType,
    'mediaSample': mediaSample,
    'templateMode': templateMode,
    'setupComplete': setupComplete,
    'mediaHandle': mediaHandle.text,
    'mediaBase64': mediaBase64,
    'mediaMimeType': mediaMimeType,
    'mediaFileName': mediaFileName,
    'locationLatitude': locationLatitude.text,
    'locationLongitude': locationLongitude.text,
    'locationName': locationName.text,
    'locationAddress': locationAddress.text,
    'savedDraftId': savedDraftId,
    'samples': {
      for (final entry in variableSamples.entries) entry.key: entry.value.text,
    },
    'meanings': variableMeanings,
    'buttons': buttons.map((b) => b.toMap()).toList(),
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
          aiEditing = saved['aiEditing'] == true;
          usingAiMode = saved['usingAiMode'] == true;
          aiHasDraft = saved['aiHasDraft'] == true;
          aiPurpose = '${saved['aiPurpose'] ?? aiPurpose}';
          aiTone = '${saved['aiTone'] ?? aiTone}';
          aiRecipientType = '${saved['aiRecipientType'] ?? aiRecipientType}';
          aiLanguageStyle = '${saved['aiLanguageStyle'] ?? aiLanguageStyle}';
          aiMediaPreference =
              '${saved['aiMediaPreference'] ?? aiMediaPreference}';
          final fields = saved['guideFields'];
          if (fields is Map)
            for (final entry in guideFields.entries)
              entry.value.text = '${fields[entry.key] ?? ''}';
          aiPrompt.text = '${saved['aiPrompt'] ?? ''}';
          aiChat.clear();
          if (saved['aiChat'] is List)
            for (final item in (saved['aiChat'] as List).whereType<Map>())
              aiChat.add(item.map((k, v) => MapEntry('$k', '$v')));
          for (final entry in {
            'name': name,
            'header': header,
            'body': body,
            'footer': footer,
            'mediaHandle': mediaHandle,
            'locationLatitude': locationLatitude,
            'locationLongitude': locationLongitude,
            'locationName': locationName,
            'locationAddress': locationAddress,
          }.entries)
            entry.value.text = '${saved[entry.key] ?? ''}';
          category = '${saved['category'] ?? category}';
          language = '${saved['language'] ?? language}';
          variableType = '${saved['variableType'] ?? variableType}';
          mediaSample = '${saved['mediaSample'] ?? mediaSample}';
          templateMode = '${saved['templateMode'] ?? templateMode}';
          setupComplete = saved['setupComplete'] == true;
          savedDraftId = int.tryParse('${saved['savedDraftId']}');
          mediaBase64 = saved['mediaBase64'] as String?;
          mediaMimeType = saved['mediaMimeType'] as String?;
          mediaFileName = saved['mediaFileName'] as String?;
          variableMeanings.clear();
          final meanings = saved['meanings'];
          if (meanings is Map)
            variableMeanings.addAll(
              meanings.map((k, v) => MapEntry('$k', '$v')),
            );
          for (final controller in variableSamples.values) controller.dispose();
          variableSamples.clear();
          final samples = saved['samples'];
          if (samples is Map)
            for (final entry in samples.entries)
              variableSamples['${entry.key}'] = TextEditingController(
                text: '${entry.value}',
              );
          for (final b in buttons) b.dispose();
          buttons.clear();
          if (saved['buttons'] is List)
            for (final b in (saved['buttons'] as List).whereType<Map>())
              buttons.add(
                _TemplateButtonDraft.fromMap(b.cast<String, dynamic>()),
              );
          _ensureVariableEditors();
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
          'Could not restore the saved draft: $error',
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
    initialFingerprint = jsonEncode(_draftSnapshot());
    ref.invalidate(editorDraftProvider(draftKind));
    if (mounted)
      showAppMessage(
        context,
        'Draft saved on this device. Open this editor to continue.',
      );
  }

  Future<void> _discardDraft() async {
    await ref.read(editorDraftStoreProvider).remove(draftKind);
    ref.invalidate(editorDraftProvider(draftKind));
  }

  Future<void> _generateAiTemplate() async {
    final user = ref.read(authProvider).user;
    final business = user?.businessName.trim().isNotEmpty == true
        ? user!.businessName.trim()
        : user?.name.trim().isNotEmpty == true
        ? user!.name.trim()
        : 'Your business';
    if ([aiPurpose, aiTone, aiRecipientType].any((v) => v.trim().isEmpty)) {
      showAppMessage(
        context,
        'Enter a purpose, tone and audience.',
        error: true,
      );
      return;
    }
    final guide = _guide();
    final prompt = AiPromptGuide.prompt(
      purpose: aiPurpose,
      business: business,
      details: {
        'Recipient type': aiRecipientType,
        'Tone': aiTone,
        'Language': aiLanguageStyle == 'BILINGUAL'
            ? 'English + $language'
            : language,
        'Attachment': aiMediaPreference,
        for (final entry in guideFields.entries)
          if ('${guide[entry.key] ?? ''}'.isNotEmpty)
            entry.key: '${guide[entry.key]}',
      },
      note: aiPrompt.text,
      revision: aiHasDraft,
    );
    if (prompt.length > 2500) {
      showAppMessage(
        context,
        'Shorten the change note or supplied details to fit 2,500 characters.',
        error: true,
      );
      return;
    }
    if (aiGenerating) return;
    if (AiPromptGuide.purposeCode(aiPurpose) == 'OTHER' &&
        AiPromptGuide.purposeLabel(aiPurpose).toLowerCase() == 'other' &&
        aiPrompt.text.trim().isEmpty) {
      showAppMessage(context, 'Describe the template you want.', error: true);
      return;
    }
    FocusScope.of(context).unfocus();
    final history = [
      ...aiChat,
      {'role': 'user', 'text': prompt},
    ];
    final recent = history.length > 7
        ? history.sublist(history.length - 7)
        : history;
    setState(() {
      aiGenerating = true;
      aiError = null;
    });
    try {
      final response = await ref
          .read(apiClientProvider)
          .post(
            '/api/whatsapp/templates/ai-generate',
            data: {
              'messages': recent,
              'language': language,
              'guide': guide,
              if (aiHasDraft || body.text.trim().isNotEmpty)
                'currentDraft': {
                  'header': header.text,
                  'body': body.text,
                  'footer': footer.text,
                  'category': category,
                  'mediaFormat': mediaSample,
                },
            },
          );
      if (!mounted) return;
      final raw = response is Map ? response['draft'] : null;
      if (raw is! Map)
        throw Exception('AI did not return a template. Try again.');
      final draft = raw.cast<String, dynamic>();
      setState(() {
        aiChat.addAll([
          {'role': 'user', 'text': prompt},
          {
            'role': 'assistant',
            'text':
                '${draft['assistantMessage'] ?? "Your template is ready to review."}',
          },
        ]);
        if (aiChat.length > 8) aiChat.removeRange(0, aiChat.length - 8);
        aiPrompt.clear();
        name.text = '${draft['templateName'] ?? ''}';
        header.text = '${draft['header'] ?? ''}';
        body.text = '${draft['body'] ?? ''}';
        footer.text = '${draft['footer'] ?? ''}';
        category = '${draft['category']}';
        language = '${draft['language']}';
        final newMedia = '${draft['mediaFormat'] ?? 'NONE'}';
        if (newMedia != mediaSample) {
          mediaBase64 = null;
          mediaMimeType = null;
          mediaFileName = null;
          mediaHandle.clear();
          locationLatitude.clear();
          locationLongitude.clear();
        }
        mediaSample = newMedia;
        templateMode = 'DEFAULT';
        variableType = 'NAME';
        if (mediaSample == 'LOCATION') {
          if (locationName.text.isEmpty)
            locationName.text = '${draft['locationName'] ?? ''}';
          if (locationAddress.text.isEmpty)
            locationAddress.text = '${draft['locationAddress'] ?? ''}';
        }
        for (final button in buttons) button.dispose();
        buttons.clear();
        variableMeanings.clear();
        for (final section in ['HEADER', 'BODY']) {
          final samples =
              draft[section == 'HEADER' ? 'headerSamples' : 'bodySamples'];
          final meanings =
              draft[section == 'HEADER' ? 'headerMeanings' : 'bodyMeanings'];
          for (final token in _tokens(
            section == 'HEADER' ? header.text : body.text,
          )) {
            if (samples is Map)
              _sampleController(section, token).text =
                  '${samples[token] ?? ''}';
            if (meanings is Map)
              variableMeanings[_sampleKey(section, token)] =
                  '${meanings[token] ?? 'CUSTOM'}';
          }
        }
        _ensureVariableEditors();
        aiHasDraft = true;
        aiEditing = false;
      });
    } catch (error) {
      if (mounted) {
        setState(() => aiError = '$error');
        showAppMessage(context, '$error', error: true);
      }
    } finally {
      if (mounted) setState(() => aiGenerating = false);
    }
  }

  bool get isEditing => widget.existing != null && !widget.duplicate;
  bool get approvedExisting =>
      isEditing && widget.existing!.status.toUpperCase() == 'APPROVED';

  @override
  Widget build(BuildContext context) {
    return DraftExitGuard(
      key: exitGuard,
      title: 'template',
      hasChanges: () =>
          !completed && jsonEncode(_draftSnapshot()) != initialFingerprint,
      isBusy: () =>
          draftLoading || saving || uploadingMedia || reviewing || aiGenerating,
      saveDraft: _stashDraft,
      discardDraft: _discardDraft,
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            usingAiMode
                ? 'AI Template Generator'
                : isEditing
                ? 'Edit Template'
                : widget.duplicate
                ? 'Duplicate Template'
                : 'Create Template',
          ),
        ),
        body: draftLoading
            ? const Center(child: CircularProgressIndicator())
            : !setupComplete
            ? _setupTemplateType()
            : Form(
                key: form,
                child: AbsorbPointer(
                  absorbing: aiGenerating,
                  child: ListView(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 28),
                    children: [
                      if (usingAiMode && aiEditing)
                        TextButton.icon(
                          onPressed: () => setState(() => aiEditing = false),
                          icon: const Icon(Icons.auto_awesome_rounded),
                          label: const Text('Back to AI — add a change note'),
                        ),
                      if (usingAiMode && !aiEditing) ...[
                        _aiChatPanel(),
                        const SizedBox(height: 12),
                        if (aiHasDraft) ...[
                          _sectionCard(
                            title: 'WhatsApp preview • edit below',
                            child: _previewCard(
                              context,
                              _renderPreviewHeader(),
                              _renderPreviewBody(),
                              footer.text,
                              buttons.map((b) => b.toMap()).toList(),
                              mediaType: mediaSample,
                              mediaBase64: mediaBase64,
                              mediaName: mediaFileName,
                              location: mediaSample == 'LOCATION'
                                  ? {
                                      'latitude': locationLatitude.text,
                                      'longitude': locationLongitude.text,
                                      'name': locationName.text,
                                      'address': locationAddress.text,
                                    }
                                  : null,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () =>
                                      setState(() => aiEditing = true),
                                  icon: const Icon(Icons.edit_outlined),
                                  label: const Text('Edit template'),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: FilledButton(
                                  onPressed: saving || reviewing
                                      ? null
                                      : _confirmSubmission,
                                  child: const Text('Use template'),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                        ],
                      ],
                      _stepHeader(),
                      const SizedBox(height: 12),
                      if (widget.suggestion != null) _suggestionNotice(),
                      if (widget.existing?.status.toUpperCase() == 'REJECTED')
                        const Padding(
                          padding: EdgeInsets.only(bottom: 10),
                          child: Card(
                            color: Color(0xFFFFF5F5),
                            child: Padding(
                              padding: EdgeInsets.all(12),
                              child: Text(
                                'This template was rejected. Update the content and submit a new version to Meta.',
                              ),
                            ),
                          ),
                        ),
                      _sectionCard(
                        title: 'Template name and language',
                        subtitle:
                            'GreetSync creates a Meta-compatible internal name while keeping the display name readable for your team.',
                        child: Column(
                          children: [
                            TextFormField(
                              controller: name,
                              readOnly: metaIdentityLocked,
                              maxLength: 512,
                              decoration: const InputDecoration(
                                labelText: 'Name your template *',
                                hintText: 'festival_offer',
                              ),
                              validator: (value) {
                                final text = (value ?? '').trim();
                                if (text.length < 3 || text.length > 512)
                                  return 'Enter a template name between 3 and 512 characters';
                                if (text.contains(RegExp(r'[\r\n\t]')))
                                  return 'Template name cannot contain line breaks or tabs';
                                return null;
                              },
                            ),
                            const SizedBox(height: 8),
                            if (metaIdentityLocked)
                              TextFormField(
                                initialValue: widget.existing!.languageLabel,
                                readOnly: true,
                                decoration: const InputDecoration(
                                  labelText: 'Language (fixed by Meta)',
                                ),
                              )
                            else
                              _dropdown<String>(
                                label: 'Select language',
                                value: language,
                                items: const {
                                  'en_US': 'English',
                                  'hi': 'Hindi',
                                  'mr': 'Marathi',
                                },
                                onChanged: (value) => setState(() {
                                  language = value ?? language;
                                  aiLanguageStyle = 'STANDARD';
                                }),
                              ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    '${category == 'UTILITY' ? 'Utility' : 'Marketing'} • ${templateMode == 'FLOW' ? 'Flow' : 'Default'}',
                                    style: const TextStyle(
                                      color: BusinessColors.muted,
                                    ),
                                  ),
                                ),
                                if (!metaIdentityLocked)
                                  TextButton(
                                    onPressed: () =>
                                        setState(() => setupComplete = false),
                                    child: const Text('Change setup'),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      _sectionCard(
                        title: 'Content',
                        subtitle:
                            'Add the template content and realistic variable samples. Samples are for Meta review and are not sent to customers.',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _responsivePair(
                              _variableTypePicker(),
                              _mediaTypePicker(),
                            ),
                            if (mediaSample != 'NONE') ...[
                              const SizedBox(height: 12),
                              _mediaSampleInput(),
                            ],
                            if (mediaSample == 'NONE') ...[
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: header,
                                maxLength: 60,
                                onChanged: (_) =>
                                    setState(_ensureVariableEditors),
                                decoration: InputDecoration(
                                  labelText: 'Header (optional)',
                                  hintText: _languageHint('Add a short header'),
                                  suffixIcon: IconButton(
                                    tooltip: 'Add variable',
                                    onPressed: () => _insertVariable(
                                      header,
                                      section: 'HEADER',
                                    ),
                                    icon: const Icon(Icons.add_rounded),
                                  ),
                                ),
                                validator: _validateHeader,
                              ),
                            ],
                            const SizedBox(height: 8),
                            TextFormField(
                              key: contentKey,
                              controller: body,
                              minLines: 4,
                              maxLines: 8,
                              maxLength: 1024,
                              onChanged: (_) =>
                                  setState(_ensureVariableEditors),
                              decoration: InputDecoration(
                                labelText: 'Body *',
                                hintText: _languageHint(
                                  'Enter the WhatsApp message content',
                                ),
                                alignLabelWithHint: true,
                                suffixIcon: IconButton(
                                  tooltip: 'Add variable',
                                  onPressed: () =>
                                      _insertVariable(body, section: 'BODY'),
                                  icon: const Icon(Icons.add_rounded),
                                ),
                              ),
                              validator: _validateBody,
                            ),
                            if (_tokens(header.text).isNotEmpty ||
                                _tokens(body.text).isNotEmpty) ...[
                              const SizedBox(height: 12),
                              _variableSamplesSection(),
                            ],
                            const SizedBox(height: 8),
                            TextFormField(
                              controller: footer,
                              onChanged: (_) => setState(() {}),
                              maxLength: 60,
                              decoration: InputDecoration(
                                labelText: 'Footer (optional)',
                                hintText: _languageHint('Add footer text'),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      _sectionCard(
                        title: 'Buttons (optional)',
                        subtitle:
                            'Add up to 10 buttons. GreetSync validates action-specific limits before the template is submitted to Meta.',
                        child: Column(
                          children: [
                            ...List.generate(buttons.length, _buttonEditor),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: OutlinedButton.icon(
                                onPressed: buttons.length >= 10
                                    ? null
                                    : _showAddButtonMenu,
                                icon: const Icon(Icons.add_rounded),
                                label: const Text('Add button'),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      _sectionCard(
                        title: 'Template preview',
                        child: _previewCard(
                          context,
                          _renderPreviewHeader(),
                          _renderPreviewBody(),
                          footer.text,
                          buttons.map((button) => button.toMap()).toList(),
                          mediaType: mediaSample,
                          mediaBase64: mediaBase64,
                          mediaName: mediaFileName,
                          location: mediaSample == 'LOCATION'
                              ? {
                                  'latitude': locationLatitude.text,
                                  'longitude': locationLongitude.text,
                                  'name': locationName.text,
                                  'address': locationAddress.text,
                                }
                              : null,
                        ),
                      ),
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed:
                            saving ||
                                uploadingMedia ||
                                reviewing ||
                                aiGenerating
                            ? null
                            : _confirmSubmission,
                        icon: saving || uploadingMedia
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.cloud_upload_outlined),
                        label: Text(
                          uploadingMedia
                              ? 'Uploading media…'
                              : saving
                              ? 'Submitting…'
                              : reviewing
                              ? 'Reviewing…'
                              : 'Submit for Meta Approval',
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'The template can be used in automation only after the connected Meta account returns APPROVED status.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11,
                          color: BusinessColors.muted,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }

  Widget _variableTypePicker() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          const Text(
            'Type of variable',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
          const SizedBox(width: 4),
          InkWell(
            onTap: _showVariableHelp,
            borderRadius: BorderRadius.circular(20),
            child: const Padding(
              padding: EdgeInsets.all(3),
              child: Icon(Icons.info_outline_rounded, size: 17),
            ),
          ),
        ],
      ),
      const SizedBox(height: 6),
      DropdownButtonFormField<String>(
        value: variableType,
        isExpanded: true,
        decoration: const InputDecoration(),
        items: const [
          DropdownMenuItem(value: 'NUMBER', child: Text('Number')),
          DropdownMenuItem(value: 'NAME', child: Text('Name')),
        ],
        onChanged: metaIdentityLocked
            ? null
            : (value) => setState(() => variableType = value ?? variableType),
      ),
    ],
  );

  Future<void> _showVariableHelp() async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Type of variable'),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'A variable is a blank filled before sending. Use it for a customer name, shop name, business address or other details. Number uses {{1}}, {{2}}; Name uses {{customer_name}}, {{shop_name}}.',
            ),
            SizedBox(height: 12),
            Text('You write: Hello {{1}}, your order {{2}} is ready.'),
            SizedBox(height: 8),
            DecoratedBox(
              decoration: BoxDecoration(
                color: Color(0xFFDCF8C6),
                borderRadius: BorderRadius.all(Radius.circular(12)),
              ),
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text('Hello Rahul, your order 1042 is ready.'),
              ),
            ),
            SizedBox(height: 8),
            Text(
              'GreetSync replaces each blank with the customer’s real details before sending. Sample values help Meta review your template.',
              style: TextStyle(fontSize: 12),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Got it'),
          ),
        ],
      ),
    );
  }

  Widget _mediaTypePicker() => _dropdown<String>(
    label: 'Media sample',
    value: mediaSample,
    items: const {
      'NONE': 'None',
      'IMAGE': 'Image',
      'VIDEO': 'Video',
      'DOCUMENT': 'Document',
      'LOCATION': 'Location',
    },
    onChanged: (value) => setState(() {
      mediaSample = value ?? mediaSample;
      if (mediaSample != 'NONE') header.clear();
      mediaFileName = null;
      mediaMimeType = null;
      mediaBase64 = null;
      mediaHandle.clear();
    }),
  );

  Widget _mediaSampleInput() {
    if (mediaSample == 'LOCATION') {
      return Column(
        children: [
          OutlinedButton.icon(
            onPressed: _pickLocation,
            icon: const Icon(Icons.map_outlined),
            label: const Text('Choose location on map'),
          ),
          const SizedBox(height: 10),
          _responsivePair(
            TextFormField(
              controller: locationLatitude,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
                signed: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Latitude *',
                hintText: '18.5204',
              ),
              onChanged: (_) => setState(() {}),
              validator: (v) => validatingForApproval
                  ? _validateCoordinate(v, -90, 90, 'latitude')
                  : null,
            ),
            TextFormField(
              controller: locationLongitude,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
                signed: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Longitude *',
                hintText: '73.8567',
              ),
              onChanged: (_) => setState(() {}),
              validator: (v) => validatingForApproval
                  ? _validateCoordinate(v, -180, 180, 'longitude')
                  : null,
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: locationName,
            onChanged: (_) => setState(() {}),
            maxLength: 120,
            validator: (v) => validatingForApproval && (v ?? '').trim().isEmpty
                ? 'Enter the location name'
                : null,
            decoration: const InputDecoration(
              labelText: 'Shop / location name *',
              hintText: 'Your shop or business name',
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: locationAddress,
            onChanged: (_) => setState(() {}),
            maxLines: 2,
            maxLength: 300,
            decoration: const InputDecoration(
              labelText: 'Full street address *',
              hintText: 'Building, road, area, city and PIN code',
            ),
            validator: (v) => validatingForApproval && (v ?? '').trim().isEmpty
                ? 'Enter the full location address'
                : null,
          ),
          const Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Map selection fills the exact coordinates. Add the shop name and full address customers will receive. Location headers do not need a media upload handle.',
              style: TextStyle(fontSize: 11, color: BusinessColors.muted),
            ),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (mediaSample == 'DOCUMENT')
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text(
              'Accepted in GreetSync: PDF (.pdf), up to 16 MB for this template header. Convert Word, Excel, PowerPoint or text documents to PDF before selecting.',
              style: TextStyle(fontSize: 12, color: BusinessColors.muted),
            ),
          ),
        OutlinedButton.icon(
          onPressed: _pickMediaSample,
          icon: Icon(
            mediaSample == 'IMAGE'
                ? Icons.image_outlined
                : mediaSample == 'VIDEO'
                ? Icons.video_file_outlined
                : Icons.description_outlined,
          ),
          label: Text(
            mediaFileName == null
                ? 'Choose ${mediaSample.toLowerCase()} sample'
                : mediaFileName!,
          ),
        ),
        if (mediaFileName != null) ...[
          const SizedBox(height: 8),
          _selectedMediaPreview(compact: true),
          const SizedBox(height: 6),
          Text(
            '${mediaMimeType ?? 'file'} • ready to upload to Meta',
            style: const TextStyle(fontSize: 11, color: BusinessColors.green),
          ),
        ],
        const SizedBox(height: 10),
        TextFormField(
          controller: mediaHandle,
          decoration: const InputDecoration(
            labelText: 'Meta header handle (advanced / optional)',
            hintText:
                'You can paste an existing header_handle instead of selecting a file',
          ),
          validator: (v) {
            if (mediaSample == 'NONE' || mediaSample == 'LOCATION') return null;
            if ((v ?? '').trim().isEmpty && mediaBase64 == null)
              return 'Select a sample file or paste a Meta media handle';
            return null;
          },
        ),
      ],
    );
  }

  Future<void> _pickMediaSample() async {
    FileType type = FileType.custom;
    List<String> extensions;
    if (mediaSample == 'IMAGE') {
      extensions = ['jpg', 'jpeg', 'png'];
    } else if (mediaSample == 'VIDEO') {
      extensions = ['mp4'];
    } else {
      extensions = ['pdf'];
    }
    final result = await FilePicker.platform.pickFiles(
      type: type,
      allowedExtensions: extensions,
      withData: true,
      allowMultiple: false,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final bytes =
        file.bytes ??
        (file.path != null ? await File(file.path!).readAsBytes() : null);
    if (bytes == null || bytes.isEmpty) {
      if (mounted)
        showAppMessage(
          context,
          'Could not read the selected file.',
          error: true,
        );
      return;
    }
    final maxBytes = mediaSample == 'IMAGE'
        ? 5 * 1024 * 1024
        : mediaSample == 'VIDEO'
        ? 16 * 1024 * 1024
        : 16 * 1024 * 1024;
    if (bytes.length > maxBytes) {
      if (mounted)
        showAppMessage(
          context,
          '${mediaSample.toLowerCase()} sample is too large for this template editor.',
          error: true,
        );
      return;
    }
    final ext = (file.extension ?? '').toLowerCase();
    final mime = mediaSample == 'IMAGE'
        ? (ext == 'png' ? 'image/png' : 'image/jpeg')
        : mediaSample == 'VIDEO'
        ? 'video/mp4'
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
        : ext == 'txt'
        ? 'text/plain'
        : 'application/octet-stream';
    setState(() {
      mediaFileName = file.name;
      mediaMimeType = mime;
      mediaBase64 = base64Encode(bytes);
      mediaHandle.clear();
    });
  }

  Widget _selectedMediaPreview({bool compact = false}) {
    if (const {'IMAGE', 'VIDEO', 'DOCUMENT'}.contains(mediaSample)) {
      return TemplateMediaPreview(
        type: mediaSample,
        dataBase64: mediaBase64,
        fileName: mediaFileName,
        height: compact ? 120 : 180,
      );
    }
    if (mediaSample == 'LOCATION') {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFF4F7FB),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            const Icon(Icons.location_on_outlined),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                locationName.text.trim().isNotEmpty
                    ? locationName.text.trim()
                    : '${locationLatitude.text}, ${locationLongitude.text}',
              ),
            ),
          ],
        ),
      );
    }
    final icon = mediaSample == 'VIDEO'
        ? Icons.play_circle_outline_rounded
        : Icons.description_outlined;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F7FB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: BusinessColors.line),
      ),
      child: Row(
        children: [
          Icon(icon, size: compact ? 30 : 42),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              mediaFileName ?? '${mediaSample.toLowerCase()} selected',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }

  String? _validateCoordinate(
    String? raw,
    double min,
    double max,
    String label,
  ) {
    final value = double.tryParse((raw ?? '').trim());
    if (value == null) return 'Enter a valid $label';
    if (!value.isFinite || value < min || value > max)
      return '${label[0].toUpperCase()}${label.substring(1)} must be between $min and $max';
    return null;
  }

  String? _validateHeader(String? value) {
    final text = (value ?? '').trim();
    if (text.length > 60) return 'Header can contain at most 60 characters';
    if (_containsEmoji(text)) return 'Header text cannot contain emojis';
    final syntax = _variableValidation(text, isBody: false);
    if (syntax != null) return syntax;
    final tokens = _tokens(text);
    if (tokens.length > 1) return 'Header supports only one variable';
    return null;
  }

  String? _validateBody(String? value) {
    final text = (value ?? '').trim();
    if (text.isEmpty) return 'Message body is required';
    if (text.length > 1024) return 'Maximum 1024 characters';
    final syntax = _variableValidation(text, isBody: true);
    if (syntax != null) return syntax;
    final matches = RegExp(
      r'\{\{\s*([^{}]+?)\s*\}\}',
    ).allMatches(text).toList();
    if (matches.isNotEmpty) {
      final staticText = text
          .replaceAll(RegExp(r'\{\{\s*[^{}]+?\s*\}\}'), '')
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();
      if (staticText.length < matches.length * 8) {
        return 'This template has too many variables for its length. Reduce the number of variables or increase the message length.';
      }
    }
    return null;
  }

  String? _variableValidation(String text, {required bool isBody}) {
    if (text.isEmpty) return null;
    final openings = RegExp(r'\{\{').allMatches(text).length;
    final closings = RegExp(r'\}\}').allMatches(text).length;
    final valid = RegExp(r'\{\{\s*([^{}]+?)\s*\}\}').allMatches(text).toList();
    if (openings != closings || valid.length != openings)
      return 'Fix malformed variable braces. Use {{1}} or {{order_id}}.';
    final tokens = valid.map((m) => (m.group(1) ?? '').trim()).toList();
    if (variableType == 'NUMBER') {
      if (tokens.any((t) => !RegExp(r'^\d+$').hasMatch(t)))
        return 'Number variables must use {{1}}, {{2}}, {{3}}…';
      final nums = tokens.map(int.parse).toSet().toList()..sort();
      for (var i = 0; i < nums.length; i++) {
        if (nums[i] != i + 1)
          return 'Number variables must be sequential and start with {{1}}.';
      }
    } else {
      if (tokens.any((t) => !RegExp(r'^[a-z_]+$').hasMatch(t)))
        return 'Name variables use lowercase letters and underscores, for example customer_name.';
    }
    if (RegExp(r'\}\}\s*\{\{').hasMatch(text))
      return 'Two variables cannot be adjacent. Add normal text between them.';
    if (isBody && valid.isNotEmpty) {
      final trimmed = text.trim();
      if (RegExp(r'^\{\{\s*[^{}]+?\s*\}\}').hasMatch(trimmed) ||
          RegExp(r'\{\{\s*[^{}]+?\s*\}\}$').hasMatch(trimmed)) {
        return 'Variables can’t be at the start or end of the template. Add normal text before and after them.';
      }
    }
    return null;
  }

  bool _containsEmoji(String text) => RegExp(
    r'[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]',
    unicode: true,
  ).hasMatch(text);

  List<String> _tokens(String text) {
    final seen = <String>{};
    for (final m in RegExp(r'\{\{\s*([^{}]+?)\s*\}\}').allMatches(text)) {
      final token = (m.group(1) ?? '').trim();
      if (token.isNotEmpty) seen.add(token);
    }
    return seen.toList();
  }

  String _sampleKey(String section, String token) => '$section:$token';

  TextEditingController _sampleController(String section, String token) =>
      variableSamples.putIfAbsent(
        _sampleKey(section, token),
        () => TextEditingController(),
      );

  void _ensureVariableEditors() {
    for (final token in _tokens(header.text)) {
      final key = _sampleKey('HEADER', token);
      final sample = _sampleController('HEADER', token);
      variableMeanings.putIfAbsent(key, () => _defaultMeaning(token));
      if (sample.text.isEmpty)
        sample.text = _businessSample(variableMeanings[key]!) ?? '';
    }
    for (final token in _tokens(body.text)) {
      final key = _sampleKey('BODY', token);
      final sample = _sampleController('BODY', token);
      variableMeanings.putIfAbsent(key, () => _defaultMeaning(token));
      if (sample.text.isEmpty)
        sample.text = _businessSample(variableMeanings[key]!) ?? '';
    }
  }

  String _defaultMeaning(String token) {
    final t = token.toLowerCase();
    if (t == 'shop_name' || t == 'business_name' || t == 'store_name')
      return 'BUSINESS_NAME';
    if (t == 'business_address' || t == 'shop_address')
      return 'BUSINESS_ADDRESS';
    if (t == 'business_details') return 'BUSINESS_DETAILS';
    if (t == 'business_phone') return 'BUSINESS_PHONE';
    if (t == 'business_email') return 'BUSINESS_EMAIL';
    if (t.contains('first_name') || t == 'firstname') return 'FIRST_NAME';
    if (t.contains('name') || t.contains('customer')) return 'CONTACT_NAME';
    if (t.contains('age')) return 'AGE';
    if (t.contains('phone') || t.contains('mobile')) return 'PHONE';
    if (t.contains('email')) return 'EMAIL';
    if (t.contains('birthday') || t.contains('birth_date') || t == 'dob')
      return 'BIRTHDAY_DATE';
    if (t.contains('scheduled_date_time')) return 'SCHEDULED_DATE_TIME';
    if (t.contains('scheduled_date')) return 'SCHEDULED_DATE';
    if (t.contains('scheduled_time')) return 'SCHEDULED_TIME';
    if (t.contains('order')) return 'ORDER_ID';
    if (t.contains('amount') || t.contains('price')) return 'AMOUNT';
    if (t.contains('code') || t.contains('coupon')) return 'CODE';
    return 'CUSTOM';
  }

  String _sampleHintFor(String meaning) {
    switch (meaning) {
      case 'BUSINESS_NAME':
        return ref.read(authProvider).user?.businessName ?? 'Your shop name';
      case 'BUSINESS_ADDRESS':
        return ref.read(authProvider).user?.businessAddress ??
            'Your business address';
      case 'BUSINESS_DETAILS':
        return 'Shop name and address';
      case 'BUSINESS_PHONE':
        return 'Your business phone number';
      case 'BUSINESS_EMAIL':
        return 'Your business email address';
      case 'CONTACT_NAME':
        return 'Enter a review example, e.g. Customer Name';
      case 'FIRST_NAME':
        return 'Enter a review example, e.g. First Name';
      case 'AGE':
        return 'Enter a review example, e.g. 28';
      case 'PHONE':
        return 'Enter a review example, e.g. +919876543210';
      case 'EMAIL':
        return 'Enter a review example, e.g. customer@example.com';
      case 'BIRTHDAY_DATE':
        return 'Enter a review example, e.g. 15-03-1990';
      case 'SCHEDULED_DATE':
        return 'Enter a review example, e.g. 10-10-2026';
      case 'SCHEDULED_TIME':
        return 'Enter a review example, e.g. 10:30';
      case 'SCHEDULED_DATE_TIME':
        return 'Enter a review example, e.g. 10-10-2026 10:30';
      case 'ORDER_ID':
        return 'Enter a review example, e.g. ORD-1001';
      case 'AMOUNT':
        return 'Enter a review example, e.g. 1250';
      case 'CODE':
        return 'Enter a review example, e.g. DIWALI20';
      default:
        return 'Enter a review-only example';
    }
  }

  Widget _variableSamplesSection() {
    _ensureVariableEditors();
    final rows = <Widget>[];
    void addRows(String section, String text) {
      final tokens = _tokens(text);
      if (tokens.isEmpty) return;
      rows.add(
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 6),
          child: Text(
            section == 'HEADER' ? 'Header variables' : 'Body variables',
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
        ),
      );
      for (final token in tokens) {
        final key = _sampleKey(section, token);
        rows.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '{{$token}}',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 6),
                _responsivePair(
                  DropdownButtonFormField<String>(
                    value: variableMeanings[key] ?? _defaultMeaning(token),
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Information this variable holds',
                    ),
                    items:
                        const {
                              'BUSINESS_NAME':
                                  'Shop / business name (automatic)',
                              'BUSINESS_ADDRESS':
                                  'Business address (automatic)',
                              'BUSINESS_DETAILS':
                                  'Business name & address (automatic)',
                              'BUSINESS_PHONE': 'Business phone (automatic)',
                              'BUSINESS_EMAIL': 'Business email (automatic)',
                              'CONTACT_NAME': 'Contact name (automatic)',
                              'FIRST_NAME': 'First name (automatic)',
                              'AGE': 'Age from birthday (automatic)',
                              'PHONE': 'Mobile number (automatic)',
                              'EMAIL': 'Email address (automatic)',
                              'BIRTHDAY_DATE': 'Birthday date (automatic)',
                              'SCHEDULED_DATE': 'Scheduled date (automatic)',
                              'SCHEDULED_TIME': 'Scheduled time (automatic)',
                              'SCHEDULED_DATE_TIME':
                                  'Scheduled date & time (automatic)',
                              'DATE_TIME': 'Date / time (manual)',
                              'ORDER_ID': 'Order / reference ID',
                              'AMOUNT': 'Amount / price',
                              'CODE': 'Code / coupon',
                              'CUSTOM': 'Custom information',
                            }.entries
                            .map(
                              (e) => DropdownMenuItem(
                                value: e.key,
                                child: Text(
                                  e.value,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            )
                            .toList(),
                    onChanged: (v) => setState(() {
                      variableMeanings[key] = v ?? 'CUSTOM';
                      _sampleController(section, token).text =
                          _businessSample(v ?? '') ?? '';
                    }),
                  ),
                  TextFormField(
                    controller: _sampleController(section, token),
                    decoration: InputDecoration(
                      labelText: 'Sample value for {{$token}} *',
                      hintText: _sampleHintFor(
                        variableMeanings[key] ?? _defaultMeaning(token),
                      ),
                    ),
                    validator: (v) => (v ?? '').trim().isEmpty
                        ? 'Add sample text for {{$token}}'
                        : null,
                  ),
                ),
              ],
            ),
          ),
        );
      }
    }

    addRows('HEADER', header.text);
    addRows('BODY', body.text);
    final total = _tokens(header.text).length + _tokens(body.text).length;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F8FA),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: BusinessColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Variable samples',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
              ),
              Text(
                '$total variable${total == 1 ? '' : 's'}',
                style: const TextStyle(color: BusinessColors.muted),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Add realistic examples so Meta can review the template. These sample values are not sent to customers.',
            style: TextStyle(
              fontSize: 11,
              color: BusinessColors.muted,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 10),
          ...rows,
        ],
      ),
    );
  }

  String _renderPreviewBody() {
    var text = body.text;
    for (final token in _tokens(text)) {
      final sample = _sampleController('BODY', token).text.trim();
      if (sample.isNotEmpty)
        text = text.replaceAll(
          RegExp(r'\{\{\s*' + RegExp.escape(token) + r'\s*\}\}'),
          sample,
        );
    }
    return text;
  }

  String _languageHint(String english) {
    if (language == 'hi') return '$english (हिंदी supported)';
    if (language == 'mr') return '$english (मराठी supported)';
    return english;
  }

  Widget _responsivePair(Widget first, Widget second) => LayoutBuilder(
    builder: (context, constraints) {
      if (constraints.maxWidth < 520)
        return Column(children: [first, const SizedBox(height: 10), second]);
      return Row(
        children: [
          Expanded(child: first),
          const SizedBox(width: 10),
          Expanded(child: second),
        ],
      );
    },
  );

  Widget _dropdown<T>({
    required String label,
    required T value,
    required Map<T, String> items,
    required ValueChanged<T?> onChanged,
  }) => DropdownButtonFormField<T>(
    value: value,
    isExpanded: true,
    decoration: InputDecoration(labelText: label),
    items: items.entries
        .map(
          (entry) => DropdownMenuItem<T>(
            value: entry.key,
            child: Text(entry.value, overflow: TextOverflow.ellipsis),
          ),
        )
        .toList(),
    onChanged: onChanged,
  );

  Widget _setupTemplateType() => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const Text(
        'Set up your template',
        style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
      ),
      const SizedBox(height: 6),
      const Text(
        'Choose the category that best describes the message, then select Default or Flow.',
        style: TextStyle(color: BusinessColors.muted),
      ),
      const SizedBox(height: 18),
      SegmentedButton<String>(
        segments: const [
          ButtonSegment(
            value: 'MARKETING',
            icon: Icon(Icons.campaign_rounded),
            label: Text('Marketing'),
          ),
          ButtonSegment(
            value: 'UTILITY',
            icon: Icon(Icons.notifications_active_outlined),
            label: Text('Utility'),
          ),
        ],
        selected: {category},
        showSelectedIcon: false,
        onSelectionChanged: (v) => setState(() => category = v.first),
      ),
      const SizedBox(height: 16),
      _templateTypeCard(
        'DEFAULT',
        'Default',
        category == 'MARKETING'
            ? 'Promotions, offers, announcements and engagement with text, media and buttons.'
            : 'Transactional/account updates such as confirmations, reminders and status updates.',
        Icons.message_outlined,
      ),
      const SizedBox(height: 10),
      _templateTypeCard(
        'FLOW',
        'Flow',
        'Open a Meta WhatsApp Flow from the template button.',
        Icons.account_tree_outlined,
      ),
      const SizedBox(height: 14),
      _setupPreview(),
      const SizedBox(height: 12),
      _categoryNotes(),
      const SizedBox(height: 24),
      FilledButton(
        onPressed: () => setState(() {
          setupComplete = true;
          if (templateMode == 'FLOW' && !buttons.any((b) => b.type == 'FLOW'))
            buttons.add(
              _TemplateButtonDraft.fromMap({
                'type': 'FLOW',
                'text': category == 'UTILITY' ? 'Share feedback' : 'Sign up',
              }),
            );
        }),
        child: const Text('Next'),
      ),
    ],
  );

  Widget _categoryNotes() => Card(
    child: ExpansionTile(
      title: const Text(
        'Notes: category and message type',
        style: TextStyle(fontSize: 13),
      ),
      leading: const Icon(Icons.info_outline),
      childrenPadding: const EdgeInsets.all(14),
      children: const [
        Text(
          '• Marketing: offers, promotions, greetings, product news and re-engagement.\n• Utility: specific customer orders, appointments, accounts, payments or requested updates; no promotions.\n• Mixed promotional and transactional content belongs in Marketing.\n• Default: a WhatsApp message with optional media and action buttons.\n• Flow: a button opens an interactive form inside WhatsApp. Connect a published Meta Flow. A Flow does not change the category rules.\n• Meta decides the final category and approval.',
          style: TextStyle(fontSize: 12, height: 1.5),
        ),
      ],
    ),
  );

  Widget _setupPreview() {
    final marketing = category == 'MARKETING';
    final flow = templateMode == 'FLOW';
    return _sectionCard(
      title: 'Template preview • example',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _previewCard(
            context,
            '',
            marketing
                ? (flow
                      ? 'Hi Rahul, tell us what you are interested in. Sign up for updates from our store.'
                      : 'Hi Rahul! Explore our latest collection and save 10% on your next order.')
                : (flow
                      ? 'Your order 1042 has been delivered. Please share feedback about this order.'
                      : 'Your order 1042 has shipped. You can track your delivery below.'),
            '',
            [
              {
                'type': flow ? 'FLOW' : 'URL',
                'text': flow
                    ? (marketing ? 'Sign up' : 'Share feedback')
                    : (marketing ? 'Shop now' : 'Track shipment'),
              },
            ],
          ),
          if (flow) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFF4F7FB),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    marketing
                        ? 'Example form: Sign up'
                        : 'Example form: Order feedback',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    marketing
                        ? 'First name\nEmail address'
                        : 'Would you recommend us?  Yes / No\nHow could we do better?',
                    style: const TextStyle(height: 2),
                  ),
                  const Text(
                    'The real form comes from your published Meta Flow.',
                    style: TextStyle(fontSize: 11, color: BusinessColors.muted),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _pickLocation() async {
    final result = await Navigator.push<Map<String, double>>(
      context,
      MaterialPageRoute(
        builder: (_) => LocationPickerScreen(
          latitude: double.tryParse(locationLatitude.text),
          longitude: double.tryParse(locationLongitude.text),
        ),
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      locationLatitude.text = result['latitude']!.toStringAsFixed(7);
      locationLongitude.text = result['longitude']!.toStringAsFixed(7);
    });
  }

  String _renderPreviewHeader() {
    var text = header.text;
    for (final token in _tokens(text)) {
      final value = _sampleController('HEADER', token).text.trim();
      if (value.isNotEmpty)
        text = text.replaceAll(
          RegExp(r'\{\{\s*' + RegExp.escape(token) + r'\s*\}\}'),
          value,
        );
    }
    return text;
  }

  String? _businessSample(String meaning) {
    final user = ref.read(authProvider).user;
    switch (meaning) {
      case 'BUSINESS_NAME':
        return user?.businessName;
      case 'BUSINESS_ADDRESS':
        return user?.businessAddress;
      case 'BUSINESS_DETAILS':
        return [
          user?.businessName ?? '',
          user?.businessAddress ?? '',
        ].where((v) => v.trim().isNotEmpty).join(', ');
      case 'BUSINESS_PHONE':
        return user?.mobile;
      case 'BUSINESS_EMAIL':
        return user?.email;
      default:
        return null;
    }
  }

  bool _validateAllContent({bool requireLocation = true}) {
    validatingForApproval = requireLocation;
    _ensureVariableEditors();
    final errors = <String>[];
    if (name.text.trim().length < 3)
      errors.add('Give your template a name of at least 3 characters.');
    final bodyError = _validateBody(body.text);
    if (bodyError != null) errors.add(bodyError);
    if (mediaSample == 'NONE') {
      final headerError = _validateHeader(header.text);
      if (headerError != null) errors.add(headerError);
    }
    if (mediaSample == 'LOCATION' && requireLocation) {
      final latError = _validateCoordinate(
        locationLatitude.text,
        -90,
        90,
        'latitude',
      );
      final lngError = _validateCoordinate(
        locationLongitude.text,
        -180,
        180,
        'longitude',
      );
      if (latError != null || lngError != null)
        errors.add('Select a valid point on the location map.');
      if (locationName.text.trim().isEmpty)
        errors.add('Add the shop / location name.');
      if (locationAddress.text.trim().isEmpty)
        errors.add('Add the full location address.');
    }
    for (final section in ['HEADER', 'BODY']) {
      if (section == 'HEADER' && mediaSample != 'NONE') continue;
      for (final token in _tokens(
        section == 'BODY' ? body.text : header.text,
      )) {
        if (_sampleController(section, token).text.trim().isEmpty) {
          errors.add(
            'Add a sample value for {{$token}} in the ${section.toLowerCase()}.',
          );
        }
      }
    }
    final validFields = form.currentState?.validate() ?? false;
    validatingForApproval = true;
    if (errors.isEmpty && validFields) return true;
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Complete your template'),
        content: Text(
          errors.isEmpty
              ? 'Check the highlighted fields and button details.'
              : errors.join('\n\n'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Edit template'),
          ),
        ],
      ),
    );
    return false;
  }

  Future<void> _confirmSubmission() async {
    if (saving ||
        uploadingMedia ||
        reviewing ||
        aiGenerating ||
        !_validateAllContent(requireLocation: false))
      return;
    setState(() => reviewing = true);
    try {
      await _reviewAndSubmit();
    } finally {
      if (mounted) setState(() => reviewing = false);
    }
  }

  Future<void> _reviewAndSubmit() async {
    FocusScope.of(context).unfocus();
    bool acknowledged = false;
    try {
      final result = await ref
          .read(apiClientProvider)
          .post(
            '/api/whatsapp/templates/category-check',
            data: {
              'category': category,
              'body': body.text,
              'buttons': buttons.map((b) => b.toMap()).toList(),
            },
          );
      if (!mounted) return;
      if (result is Map && result['advice'] is Map) {
        final choice = await showDialog<String>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Category may not match'),
            content: Text('${result['advice']['message']}'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Revise message'),
              ),
              if (!approvedExisting)
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, 'MARKETING'),
                  child: const Text('Use Marketing'),
                ),
            ],
          ),
        );
        if (choice == null || !mounted) return;
        setState(() => category = choice);
        acknowledged = true;
      }
    } catch (e) {
      if (mounted)
        showAppMessage(context, 'Category check unavailable: $e', error: true);
      return;
    }
    bool utilityConfirmed = category != 'UTILITY';
    final decision = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, change) => AlertDialog(
          title: const Text('Review your template'),
          content: SizedBox(
            width: 420,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '${name.text} • ${category == 'UTILITY' ? 'Utility' : 'Marketing'}',
                  ),
                  const SizedBox(height: 12),
                  _previewCard(
                    ctx,
                    _renderPreviewHeader(),
                    _renderPreviewBody(),
                    footer.text,
                    buttons.map((b) => b.toMap()).toList(),
                    mediaType: mediaSample,
                    mediaBase64: mediaBase64,
                    mediaName: mediaFileName,
                    location: mediaSample == 'LOCATION'
                        ? {
                            'latitude': locationLatitude.text,
                            'longitude': locationLongitude.text,
                            'name': locationName.text,
                            'address': locationAddress.text,
                          }
                        : null,
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Meta will review this content and decide its category. Use the template only when Meta confirms approval.',
                    style: TextStyle(fontSize: 12),
                  ),
                  if (category == 'UTILITY')
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: utilityConfirmed,
                      onChanged: (v) =>
                          change(() => utilityConfirmed = v == true),
                      title: const Text(
                        'This relates to a specific customer transaction, account or request and contains no promotions.',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  if (approvedExisting)
                    const Text(
                      'Saving a draft preserves the current approved template and creates a separate draft copy.',
                      style: TextStyle(fontSize: 12),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, 'DRAFT'),
              child: const Text('Save as Draft'),
            ),
            FilledButton(
              onPressed: utilityConfirmed
                  ? () => Navigator.pop(ctx, 'SUBMIT')
                  : null,
              child: const Text('Submit for Approval'),
            ),
          ],
        ),
      ),
    );
    if (decision == null || !mounted) return;
    await _save(
      submitToMeta: decision == 'SUBMIT',
      categoryAcknowledged: acknowledged,
      utilityConfirmed: utilityConfirmed,
    );
  }

  Widget _templateTypeCard(
    String value,
    String title,
    String subtitle,
    IconData icon,
  ) => Card(
    color: templateMode == value
        ? Theme.of(context).colorScheme.primary.withOpacity(.08)
        : Colors.white,
    child: RadioListTile<String>(
      value: value,
      groupValue: templateMode,
      onChanged: (v) => setState(() => templateMode = v ?? templateMode),
      secondary: Icon(icon),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text(subtitle),
    ),
  );

  Widget _stepHeader() => const Card(
    child: Padding(
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: _StepChip(
              icon: Icons.check_circle_rounded,
              label: 'Set up template',
              active: false,
              done: true,
            ),
          ),
          Expanded(
            child: _StepChip(
              icon: Icons.edit_rounded,
              label: 'Edit template',
              active: true,
            ),
          ),
          Expanded(
            child: _StepChip(
              icon: Icons.radio_button_unchecked_rounded,
              label: 'Submit for review',
              active: false,
            ),
          ),
        ],
      ),
    ),
  );

  Widget _suggestionNotice() => const Padding(
    padding: EdgeInsets.only(bottom: 10),
    child: Card(
      color: Color(0xFFFFF9E8),
      child: Padding(
        padding: EdgeInsets.all(12),
        child: Row(
          children: [
            Icon(Icons.auto_awesome_rounded, color: Color(0xFFF59E0B)),
            SizedBox(width: 9),
            Expanded(
              child: Text(
                'This is an admin suggestion. Personalize it for your business before submitting it to Meta.',
                style: TextStyle(fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _sectionCard({
    required String title,
    String? subtitle,
    required Widget child,
  }) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w900,
              color: BusinessColors.ink,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: const TextStyle(
                fontSize: 11,
                color: BusinessColors.muted,
                height: 1.35,
              ),
            ),
          ],
          const SizedBox(height: 12),
          child,
        ],
      ),
    ),
  );

  Future<void> _insertVariable(
    TextEditingController controller, {
    required String section,
  }) async {
    final existingTokens = _tokens(controller.text);
    if (section == 'HEADER' && existingTokens.isNotEmpty) {
      showAppMessage(
        context,
        'Header supports only one variable.',
        error: true,
      );
      return;
    }
    String token;
    if (variableType == 'NAME') {
      final input = TextEditingController(
        text: section == 'HEADER'
            ? 'customer_name'
            : existingTokens.isEmpty
            ? 'name'
            : 'value_${String.fromCharCode(97 + existingTokens.length % 26)}',
      );
      final value = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Variable name'),
          content: TextField(
            controller: input,
            autofocus: true,
            decoration: const InputDecoration(
              hintText: 'shop_name',
              helperText:
                  'Examples: customer_name, shop_name, business_address',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final v = input.text.trim();
                if (RegExp(r'^[a-z_]+$').hasMatch(v)) Navigator.pop(ctx, v);
              },
              child: const Text('Add'),
            ),
          ],
        ),
      );
      input.dispose();
      if (value == null || value.isEmpty) return;
      token = '{{$value}}';
    } else {
      final all = <int>[];
      // Meta numbers variables independently inside each component. A text header
      // may use {{1}} while the body also starts again at {{1}}.
      for (final t in _tokens(controller.text)) {
        final n = int.tryParse(t);
        if (n != null) all.add(n);
      }
      final next = all.isEmpty ? 1 : (all.reduce((a, b) => a > b ? a : b) + 1);
      token = '{{$next}}';
    }
    final selection = controller.selection;
    final text = controller.text;
    final offset = selection.isValid
        ? selection.start.clamp(0, text.length)
        : text.length;
    controller.text = text.replaceRange(offset, offset, token);
    controller.selection = TextSelection.collapsed(
      offset: offset + token.length,
    );
    setState(_ensureVariableEditors);
  }

  Widget _buttonEditor(int index) {
    final button = buttons[index];
    const textLimit = 25;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F9FC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: BusinessColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  _buttonTypeLabel(button.type),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              IconButton(
                onPressed: () => setState(() {
                  final removed = buttons.removeAt(index);
                  removed.dispose();
                }),
                icon: const Icon(Icons.close_rounded),
              ),
            ],
          ),
          if (button.type != 'COPY_CODE' &&
              button.type != 'REQUEST_CONTACT_INFO')
            TextFormField(
              controller: button.text,
              maxLength: textLimit,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'Button text'),
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? 'Button text is required' : null,
            ),
          if (button.type == 'REQUEST_CONTACT_INFO')
            const ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.contact_phone_outlined),
              title: Text(
                'Share Contact Info',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: Text(
                'Meta fixes this label. This must be the only button in the template.',
              ),
            ),
          if (button.type == 'URL')
            TextFormField(
              controller: button.value,
              maxLength: 2000,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Website URL',
                hintText: 'https://example.com',
              ),
              validator: (v) {
                final uri = Uri.tryParse((v ?? '').trim());
                if (uri == null ||
                    !uri.hasScheme ||
                    !['http', 'https'].contains(uri.scheme))
                  return 'Enter a complete http/https URL';
                return null;
              },
            ),
          if (button.type == 'PHONE_NUMBER')
            TextFormField(
              controller: button.value,
              maxLength: 20,
              keyboardType: TextInputType.phone,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Phone number with country code',
                hintText: '+919876543210',
              ),
              validator: (v) {
                final raw = (v ?? '').trim();
                if (!RegExp(r'^\+[1-9][0-9]{6,19}$').hasMatch(raw))
                  return 'Use international format with country code, e.g. +919876543210';
                return null;
              },
            ),
          if (button.type == 'COPY_CODE')
            TextFormField(
              controller: button.value,
              maxLength: 20,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'Offer code sample'),
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? 'Add a sample offer code' : null,
            ),
          if (button.type == 'FLOW')
            TextFormField(
              controller: button.value,
              maxLength: 100,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Meta Flow ID *',
                hintText: 'Enter Flow ID from WhatsApp Manager',
              ),
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? 'Flow ID is required' : null,
            ),
          if (button.type == 'FLOW') ...[
            const SizedBox(height: 8),
            TextFormField(
              controller: button.screen,
              decoration: const InputDecoration(
                labelText: 'Initial Flow screen ID *',
                hintText: 'WELCOME_SCREEN',
              ),
              validator: (v) => (v ?? '').trim().isEmpty
                  ? 'Enter the screen ID from your published Meta Flow'
                  : null,
            ),
            const SizedBox(height: 5),
            const Text(
              'Use a published Flow from your connected WhatsApp Business Account.',
              style: TextStyle(fontSize: 11, color: BusinessColors.muted),
            ),
          ],
          if (button.type == 'VOICE_CALL') ...[
            const SizedBox(height: 8),
            DropdownButtonFormField<int>(
              value: button.ttlDays,
              decoration: const InputDecoration(labelText: 'Active for'),
              items: const [1, 7, 14, 30]
                  .map(
                    (d) => DropdownMenuItem(
                      value: d,
                      child: Text('$d day${d == 1 ? '' : 's'}'),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => button.ttlDays = v ?? 7),
            ),
            const SizedBox(height: 6),
            const Text(
              'WhatsApp calling must also be enabled for the connected business phone number.',
              style: TextStyle(fontSize: 11, color: BusinessColors.muted),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _showAddButtonMenu() async {
    final type = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const ListTile(
              title: Text(
                'Add button',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
            _buttonMenuTile(
              ctx,
              'QUICK_REPLY',
              Icons.reply_rounded,
              'Custom',
              'Quick reply • up to 10 buttons total',
            ),
            _buttonMenuTile(
              ctx,
              'URL',
              Icons.open_in_new_rounded,
              'Visit website',
              '2 buttons maximum',
            ),
            _buttonMenuTile(
              ctx,
              'VOICE_CALL',
              Icons.call_outlined,
              'Call on WhatsApp',
              '1 button maximum',
            ),
            _buttonMenuTile(
              ctx,
              'PHONE_NUMBER',
              Icons.call_rounded,
              'Call phone number',
              '1 button maximum',
            ),
            if (templateMode == 'FLOW')
              _buttonMenuTile(
                ctx,
                'FLOW',
                Icons.account_tree_outlined,
                'Complete Flow',
                '1 button maximum',
              ),
            _buttonMenuTile(
              ctx,
              'COPY_CODE',
              Icons.copy_rounded,
              'Copy offer code',
              '1 button maximum',
            ),
            _buttonMenuTile(
              ctx,
              'REQUEST_CONTACT_INFO',
              Icons.contact_phone_outlined,
              'Share Contact Info',
              '1 button maximum • cannot be combined',
            ),
          ],
        ),
      ),
    );
    if (type == null || !mounted) return;
    final error = _buttonAddError(type);
    if (error != null) {
      showAppMessage(context, error, error: true);
      return;
    }
    setState(
      () => buttons.add(
        _TemplateButtonDraft(
          type: type,
          text: type == 'VOICE_CALL'
              ? 'Call on WhatsApp'
              : type == 'REQUEST_CONTACT_INFO'
              ? 'Share Contact Info'
              : '',
        ),
      ),
    );
  }

  Widget _buttonMenuTile(
    BuildContext ctx,
    String type,
    IconData icon,
    String title,
    String subtitle,
  ) {
    final error = _buttonAddError(type);
    return ListTile(
      enabled: error == null,
      leading: Icon(icon),
      title: Text(title),
      subtitle: Text(error ?? subtitle),
      onTap: error == null ? () => Navigator.pop(ctx, type) : null,
    );
  }

  String? _buttonAddError(String type) {
    if (buttons.length >= 10)
      return 'Template already has the maximum 10 buttons';
    if (buttons.any((b) => b.type == 'REQUEST_CONTACT_INFO') &&
        type != 'REQUEST_CONTACT_INFO') {
      return 'Share Contact Info cannot be combined with other buttons';
    }
    if (type == 'REQUEST_CONTACT_INFO' && buttons.isNotEmpty) {
      return 'Share Contact Info must be the only button';
    }
    final sameCount = buttons.where((b) => b.type == type).length;
    final limit = type == 'URL'
        ? 2
        : (type == 'PHONE_NUMBER' ||
              type == 'COPY_CODE' ||
              type == 'FLOW' ||
              type == 'VOICE_CALL' ||
              type == 'REQUEST_CONTACT_INFO')
        ? 1
        : 10;
    if (sameCount >= limit)
      return '$limit ${_buttonTypeLabel(type)} button${limit == 1 ? '' : 's'} maximum';
    return null;
  }

  String _buttonTypeLabel(String type) {
    switch (type) {
      case 'URL':
        return 'Visit website';
      case 'PHONE_NUMBER':
        return 'Call phone number';
      case 'VOICE_CALL':
        return 'Call on WhatsApp';
      case 'COPY_CODE':
        return 'Copy offer code';
      case 'FLOW':
        return 'Complete Flow';
      case 'REQUEST_CONTACT_INFO':
        return 'Share Contact Info';
      default:
        return 'Custom / quick reply';
    }
  }

  Future<String?> _resolveMediaHandle() async {
    if (mediaSample == 'NONE' || mediaSample == 'LOCATION') return null;
    if (mediaHandle.text.trim().isNotEmpty) return mediaHandle.text.trim();
    if (mediaBase64 == null || mediaFileName == null || mediaMimeType == null)
      return null;
    setState(() => uploadingMedia = true);
    try {
      final response = await ref
          .read(apiClientProvider)
          .post(
            '/api/whatsapp/templates/media-sample',
            data: {
              'fileName': mediaFileName,
              'mimeType': mediaMimeType,
              'dataBase64': mediaBase64,
            },
          );
      if (response is Map && '${response['handle'] ?? ''}'.trim().isNotEmpty) {
        final handle = '${response['handle']}'.trim();
        mediaHandle.text = handle;
        return handle;
      }
      throw Exception('Meta did not return a media handle.');
    } finally {
      if (mounted) setState(() => uploadingMedia = false);
    }
  }

  Map<String, String> _samplesFor(String section, String text) {
    final result = <String, String>{};
    for (final token in _tokens(text))
      result[token] = _sampleController(section, token).text.trim();
    return result;
  }

  Map<String, String> _meaningsFor(String section, String text) {
    final result = <String, String>{};
    for (final token in _tokens(text))
      result[token] =
          variableMeanings[_sampleKey(section, token)] ??
          _defaultMeaning(token);
    return result;
  }

  Future<void> _save({
    bool submitToMeta = true,
    bool categoryAcknowledged = false,
    bool utilityConfirmed = false,
  }) async {
    if (saving ||
        aiGenerating ||
        !_validateAllContent(requireLocation: submitToMeta))
      return;
    final headerError = mediaSample == 'NONE'
        ? _validateHeader(header.text)
        : null;
    final bodyError = _validateBody(body.text);
    if (headerError != null || bodyError != null) {
      showAppMessage(context, headerError ?? bodyError!, error: true);
      return;
    }
    if (templateMode == 'FLOW' && !buttons.any((b) => b.type == 'FLOW')) {
      showAppMessage(
        context,
        'Flow templates require a Complete Flow button.',
        error: true,
      );
      return;
    }
    if (buttons.length > 10) {
      showAppMessage(
        context,
        'A template can contain at most 10 buttons.',
        error: true,
      );
      return;
    }
    setState(() => saving = true);
    try {
      final resolvedHandle = submitToMeta
          ? await _resolveMediaHandle()
          : mediaHandle.text.trim();
      if (submitToMeta &&
          mediaSample != 'NONE' &&
          mediaSample != 'LOCATION' &&
          (resolvedHandle ?? '').isEmpty) {
        throw Exception(
          'Select a media sample file or provide a Meta header handle.',
        );
      }
      final payload = {
        'displayName': name.text.trim(),
        'category': category,
        'language': language,
        'header': mediaSample == 'NONE' ? header.text.trim() : '',
        'body': body.text.trim(),
        'footer': footer.text.trim(),
        'variableType': variableType,
        'headerSamples': _samplesFor('HEADER', header.text),
        'bodySamples': _samplesFor('BODY', body.text),
        'headerMeanings': _meaningsFor('HEADER', header.text),
        'bodyMeanings': _meaningsFor('BODY', body.text),
        'mediaFormat': mediaSample,
        'mediaHandle': resolvedHandle ?? '',
        'locationSample': mediaSample == 'LOCATION'
            ? {
                'latitude': locationLatitude.text.trim(),
                'longitude': locationLongitude.text.trim(),
                'name': locationName.text.trim(),
                'address': locationAddress.text.trim(),
              }
            : null,
        'mediaPreview': mediaBase64 != null && mediaMimeType != null
            ? {
                'dataBase64': mediaBase64,
                'mimeType': mediaMimeType,
                'fileName': mediaFileName ?? 'media',
              }
            : null,
        'buttons': buttons.map((button) => button.toMap()).toList(),
        'templateMode': templateMode,
        'submitToMeta': submitToMeta,
        'categoryAcknowledged': categoryAcknowledged,
        'utilityConfirmed': utilityConfirmed,
      };
      final response = isEditing || savedDraftId != null
          ? await ref
                .read(apiClientProvider)
                .put(
                  '/api/whatsapp/templates/${savedDraftId ?? widget.existing!.id}',
                  data: payload,
                )
          : await ref
                .read(apiClientProvider)
                .post('/api/whatsapp/templates', data: payload);
      ref.invalidate(templatesProvider);
      ref.invalidate(dashboardProvider);
      if (!mounted) return;
      final map = response is Map ? response : const {};
      final submitError = '${map['submitError'] ?? ''}'.trim();
      if (submitError.isNotEmpty) {
        savedDraftId = int.tryParse('${map['id']}');
        showAppMessage(context, submitError, error: true);
        return;
      }
      showAppMessage(
        context,
        submitToMeta
            ? 'Template sent to Meta. Sync to check the latest approval status.'
            : 'Template saved as Draft.',
      );
      completed = true;
      try {
        await _discardDraft();
      } catch (_) {}
      if (mounted) await exitGuard.currentState?.finish(true);
    } catch (error) {
      if (mounted) showAppMessage(context, '$error', error: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}

class _StepChip extends StatelessWidget {
  const _StepChip({
    required this.icon,
    required this.label,
    required this.active,
    this.done = false,
  });
  final IconData icon;
  final String label;
  final bool active;
  final bool done;

  @override
  Widget build(BuildContext context) {
    final color = done
        ? const Color(0xFF0E8F66)
        : active
        ? const Color(0xFF1677FF)
        : BusinessColors.muted;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: color),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            label,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ),
      ],
    );
  }
}

class _TemplateButtonDraft {
  _TemplateButtonDraft({
    required this.type,
    String text = '',
    String value = '',
    String screen = '',
    this.ttlDays = 7,
  }) : text = TextEditingController(text: text),
       value = TextEditingController(text: value),
       screen = TextEditingController(text: screen);

  factory _TemplateButtonDraft.fromMap(Map<String, dynamic> map) {
    final type = '${map['type'] ?? 'QUICK_REPLY'}'.toUpperCase();
    final value = type == 'URL'
        ? '${map['url'] ?? ''}'
        : type == 'PHONE_NUMBER'
        ? '${map['phone_number'] ?? map['phoneNumber'] ?? ''}'
        : type == 'COPY_CODE'
        ? '${map['example'] ?? map['code'] ?? ''}'
        : type == 'FLOW'
        ? '${map['flow_id'] ?? map['flowId'] ?? ''}'
        : '';
    final ttlMinutes =
        int.tryParse('${map['ttl_minutes'] ?? map['ttlMinutes'] ?? ''}') ??
        10080;
    final ttlDays = (ttlMinutes / 1440).round().clamp(1, 30).toInt();
    return _TemplateButtonDraft(
      type: type,
      text: '${map['text'] ?? ''}',
      value: value,
      ttlDays: ttlDays,
      screen: '${map["navigate_screen"] ?? ""}',
    );
  }

  final String type;
  final TextEditingController text;
  final TextEditingController value;
  final TextEditingController screen;
  int ttlDays;

  Map<String, dynamic> toMap() {
    if (type == 'URL')
      return {
        'type': 'URL',
        'text': text.text.trim(),
        'url': value.text.trim(),
      };
    if (type == 'PHONE_NUMBER')
      return {
        'type': 'PHONE_NUMBER',
        'text': text.text.trim(),
        'phone_number': value.text.trim(),
      };
    if (type == 'VOICE_CALL')
      return {
        'type': 'VOICE_CALL',
        'text': text.text.trim().isEmpty ? 'Call Now' : text.text.trim(),
        'ttl_minutes': ttlDays * 1440,
      };
    if (type == 'COPY_CODE')
      return {'type': 'COPY_CODE', 'example': value.text.trim()};
    if (type == 'FLOW')
      return {
        'type': 'FLOW',
        'text': text.text.trim().isEmpty ? 'Continue' : text.text.trim(),
        'flow_id': value.text.trim(),
        'navigate_screen': screen.text.trim(),
      };
    if (type == 'REQUEST_CONTACT_INFO')
      return {'type': 'REQUEST_CONTACT_INFO', 'text': 'Share Contact Info'};
    return {'type': 'QUICK_REPLY', 'text': text.text.trim()};
  }

  void dispose() {
    text.dispose();
    value.dispose();
    screen.dispose();
  }
}

Widget _previewCard(
  BuildContext context,
  String header,
  String body,
  String footer,
  List<dynamic> buttons, {
  String mediaType = 'NONE',
  String? mediaBase64,
  String? mediaName,
  String? mediaUrl,
  Map<String, dynamic>? location,
}) {
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: const Color(0xFFEFE9DF),
      borderRadius: BorderRadius.circular(14),
    ),
    child: Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 360),
        padding: const EdgeInsets.all(11),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 8)],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (const {
              'IMAGE',
              'VIDEO',
              'DOCUMENT',
            }.contains(mediaType.toUpperCase())) ...[
              TemplateMediaPreview(
                type: mediaType.toUpperCase(),
                dataBase64: mediaBase64,
                fileName: mediaName,
                url: mediaUrl,
                height: 150,
              ),
              const SizedBox(height: 8),
            ] else if (mediaType.toUpperCase() == 'LOCATION') ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFE8EDF5),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.location_on_outlined),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${location?['name'] ?? ''}'.trim().isNotEmpty
                            ? [
                                '${location?['name']}',
                                '${location?['address'] ?? ''}',
                                '${location?['latitude'] ?? ''}, ${location?['longitude'] ?? ''}',
                              ].where((v) => v.trim().isNotEmpty).join('\n')
                            : '${location?['latitude'] ?? ''}, ${location?['longitude'] ?? ''}',
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
            ],
            if (header.trim().isNotEmpty) ...[
              Text(
                header.trim(),
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 5),
            ],
            Text(
              body.trim().isEmpty ? 'No message body available.' : body.trim(),
              style: const TextStyle(height: 1.35),
            ),
            if (footer.trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                footer.trim(),
                style: const TextStyle(
                  fontSize: 11,
                  color: BusinessColors.muted,
                ),
              ),
            ],
            if (buttons.isNotEmpty) ...[
              const Divider(height: 16),
              ...buttons.take(10).map((raw) {
                final map = raw is Map ? raw : const {};
                final label =
                    '${map['text'] ?? (map['type'] == 'COPY_CODE' ? 'Copy offer code' : 'Action')}';
                return Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.touch_app_outlined,
                        size: 15,
                        color: Color(0xFF1677FF),
                      ),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(
                          label,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF1677FF),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ],
        ),
      ),
    ),
  );
}
