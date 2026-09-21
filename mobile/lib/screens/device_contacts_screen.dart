import 'package:flutter/material.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class DeviceContactsPanel extends ConsumerStatefulWidget {
  const DeviceContactsPanel({super.key});

  @override
  ConsumerState<DeviceContactsPanel> createState() => _DeviceContactsPanelState();
}

class _DeviceContactsPanelState extends ConsumerState<DeviceContactsPanel> {
  bool loading = true;
  bool denied = false;
  String query = '';
  List<Contact> contacts = const [];
  final Set<String> importing = <String>{};

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
      final granted = await FlutterContacts.requestPermission(readonly: true);
      if (!granted) {
        if (mounted) setState(() { denied = true; loading = false; });
        return;
      }
      final list = await FlutterContacts.getContacts(withProperties: true);
      list.sort((a, b) => a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase()));
      if (mounted) setState(() { contacts = list; loading = false; });
    } catch (_) {
      if (mounted) setState(() { denied = true; loading = false; });
    }
  }

  String _digits(String value) => value.replaceAll(RegExp(r'\D'), '');

  String? _normalizeIndianPhone(String raw) {
    var d = _digits(raw);
    if (d.startsWith('91') && d.length == 12) d = d.substring(2);
    if (d.length != 10 || !RegExp(r'^[6-9]').hasMatch(d)) return null;
    return '+91$d';
  }

  Future<void> _import(Contact c) async {
    final raw = c.phones.isEmpty ? '' : c.phones.first.number;
    final phone = _normalizeIndianPhone(raw);
    if (phone == null) {
      showAppMessage(context, 'This contact does not have a valid 10-digit Indian mobile number.', error: true);
      return;
    }
    final name = c.displayName.trim().isEmpty ? 'Phone Contact' : c.displayName.trim();
    setState(() => importing.add(c.id));
    try {
      await ref.read(apiClientProvider).post('/api/contacts', data: {
        'name': name,
        'phone': phone,
        'optIn': false,
        'birthdayAutomationEnabled': false,
        'notes': 'Imported from device contacts. WhatsApp consent must be enabled manually before messaging.',
      });
      ref.invalidate(contactsProvider);
      if (mounted) showAppMessage(context, '$name saved to WishFlow. Enable WhatsApp consent before messaging.');
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => importing.remove(c.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (denied) {
      return ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const SizedBox(height: 50),
          const Icon(Icons.contacts_outlined, size: 58, color: BusinessColors.muted),
          const SizedBox(height: 16),
          const Text('Contacts permission required', textAlign: TextAlign.center, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          const Text('Allow contacts access to show your phone contacts inside WishFlow.', textAlign: TextAlign.center, style: TextStyle(color: BusinessColors.muted)),
          const SizedBox(height: 18),
          FilledButton.icon(onPressed: _load, icon: const Icon(Icons.security_outlined), label: const Text('Allow Contacts')),
        ],
      );
    }

    final q = query.trim().toLowerCase();
    final filtered = contacts.where((c) {
      final phone = c.phones.isEmpty ? '' : c.phones.first.number;
      return q.isEmpty || c.displayName.toLowerCase().contains(q) || phone.contains(q);
    }).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 90),
        children: [
          TextField(
            onChanged: (v) => setState(() => query = v),
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search phone contacts'),
          ),
          const SizedBox(height: 12),
          Text('${filtered.length} phone contacts', style: const TextStyle(color: BusinessColors.muted, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (filtered.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(28), child: Center(child: Text('No phone contacts found.'))))
          else
            ...filtered.map((c) {
              final phone = c.phones.isEmpty ? 'No phone number' : c.phones.first.number;
              final busy = importing.contains(c.id);
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: BusinessColors.greenSoft,
                      child: Text(c.displayName.trim().isEmpty ? '?' : c.displayName.trim()[0].toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900, color: BusinessColors.greenDark)),
                    ),
                    title: Text(c.displayName.trim().isEmpty ? 'Unnamed contact' : c.displayName, style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text(phone),
                    trailing: TextButton(
                      onPressed: busy || c.phones.isEmpty ? null : () => _import(c),
                      child: busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save'),
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
