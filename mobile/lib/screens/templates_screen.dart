import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import 'bulk_send_screen.dart';

class TemplatesScreen extends ConsumerStatefulWidget {
  const TemplatesScreen({super.key});
  @override
  ConsumerState<TemplatesScreen> createState() => _TemplatesScreenState();
}

class _TemplatesScreenState extends ConsumerState<TemplatesScreen> {
  String query = '';
  String filter = 'ALL';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(templatesProvider);
    return async.when(
      loading: () => ListView(children: const [SizedBox(height: 260), Center(child: CircularProgressIndicator())]),
      error: (e, _) => ListView(children: [const SizedBox(height: 180), ErrorState(e, onRetry: () => ref.invalidate(templatesProvider))]),
      data: (list) {
        final visible = list;
        final q = query.trim().toLowerCase();
        final items = visible.where((t) => (filter == 'ALL' || t.status == filter) && (q.isEmpty || _displayName(t).toLowerCase().contains(q) || t.category.toLowerCase().contains(q))).toList();
        return RefreshIndicator(
          onRefresh: () => ref.refresh(templatesProvider.future),
          child: ListView(padding: const EdgeInsets.fromLTRB(18, 8, 18, 90), children: [
            Row(children: [
              const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Message Templates', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
                SizedBox(height: 4),
                Text('Your WhatsApp templates synced from Meta.', style: TextStyle(color: BusinessColors.muted)),
              ])),
              IconButton.filledTonal(onPressed: _sync, icon: const Icon(Icons.sync)),
              const SizedBox(width: 6),
              FilledButton.icon(onPressed: _createTemplate, icon: const Icon(Icons.add), label: const Text('Create')),
            ]),
            const SizedBox(height: 16),
            TextField(onChanged: (v) => setState(() => query = v), decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search templates...')),
            const SizedBox(height: 12),
            SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [
              _filterChip('ALL', 'All (${visible.length})'),
              _filterChip('APPROVED', 'Approved (${visible.where((e) => e.status == 'APPROVED').length})'),
              _filterChip('PENDING', 'Pending (${visible.where((e) => e.status.contains('PENDING')).length})'),
              _filterChip('REJECTED', 'Rejected (${visible.where((e) => e.status == 'REJECTED').length})'),
            ])),
            const SizedBox(height: 14),
            if (items.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(28), child: Center(child: Text('No templates found.'))))
            else
              ...items.map((t) => Padding(
                    padding: const EdgeInsets.only(bottom: 9),
                    child: Card(
                      child: ListTile(
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TemplateDetailsScreen(template: t))),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        leading: SoftIcon(_icon(t.category), color: _color(t.category)),
                        title: Text(_displayName(t), style: const TextStyle(fontWeight: FontWeight.w900)),
                        subtitle: Padding(padding: const EdgeInsets.only(top: 4), child: Text('${t.category} • ${t.language}\n${_preview(t.bodyText)}', maxLines: 2, overflow: TextOverflow.ellipsis)),
                        isThreeLine: true,
                        trailing: _status(t.status),
                      ),
                    ),
                  )),
          ]),
        );
      },
    );
  }

  Widget _filterChip(String value, String label) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(selected: filter == value, label: Text(label), onSelected: (_) => setState(() => filter = value), selectedColor: BusinessColors.green, labelStyle: TextStyle(color: filter == value ? Colors.white : BusinessColors.ink, fontWeight: FontWeight.w700)),
      );


  static List<MessageTemplate> _businessTemplates(List<MessageTemplate> list) {
    MessageTemplate? hello;
    MessageTemplate? birthday;
    for (final t in list) {
      final n = t.name.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
      if (n == 'hello_world') hello ??= t;
      if (n.contains('birthday')) {
        if (birthday == null || (birthday.status != 'APPROVED' && t.status == 'APPROVED')) birthday = t;
      }
    }
    return [if (hello != null) hello, if (birthday != null) birthday];
  }

  static String _displayName(MessageTemplate t) {
    final n = t.name.toLowerCase();
    if (n == 'hello_world' || n == 'hello world') return 'Hello World';
    if (n.contains('birthday')) return 'Birthday';
    return t.name;
  }

  Future<void> _createTemplate() async {
    final created = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const CreateTemplateScreen()));
    if (created == true) ref.invalidate(templatesProvider);
  }

  Future<void> _sync() async {
    try {
      await ref.read(apiClientProvider).post('/api/whatsapp/templates/sync');
      ref.invalidate(templatesProvider);
      if (mounted) showAppMessage(context, 'Templates synced successfully');
    } catch (e) {
      if (mounted) showAppMessage(context, '$e', error: true);
    }
  }

  static String _preview(String s) => s.replaceAll('\n', ' ').trim();
  static IconData _icon(String c) => c.toUpperCase() == 'MARKETING' ? Icons.campaign_outlined : c.toUpperCase() == 'UTILITY' ? Icons.description_outlined : Icons.message_outlined;
  static Color _color(String c) => c.toUpperCase() == 'MARKETING' ? const Color(0xFFE83E8C) : c.toUpperCase() == 'UTILITY' ? const Color(0xFF2F80ED) : BusinessColors.green;
  static Widget _status(String s) {
    final color = s == 'APPROVED' ? BusinessColors.green : s == 'REJECTED' ? Colors.redAccent : Colors.orange;
    return Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5), decoration: BoxDecoration(color: color.withOpacity(.11), borderRadius: BorderRadius.circular(12)), child: Text(s, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800)));
  }
}

