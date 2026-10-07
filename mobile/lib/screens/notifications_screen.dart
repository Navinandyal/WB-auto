import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../core/api_client.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async=ref.watch(notificationsProvider);
    return Scaffold(
      appBar:AppBar(title:const Text('Notifications'),actions:[TextButton(onPressed:()async{try{await ref.read(apiClientProvider).post('/api/notifications/read-all',data:{});ref.invalidate(notificationsProvider);}catch(e){if(context.mounted)showAppMessage(context,'$e',error:true);}},child:const Text('Mark all read'))]),
      body:async.when(
        loading:()=>const Center(child:CircularProgressIndicator()),
        error:(e,_)=>ErrorState(e,onRetry:()=>ref.invalidate(notificationsProvider)),
        data:(items)=>RefreshIndicator(onRefresh:()=>ref.refresh(notificationsProvider.future),child:items.isEmpty
          ?ListView(children:const[SizedBox(height:180),Icon(Icons.notifications_none_rounded,size:54,color:BusinessColors.muted),SizedBox(height:14),Center(child:Text('No notifications yet.',style:TextStyle(fontWeight:FontWeight.w800,color:BusinessColors.muted)))])
          :ListView(padding:const EdgeInsets.fromLTRB(16,12,16,28),children:[
            Row(children:[const Expanded(child:Text('Recent activity',style:TextStyle(fontSize:22,fontWeight:FontWeight.w900,color:BusinessColors.ink))),Container(padding:const EdgeInsets.symmetric(horizontal:10,vertical:6),decoration:BoxDecoration(color:Theme.of(context).colorScheme.primary.withOpacity(.1),borderRadius:BorderRadius.circular(18)),child:Text('${items.where((e)=>e['readAt']==null).length} unread',style:TextStyle(color:Theme.of(context).colorScheme.primary,fontWeight:FontWeight.w800,fontSize:12)))]),
            const SizedBox(height:12),
            ...items.map((n)=>_NotificationCard(data:n,onTap:()=>_read(context,ref,n))),
          ])),
      ),
    );
  }

  Future<void> _read(BuildContext context,WidgetRef ref,Map<String,dynamic> n)async{
    if(n['readAt']!=null)return;
    try{await ref.read(apiClientProvider).post('/api/notifications/${n['id']}/read',data:{});ref.invalidate(notificationsProvider);}catch(e){if(context.mounted)showAppMessage(context,'$e',error:true);}
  }
}

class _NotificationCard extends StatelessWidget{
  const _NotificationCard({required this.data,required this.onTap});
  final Map<String,dynamic> data;final VoidCallback onTap;
  @override Widget build(BuildContext context){
    final type='${data['type']??'SYSTEM'}'.toUpperCase(); final unread=data['readAt']==null;
    final icon=type=='ERROR'?Icons.error_outline_rounded:type=='MESSAGE'?Icons.send_rounded:type=='AUTOMATION'?Icons.schedule_send_rounded:type=='BUSINESS'?Icons.business_rounded:type=='ACCOUNT'?Icons.verified_user_outlined:Icons.notifications_active_outlined;
    final color=type=='ERROR'?Colors.redAccent:type=='MESSAGE'?BusinessColors.green:type=='AUTOMATION'?const Color(0xFF7C4DFF):Theme.of(context).colorScheme.primary;
    final dt=DateTime.tryParse('${data['createdAt']??''}')?.toLocal();
    return Padding(padding:const EdgeInsets.only(bottom:10),child:Card(color:unread?color.withOpacity(.055):Colors.white,child:InkWell(onTap:onTap,borderRadius:BorderRadius.circular(18),child:Padding(padding:const EdgeInsets.all(14),child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Container(width:44,height:44,decoration:BoxDecoration(color:color.withOpacity(.12),shape:BoxShape.circle),child:Icon(icon,color:color)),const SizedBox(width:12),
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Row(children:[Expanded(child:Text('${data['title']??'Notification'}',style:TextStyle(fontWeight:FontWeight.w900,color:BusinessColors.ink,fontSize:15))),if(unread)Container(width:8,height:8,decoration:BoxDecoration(color:color,shape:BoxShape.circle))]),const SizedBox(height:5),Text('${data['message']??''}',style:const TextStyle(color:BusinessColors.muted,height:1.35)),if(dt!=null)...[const SizedBox(height:7),Text(DateFormat('dd MMM, hh:mm a').format(dt),style:const TextStyle(fontSize:11,color:BusinessColors.muted))]])),
    ])))));
  }
}
