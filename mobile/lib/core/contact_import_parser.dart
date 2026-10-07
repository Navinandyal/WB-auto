import 'dart:convert';
import 'package:archive/archive.dart';
import 'package:csv/csv.dart';
import 'package:excel/excel.dart';
import 'package:xml/xml.dart';

/// Keeps Excel cell wrappers and CSV number inference out of contact data.
class ContactImportParser {
  static String normalizeHeader(String raw) {
    final value = raw
        .replaceFirst('\ufeff', '')
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[\s-]+'), '_');
    const aliases = {
      'full_name': 'name',
      'contact_name': 'name',
      'mobile': 'phone',
      'mobile_number': 'phone',
      'phone_number': 'phone',
      'whatsapp_number': 'phone',
      'countrycode': 'country_code',
      'dob': 'date_of_birth',
      'birth_date': 'date_of_birth',
      'dateofbirth': 'date_of_birth',
      'consent': 'opt_in',
      'whatsapp_opt_in': 'opt_in',
    };
    return aliases[value] ?? value;
  }

  static String cellText(CellValue? value) {
    if (value == null) return '';
    if (value is TextCellValue) return _spanText(value.value).trim();
    if (value is IntCellValue) return '${value.value}';
    if (value is DoubleCellValue) {
      final number = value.value;
      return number == number.truncateToDouble()
          ? number.toInt().toString()
          : number.toString();
    }
    if (value is BoolCellValue) return '${value.value}';
    if (value is DateCellValue)
      return _date(value.year, value.month, value.day);
    if (value is DateTimeCellValue)
      return _date(value.year, value.month, value.day);
    if (value is FormulaCellValue)
      throw const FormatException(
        'Replace formula cells with their values before importing.',
      );
    return value.toString().trim();
  }

  static String _date(int year, int month, int day) =>
      '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';

  static String _spanText(TextSpan span) =>
      (span.text ?? '') +
      (span.children ?? const <TextSpan>[]).map(_spanText).join();

  static List<List<String>> readCsv(List<int> bytes) {
    final text = utf8
        .decode(bytes)
        .replaceFirst('\ufeff', '')
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n');
    return const CsvToListConverter(shouldParseNumbers: false, eol: '\n')
        .convert(text)
        .map((row) => row.map((cell) => cell.toString()).toList())
        .where((row) => row.any((cell) => cell.trim().isNotEmpty))
        .toList();
  }

  static List<List<String>> readExcel(List<int> bytes) {
    final book = Excel.decodeBytes(_portableWorkbook(bytes));
    for (final sheet in book.tables.values) {
      final nonempty = sheet.rows
          .where((row) => row.any((cell) => cell?.value != null))
          .toList();
      if (nonempty.isEmpty) continue;
      final firstRow = nonempty.first
          .map(
            (cell) =>
                cell?.value is FormulaCellValue ? '' : cellText(cell?.value),
          )
          .toList();
      final headers = firstRow.map(normalizeHeader).toSet();
      if (!headers.contains('name') || !headers.contains('phone')) continue;
      return nonempty
          .map((row) => row.map((cell) => cellText(cell?.value)).toList())
          .where((row) => row.any((cell) => cell.trim().isNotEmpty))
          .toList();
    }
    throw const FormatException(
      'No contact worksheet found. The first non-empty row must contain name and phone columns.',
    );
  }

  // Excel 4.x expects relative relationship targets and unprefixed spreadsheet
  // elements. Both absolute OOXML targets and namespace prefixes are valid in
  // files exported by other tools. Normalize only the in-memory reader input.
  static List<int> _portableWorkbook(List<int> bytes) {
    final archive = ZipDecoder().decodeBytes(bytes);
    final normalized = Archive();
    for (final file in archive.files) {
      if (!file.isFile) continue;
      var content = file.content as List<int>;
      if (file.name.endsWith('.xml') || file.name.endsWith('.rels')) {
        var text = utf8.decode(content).replaceFirst('\ufeff', '');
        final document = XmlDocument.parse(text);
        if (file.name == 'xl/_rels/workbook.xml.rels') {
          for (final element in document.descendants.whereType<XmlElement>()) {
            if (element.name.local != 'Relationship') continue;
            final target = element.getAttribute('Target');
            if (target != null && target.startsWith('/xl/'))
              element.setAttribute('Target', target.substring(4));
          }
        }
        if (file.name.startsWith('xl/worksheets/')) {
          for (final cell
              in document.descendants
                  .whereType<XmlElement>()
                  .where((element) => element.name.local == 'c')
                  .toList()) {
            if (cell.getAttribute('t') != 'str' ||
                cell.childElements.any((element) => element.name.local == 'f'))
              continue;
            // Other exporters use t=str for plain text. excel 4.x treats this
            // as a formula, and crashes on an empty str cell without a v node.
            final values = cell.childElements.where(
              (element) => element.name.local == 'v',
            );
            final value = values.isEmpty ? '' : values.first.innerText;
            cell.setAttribute('t', 'inlineStr');
            cell.children.clear();
            cell.children.add(
              XmlElement(XmlName('is'), [], [
                XmlElement(XmlName('t'), [], [XmlText(value)]),
              ]),
            );
          }
        }
        text = document.toXmlString();
        final prefixes = RegExp(
          r'''xmlns:([A-Za-z_][\w.-]*)\s*=\s*['"]http://schemas.openxmlformats.org/(?:spreadsheetml/2006/main|package/2006/(?:relationships|content-types))['"]''',
        );
        for (final match in prefixes.allMatches(text).toList()) {
          final prefix = RegExp.escape(match.group(1)!);
          text = text.replaceAllMapped(
            RegExp('(<\\/?)$prefix:'),
            (match) => match.group(1)!,
          );
        }
        content = utf8.encode(text);
      }
      normalized.addFile(ArchiveFile(file.name, content.length, content));
    }
    return ZipEncoder().encode(normalized)!;
  }
}
