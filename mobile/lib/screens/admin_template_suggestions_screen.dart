import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import '../widgets/admin_ui.dart';
import '../widgets/common.dart';

List<Map<String, dynamic>> suggestionComponents(Map<String, dynamic> row) => [
  if ('${row['header'] ?? ''}'.isNotEmpty)
    {'type': 'HEADER', 'format': 'TEXT', 'text': row['header']},
  {'type': 'BODY', 'text': row['body'] ?? ''},
  if ('${row['footer'] ?? ''}'.isNotEmpty)
    {'type': 'FOOTER', 'text': row['footer']},
  if ((row['buttons'] as List? ?? const []).isNotEmpty)
    {'type': 'BUTTONS', 'buttons': row['buttons']},
];

class AdminTemplateSuggestionsScreen extends ConsumerStatefulWidget {
  const AdminTemplateSuggestionsScreen({super.key});
  @override
  ConsumerState<AdminTemplateSuggestionsScreen> createState() =>
      _AdminTemplateSuggestionsScreenState();
}

class _AdminTemplateSuggestionsScreenState
    extends ConsumerState<AdminTemplateSuggestionsScreen> {
  String search = '', status = 'ALL';
  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: () async => ref.refresh(adminTemplateSuggestionsProvider.future),
    child: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        AdminHeader(
          'Template suggestions',
          'Offer reusable ideas for festivals, reminders and campaigns. Businesses can edit a copy before requesting Meta approval.',
          icon: Icons.auto_awesome_outlined,
          action: FilledButton.icon(
            onPressed: () => _openEditor(),
            icon: const Icon(Icons.add),
            label: const Text('Create suggestion'),
          ),
        ),
        TextField(
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            hintText: 'Search suggestion or campaign',
          ),
          onChanged: (v) => setState(() => search = v),
        ),
        const SizedBox(height: 14),
        AdminStatusTabs(
          values: const ['ALL', 'AVAILABLE', 'HIDDEN'],
          selected: status,
          onChanged: (v) => setState(() => status = v),
        ),
        const SizedBox(height: 16),
        ref
            .watch(adminTemplateSuggestionsProvider)
            .when(
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => ErrorState(
                e,
                onRetry: () => ref.invalidate(adminTemplateSuggestionsProvider),
              ),
              data: (all) {
                final q = search.toLowerCase().trim();
                final rows = all
                    .where(
                      (r) =>
                          (status == 'ALL' ||
                              (r['isActive'] != false
                                      ? 'AVAILABLE'
                                      : 'HIDDEN') ==
                                  status) &&
                          (q.isEmpty ||
                              ['title', 'festival', 'templateName', 'body'].any(
                                (k) =>
                                    '${r[k] ?? ''}'.toLowerCase().contains(q),
                              )),
                    )
                    .toList();
                return Column(
                  children: [
                    if (rows.isEmpty)
                      const EmptyState('No matching suggestions.'),
                    ...rows.map(
                      (r) => AdminPanel(
                        title: '${r['title']}',
                        trailing: AdminBadge(
                          r['isActive'] != false ? 'AVAILABLE' : 'HIDDEN',
                        ),
                        children: [
                          Text(
                            '${r['festival'] ?? 'Campaign'} · ${r['language']} · ${r['category']}',
                            style: const TextStyle(
                              color: adminMuted,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            '${r['body']}',
                            maxLines: 4,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(height: 1.5),
                          ),
                          const SizedBox(height: 14),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton.icon(
                                onPressed: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => Scaffold(
                                      appBar: AppBar(
                                        title: const Text('Suggestion preview'),
                                      ),
                                      body: ListView(
                                        padding: const EdgeInsets.all(20),
                                        children: [
                                          AdminHeader(
                                            '${r['title']}',
                                            'Reusable suggestion. Meta approval is required for each business.',
                                          ),
                                          AdminTemplatePreview({
                                            'components': suggestionComponents(
                                              r,
                                            ),
                                          }),
                                          const SizedBox(height: 20),
                                          adminInfo(
                                            'Template name',
                                            r['templateName'],
                                          ),
                                          adminInfo('Category', r['category']),
                                          adminInfo('Language', r['language']),
                                          adminInfo(
                                            'Description',
                                            r['description'],
                                          ),
                                          FilledButton.icon(
                                            onPressed: () =>
                                                _openEditor(existing: r),
                                            icon: const Icon(
                                              Icons.edit_outlined,
                                            ),
                                            label: const Text(
                                              'Edit suggestion',
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                                icon: const Icon(Icons.visibility_outlined),
                                label: const Text('Preview'),
                              ),
                              OutlinedButton.icon(
                                onPressed: () => _openEditor(existing: r),
                                icon: const Icon(Icons.edit_outlined),
                                label: const Text('Edit'),
                              ),
                              TextButton(
                                onPressed: () => _delete(r),
                                child: const Text('Delete'),
                              ),
                            ],
                          ),
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('Available to businesses'),
                            value: r['isActive'] != false,
                            onChanged: (v) => _setActive(r, v),
                          ),
                        ],
                      ),
                    ),
                  ],
                );
              },
            ),
      ],
    ),
  );
  Future<void> _openEditor({Map<String, dynamic>? existing}) async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => AdminTemplateSuggestionEditor(existing: existing),
      ),
    );
    if (changed == true) ref.invalidate(adminTemplateSuggestionsProvider);
  }

  Future<void> _setActive(Map<String, dynamic> row, bool value) async {
    try {
      await ref
          .read(apiClientProvider)
          .put(
            '/api/admin/template-suggestions/${row['id']}',
            data: {'isActive': value},
          );
      ref.invalidate(adminTemplateSuggestionsProvider);
      ref.invalidate(templateSuggestionsProvider);
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    }
  }

  Future<void> _delete(Map<String, dynamic> row) async {
    if (!await adminConfirm(
          context,
          'Delete suggestion?',
          'Remove ${row['title']} from the suggestion catalogue?',
        ) ||
        !mounted)
      return;
    try {
      await ref
          .read(apiClientProvider)
          .delete('/api/admin/template-suggestions/${row['id']}');
      ref.invalidate(adminTemplateSuggestionsProvider);
      ref.invalidate(templateSuggestionsProvider);
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    }
  }
}

