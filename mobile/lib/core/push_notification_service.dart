import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'api_client.dart';

/// Firebase values are supplied by the app owner at build time. No fabricated
/// project/credentials are bundled, and local notifications still work without FCM.
class PushNotificationService {
  static bool ready = false;
  static StreamSubscription<String>? refresh;
  static Future<void> initialize() async {
    const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
    const appId = String.fromEnvironment('FIREBASE_APP_ID');
    const sender = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
    const project = String.fromEnvironment('FIREBASE_PROJECT_ID');
    try {
      if ([apiKey, appId, sender, project].any((v) => v.isEmpty)) {
        await Firebase.initializeApp();
      } else {
        await Firebase.initializeApp(
          options: const FirebaseOptions(
            apiKey: apiKey,
            appId: appId,
            messagingSenderId: sender,
            projectId: project,
          ),
        );
      }
      ready = true;
    } catch (_) {
      ready = false;
    }
  }

  static Future<void> register(ApiClient api) async {
    if (!ready) return;
    try {
      await FirebaseMessaging.instance.requestPermission();
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null)
        await api.post('/api/push/devices', data: {'token': token});
      await refresh?.cancel();
      refresh = FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
        try {
          await api.post('/api/push/devices', data: {'token': token});
        } catch (_) {}
      });
    } catch (_) {}
  }

  static Future<void> unregister(ApiClient api) async {
    await refresh?.cancel();
    refresh = null;
    if (!ready) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null)
        await api.delete('/api/push/devices', data: {'token': token});
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
  }
}
