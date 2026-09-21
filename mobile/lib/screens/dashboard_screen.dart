import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';
import 'bulk_send_screen.dart';
import 'groups_screen.dart';
import 'import_contacts_screen.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncData = ref.watch(dashboardProvider);
    final birthdays = ref.watch(birthdaysProvider);
    final user = ref.watch(authProvider).user;
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(dashboardProvider);
        ref.invalidate(birthdaysProvider);
        await ref.read(dashboardProvider.future);
      },
      child: asyncData.when(
        loading: () => ListView(children: const [SizedBox(height: 260), Center(child: CircularProgressIndicator())]),
        error: (error, _) => ListView(children: [const SizedBox(height: 180), ErrorState(error, onRetry: () => ref.invalidate(dashboardProvider))]),
        data: (data) {
          final todayBirthdays = birthdays.valueOrNull?.where((e) => e.isToday).toList() ?? const [];
          final birthdayToday = todayBirthdays.length;
          return ListView(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
            children: [
              Text('Hello, ${_firstName(user?.name ?? 'there')} 👋', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
              const SizedBox(height: 5),
              const Text("Here's what's happening with your business today.", style: TextStyle(color: BusinessColors.muted, fontSize: 15)),
              const SizedBox(height: 18),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(children: [
                    const SoftIcon(Icons.chat_rounded),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        const Text('WhatsApp Connected', style: TextStyle(fontWeight: FontWeight.w800, color: BusinessColors.ink)),
                        const SizedBox(width: 8),
                        Container(width: 8, height: 8, decoration: BoxDecoration(color: data.configured ? Colors.green : Colors.orange, shape: BoxShape.circle)),
                      ]),
                      const SizedBox(height: 4),
                      Text(data.configured ? 'Active' : 'Setup required', style: TextStyle(color: data.configured ? BusinessColors.green : Colors.orange.shade700)),
                    ])),
                    const Icon(Icons.chevron_right_rounded, color: BusinessColors.muted),
                  ]),
                ),
              ),
              const SizedBox(height: 14),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: 1.55,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                children: [
                  _Metric(icon: Icons.send_rounded, value: '${data.messagesSent}', label: 'Messages Sent', color: BusinessColors.green),
                  _Metric(icon: Icons.people_alt_rounded, value: '${data.totalContacts}', label: 'Total Contacts', color: const Color(0xFF2F80ED)),
                  _Metric(icon: Icons.calendar_month_rounded, value: '$birthdayToday', label: 'Birthdays Today', color: const Color(0xFF7C4DFF)),
                  _Metric(icon: Icons.schedule_rounded, value: '${data.scheduledMessages}', label: 'Scheduled', color: const Color(0xFF00A6A6)),
                ],
              ),
              if (birthdayToday > 0) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFF07965E), Color(0xFF23B97C)]),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      const Icon(Icons.cake_rounded, size: 38, color: Colors.white),
                      const SizedBox(width: 14),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('$birthdayToday Birthday${birthdayToday == 1 ? '' : 's'} Today!', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
                        const SizedBox(height: 4),
                        const Text('Today’s birthday contacts', style: TextStyle(color: Colors.white70)),
                      ])),
                    ]),
                    const SizedBox(height: 12),
                    ...todayBirthdays.take(5).map((b) => Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Row(children: [
                        CircleAvatar(radius: 16, backgroundColor: Colors.white24, child: Text(b.contactName.isEmpty ? '?' : b.contactName[0].toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900))),
                        const SizedBox(width: 10),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(b.contactName, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                          Text(b.contactPhone, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                        ])),
                      ]),
                    )),
                    if (todayBirthdays.length > 5)
                      Padding(padding: const EdgeInsets.only(top: 10), child: Text('+${todayBirthdays.length - 5} more', style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w700))),
                  ]),
                ),
              ] else ...[
                const SizedBox(height: 14),
                const Card(child: Padding(padding: EdgeInsets.all(18), child: Row(children: [
                  SoftIcon(Icons.cake_outlined, color: Color(0xFF7C4DFF)),
                  SizedBox(width: 12),
                  Expanded(child: Text('No birthdays today.', style: TextStyle(fontWeight: FontWeight.w800, color: BusinessColors.ink))),
                ]))),
              ],
              const SizedBox(height: 18),
              const SectionTitle('Quick Actions'),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: _ActionCard(icon: Icons.campaign_rounded, label: 'Marketing', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BulkSendScreen())))),
                const SizedBox(width: 10),
                Expanded(child: _ActionCard(icon: Icons.groups_rounded, label: 'Groups', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const GroupsScreen())))),
                const SizedBox(width: 10),
                Expanded(child: _ActionCard(icon: Icons.upload_file_rounded, label: 'Import CSV', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ImportContactsScreen())))),
              ]),
              if (birthdayToday > 0) ...[
                const SizedBox(height: 10),
                SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: () {
                  int? preferred; for (final b in todayBirthdays) { if (b.templateId != null) { preferred = b.templateId; break; } }
                  Navigator.of(context).push(MaterialPageRoute(builder: (_) => BulkSendScreen(preselectedContactIds: todayBirthdays.where((b) => b.optIn).map((b) => b.contactId).toList(), preferredTemplateId: preferred)));
                }, icon: const Icon(Icons.cake_rounded), label: const Text("Select & Send Today's Birthday Wishes"))),
              ],
              const SizedBox(height: 20),
              const SectionTitle('Upcoming Messages'),
              const SizedBox(height: 10),
              if (data.upcoming.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No upcoming scheduled messages.', style: TextStyle(color: BusinessColors.muted)))))
              else
                ...data.upcoming.map((item) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          leading: const SoftIcon(Icons.schedule_send_rounded, color: Color(0xFF2F80ED)),
                          title: Text(item.contactName, style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text('${item.templateName}\n${DateFormat('dd MMM, hh:mm a').format(item.scheduledAt.toLocal())}'),
                          isThreeLine: true,
                          trailing: _Status(item.status),
                        ),
                      ),
                    )),
            ],
          );
        },
      ),
    );
  }

  String _firstName(String name) => name.trim().split(RegExp(r'\s+')).first;
}

class _Metric extends StatelessWidget {
  const _Metric({required this.icon, required this.value, required this.label, required this.color});
  final IconData icon;
  final String value, label;
  final Color color;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, color: color, size: 25),
            const Spacer(),
            Text(value, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
            Text(label, style: const TextStyle(color: BusinessColors.muted, fontSize: 12)),
          ]),
        ),
      );
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({required this.icon, required this.label, required this.onTap});
  final IconData icon; final String label; final VoidCallback onTap;
  @override Widget build(BuildContext context) => InkWell(onTap:onTap,borderRadius:BorderRadius.circular(18),child:Container(padding:const EdgeInsets.symmetric(vertical:16,horizontal:8),decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(18),border:Border.all(color:BusinessColors.line)),child:Column(children:[Icon(icon,color:BusinessColors.green,size:28),const SizedBox(height:8),Text(label,textAlign:TextAlign.center,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:12))])));
}

class _Status extends StatelessWidget {
  const _Status(this.status);
  final String status;
  @override
  Widget build(BuildContext context) {
    final good = ['SENT', 'DELIVERED', 'READ', 'SCHEDULED'].contains(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(color: good ? BusinessColors.greenSoft : const Color(0xFFFFECEF), borderRadius: BorderRadius.circular(20)),
      child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: good ? BusinessColors.greenDark : Colors.redAccent)),
    );
  }
}
