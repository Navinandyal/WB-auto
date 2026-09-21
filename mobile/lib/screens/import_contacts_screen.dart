import 'dart:convert';
import 'package:csv/csv.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class ImportContactsScreen extends ConsumerStatefulWidget {
  const ImportContactsScreen({super.key});
  @override
  ConsumerState<ImportContactsScreen> createState() => _ImportContactsScreenState();
}

class _ImportContactsScreenState extends ConsumerState<ImportContactsScreen> {
  List<Map<String,dynamic>> rows = [];
  String? fileName;
  bool importing = false;
  Map<String,dynamic>? result;
  static const headers = ['name','country_code','phone','email','date_of_birth','opt_in','notes'];

  Future<void> _choose() async {
    final picked = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['csv'], withData: true);
    if (picked == null || picked.files.single.bytes == null) return;
    try {
      final text = utf8.decode(picked.files.single.bytes!);
      final table = const CsvToListConverter(shouldParseNumbers: false, eol: '\n').convert(text);
      if (table.isEmpty) throw Exception('CSV is empty.');
      final actual = table.first.map((e)=>e.toString().trim().toLowerCase()).toList();
      if (actual.length != headers.length || List.generate(headers.length, (i)=>actual[i] == headers[i]).contains(false)) {
        throw Exception('Invalid CSV format. Header must be exactly: ${headers.join(',')}');
      }
      final parsed=<Map<String,dynamic>>[];
      for(final r in table.skip(1)) {
        if (r.every((e)=>e.toString().trim().isEmpty)) continue;
        final row=<String,dynamic>{};
        for(var i=0;i<headers.length;i++) row[headers[i]]=i<r.length?r[i].toString().trim():'';
        parsed.add(row);
      }
      setState(() { fileName=picked.files.single.name; rows=parsed; result=null; });
    } catch(e) { if(mounted) showAppMessage(context,'$e',error:true); }
  }

  Future<void> _import() async {
    if(rows.isEmpty) return;
    setState(()=>importing=true);
    try {
      final data = await ref.read(apiClientProvider).post('/api/contacts/import', data:{'rows':rows});
      ref.invalidate(contactsProvider);
      setState(()=>result=(data as Map).cast<String,dynamic>());
    } catch(e){ if(mounted) showAppMessage(context,'$e',error:true); }
    finally { if(mounted) setState(()=>importing=false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Import Contacts')),
    body: ListView(padding: const EdgeInsets.all(18), children: [
      const Text('Bulk CSV Import', style: TextStyle(fontSize:24,fontWeight:FontWeight.w900,color:BusinessColors.ink)),
      const SizedBox(height:6),
      const Text('Use the fixed CSV format below. Duplicates are skipped using the full international phone number.', style: TextStyle(color:BusinessColors.muted)),
      const SizedBox(height:16),
      Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Text('Required CSV header', style: TextStyle(fontWeight:FontWeight.w900)),
        const SizedBox(height:8),
        SelectableText(headers.join(','), style: const TextStyle(fontFamily:'monospace',fontSize:12)),
        const SizedBox(height:10),
        const Text('Example:', style: TextStyle(fontWeight:FontWeight.w700)),
        const SizedBox(height:4),
        const SelectableText('Rahul Sharma,91,9876543210,rahul@example.com,1990-03-15,true,VIP customer', style: TextStyle(fontFamily:'monospace',fontSize:11)),
        const SizedBox(height:8),
        const Text('For India use country_code 91 and exactly 10 mobile digits. Use true only when the contact has WhatsApp consent.', style: TextStyle(color:BusinessColors.muted,fontSize:12)),
      ]))),
      const SizedBox(height:14),
      OutlinedButton.icon(onPressed:_choose, icon:const Icon(Icons.upload_file), label:Text(fileName==null?'Choose CSV File':'Change CSV File')),
      if(fileName!=null) ...[
        const SizedBox(height:12),
        Card(child:ListTile(leading:const Icon(Icons.table_chart,color:BusinessColors.green),title:Text(fileName!),subtitle:Text('${rows.length} contact rows ready'))),
      ],
      if(rows.isNotEmpty) ...[
        const SizedBox(height:14),
        const Text('Preview', style:TextStyle(fontSize:18,fontWeight:FontWeight.w900)),
        ...rows.take(5).map((r)=>ListTile(dense:true,title:Text(r['name']??''),subtitle:Text('+${r['country_code']} ${r['phone']} • ${r['email'] ?? ''}'))),
        const SizedBox(height:14),
        FilledButton(onPressed:importing?null:_import, child: importing?const CircularProgressIndicator(color:Colors.white):Text('Import ${rows.length} Contacts')),
      ],
      if(result!=null) ...[
        const SizedBox(height:18),
        Card(color:BusinessColors.greenSoft,child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('Import Complete',style:TextStyle(fontSize:18,fontWeight:FontWeight.w900)),
          const SizedBox(height:8),
          Text('Imported: ${result!['imported']}'), Text('Skipped duplicates: ${result!['skipped']}'), Text('Failed: ${result!['failed']}'),
        ]))),
      ]
    ]),
  );
}
