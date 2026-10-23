import 'package:flutter/material.dart';

String? importGroupError(String? name) {
  if (name == null) return null;
  final length = name.trim().length;
  return length < 2 || length > 80
      ? 'Enter a group name with 2–80 characters.'
      : null;
}

class ImportGroupOption extends StatelessWidget {
  const ImportGroupOption({
    super.key,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });
  final String? value;
  final ValueChanged<String?> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            secondary: const Icon(Icons.group_add_outlined),
            title: const Text(
              'Create a group',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: const Text(
              'Keep these contacts together for bulk messages.',
            ),
            value: value != null,
            onChanged: enabled
                ? (selected) => onChanged(selected ? '' : null)
                : null,
          ),
          if (value != null) ...[
            TextFormField(
              initialValue: value,
              enabled: enabled,
              maxLength: 80,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Group name',
                hintText: 'For example: October customers',
              ),
              onChanged: onChanged,
            ),
            const Text(
              'If this group already exists, contacts are added to it. Duplicate contacts already saved in your business are included without changing their details.',
              style: TextStyle(fontSize: 12),
            ),
          ],
        ],
      ),
    ),
  );
}
