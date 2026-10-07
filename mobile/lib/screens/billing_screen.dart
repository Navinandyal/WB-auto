import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class BillingScreen extends ConsumerWidget {
  const BillingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(billingProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Billing & Packages')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(e, onRetry: () => ref.invalidate(billingProvider)),
        data: (data) => _BillingBody(data: data),
      ),
    );
  }
}

class _BillingBody extends ConsumerWidget {
  const _BillingBody({required this.data});
  final Map<String,dynamic> data;

  int _i(dynamic v) => int.tryParse('$v') ?? 0;
  bool _b(dynamic v) => v == true || '$v'.toLowerCase() == 'true';
  Map<String,dynamic> _map(dynamic v) => v is Map ? v.cast<String,dynamic>() : <String,dynamic>{};
  List<Map<String,dynamic>> _list(dynamic v) => (v as List? ?? const []).whereType<Map>().map((e)=>e.cast<String,dynamic>()).toList();
  String _money(dynamic paise) => NumberFormat.currency(locale:'en_IN',symbol:'₹',decimalDigits:0).format(_i(paise)/100);
  String _date(dynamic value) { final d=DateTime.tryParse('$value')?.toLocal(); return d==null?'—':DateFormat('dd MMM yyyy').format(d); }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final access=_map(data['access']);
    final active=_b(access['active']);
    final base=_map(access['activeBase']);
    final packages=_list(data['packages']);
    final history=_list(data['history']);
    final monthly=_list(data['monthlyUsage']);
    final pendingIds=history.where((h)=>'${h['status']}'=='PENDING').map((h)=>_i(h['packageId'])).toSet();
    final limit=_i(access['messageLimit']);
    final used=_i(access['messagesUsed']);
    final reserved=_i(access['scheduledReserved']);
    final remaining=_i(access['messagesRemaining']);
    final progress=limit<=0?0.0:(used+reserved)/limit;

