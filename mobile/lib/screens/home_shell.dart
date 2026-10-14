import '../core/push_notification_service.dart';

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import '../core/ios_reminders.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/native_notification_service.dart';
import '../models/models.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/data_image.dart';
import '../widgets/draft_exit_guard.dart';
import 'dashboard_screen.dart';
import 'contacts_screen.dart';
import 'automations_screen.dart';
import 'settings_screen.dart';
import 'notifications_screen.dart';
import 'profile_screen.dart';
import 'create_automation_screen.dart';
import 'billing_screen.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell>
    with WidgetsBindingObserver {
  final editorExits = EditorExitController();
  int index = 0;
  final _contentNavigator = GlobalKey<NavigatorState>();
  final _pageIndex = ValueNotifier<int>(0);
  static const pages = <Widget>[
    DashboardScreen(),
    ContactsScreen(),
    AutomationsScreen(),
    SettingsScreen(),
  ];

  Timer? _liveTimer;
  Timer? _contentTimer;
  bool _liveRefreshRunning = false;
  bool _notificationBaselineReady = false;
  int _lastShownNotificationId = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _startLiveUpdates());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _liveTimer?.cancel();
    _contentTimer?.cancel();
    PushNotificationService.refresh?.cancel();
    _pageIndex.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_refreshLiveData());
      _refreshContentData();
    }
  }

  Future<void> _startLiveUpdates() async {
    await NativeNotificationService.requestPermission();
    await PushNotificationService.register(ref.read(apiClientProvider));
    final storage = ref.read(secureStorageProvider);
    final stored = await storage.read(
      key: 'greetsync_last_native_notification_id',
    );
    if (!mounted) return;
    if (stored != null) {
      _lastShownNotificationId = int.tryParse(stored) ?? 0;
      _notificationBaselineReady = true;
    }

    await _refreshLiveData();
    _refreshContentData();
    _liveTimer = Timer.periodic(
      const Duration(seconds: 8),
      (_) => unawaited(_refreshLiveData()),
    );
    _contentTimer = Timer.periodic(
      const Duration(seconds: 25),
      (_) => _refreshContentData(),
    );
  }

  Future<void> _refreshLiveData() async {
    if (!mounted || _liveRefreshRunning) return;
    _liveRefreshRunning = true;
    try {
      final notificationsFuture = ref.refresh(notificationsProvider.future);
      final automationsFuture = ref.refresh(automationsProvider.future);
      ref.invalidate(dashboardProvider);
      ref.invalidate(billingProvider);
      ref.invalidate(accountStatusProvider);
      ref.invalidate(birthdaysProvider);

      try {
        await _processNotifications(await notificationsFuture);
      } catch (_) {}
      try {
        await _syncScheduledNotificationAlarms(await automationsFuture);
      } catch (_) {}
    } finally {
      _liveRefreshRunning = false;
    }
  }

  void _refreshContentData() {
    if (!mounted) return;
    ref.invalidate(contactsProvider);
    ref.invalidate(contactGroupsProvider);
    ref.invalidate(templatesProvider);
    ref.invalidate(templateSuggestionsProvider);
    ref.invalidate(whatsappAccountProvider);
    ref.invalidate(birthdaySettingsProvider);
    ref.invalidate(wishHistoryProvider);
    ref.invalidate(monthlyAnalysisProvider);
  }

  Future<void> _processNotifications(List<Map<String, dynamic>> rows) async {
    if (rows.isEmpty) return;
    final sorted = List<Map<String, dynamic>>.from(rows)
      ..sort((a, b) => _notificationId(a).compareTo(_notificationId(b)));
    final maxId = _notificationId(sorted.last);

    if (!_notificationBaselineReady) {
      _lastShownNotificationId = maxId;
      _notificationBaselineReady = true;
      await ref
          .read(secureStorageProvider)
          .write(key: 'greetsync_last_native_notification_id', value: '$maxId');
      return;
    }

    final fresh = sorted
        .where((row) => _notificationId(row) > _lastShownNotificationId)
        .toList();
    for (final row in fresh.take(5)) {
      final id = _notificationId(row);
      await NativeNotificationService.show(
        id: 10000 + id,
        title: '${row['title'] ?? 'GreetSync'}',
        body: '${row['message'] ?? ''}',
      );
    }

    if (maxId > _lastShownNotificationId) {
      _lastShownNotificationId = maxId;
      await ref
          .read(secureStorageProvider)
          .write(key: 'greetsync_last_native_notification_id', value: '$maxId');
    }
  }

  int _notificationId(Map<String, dynamic> row) =>
      int.tryParse('${row['id'] ?? 0}') ?? 0;

  Future<void> _syncScheduledNotificationAlarms(
    List<Automation> automations,
  ) async {
    final now = DateTime.now();
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      await NativeNotificationService.syncSchedules(
        iosReminderEntries(automations, now),
      );
      return;
    }
    for (final automation in automations) {
      final nativeId = 200000 + automation.id;
      final scheduled = automation.scheduledAt.toLocal();
      if (automation.status == 'SCHEDULED' && scheduled.isAfter(now)) {
        await NativeNotificationService.schedule(
          id: nativeId,
          title: 'Scheduled message',
          body:
              '${automation.templateName} to ${automation.contactName} is due now. GreetSync will refresh the delivery status automatically.',
          when: scheduled,
        );
      } else if (scheduled.isAfter(now)) {
        await NativeNotificationService.cancel(nativeId);
      }
    }
  }

  bool _activePackage(AsyncValue<Map<String, dynamic>> billing) {
    final data = billing.valueOrNull;
    final access = data?['access'];
    return access is Map && access['active'] == true;
  }

  Future<void> _select(int target, bool active) async {
    if ((target == 1 || target == 2) && !active) {
      await _openScreen(const BillingScreen());
      return;
    }
    if (!await editorExits.prepareNavigation() || !mounted) return;
    await editorExits.allowEditorPops();
    if (!mounted) return;
    _contentNavigator.currentState?.popUntil((route) => route.isFirst);
    setState(() => index = target);
    _pageIndex.value = target;
  }

  Future<Object?> _openScreen(Widget screen) async {
    if (editorExits.hasEditors) {
      if (!await editorExits.prepareNavigation() || !mounted) return null;
      await editorExits.allowEditorPops();
      if (!mounted) return null;
      _contentNavigator.currentState?.popUntil((route) => route.isFirst);
    }
    if (!mounted) return null;
    return _contentNavigator.currentState!.push(
      MaterialPageRoute(builder: (_) => screen),
    );
  }

  Future<void> _sendMessage(bool active) async {
    final value = await _openScreen(
      active ? const CreateAutomationScreen() : const BillingScreen(),
    );
    if (value == true) {
      ref.invalidate(dashboardProvider);
      ref.invalidate(automationsProvider);
      ref.invalidate(billingProvider);
    }
  }

  Future<void> _confirmLogout() async {
    if (!await editorExits.prepareNavigation() || !mounted) return;
    final accent = Theme.of(context).colorScheme.primary;
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Are you sure you want to logout?'),
        content: const Text(
          'Your GreetSync session will end. Your saved business data and WhatsApp configuration will remain available when you sign in again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: accent),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (yes == true) {
      await ref.read(authProvider.notifier).signOut();
    } else if (yes == false) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Logout cancelled.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final billing = ref.watch(billingProvider);
    final activePackage = _activePackage(billing);
    final accent = Theme.of(context).colorScheme.primary;
    final accountStatus = ref.watch(accountStatusProvider).valueOrNull;
    final accountEnabled =
        accountStatus == null ||
        ['ACTIVE', 'APPROVED'].contains('${accountStatus['status']}');
    final active = activePackage && accountEnabled;

    return EditorExitScope(
      controller: editorExits,
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 10),
                child: BusinessHeader(
                  title: 'GreetSync',
                  businessName: user?.businessName.isNotEmpty == true
                      ? user!.businessName
                      : 'Business',
                  businessLogoData: user?.businessLogoData,
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Consumer(
                        builder: (context, ref, _) {
                          final unread = ref.watch(unreadNotificationsProvider);
                          return IconButton(
                            tooltip: 'Notifications',
                            onPressed: () =>
                                _openScreen(const NotificationsScreen()),
                            icon: unread > 0
                                ? Badge(
                                    label: Text(
                                      unread > 99 ? '99+' : '$unread',
                                    ),
                                    child: const Icon(
                                      Icons.notifications_none_rounded,
                                      color: BusinessColors.ink,
                                    ),
                                  )
                                : const Icon(
                                    Icons.notifications_none_rounded,
                                    color: BusinessColors.ink,
                                  ),
                          );
                        },
                      ),
                      PopupMenuButton<String>(
                        tooltip: 'Account',
                        onSelected: (value) {
                          if (value == 'profile') {
                            _openScreen(const ProfileScreen());
                          }
                          if (value == 'billing') {
                            _openScreen(const BillingScreen());
                          }
                          if (value == 'logout') {
                            _confirmLogout();
                          }
                        },
                        itemBuilder: (_) => [
                          PopupMenuItem<String>(
                            enabled: false,
                            child: SizedBox(
                              width: 230,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    user?.name ?? 'Business User',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 16,
                                      color: BusinessColors.ink,
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    user?.businessName.isNotEmpty == true
                                        ? user!.businessName
                                        : 'GreetSync Business',
                                    style: const TextStyle(
                                      color: BusinessColors.muted,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const PopupMenuDivider(),
                          const PopupMenuItem(
                            value: 'profile',
                            child: Row(
                              children: [
                                Icon(Icons.person_outline_rounded),
                                SizedBox(width: 10),
                                Text('View Profile'),
                              ],
                            ),
                          ),
                          const PopupMenuItem(
                            value: 'billing',
                            child: Row(
                              children: [
                                Icon(Icons.workspace_premium_outlined),
                                SizedBox(width: 10),
                                Text('Billing & Packages'),
                              ],
                            ),
                          ),
                          PopupMenuItem(
                            value: 'logout',
                            child: Row(
                              children: [
                                Icon(Icons.logout_rounded, color: accent),
                                const SizedBox(width: 10),
                                Text('Logout', style: TextStyle(color: accent)),
                              ],
                            ),
                          ),
                        ],
                        child: DataImageAvatar(
                          data: user?.businessLogoData,
                          radius: 20,
                          fallbackText: _initials(user?.name ?? 'U'),
                          backgroundColor: accent.withOpacity(.12),
                          foregroundColor: accent,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (!active && !billing.isLoading)
                InkWell(
                  onTap: () => _openScreen(
                    accountEnabled
                        ? const BillingScreen()
                        : const ProfileScreen(),
                  ),
                  child: Container(
                    margin: const EdgeInsets.fromLTRB(18, 0, 18, 8),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 13,
                      vertical: 9,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF4E0),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFFFFD28A)),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.lock_rounded,
                          size: 18,
                          color: Color(0xFFE68A00),
                        ),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            accountEnabled
                                ? 'No active package — business features are locked.'
                                : 'Account ${'${accountStatus['status'] ?? 'suspended'}'.toLowerCase()} — business features are paused.',
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        Icon(Icons.chevron_right_rounded),
                      ],
                    ),
                  ),
                ),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.zero,
                  child: NavigatorPopHandler<Object?>(
                    onPopWithResult: (result) =>
                        _contentNavigator.currentState!.maybePop(result),
                    child: Navigator(
                      key: _contentNavigator,
                      onGenerateRoute: (_) => MaterialPageRoute(
                        builder: (_) => ValueListenableBuilder<int>(
                          valueListenable: _pageIndex,
                          builder: (_, page, __) =>
                              IndexedStack(index: page, children: pages),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: BottomAppBar(
          height: 74,
          padding: EdgeInsets.zero,
          child: Row(
            children: [
              Expanded(
                child: _NavItem(
                  icon: Icons.home_outlined,
                  activeIcon: Icons.home_rounded,
                  label: 'Home',
                  selected: index == 0,
                  onTap: () => _select(0, active),
                ),
              ),
              Expanded(
                child: _NavItem(
                  icon: Icons.people_outline,
                  activeIcon: Icons.people,
                  label: 'Contacts',
                  selected: index == 1,
                  locked: !active,
                  onTap: () => _select(1, active),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 7,
                  ),
                  child: Material(
                    color: accent,
                    borderRadius: BorderRadius.circular(14),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () => _sendMessage(active),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            active ? Icons.send_rounded : Icons.lock_rounded,
                            color: Colors.white,
                            size: 23,
                          ),
                          const SizedBox(height: 3),
                          const Text(
                            'Send',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: _NavItem(
                  icon: Icons.message_outlined,
                  activeIcon: Icons.message_rounded,
                  label: 'Scheduled',
                  selected: index == 2,
                  locked: !active,
                  onTap: () => _select(2, active),
                ),
              ),
              Expanded(
                child: _NavItem(
                  icon: Icons.grid_view_outlined,
                  activeIcon: Icons.grid_view_rounded,
                  label: 'More',
                  selected: index == 3,
                  onTap: () => _select(3, active),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _initials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'U';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.selected,
    required this.onTap,
    this.locked = false,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool selected;
  final bool locked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected
        ? Theme.of(context).colorScheme.primary
        : BusinessColors.muted;
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Icon(selected ? activeIcon : icon, color: color, size: 23),
              if (locked)
                const Positioned(
                  right: -8,
                  top: -5,
                  child: Icon(
                    Icons.lock_rounded,
                    size: 11,
                    color: Colors.orange,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            label,
            maxLines: 1,
            style: TextStyle(
              fontSize: 9,
              fontWeight: selected ? FontWeight.w900 : FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
