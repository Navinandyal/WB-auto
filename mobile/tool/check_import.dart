import 'dart:convert';
import 'dart:io';
import 'package:excel/excel.dart';
import '../lib/core/contact_import_parser.dart';
import '../lib/models/models.dart';

void require(bool condition, String label) {
  if (!condition) throw StateError('FAILED: $label');
  stdout.writeln('PASS: $label');
}

void main() {
  require(
    ContactImportParser.cellText(TextCellValue('name')) == 'name',
    'Excel text headings',
  );
  require(
    ContactImportParser.cellText(
          TextCellValue.span(
            const TextSpan(
              text: 'Full ',
              children: [TextSpan(text: 'Name')],
            ),
          ),
        ) ==
        'Full Name',
    'Excel rich text headings',
  );
  require(
    ContactImportParser.cellText(DoubleCellValue(9876543210.0)) == '9876543210',
    'Excel numeric phone has no decimal suffix',
  );
  require(
    ContactImportParser.cellText(
          DateCellValue(year: 1995, month: 3, day: 15),
        ) ==
        '1995-03-15',
    'Excel date cell',
  );
  require(
    ContactImportParser.cellText(BoolCellValue(true)) == 'true',
    'Excel consent cell',
  );
  require(
    ContactImportParser.normalizeHeader('Mobile Number') == 'phone',
    'Phone heading alias',
  );
  for (final newline in ['\n', '\r\n', '\r']) {
    final rows = ContactImportParser.readCsv(
      utf8.encode(
        '\ufeffname,phone,notes${newline}"Patil, Aarav",9876543210,"VIP, customer"$newline',
      ),
    );
    require(
      rows.length == 2 &&
          rows[1][0] == 'Patil, Aarav' &&
          rows[1][2] == 'VIP, customer',
      'CSV quoting with ${newline.codeUnits} line endings',
    );
  }
  final csv = ContactImportParser.readCsv(
    File(
      'assets/samples/GreetSync_Contacts_Import_Sample.csv',
    ).readAsBytesSync(),
  );
  final xlsx = ContactImportParser.readExcel(
    File(
      'assets/samples/GreetSync_Contacts_Import_Sample.xlsx',
    ).readAsBytesSync(),
  );
  require(csv.length == xlsx.length, 'Bundled sample row counts agree');
  require(
    csv[0].join('|') == xlsx[0].join('|'),
    'Bundled Excel and CSV headings agree',
  );
  for (var row = 1; row < csv.length; row++) {
    require(
      csv[row].join('|') == xlsx[row].join('|'),
      'Bundled Excel and CSV contact row $row agrees',
    );
  }
  final template = MessageTemplate.fromJson({
    'id': 1,
    'name': 'brain_add',
    'language': 'en_US',
    'status': 'APPROVED',
    'category': 'MARKETING',
    'components': jsonEncode([
      {'type': 'HEADER', 'format': 'IMAGE'},
      {
        'type': 'BODY',
        'text': 'Hello {{customer_name}}. This is the entire message.',
      },
      {'type': 'FOOTER', 'text': 'AIKYAM'},
      {
        'type': 'BUTTONS',
        'buttons': [
          {
            'type': 'URL',
            'text': 'Visit our website',
            'url': 'https://example.com',
          },
        ],
      },
    ]),
  });
  require(
    template.bodyText == 'Hello {{customer_name}}. This is the entire message.',
    'Message body comes from BODY, not button label',
  );
  require(
    template.hasMediaHeader && template.headerFormat == 'IMAGE',
    'Image header survives API decoding',
  );
  final job = Automation.fromJson({
    'id': 1,
    'templateName': 'brain_add',
    'variables': {
      'customer_name': 'Navin',
      '_customMessage': 'Old stale message',
    },
    'templateComponents': template.components,
  });
  require(
    job.messagePreview == 'Hello Navin. This is the entire message.',
    'Automation preview renders the actual approved body',
  );

  final workbook = Excel.createExcel();
  workbook.tables.values.first.appendRow([TextCellValue('Instructions')]);
  final contacts = workbook['Contacts'];
  contacts.appendRow([
    TextCellValue('Name'),
    TextCellValue('Mobile Number'),
    TextCellValue('date_of_birth'),
    TextCellValue('opt_in'),
  ]);
  contacts.appendRow([
    TextCellValue('Demo Contact'),
    IntCellValue(9876543210),
    DateCellValue(year: 1995, month: 3, day: 15),
    BoolCellValue(true),
  ]);
  final rows = ContactImportParser.readExcel(workbook.encode()!);
  require(
    rows.length == 2 && rows[1][0] == 'Demo Contact',
    'Find contact sheet after an instruction sheet',
  );
  require(
    rows[1][1] == '9876543210' &&
        rows[1][2] == '1995-03-15' &&
        rows[1][3] == 'true',
    'Typed Excel cells survive a real workbook import',
  );
}