class AdminTemplateSuggestionEditor extends ConsumerStatefulWidget {
  const AdminTemplateSuggestionEditor({super.key, this.existing});
  final Map<String, dynamic>? existing;

  @override
  ConsumerState<AdminTemplateSuggestionEditor> createState() =>
      _AdminTemplateSuggestionEditorState();
}

class _AdminTemplateSuggestionEditorState
    extends ConsumerState<AdminTemplateSuggestionEditor> {
  final form = GlobalKey<FormState>();
  late final TextEditingController title;
  late final TextEditingController festival;
  late final TextEditingController description;
  late final TextEditingController templateName;
  late final TextEditingController header;
  late final TextEditingController body;
  late final TextEditingController footer;
  String category = 'MARKETING';
  String language = 'en_US';
  bool active = true;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    final m = widget.existing ?? const <String, dynamic>{};
    title = TextEditingController(text: '${m['title'] ?? ''}');
    festival = TextEditingController(text: '${m['festival'] ?? ''}');
    description = TextEditingController(text: '${m['description'] ?? ''}');
    templateName = TextEditingController(
      text: '${m['templateName'] ?? m['template_name'] ?? ''}',
    );
    header = TextEditingController(text: '${m['header'] ?? ''}');
    body = TextEditingController(text: '${m['body'] ?? ''}');
    footer = TextEditingController(text: '${m['footer'] ?? ''}');
    category = '${m['category'] ?? 'MARKETING'}';
    language = '${m['language'] ?? 'en_US'}';
    if (language == 'en') language = 'en_US';
    active = m['isActive'] != false;
  }

  @override
  void dispose() {
    for (final c in [
      title,
      festival,
      description,
      templateName,
      header,
      body,
      footer,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        widget.existing == null ? 'Create Suggestion' : 'Edit Suggestion',
      ),
    ),
    body: Form(
      key: form,
      child: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const AdminHeader(
            'Suggestion setup',
            'Create a reusable message that business owners can personalize.',
            icon: Icons.auto_awesome_outlined,
          ),
          TextFormField(
            controller: title,
            decoration: const InputDecoration(labelText: 'Suggestion title *'),
            validator: (v) =>
                (v ?? '').trim().length < 2 ? 'Enter a title' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: festival,
            decoration: const InputDecoration(labelText: 'Festival / campaign'),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: description,
            minLines: 2,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Business-facing description',
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: templateName,
            maxLength: 512,
            decoration: const InputDecoration(
              labelText: 'Suggested template name *',
              hintText: 'diwali_greeting',
            ),
            validator: (v) =>
                RegExp(
                  r'^[a-z0-9_]{3,512}$',
                ).hasMatch((v ?? '').trim().toLowerCase())
                ? null
                : 'Use lowercase letters, numbers and underscores',
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: category,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: const [
                    DropdownMenuItem(
                      value: 'MARKETING',
                      child: Text('Marketing'),
                    ),
                    DropdownMenuItem(value: 'UTILITY', child: Text('Utility')),
                    DropdownMenuItem(
                      value: 'AUTHENTICATION',
                      child: Text('Authentication'),
                    ),
                  ],
                  onChanged: (v) => setState(() => category = v ?? 'MARKETING'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: language,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Language'),
                  items: const [
                    DropdownMenuItem(value: 'en_US', child: Text('English')),
                    DropdownMenuItem(value: 'mr', child: Text('Marathi')),
                    DropdownMenuItem(value: 'hi', child: Text('Hindi')),
                  ],
                  onChanged: (v) => setState(() => language = v ?? 'en_US'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: header,
            maxLength: 60,
            decoration: const InputDecoration(labelText: 'Header (optional)'),
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: body,
            minLines: 6,
            maxLines: 10,
            maxLength: 1024,
            decoration: const InputDecoration(
              labelText: 'Body *',
              alignLabelWithHint: true,
            ),
            validator: (v) => (v ?? '').trim().length < 5
                ? 'Enter at least 5 characters'
                : null,
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: footer,
            maxLength: 60,
            decoration: const InputDecoration(labelText: 'Footer (optional)'),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: active,
            onChanged: (v) => setState(() => active = v),
            title: const Text(
              'Show to businesses',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          const SizedBox(height: 14),
          AdminPanel(
            title: 'WhatsApp preview',
            children: [
              AnimatedBuilder(
                animation: Listenable.merge([header, body, footer]),
                builder: (context, _) => AdminTemplatePreview({
                  'components': suggestionComponents({
                    'header': header.text,
                    'body': body.text,
                    'footer': footer.text,
                    'buttons': widget.existing?['buttons'] ?? [],
                  }),
                }),
              ),
            ],
          ),
          FilledButton(
            onPressed: saving ? null : _save,
            child: saving
                ? const CircularProgressIndicator(color: Colors.white)
                : const Text('Save Suggestion'),
          ),
        ],
      ),
    ),
  );

  Future<void> _save() async {
    if (!(form.currentState?.validate() ?? false)) return;
    setState(() => saving = true);
    final payload = {
      'title': title.text.trim(),
      'festival': festival.text.trim(),
      'description': description.text.trim(),
      'templateName': templateName.text.trim().toLowerCase(),
      'category': category,
      'language': language,
      'header': header.text.trim(),
      'body': body.text.trim(),
      'footer': footer.text.trim(),
      'buttons': widget.existing?['buttons'] ?? const <Map<String, dynamic>>[],
      'isActive': active,
    };
    try {
      if (widget.existing == null) {
        await ref
            .read(apiClientProvider)
            .post('/api/admin/template-suggestions', data: payload);
      } else {
        await ref
            .read(apiClientProvider)
            .put(
              '/api/admin/template-suggestions/${widget.existing!['id']}',
              data: payload,
            );
      }
      ref.invalidate(adminTemplateSuggestionsProvider);
      ref.invalidate(templateSuggestionsProvider);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}
