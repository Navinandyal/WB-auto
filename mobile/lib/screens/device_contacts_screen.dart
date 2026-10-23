import '../core/contact_name.dart';
import '../widgets/import_group_option.dart';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import '../widgets/data_image.dart';

class DeviceContactsPanel extends ConsumerStatefulWidget {
  const DeviceContactsPanel({
    super.key,
    this.searchQuery,
    this.showSearch = true,
  });

  final String? searchQuery;
  final bool showSearch;

  @override
  ConsumerState<DeviceContactsPanel> createState() =>
      _DeviceContactsPanelState();
}

class _DeviceContactsPanelState extends ConsumerState<DeviceContactsPanel> {
  bool loading = true;
  bool denied = false;
  bool bulkSaving = false;
  String query = '';
  String? groupName;
  List<Contact> contacts = const [];
  final Set<String> importing = <String>{};
  final Set<String> selected = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      loading = true;
      denied = false;
    });
    try {
      final status = await FlutterContacts.permissions.request(
        PermissionType.read,
      );
      final granted =
          status == PermissionStatus.granted ||
          status == PermissionStatus.limited;
      if (!granted) {
        if (mounted)
          setState(() {
            denied = true;
            loading = false;
          });
        return;
      }
      final list = await FlutterContacts.getAll(
        properties: const {
          ContactProperty.name,
          ContactProperty.phone,
          ContactProperty.photoThumbnail,
        },
      );
      list.sort(
        (a, b) => (a.displayName ?? '').toLowerCase().compareTo(
          (b.displayName ?? '').toLowerCase(),
        ),
      );
      if (mounted) {
        setState(() {
          contacts = list;
          selected.removeWhere((key) => !list.any((c) => _key(c) == key));
          loading = false;
        });
      }
    } catch (_) {
      if (mounted)
        setState(() {
          denied = true;
          loading = false;
        });
    }
  }

  String _digits(String value) => value.replaceAll(RegExp(r'\D'), '');

  String? _normalizePhone(String raw) {
    final trimmed = raw.trim();
    var d = _digits(trimmed);
    if (d.isEmpty) return null;
    if (trimmed.startsWith('00') && d.length > 2) d = d.substring(2);
    if (!trimmed.startsWith('+') &&
        d.length == 10 &&
        RegExp(r'^[6-9]').hasMatch(d)) {
      return '+91$d';
    }
    if (d.length < 7 || d.length > 15) return null;
    return '+$d';
  }

  String _key(Contact c) {
    final displayName = contactName(c.displayName);
    final phone = c.phones.isEmpty ? '' : c.phones.first.number;
    return c.id ?? '$displayName|$phone';
  }

  String? _photoData(Contact c) {
    final bytes = c.photo?.thumbnail;
    if (bytes == null || bytes.isEmpty) return null;
    return 'data:image/jpeg;base64,${base64Encode(bytes)}';
  }

  Map<String, dynamic>? _rowFor(Contact c) {
    if (c.phones.isEmpty) return null;
    final phone = _normalizePhone(c.phones.first.number);
    if (phone == null) return null;
    final displayName = contactName(c.displayName);
    return {
      'name': displayName.isEmpty ? 'Phone Contact' : displayName,
      'phone': phone,
      'avatarData': _photoData(c),
    };
  }

  Future<void> _importOne(Contact c) async {
    final row = _rowFor(c);
    if (row == null) {
      showAppMessage(
        context,
        'This contact does not have a valid phone number with country code.',
        error: true,
      );
      return;
    }
    final contactKey = _key(c);
    setState(() => importing.add(contactKey));
    try {
      await ref
          .read(apiClientProvider)
          .post(
            '/api/contacts/import-device',
            data: {
              'rows': [row],
            },
          );
      ref.invalidate(contactsProvider);
      ref.invalidate(contactGroupsProvider);
      if (mounted)
        showAppMessage(
          context,
          '${row['name']} saved to GreetSync. WhatsApp opt-in is enabled by default.',
        );
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => importing.remove(contactKey));
    }
  }

  Future<void> _importSelected() async {
    if (bulkSaving) return;
    final groupError = importGroupError(groupName);
    if (groupError != null) {
      showAppMessage(context, groupError, error: true);
      return;
    }
    final chosen = contacts.where((c) => selected.contains(_key(c))).toList();
    final rows = chosen.map(_rowFor).whereType<Map<String, dynamic>>().toList();
    if (rows.isEmpty) {
      showAppMessage(
        context,
        'Select at least one contact with a valid phone number.',
        error: true,
      );
      return;
    }
    setState(() => bulkSaving = true);
    try {
      final response = await ref
          .read(apiClientProvider)
          .post(
            '/api/contacts/import-device',
            data: {
              'rows': rows,
              if (groupName != null) 'createGroupName': groupName!.trim(),
            },
          );
      ref.invalidate(contactsProvider);
      ref.invalidate(contactGroupsProvider);
      if (!mounted) return;
      final map = response is Map ? response : const {};
      final imported = map['imported'] ?? rows.length;
      final skipped = map['skipped'] ?? 0;
      final failed = map['failed'] ?? 0;
      setState(() => selected.clear());
      final group = map['group'];
      final groupNote = group is Map
          ? ' Group: ${group['name']} (${group['memberCount']} contacts).'
          : '';
      showAppMessage(
        context,
        '$imported contact(s) added to GreetSync. $skipped skipped, $failed failed.$groupNote',
      );
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => bulkSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (denied) {
      return ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const SizedBox(height: 50),
          const Icon(
            Icons.contacts_outlined,
            size: 58,
            color: BusinessColors.muted,
          ),
          const SizedBox(height: 16),
          const Text(
            'Contacts permission required',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          const Text(
            'Allow contacts access to select and add phone contacts to GreetSync.',
            textAlign: TextAlign.center,
            style: TextStyle(color: BusinessColors.muted),
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: _load,
            icon: const Icon(Icons.security_outlined),
            label: const Text('Allow Contacts'),
          ),
        ],
      );
    }

    final q = (widget.searchQuery ?? query).trim().toLowerCase();
    final filtered = contacts.where((c) {
      final phone = c.phones.isEmpty ? '' : c.phones.first.number;
      return q.isEmpty ||
          (c.displayName ?? '').toLowerCase().contains(q) ||
          phone.contains(q);
    }).toList();
    final validFiltered = filtered.where((c) => _rowFor(c) != null).toList();
    final allVisibleSelected =
        validFiltered.isNotEmpty &&
        validFiltered.every((c) => selected.contains(_key(c)));

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 110),
        children: [
          if (widget.showSearch) ...[
            TextField(
              onChanged: (v) => setState(() => query = v),
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Search phone contacts',
              ),
            ),
            const SizedBox(height: 12),
          ],
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: BusinessColors.line),
            ),
            child: Row(
              children: [
                Checkbox(
                  value: allVisibleSelected,
                  onChanged: bulkSaving || validFiltered.isEmpty
                      ? null
                      : (value) {
                          setState(() {
                            if (value == true) {
                              selected.addAll(validFiltered.map(_key));
                            } else {
                              selected.removeAll(validFiltered.map(_key));
                            }
                          });
                        },
                ),
                Expanded(
                  child: Text(
                    selected.isEmpty
                        ? '${filtered.length} phone contacts'
                        : '${selected.length} selected',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: BusinessColors.ink,
                    ),
                  ),
                ),
                if (selected.isNotEmpty)
                  FilledButton.icon(
                    onPressed: bulkSaving || importing.isNotEmpty
                        ? null
                        : _importSelected,
                    icon: bulkSaving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.person_add_alt_1_rounded, size: 18),
                    label: const Text('Add selected'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          ImportGroupOption(
            value: groupName,
            enabled: !bulkSaving,
            onChanged: (value) => setState(() => groupName = value),
          ),
          const SizedBox(height: 10),
          if (filtered.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(28),
                child: Center(child: Text('No phone contacts found.')),
              ),
            )
          else
            ...filtered.map((c) {
              final phone = c.phones.isEmpty
                  ? 'No phone number'
                  : c.phones.first.number;
              final displayName = contactName(c.displayName);
              final contactKey = _key(c);
              final busy = importing.contains(contactKey);
              final valid = _rowFor(c) != null;
              final checked = selected.contains(contactKey);
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  child: ListTile(
                    onTap: valid && !bulkSaving
                        ? () => setState(
                            () => checked
                                ? selected.remove(contactKey)
                                : selected.add(contactKey),
                          )
                        : null,
                    leading: SizedBox(
                      width: 76,
                      child: Row(
                        children: [
                          Checkbox(
                            value: checked,
                            onChanged: valid && !bulkSaving
                                ? (value) => setState(
                                    () => value == true
                                        ? selected.add(contactKey)
                                        : selected.remove(contactKey),
                                  )
                                : null,
                          ),
                          DataImageAvatar(
                            data: _photoData(c),
                            radius: 16,
                            fallbackText: displayName.isEmpty
                                ? '?'
                                : displayName[0].toUpperCase(),
                          ),
                        ],
                      ),
                    ),
                    title: Text(
                      displayName.isEmpty ? 'Unnamed contact' : displayName,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    subtitle: Text(
                      valid
                          ? phone
                          : '$phone\nAdd a valid country code before importing.',
                    ),
                    isThreeLine: !valid,
                    trailing: TextButton(
                      onPressed: bulkSaving || busy || !valid
                          ? null
                          : () => _importOne(c),
                      child: busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Add'),
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}
