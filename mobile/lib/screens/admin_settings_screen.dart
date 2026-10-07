import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import 'appearance_screen.dart';
import 'legal_pages.dart';
import 'profile_screen.dart';
import 'security_settings_screen.dart';
import 'notifications_screen.dart';

class AdminSettingsScreen extends ConsumerWidget {
  const AdminSettingsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u=ref.watch(authProvider).user;
    return ListView(padding:const EdgeInsets.all(16),children:[
      const Text('Admin Profile & Settings',style:TextStyle(fontSize:28,fontWeight:FontWeight.w900,color:BusinessColors.ink)),
      const SizedBox(height:4),const Text('Manage your account, security, appearance and legal preferences.',style:TextStyle(color:BusinessColors.muted)),const SizedBox(height:16),
      Card(child:Padding(padding:const EdgeInsets.all(18),child:Row(crossAxisAlignment:CrossAxisAlignment.center,children:[
        CircleAvatar(radius:34,backgroundColor:Theme.of(context).colorScheme.primary.withOpacity(.12),child:Text((u?.name.isNotEmpty==true?u!.name[0]:'A').toUpperCase(),style:TextStyle(color:Theme.of(context).colorScheme.primary,fontSize:25,fontWeight:FontWeight.w900))),
        const SizedBox(width:14),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(u?.name??'System Administrator',maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(fontSize:19,fontWeight:FontWeight.w900)),const SizedBox(height:3),Text(u?.mobile??'',style:const TextStyle(color:BusinessColors.muted)),const SizedBox(height:7),Wrap(spacing:7,runSpacing:6,children:[const Chip(label:Text('SUPER ADMIN')),ActionChip(avatar:const Icon(Icons.edit_outlined,size:17),label:const Text('Edit Profile'),onPressed:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>const ProfileScreen())))])]))
      ]))),const SizedBox(height:14),
      Card(child:Column(children:[
        _tile(context,Icons.fingerprint_rounded,'Security & Biometric Login','Use device biometrics to bypass password entry',()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>const SecuritySettingsScreen()))),
        const Divider(height:1),_tile(context,Icons.palette_outlined,'Themes & Colors','Change GreetSync accent colors in one tap',()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>const AppearanceScreen()))),
        const Divider(height:1),_tile(context,Icons.notifications_active_outlined,'Notifications','Platform, business approval and automation alerts',()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>const NotificationsScreen()))),
        const Divider(height:1),_tile(context,Icons.privacy_tip_outlined,'Privacy Policy','Review GreetSync data and privacy practices',()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>const PrivacyPolicyScreen()))),
        const Divider(height:1),_tile(context,Icons.description_outlined,'Terms & Conditions','Review platform usage terms',()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>const TermsConditionsScreen()))),
      ])),const SizedBox(height:16),
      FilledButton.icon(style:FilledButton.styleFrom(backgroundColor:Colors.redAccent),onPressed:()=>ref.read(authProvider.notifier).signOut(),icon:const Icon(Icons.logout),label:const Text('Logout')),
    ]);
  }
  Widget _tile(BuildContext context,IconData icon,String title,String subtitle,VoidCallback onTap)=>ListTile(contentPadding:const EdgeInsets.symmetric(horizontal:14,vertical:7),leading:SoftIcon(icon),title:Text(title,style:const TextStyle(fontWeight:FontWeight.w900)),subtitle:Text(subtitle),trailing:const Icon(Icons.chevron_right_rounded),onTap:onTap);
}
