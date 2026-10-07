import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class AdminTemplateSuggestionsScreen extends ConsumerWidget {
  const AdminTemplateSuggestionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminTemplateSuggestionsProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(adminTemplateSuggestionsProvider.future),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 28),
        children: [
          Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Festival Template Suggestions', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
                    SizedBox(height: 4),
                    Text('Create reusable suggestions. Business users can edit a copy and submit it to Meta for approval.', style: TextStyle(color: BusinessColors.muted)),
                  ],
                ),
              ),
              FilledButton.icon(
                onPressed: () => _openEditor(context, ref),
                icon: const Icon(Icons.add_rounded),
                label: const Text('Create'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          async.when(
            loading: () => const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
            error: (e, _) => ErrorState(e, onRetry: () => ref.invalidate(adminTemplateSuggestionsProvider)),
            data: (rows) => rows.isEmpty
                ? const Card(child: Padding(padding: EdgeInsets.all(28), child: Center(child: Text('No template suggestions yet.'))))
                : Column(
                    children: rows.map((row) => _card(context, ref, row)).toList(),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _card(BuildContext context, WidgetRef ref, Map<String, dynamic> row) {
    final enabled = row['isActive'] != false;
    final title = '${row['title'] ?? 'Suggestion'}';
    final body = '${row['body'] ?? ''}';
    final festival = '${row['festival'] ?? ''}'.trim();
    final name = '${row['templateName'] ?? row['template_name'] ?? ''}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const SoftIcon(Icons.auto_awesome_rounded),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                        Text('${festival.isEmpty ? 'Campaign' : festival} • $name', style: const TextStyle(color: BusinessColors.muted, fontSize: 11)),
                      ],
                    ),
                  ),
                  Switch(
                    value: enabled,
                    onChanged: (value) => _setActive(context, ref, row, value),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(body, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(height: 1.4)),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: OutlinedButton.icon(onPressed: () => _openEditor(context, ref, existing: row), icon: const Icon(Icons.edit_outlined), label: const Text('Edit'))),
                  const SizedBox(width: 8),
                  Expanded(child: OutlinedButton.icon(onPressed: () => _delete(context, ref, row), icon: const Icon(Icons.delete_outline_rounded), label: const Text('Delete'))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openEditor(BuildContext context, WidgetRef ref, {Map<String, dynamic>? existing}) async {
    final changed = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => AdminTemplateSuggestionEditor(existing: existing)));
    if (changed == true) ref.invalidate(adminTemplateSuggestionsProvider);
  }

  Future<void> _setActive(BuildContext context, WidgetRef ref, Map<String, dynamic> row, bool active) async {
    try {
      await ref.read(apiClientProvider).put('/api/admin/template-suggestions/${row['id']}', data: {'isActive': active});
      ref.invalidate(adminTemplateSuggestionsProvider);
      ref.invalidate(templateSuggestionsProvider);
    } catch (e) {
      if (context.mounted) showAppMessage(context, '$e', error: true);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, Map<String, dynamic> row) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete suggestion?'),
        content: Text('Delete ${row['title'] ?? 'this suggestion'}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await ref.read(apiClientProvider).delete('/api/admin/template-suggestions/${row['id']}');
      ref.invalidate(adminTemplateSuggestionsProvider);
      ref.invalidate(templateSuggestionsProvider);
    } catch (e) {
      if (context.mounted) showAppMessage(context, '$e', error: true);
    }
  }
}

class AdminTemplateSuggestionEditor extends ConsumerStatefulWidget {
  const AdminTemplateSuggestionEditor({super.key, this.existing});
  final Map<String, dynamic>? existing;

  @override
  ConsumerState<AdminTemplateSuggestionEditor> createState() => _AdminTemplateSuggestionEditorState();
}

