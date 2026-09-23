import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../core/api_client.dart';
import '../providers/providers.dart';

class AdminMessagesScreen extends ConsumerStatefulWidget { const AdminMessagesScreen({super.key}); @override ConsumerState<AdminMessagesScreen> createState()=>_S(); }
class _S extends ConsumerState<AdminMessagesScreen> {
  List<Map<String,dynamic>> rows=[]; bool loading=true; String search=''; String status='ALL'; String? error;
  @override void initState(){super.initState();_load();}
  Future<void> _load() async { try{final d=await ref.read(apiClientProvider).get('/api/admin/messages') as List; if(mounted)setState((){rows=d.whereType<Map>().map((e)=>e.cast<String,dynamic>()).toList();loading=false;});}catch(e){if(mounted)setState((){error=e is ApiException?e.message:'$e';loading=false;});}}
  @override Widget build(BuildContext context){
    final list=rows.where((m){final q=search.toLowerCase();final mq=q.isEmpty||'${m['templateName']??''} ${m['content']??''} ${m['status']??''}'.toLowerCase().contains(q);return mq&&(status=='ALL'||'${m['status']}'.toUpperCase()==status);}).toList();
    return RefreshIndicator(onRefresh:_load,child:loading?ListView(children:const[SizedBox(height:260),Center(child:CircularProgressIndicator())]):ListView(padding:const EdgeInsets.all(16),children:[
      const Text('Messages / Logs',style:TextStyle(fontSize:28,fontWeight:FontWeight.w900,color:Color(0xFF071A63))),const Text('Monitor WhatsApp message outcomes across businesses.',style:TextStyle(color:Color(0xFF62729B))),const SizedBox(height:16),
      if(error!=null)Card(color:const Color(0xFFFFF1F2),child:Padding(padding:const EdgeInsets.all(12),child:Text(error!))),
      TextField(decoration:const InputDecoration(prefixIcon:Icon(Icons.search),hintText:'Search messages...'),onChanged:(v)=>setState(()=>search=v)),const SizedBox(height:10),
      SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(children:['ALL','SENT','DELIVERED','READ','FAILED'].map((s)=>Padding(padding:const EdgeInsets.only(right:8),child:ChoiceChip(label:Text(s),selected:status==s,onSelected:(_)=>setState(()=>status=s)))).toList())),const SizedBox(height:12),
      if(list.isEmpty)const Card(child:Padding(padding:EdgeInsets.all(28),child:Center(child:Text('No message logs.')))) else ...list.take(200).map((m)=>Card(child:ListTile(leading:CircleAvatar(child:Icon('${m['status']}'.toUpperCase()=='FAILED'?Icons.error_outline:Icons.send_outlined)),title:Text('${m['templateName']??'WhatsApp Message'}',style:const TextStyle(fontWeight:FontWeight.w800)),subtitle:Text('${m['content']??''}\n${_date(m['createdAt']??m['sentAt'])}',maxLines:3,overflow:TextOverflow.ellipsis),isThreeLine:true,trailing:Text('${m['status']??''}',style:const TextStyle(fontSize:11,fontWeight:FontWeight.w900))))),
    ]));
  }
  String _date(dynamic v){final d=DateTime.tryParse('${v??''}');return d==null?'':DateFormat('dd MMM, hh:mm a').format(d.toLocal());}
}
