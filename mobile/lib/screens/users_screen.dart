import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/api_client.dart';
import '../models/models.dart';
import '../providers/providers.dart';

class UsersScreen extends ConsumerWidget {
  const UsersScreen({super.key});

  Future<void> _openForm(BuildContext context, WidgetRef ref, {BusinessUser? user}) async {
    final name = TextEditingController(text: user?.name ?? '');
    final mobile = TextEditingController(text: user?.mobile ?? '');
    final email = TextEditingController(text: user?.email.endsWith('@business.local') == true ? '' : user?.email ?? '');
    final password = TextEditingController();
    final formKey = GlobalKey<FormState>();
    bool saving = false;
    bool obscure = true;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
          child: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(user == null ? 'Create business user' : 'Edit business user', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 18),
                  TextFormField(
                    controller: name,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Name', prefixIcon: Icon(Icons.person_outline), border: OutlineInputBorder()),
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Name is required' : null,
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: mobile,
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Mobile number', hintText: '+91 98765 43210', prefixIcon: Icon(Icons.phone_outlined), border: OutlineInputBorder()),
                    validator: (v) {
                      final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                      if (digits.length < 10 || digits.length > 15) return 'Enter a valid mobile number';
                      return null;
                    },
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Email (optional)', prefixIcon: Icon(Icons.email_outlined), border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: password,
                    obscureText: obscure,
                    textInputAction: TextInputAction.done,
                    decoration: InputDecoration(
                      labelText: user == null ? 'Password' : 'New password (optional)',
                      helperText: user == null ? 'Minimum 8 characters' : 'Leave blank to keep current password',
                      prefixIcon: const Icon(Icons.lock_outline),
                      border: const OutlineInputBorder(),
                      suffixIcon: IconButton(onPressed: () => setModalState(() => obscure = !obscure), icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined)),
                    ),
                    validator: (v) {
                      if (user == null && (v == null || v.isEmpty)) return 'Password is required';
                      if (v != null && v.isNotEmpty && v.length < 8) return 'Use at least 8 characters';
                      return null;
                    },
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: saving ? null : () async {
                      if (!formKey.currentState!.validate()) return;
                      setModalState(() => saving = true);
                      try {
                        final data = <String, dynamic>{
                          'name': name.text.trim(),
                          'mobile': mobile.text.trim(),
                          'email': email.text.trim(),
                        };
                        if (password.text.isNotEmpty) data['password'] = password.text;
                        final api = ref.read(apiClientProvider);
                        if (user == null) {
                          await api.post('/api/admin/users', data: data);
                        } else {
                          await api.put('/api/admin/users/${user.id}', data: data);
                        }
                        ref.invalidate(businessUsersProvider);
                        if (context.mounted) Navigator.pop(context);
                      } catch (e) {
                        setModalState(() => saving = false);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : '$e')));
                        }
                      }
                    },
                    child: saving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(user == null ? 'Create user' : 'Save changes'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    name.dispose();
    mobile.dispose();
    email.dispose();
    password.dispose();
  }

  Future<void> _setActive(BuildContext context, WidgetRef ref, BusinessUser user, bool value) async {
    try {
      await ref.read(apiClientProvider).put('/api/admin/users/${user.id}', data: {'isActive': value});
      ref.invalidate(businessUsersProvider);
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : '$e')));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, BusinessUser user) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete business user?'),
        content: Text('This will remove ${user.name}. They will no longer be able to log in.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await ref.read(apiClientProvider).delete('/api/admin/users/${user.id}');
      ref.invalidate(businessUsersProvider);
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : '$e')));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final users = ref.watch(businessUsersProvider);
    return RefreshIndicator(
      onRefresh: () async { await ref.refresh(businessUsersProvider.future); },
      child: users.when(
        loading: () => ListView(children: [SizedBox(height: 220), Center(child: CircularProgressIndicator())]),
        error: (e, _) => ListView(padding: const EdgeInsets.all(20), children: [
          const SizedBox(height: 120),
          Icon(Icons.error_outline, size: 48, color: Theme.of(context).colorScheme.error),
          const SizedBox(height: 12),
          Text('$e', textAlign: TextAlign.center),
          const SizedBox(height: 12),
          FilledButton(onPressed: () => ref.invalidate(businessUsersProvider), child: const Text('Retry')),
        ]),
        data: (items) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Business Users', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text('${items.length} user${items.length == 1 ? '' : 's'}', style: Theme.of(context).textTheme.bodySmall),
              ])),
              FilledButton.icon(onPressed: () => _openForm(context, ref), icon: const Icon(Icons.person_add_alt_1), label: const Text('Add user')),
            ]),
            const SizedBox(height: 16),
            if (items.isEmpty)
              Card(child: Padding(padding: const EdgeInsets.all(28), child: Column(children: [
                const Icon(Icons.group_outlined, size: 54),
                const SizedBox(height: 12),
                const Text('No business users yet.'),
                const SizedBox(height: 12),
                OutlinedButton.icon(onPressed: () => _openForm(context, ref), icon: const Icon(Icons.add), label: const Text('Create first user')),
              ])))
            else
              ...items.map((user) => Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  leading: CircleAvatar(child: Text(user.name.isEmpty ? '?' : user.name.substring(0, 1).toUpperCase())),
                  title: Text(user.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: Text('${user.mobile}\n${user.isActive ? 'Active' : 'Disabled'}'),
                  ),
                  isThreeLine: true,
                  trailing: PopupMenuButton<String>(
                    onSelected: (value) {
                      if (value == 'edit') _openForm(context, ref, user: user);
                      if (value == 'toggle') _setActive(context, ref, user, !user.isActive);
                      if (value == 'delete') _delete(context, ref, user);
                    },
                    itemBuilder: (_) => [
                      const PopupMenuItem(value: 'edit', child: Text('Edit / reset password')),
                      PopupMenuItem(value: 'toggle', child: Text(user.isActive ? 'Disable login' : 'Enable login')),
                      const PopupMenuItem(value: 'delete', child: Text('Delete user')),
                    ],
                  ),
                ),
              )),
          ],
        ),
      ),
    );
  }
}
