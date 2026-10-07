import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'providers/providers.dart';
import 'core/push_notification_service.dart';
import 'screens/admin_shell.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'theme/business_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await PushNotificationService.initialize();
  runApp(const ProviderScope(child: App()));
}

class App extends ConsumerWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final themePref = ref.watch(themeProvider);
    final user = auth.user;
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'GreetSync',
      theme: buildBusinessTheme(accent: themePref.accent),
      home: auth.loading
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : user == null
          ? const LoginScreen()
          : user.isAdmin
          ? const AdminShell()
          : const HomeShell(),
    );
  }
}
