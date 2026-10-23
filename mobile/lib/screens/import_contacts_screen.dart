import '../core/contact_name.dart';
import '../widgets/import_group_option.dart';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:flutter/services.dart';
import '../core/contact_import_parser.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class ImportContactsScreen extends ConsumerStatefulWidget {
  const ImportContactsScreen({super.key});

  @override
  ConsumerState<ImportContactsScreen> createState() =>
      _ImportContactsScreenState();
}

class _ImportContactsScreenState extends ConsumerState<ImportContactsScreen> {
  static const maxRows = 10000;
  static const optionalHeaders = <String>[
    'country_code',
    'email',
    'date_of_birth',
    'opt_in',
    'notes',
  ];

  List<Map<String, dynamic>> rows = [];
  String? fileName;
  String? groupName;
  bool importing = false;
  Map<String, dynamic>? result;

  Future<void> _choose() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['csv', 'xlsx'],
      withData: true,
      allowMultiple: false,
    );
    if (picked == null || !mounted) return;
    setState(() {
      rows = [];
      fileName = null;
      result = null;
    });

    try {
      final file = picked.files.single;
      final bytes =
          file.bytes ??
          (file.path != null ? await File(file.path!).readAsBytes() : null);
      if (bytes == null || bytes.isEmpty)
        throw Exception(
          'Unable to read the selected file. Please choose the file again.',
        );
      final lowerName = file.name.toLowerCase();
      final ext =
          (file.extension ??
                  (lowerName.endsWith('.xlsx')
                      ? 'xlsx'
                      : lowerName.endsWith('.csv')
                      ? 'csv'
                      : ''))
              .toLowerCase();
      if (ext != 'csv' && ext != 'xlsx')
        throw Exception('Choose a .csv or .xlsx file.');
      final table = ext == 'xlsx'
          ? ContactImportParser.readExcel(bytes)
          : ContactImportParser.readCsv(bytes);
      if (table.isEmpty) throw Exception('The selected file is empty.');

      final headers = table.first
          .map(ContactImportParser.normalizeHeader)
          .toList();
      if (headers.where((h) => h == 'name').length > 1 ||
          headers.where((h) => h == 'phone').length > 1)
        throw const FormatException(
          'Use only one name column and one phone column.',
        );
      final nameIndex = headers.indexOf('name');
      final phoneIndex = headers.indexOf('phone');
      final missing = <String>[];
      if (nameIndex < 0) missing.add('Name');
      if (phoneIndex < 0) missing.add('Phone');
      if (missing.isNotEmpty) {
        throw Exception(
          'Missing mandatory column${missing.length == 1 ? '' : 's'}: ${missing.join(' and ')}. Add the required column${missing.length == 1 ? '' : 's'} and try again.',
        );
      }

      final allowed = {'name', 'phone', ...optionalHeaders};
      final parsed = <Map<String, dynamic>>[];
      for (final rawRow in table.skip(1)) {
        if (rawRow.every((cell) => cell.trim().isEmpty)) continue;
        if (parsed.length >= maxRows) {
          throw Exception(
            'This file contains more than $maxRows contact rows. Split it into smaller files.',
          );
        }
        final row = <String, dynamic>{};
        for (var index = 0; index < headers.length; index++) {
          final key = headers[index];
          if (!allowed.contains(key) || row.containsKey(key)) continue;
          row[key] = index < rawRow.length ? rawRow[index].trim() : '';
        }
        row.putIfAbsent('country_code', () => '');
        row.putIfAbsent('email', () => '');
        row.putIfAbsent('date_of_birth', () => '');
        row.putIfAbsent('opt_in', () => 'true');
        row.putIfAbsent('notes', () => '');
        if ('${row['opt_in']}'.trim().isEmpty) row['opt_in'] = 'true';
        row['name'] = contactName(row['name']);
        parsed.add(row);
      }
      if (parsed.isEmpty)
        throw Exception('No contact rows were found below the header row.');

      if (!mounted) return;
      setState(() {
        fileName = file.name;
        rows = parsed;
        result = null;
      });
    } catch (error) {
      if (mounted) showAppMessage(context, '$error', error: true);
    }
  }

  Future<void> _saveSample(String extension) async {
    try {
      final filename = 'GreetSync_Contacts_Import_Sample.$extension';
      final asset = await rootBundle.load('assets/samples/$filename');
      final bytes = asset.buffer.asUint8List(
        asset.offsetInBytes,
        asset.lengthInBytes,
      );
      final path = await FilePicker.platform.saveFile(
        dialogTitle: 'Save sample import file',
        fileName: filename,
        type: FileType.custom,
        allowedExtensions: [extension],
        bytes: bytes,
      );
      if (path == null) return;
      if (Platform.isWindows || Platform.isLinux || Platform.isMacOS)
        await File(path).writeAsBytes(bytes);
      if (mounted)
        showAppMessage(
          context,
          'Sample saved. Replace the demo rows with your contacts before importing.',
        );
    } catch (error) {
      if (mounted)
        showAppMessage(
          context,
          'Could not save the sample: $error',
          error: true,
        );
    }
  }

  Future<void> _import() async {
    if (rows.isEmpty || importing || result != null) return;
    final groupError = importGroupError(groupName);
    if (groupError != null) {
      showAppMessage(context, groupError, error: true);
      return;
    }
    if (rows.length > maxRows) {
      showAppMessage(
        context,
        'Maximum $maxRows rows are allowed.',
        error: true,
      );
      return;
    }
    setState(() => importing = true);
    try {
      final data = await ref
          .read(apiClientProvider)
          .post(
            '/api/contacts/import',
            data: {
              'rows': rows,
              if (groupName != null) 'createGroupName': groupName!.trim(),
            },
          );
      ref.invalidate(contactsProvider);
      ref.invalidate(contactGroupsProvider);
      ref.invalidate(dashboardProvider);
      ref.invalidate(billingProvider);
      ref.invalidate(birthdaysProvider);
      ref.invalidate(automationsProvider);
      if (mounted)
        setState(() => result = (data as Map).cast<String, dynamic>());
    } catch (error) {
      if (mounted) showAppMessage(context, '$error', error: true);
    } finally {
      if (mounted) setState(() => importing = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Import Contacts')),
    body: ListView(
      padding: const EdgeInsets.all(18),
      children: [
        const Text(
          'CSV / Excel Import',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w900,
            color: BusinessColors.ink,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Import up to 10,000 contacts from a .csv or .xlsx file. Excel automatically finds the worksheet with name and phone columns. Duplicate phone numbers are skipped.',
          style: TextStyle(color: BusinessColors.muted),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Mandatory columns',
                  style: TextStyle(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                const SelectableText(
                  'name, phone',
                  style: TextStyle(fontFamily: 'monospace', fontSize: 12),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Optional columns',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                SelectableText(
                  optionalHeaders.join(', '),
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Example',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                const SelectableText(
                  'name,phone,country_code,email,date_of_birth,opt_in,notes\nRahul Sharma,9876543210,91,rahul@example.com,1990-03-15,true,VIP customer',
                  style: TextStyle(fontFamily: 'monospace', fontSize: 10),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Phone accepts an international +number directly, or a national number with country_code. For a 10-digit Indian number, country code 91 is assumed when omitted. opt_in is ON by default.',
                  style: TextStyle(color: BusinessColors.muted, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: importing ? null : () => _saveSample('xlsx'),
              icon: const Icon(Icons.download_rounded),
              label: const Text('Sample Excel'),
            ),
            OutlinedButton.icon(
              onPressed: importing ? null : () => _saveSample('csv'),
              icon: const Icon(Icons.download_rounded),
              label: const Text('Sample CSV'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: importing ? null : _choose,
          icon: const Icon(Icons.upload_file_rounded),
          label: Text(
            fileName == null ? 'Choose CSV / Excel File' : 'Change File',
          ),
        ),
        if (fileName != null) ...[
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const SoftIcon(Icons.table_chart_rounded),
              title: Text(fileName!),
              subtitle: Text('${rows.length} / $maxRows contact rows ready'),
            ),
          ),
        ],
        if (rows.isNotEmpty) ...[
          const SizedBox(height: 14),
          const Text(
            'Preview',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
          ),
          ...rows
              .take(5)
              .map(
                (row) => ListTile(
                  dense: true,
                  title: Text('${row['name']}'),
                  subtitle: Text('${row['phone']} • ${row['email'] ?? ''}'),
                ),
              ),
          const SizedBox(height: 14),
          ImportGroupOption(
            value: groupName,
            enabled: !importing && result == null,
            onChanged: (value) => setState(() => groupName = value),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: importing || result != null ? null : _import,
            child: importing
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : Text(
                    result != null
                        ? 'Imported'
                        : 'Import ${rows.length} Contacts',
                  ),
          ),
        ],
        if (result != null) ...[
          const SizedBox(height: 18),
          Card(
            color: BusinessColors.greenSoft,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Import Complete',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  Text('Imported: ${result!['imported']}'),
                  Text('Skipped duplicates: ${result!['skipped']}'),
                  Text('Failed: ${result!['failed']}'),
                  if (result!['group'] is Map)
                    Text(
                      'Group: ${result!['group']['name']} • ${result!['group']['memberCount']} contacts',
                    ),
                  if (result!['birthdayScheduled'] != null)
                    Text(
                      'Birthday automations scheduled: ${result!['birthdayScheduled']}',
                    ),
                  if ((int.tryParse(
                            '${result!['birthdaySchedulingQueued'] ?? 0}',
                          ) ??
                          0) >
                      0)
                    Text(
                      'Birthday automations queued: ${result!['birthdaySchedulingQueued']}',
                    ),
                  if ((result!['birthdayErrors'] as List?)?.isNotEmpty ==
                      true) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Birthday scheduling note: ${(result!['birthdayErrors'] as List).first['error']}',
                      style: const TextStyle(
                        color: Colors.orange,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                  if ((result!['errors'] as List?)?.isNotEmpty == true) ...[
                    const SizedBox(height: 8),
                    Text(
                      'First error: ${(result!['errors'] as List).first['error']}',
                      style: const TextStyle(
                        color: Colors.redAccent,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ],
    ),
  );
}