class TemplateDetailsScreen extends ConsumerWidget {
  const TemplateDetailsScreen({super.key, required this.template});
  final MessageTemplate template;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
        appBar: AppBar(title: const Text('Template Details')),
        body: ListView(padding: const EdgeInsets.fromLTRB(18, 10, 18, 24), children: [
          Card(child: Padding(padding: const EdgeInsets.all(18), child: Row(children: [
            SoftIcon(_TemplatesScreenState._icon(template.category), color: _TemplatesScreenState._color(template.category)),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_TemplatesScreenState._displayName(template), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              const SizedBox(height: 4),
              Text('${template.category} • ${template.language}', style: const TextStyle(color: BusinessColors.muted)),
            ])),
            _TemplatesScreenState._status(template.status),
          ]))),
          const SizedBox(height: 14),
          Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Message Content', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 14),
            Container(width: double.infinity, padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: const Color(0xFFF7F9FC), borderRadius: BorderRadius.circular(14)), child: Text(template.bodyText.isEmpty ? 'No body content returned by Meta.' : template.bodyText, style: const TextStyle(height: 1.5))),
          ]))),
          const SizedBox(height: 14),
          Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Template Information', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            _info('Status', template.status),
            _info('Category', template.category),
            _info('Language', template.language),
            _info('Variables', '${template.variableCount}'),
          ]))),
          const SizedBox(height: 16),
          if (template.status == 'APPROVED') FilledButton.icon(onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => BulkSendScreen(preferredTemplateId: template.id))), icon: const Icon(Icons.send), label: const Text('Send to Multiple Contacts')),
        ]),
      );

  static Widget _info(String a, String b) => Padding(padding: const EdgeInsets.symmetric(vertical: 7), child: Row(children: [Expanded(child: Text(a, style: const TextStyle(color: BusinessColors.muted))), Text(b, style: const TextStyle(fontWeight: FontWeight.w800))]));
}


class CreateTemplateScreen extends ConsumerStatefulWidget {
  const CreateTemplateScreen({super.key});
  @override ConsumerState<CreateTemplateScreen> createState()=>_CreateTemplateScreenState();
}
class _CreateTemplateScreenState extends ConsumerState<CreateTemplateScreen>{
  final key=GlobalKey<FormState>(); final name=TextEditingController(); final body=TextEditingController();
  String category='MARKETING',language='en_US'; bool saving=false;
  @override void dispose(){name.dispose();body.dispose();super.dispose();}
  Future<void> _save()async{if(!key.currentState!.validate())return;setState(()=>saving=true);try{await ref.read(apiClientProvider).post('/api/whatsapp/templates',data:{'name':name.text.trim(),'category':category,'language':language,'body':body.text.trim()});ref.invalidate(templatesProvider);if(mounted){showAppMessage(context,'Template submitted to Meta for approval');Navigator.pop(context,true);}}catch(e){if(mounted)showAppMessage(context,'$e',error:true);}finally{if(mounted)setState(()=>saving=false);}}
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Create Template')),body:Form(key:key,child:ListView(padding:const EdgeInsets.all(18),children:[
    const Text('Create WhatsApp Template',style:TextStyle(fontSize:24,fontWeight:FontWeight.w900)),const SizedBox(height:6),const Text('Templates are submitted to Meta. You can send them only after Meta returns APPROVED.',style:TextStyle(color:BusinessColors.muted)),const SizedBox(height:16),
    TextFormField(controller:name,decoration:const InputDecoration(labelText:'Template Name *',hintText:'festival_offer'),validator:(v){final x=(v??'').trim().toLowerCase();if(!RegExp(r'^[a-z0-9_]{3,512}$').hasMatch(x))return 'Use lowercase letters, numbers and underscores only';return null;}),const SizedBox(height:12),
    DropdownButtonFormField<String>(value:category,decoration:const InputDecoration(labelText:'Category *'),items:const[DropdownMenuItem(value:'MARKETING',child:Text('Marketing')),DropdownMenuItem(value:'UTILITY',child:Text('Utility')),DropdownMenuItem(value:'AUTHENTICATION',child:Text('Authentication'))],onChanged:(v)=>setState(()=>category=v??'MARKETING')),const SizedBox(height:12),
    DropdownButtonFormField<String>(value:language,decoration:const InputDecoration(labelText:'Language *'),items:const[DropdownMenuItem(value:'en_US',child:Text('English (US)')),DropdownMenuItem(value:'en',child:Text('English')),DropdownMenuItem(value:'hi',child:Text('Hindi'))],onChanged:(v)=>setState(()=>language=v??'en_US')),const SizedBox(height:12),
    TextFormField(controller:body,minLines:6,maxLines:10,maxLength:1024,decoration:const InputDecoration(labelText:'Message Content *',alignLabelWithHint:true,hintText:'Hi {{1}}, enjoy 20% off this weekend!'),validator:(v){final x=(v??'').trim();if(x.length<5)return 'Enter at least 5 characters';return null;}),
    const Card(color:BusinessColors.greenSoft,child:Padding(padding:EdgeInsets.all(14),child:Text('Use Meta variables such as {{1}}, {{2}}. For bulk sending, {{1}} defaults to each contact name when needed.'))),const SizedBox(height:16),
    FilledButton(onPressed:saving?null:_save,child:saving?const CircularProgressIndicator(color:Colors.white):const Text('Submit for Meta Approval')),
  ])));
}