    return RefreshIndicator(
      onRefresh: () async { ref.invalidate(billingProvider); await ref.read(billingProvider.future); },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18,12,18,34),
        children: [
          Text(active?'Your GreetSync Plan':'Choose a GreetSync Package',style:const TextStyle(fontSize:26,fontWeight:FontWeight.w900,color:BusinessColors.ink)),
          const SizedBox(height:5),
          Text(active?'Manage quota, validity and usage from one place.':'A package is required before contacts, messaging and automation features can be used.',style:const TextStyle(color:BusinessColors.muted,height:1.4)),
          const SizedBox(height:16),
          if(active) _activeCard(context,base,limit,used,reserved,remaining,progress,access) else _lockedCard(context),
          const SizedBox(height:20),
          const SectionTitle('Available Packages'),
          const SizedBox(height:10),
          if(packages.isEmpty) const Card(child:Padding(padding:EdgeInsets.all(20),child:Text('No packages are available yet. Ask the administrator to create a package.')))
          else ...packages.map((p)=>_packageCard(context,ref,p,pendingIds.contains(_i(p['id'])),active)),
          const SizedBox(height:20),
          const SectionTitle('Monthly Usage Report'),
          const SizedBox(height:10),
          if(monthly.isEmpty) const Card(child:Padding(padding:EdgeInsets.all(18),child:Text('No message usage yet.')))
          else Card(child:Padding(padding:const EdgeInsets.all(14),child:Column(children:monthly.map((m)=>_monthRow(m)).toList()))),
          const SizedBox(height:20),
          const SectionTitle('Billing & Package History'),
          const SizedBox(height:10),
          if(history.isEmpty) const Card(child:Padding(padding:EdgeInsets.all(18),child:Text('No package history yet.')))
          else ...history.map((h)=>Card(child:ListTile(
            leading:SoftIcon('${h['packageType']}'=='MESSAGE_ADDON'?Icons.add_chart_rounded:Icons.workspace_premium_rounded),
            title:Text('${h['packageName']??'Package'}',style:const TextStyle(fontWeight:FontWeight.w900)),
            subtitle:Text('${_money(h['pricePaise'])} • ${_date(h['createdAt'])}${h['endsAt']==null?'':' • valid till ${_date(h['endsAt'])}'}'),
            trailing:_StatusChip('${h['status']??''}'),
          ))),
        ],
      ),
    );
  }

  Widget _activeCard(BuildContext context,Map<String,dynamic> base,int limit,int used,int reserved,int remaining,double progress,Map<String,dynamic> access) {
    final unlimited=limit<=0;
    return Container(
      padding:const EdgeInsets.all(18),
      decoration:BoxDecoration(gradient:LinearGradient(colors:[Theme.of(context).colorScheme.primary,const Color(0xFF183A66)]),borderRadius:BorderRadius.circular(24)),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Row(children:[const Icon(Icons.workspace_premium_rounded,color:Colors.white),const SizedBox(width:10),Expanded(child:Text('${base['name']??'Active Package'}',style:const TextStyle(color:Colors.white,fontSize:20,fontWeight:FontWeight.w900))),const _StatusChip('ACTIVE')]),
        const SizedBox(height:6),Text('Valid ${_date(access['startsAt'])} – ${_date(access['endsAt'])}',style:const TextStyle(color:Colors.white70)),
        const SizedBox(height:18),
        Row(children:[Expanded(child:_whiteMetric('$used','Sent')),Expanded(child:_whiteMetric('$reserved','Scheduled')),Expanded(child:_whiteMetric(unlimited?'∞':'$remaining','Available'))]),
        const SizedBox(height:14),
        if(!unlimited)...[ClipRRect(borderRadius:BorderRadius.circular(10),child:LinearProgressIndicator(value:progress.clamp(0.0,1.0).toDouble(),minHeight:9,backgroundColor:Colors.white24)),const SizedBox(height:7),Text('${used+reserved} of $limit message slots used/reserved',style:const TextStyle(color:Colors.white70,fontSize:12))]
        else const Text('Unlimited message quota',style:TextStyle(color:Colors.white,fontWeight:FontWeight.w800)),
        const SizedBox(height:12),
        Wrap(spacing:7,runSpacing:7,children:[
          _darkPill(_i(access['contactLimit'])<=0?'Unlimited contacts':'${_i(access['contactsUsed'])} / ${_i(access['contactLimit'])} contacts'),
          _darkPill(_i(access['automationLimit'])<=0?'Unlimited active automations':'${_i(access['automationsUsed'])} / ${_i(access['automationLimit'])} automations'),
          ..._list(access['activeAddons']).map((a)=>_darkPill('+ ${a['name']??'Message add-on'}')),
        ]),
      ]),
    );
  }

  Widget _whiteMetric(String value,String label)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(value,style:const TextStyle(color:Colors.white,fontSize:21,fontWeight:FontWeight.w900)),Text(label,style:const TextStyle(color:Colors.white70,fontSize:11))]);

  Widget _darkPill(String text)=>Container(padding:const EdgeInsets.symmetric(horizontal:9,vertical:5),decoration:BoxDecoration(color:Colors.white.withOpacity(.12),borderRadius:BorderRadius.circular(20),border:Border.all(color:Colors.white24)),child:Text(text,style:const TextStyle(color:Colors.white,fontSize:10,fontWeight:FontWeight.w800)));

  Widget _lockedCard(BuildContext context)=>Container(
    padding:const EdgeInsets.all(18),
    decoration:BoxDecoration(color:const Color(0xFFFFF7E8),borderRadius:BorderRadius.circular(22),border:Border.all(color:const Color(0xFFFFD898))),
    child:const Row(crossAxisAlignment:CrossAxisAlignment.start,children:[Icon(Icons.lock_rounded,color:Color(0xFFE68A00),size:30),SizedBox(width:12),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('Automation features are locked',style:TextStyle(fontSize:17,fontWeight:FontWeight.w900)),SizedBox(height:4),Text('Choose a base package below. Paid packages require administrator activation before messaging and automation are unlocked.',style:TextStyle(color:BusinessColors.muted,height:1.35))]))]),
  );

  Widget _packageCard(BuildContext context,WidgetRef ref,Map<String,dynamic> p,bool pending,bool hasActiveBase) {
    final addon='${p['packageType']}'=='MESSAGE_ADDON';
    final benefits=(p['benefits'] as List? ?? const []).map((e)=>'$e').where((e)=>e.trim().isNotEmpty).toList();
    final messageLimit=_i(p['messageLimit']);
    final contacts=_i(p['contactLimit']);
    final automations=_i(p['automationLimit']);
    return Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Row(children:[SoftIcon(addon?Icons.add_comment_rounded:Icons.workspace_premium_outlined),const SizedBox(width:10),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('${p['name']}',style:const TextStyle(fontSize:17,fontWeight:FontWeight.w900)),Text(addon?'Message add-on':'Base package',style:const TextStyle(color:BusinessColors.muted,fontSize:11))])),Text(_money(p['pricePaise']),style:TextStyle(color:Theme.of(context).colorScheme.primary,fontSize:18,fontWeight:FontWeight.w900))]),
      if('${p['description']??''}'.trim().isNotEmpty)...[const SizedBox(height:9),Text('${p['description']}',style:const TextStyle(color:BusinessColors.muted))],
      const SizedBox(height:12),Wrap(spacing:7,runSpacing:7,children:[_pill(messageLimit<=0?'Unlimited messages':'$messageLimit messages'),if(!addon)_pill(contacts<=0?'Unlimited contacts':'$contacts contacts'),if(!addon)_pill(automations<=0?'Unlimited automations':'$automations active automations'),_pill('${p['durationMonths']} month${_i(p['durationMonths'])==1?'':'s'}')]),
      if(benefits.isNotEmpty)...[const SizedBox(height:12),...benefits.take(6).map((b)=>Padding(padding:const EdgeInsets.only(bottom:5),child:Row(children:[const Icon(Icons.check_circle_rounded,size:17,color:BusinessColors.green),const SizedBox(width:7),Expanded(child:Text(b))])))],
      const SizedBox(height:14),SizedBox(width:double.infinity,child:FilledButton.icon(
        onPressed: pending || (addon&&!hasActiveBase)?null:()=>_request(context,ref,_i(p['id'])),
        icon:Icon(pending?Icons.hourglass_top_rounded:addon?Icons.add_rounded:Icons.shopping_bag_outlined),
        label:Text(pending?'Approval Pending':addon&&!hasActiveBase?'Base package required':_i(p['pricePaise'])<=0?'Activate Package':'Request Package'),
      )),
    ])));
  }

  Widget _pill(String text)=>Container(padding:const EdgeInsets.symmetric(horizontal:9,vertical:5),decoration:BoxDecoration(color:const Color(0xFFF2F6FA),borderRadius:BorderRadius.circular(20)),child:Text(text,style:const TextStyle(fontSize:10,fontWeight:FontWeight.w800)));

  Widget _monthRow(Map<String,dynamic> m)=>Padding(padding:const EdgeInsets.symmetric(vertical:8),child:Row(children:[SizedBox(width:72,child:Text('${m['month']}',style:const TextStyle(fontWeight:FontWeight.w800))),Expanded(child:Wrap(spacing:8,children:[Text('Sent ${_i(m['sent'])}'),Text('Delivered ${_i(m['delivered'])}'),Text('Read ${_i(m['read'])}'),Text('Failed ${_i(m['failed'])}',style:const TextStyle(color:Colors.redAccent))]))]));

  Future<void> _request(BuildContext context,WidgetRef ref,int packageId) async {
    try {
      final result=await ref.read(apiClientProvider).post('/api/billing/purchase',data:{'packageId':packageId});
      ref.invalidate(billingProvider); ref.invalidate(dashboardProvider);
      if(context.mounted) showAppMessage(context,'${(result as Map)['message']??'Package request submitted.'}');
    } catch(e) { if(context.mounted) showAppMessage(context,'$e',error:true); }
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip(this.status); final String status;
  @override Widget build(BuildContext context){final s=status.toUpperCase();final good=s=='ACTIVE';final wait=s=='PENDING';final color=good?BusinessColors.green:wait?Colors.orange:Colors.redAccent;return Container(padding:const EdgeInsets.symmetric(horizontal:8,vertical:5),decoration:BoxDecoration(color:color.withOpacity(.10),borderRadius:BorderRadius.circular(20)),child:Text(s,style:TextStyle(fontSize:9,fontWeight:FontWeight.w900,color:color)));}
}
