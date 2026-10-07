import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import '../widgets/data_image.dart';

class GroupsScreen extends ConsumerStatefulWidget {
  const GroupsScreen({super.key});

  @override
  ConsumerState<GroupsScreen> createState() => _GroupsScreenState();

  static Future<void> editGroup(
    BuildContext context,
    WidgetRef ref, [
    ContactGroup? group,
  ]) async {
    final contacts = await ref.read(contactsProvider.future);
    if (!context.mounted) return;

    final name = TextEditingController(text: group?.name ?? '');
    final description = TextEditingController(text: group?.description ?? '');
    final selected = <int>{};
    if (group != null) {
      final data = await ref.read(apiClientProvider).get('/api/contact-groups/${group.id}');
      if (data is Map) {
        selected.addAll(
          ((data['members'] as List?) ?? const [])
              .whereType<Map>()
              .map((row) => int.tryParse('${row['id']}') ?? 0)
              .where((id) => id > 0),
        );
      }
    }
    if (!context.mounted) return;

    var saving = false;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: Text(group == null ? 'Create Group' : 'Edit Group'),
          content: SizedBox(
            width: 430,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: name,
                    maxLength: 80,
                    decoration: const InputDecoration(labelText: 'Group Name *'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: description,
                    maxLength: 240,
                    minLines: 2,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: 'Description (optional)'),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Expanded(
                        child: Text('Select Contacts', style: TextStyle(fontWeight: FontWeight.w900)),
                      ),
                      Text('${selected.length} selected', style: const TextStyle(color: BusinessColors.muted)),
                    ],
                  ),
                  const SizedBox(height: 5),
                  ...contacts.map(
                    (contact) => CheckboxListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      value: selected.contains(contact.id),
                      title: Text(contact.name),
                      subtitle: Text(contact.phone),
                      onChanged: saving
                          ? null
                          : (value) => setDialogState(() {
                                if (value == true) {
                                  selected.add(contact.id);
                                } else {
                                  selected.remove(contact.id);
                                }
                              }),
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: saving ? null : () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: saving
                  ? null
                  : () async {
                      final cleanName = name.text.trim();
                      if (cleanName.length < 2) {
                        showAppMessage(dialogContext, 'Enter a valid group name.', error: true);
                        return;
                      }
                      setDialogState(() => saving = true);
                      try {
                        final payload = {
                          'name': cleanName,
                          'description': description.text.trim(),
                          'contactIds': selected.toList(),
                        };
                        if (group == null) {
                          await ref.read(apiClientProvider).post('/api/contact-groups', data: payload);
                        } else {
                          await ref.read(apiClientProvider).put('/api/contact-groups/${group.id}', data: payload);
                        }
                        ref.invalidate(contactGroupsProvider);
                        ref.invalidate(contactsProvider);
                        if (dialogContext.mounted) Navigator.pop(dialogContext);
                      } catch (error) {
                        if (dialogContext.mounted) {
                          setDialogState(() => saving = false);
                          showAppMessage(dialogContext, '$error', error: true);
                        }
                      }
                    },
              child: saving
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Save'),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    description.dispose();
  }
}

class _GroupsScreenState extends ConsumerState<GroupsScreen> {
  final search = TextEditingController();
  String query = '';

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final groups = ref.watch(contactGroupsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Contact Groups')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => GroupsScreen.editGroup(context, ref),
        icon: const Icon(Icons.group_add_rounded),
        label: const Text('Create Group'),
      ),
      body: groups.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorState(error, onRetry: () => ref.invalidate(contactGroupsProvider)),
        data: (items) {
          final q = query.trim().toLowerCase();
          final filtered = items
              .where((group) => q.isEmpty || group.name.toLowerCase().contains(q) || (group.description ?? '').toLowerCase().contains(q))
              .toList();
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(contactGroupsProvider);
              await ref.read(contactGroupsProvider.future);
            },
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 100),
              children: [
                TextField(
                  controller: search,
                  onChanged: (value) => setState(() => query = value),
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search_rounded),
                    hintText: 'Search groups by name',
                    suffixIcon: query.isEmpty
                        ? null
                        : IconButton(
                            onPressed: () {
                              search.clear();
                              setState(() => query = '');
                            },
                            icon: const Icon(Icons.close_rounded),
                          ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    const Expanded(child: Text('Groups', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900))),
                    Text('${filtered.length}', style: const TextStyle(color: BusinessColors.muted, fontWeight: FontWeight.w800)),
                  ],
                ),
                const SizedBox(height: 10),
                if (filtered.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(28),
                      child: Center(child: Text('No groups match your search.')),
                    ),
                  )
                else
                  ...filtered.map(
                    (group) => Padding(
                      padding: const EdgeInsets.only(bottom: 9),
                      child: Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                          leading: const CircleAvatar(child: Icon(Icons.groups_rounded)),
                          title: Text(group.name, style: const TextStyle(fontWeight: FontWeight.w900)),
                          subtitle: Text(
                            '${group.memberCount} contact${group.memberCount == 1 ? '' : 's'}'
                            '${group.description?.isNotEmpty == true ? '\n${group.description}' : ''}',
                          ),
                          isThreeLine: group.description?.isNotEmpty == true,
                          onTap: () => _details(group),
                          trailing: PopupMenuButton<String>(
                            color: Colors.white,
                            surfaceTintColor: Colors.white,
                            onSelected: (value) {
                              if (value == 'edit') GroupsScreen.editGroup(context, ref, group);
                              if (value == 'delete') _delete(group);
                            },
                            itemBuilder: (_) => const [
                              PopupMenuItem(value: 'edit', child: Text('Edit group')),
                              PopupMenuItem(value: 'delete', child: Text('Delete group')),
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
      ),
    );
  }

  Future<void> _details(ContactGroup group) async {
    try {
      final data = await ref.read(apiClientProvider).get('/api/contact-groups/${group.id}');
      if (!mounted || data is! Map) return;
      final members = ((data['members'] as List?) ?? const []).whereType<Map>().toList();
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: .75,
          builder: (ctx, scroll) => ListView(
            controller: scroll,
            padding: const EdgeInsets.all(18),
            children: [
              Text(group.name, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
              Text('${members.length} contacts', style: const TextStyle(color: BusinessColors.muted)),
              const SizedBox(height: 12),
              if (members.isEmpty)
                const Padding(padding: EdgeInsets.all(20), child: Center(child: Text('No contacts in this group.')))
              else
                ...members.map(
                  (member) => ListTile(
                    leading: DataImageAvatar(
                      data: member['avatarData']?.toString(),
                      fallbackText: '${member['name'] ?? '?'}'.isEmpty ? '?' : '${member['name'] ?? '?'}'[0].toUpperCase(),
                    ),
                    title: Text('${member['name'] ?? ''}'),
                    subtitle: Text('${member['phone'] ?? ''}'),
                  ),
                ),
            ],
          ),
        ),
      );
    } catch (error) {
      if (mounted) showAppMessage(context, '$error', error: true);
    }
  }

  Future<void> _delete(ContactGroup group) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete group?'),
        content: Text('Delete ${group.name}? Contacts themselves will not be deleted.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await ref.read(apiClientProvider).delete('/api/contact-groups/${group.id}');
      ref.invalidate(contactGroupsProvider);
      ref.invalidate(contactsProvider);
    } catch (error) {
      if (mounted) showAppMessage(context, '$error', error: true);
    }
  }
}