class _AdminTemplateSuggestionEditorState extends ConsumerState<AdminTemplateSuggestionEditor> {
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
    templateName = TextEditingController(text: '${m['templateName'] ?? m['template_name'] ?? ''}');
    header = TextEditingController(text: '${m['header'] ?? ''}');
    body = TextEditingController(text: '${m['body'] ?? ''}');
    footer = TextEditingController(text: '${m['footer'] ?? ''}');
    category = '${m['category'] ?? 'MARKETING'}';
    language = '${m['language'] ?? 'en_US'}';
    active = m['isActive'] != false;
  }

  @override
  void dispose() {
    for (final c in [title, festival, description, templateName, header, body, footer]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.existing == null ? 'Create Suggestion' : 'Edit Suggestion')),
        body: Form(
          key: form,
          child: ListView(
            padding: const EdgeInsets.all(18),
            children: [
              TextFormField(controller: title, decoration: const InputDecoration(labelText: 'Suggestion title *'), validator: (v) => (v ?? '').trim().length < 2 ? 'Enter a title' : null),
              const SizedBox(height: 12),
              TextFormField(controller: festival, decoration: const InputDecoration(labelText: 'Festival / campaign')),
              const SizedBox(height: 12),
              TextFormField(controller: description, minLines: 2, maxLines: 3, decoration: const InputDecoration(labelText: 'Business-facing description')),
              const SizedBox(height: 12),
              TextFormField(
                controller: templateName,
                maxLength: 512,
                decoration: const InputDecoration(labelText: 'Suggested template name *', hintText: 'diwali_greeting'),
                validator: (v) => RegExp(r'^[a-z0-9_]{3,512}$').hasMatch((v ?? '').trim().toLowerCase()) ? null : 'Use lowercase letters, numbers and underscores',
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      value: category,
                      decoration: const InputDecoration(labelText: 'Category'),
                      items: const [
                        DropdownMenuItem(value: 'MARKETING', child: Text('Marketing')),
                        DropdownMenuItem(value: 'UTILITY', child: Text('Utility')),
                        DropdownMenuItem(value: 'AUTHENTICATION', child: Text('Authentication')),
                      ],
                      onChanged: (v) => setState(() => category = v ?? 'MARKETING'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      value: language,
                      decoration: const InputDecoration(labelText: 'Language'),
                      items: const [
                        DropdownMenuItem(value: 'en_US', child: Text('English (US)')),
                        DropdownMenuItem(value: 'en', child: Text('English')),
                        DropdownMenuItem(value: 'hi', child: Text('Hindi')),
                      ],
                      onChanged: (v) => setState(() => language = v ?? 'en_US'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(controller: header, maxLength: 60, decoration: const InputDecoration(labelText: 'Header (optional)')),
              const SizedBox(height: 8),
              TextFormField(controller: body, minLines: 6, maxLines: 10, maxLength: 1024, decoration: const InputDecoration(labelText: 'Body *', alignLabelWithHint: true), validator: (v) => (v ?? '').trim().length < 5 ? 'Enter at least 5 characters' : null),
              const SizedBox(height: 8),
              TextFormField(controller: footer, maxLength: 60, decoration: const InputDecoration(labelText: 'Footer (optional)')),
              SwitchListTile(contentPadding: EdgeInsets.zero, value: active, onChanged: (v) => setState(() => active = v), title: const Text('Show to businesses', style: TextStyle(fontWeight: FontWeight.w800))),
              const SizedBox(height: 14),
              FilledButton(onPressed: saving ? null : _save, child: saving ? const CircularProgressIndicator(color: Colors.white) : const Text('Save Suggestion')),
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
      'buttons': const <Map<String, dynamic>>[],
      'isActive': active,
    };
    try {
      if (widget.existing == null) {
        await ref.read(apiClientProvider).post('/api/admin/template-suggestions', data: payload);
      } else {
        await ref.read(apiClientProvider).put('/api/admin/template-suggestions/${widget.existing!['id']}', data: payload);
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
