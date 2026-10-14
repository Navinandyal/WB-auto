import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'api_client.dart';

/// Optional owner-supplied Firebase configuration. The app still starts without
/// Firebase; native local notifications do not require an APNs/FCM account.
class PushNotificationService {
  static bool ready = false;
  static StreamSubscription<String>? refresh;
  static Timer? _retry;
  static String? _registeredToken;
  static int _generation = 0;
  static bool get _apple =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.macOS);

  static Future<void> initialize() async {
    const commonKey = String.fromEnvironment('FIREBASE_API_KEY');
    const iosKey = String.fromEnvironment('FIREBASE_IOS_API_KEY');
    const androidAppId = String.fromEnvironment('FIREBASE_APP_ID');
    const iosAppId = String.fromEnvironment('FIREBASE_IOS_APP_ID');
    const sender = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
    const project = String.fromEnvironment('FIREBASE_PROJECT_ID');
    const bundleId = String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID');
    final apiKey = _apple && iosKey.isNotEmpty ? iosKey : commonKey;
    // Never reuse an Android Firebase app ID for an iPhone build.
    final appId = _apple ? iosAppId : androidAppId;
    try {
      if ([apiKey, appId, sender, project].any((v) => v.isEmpty)) {
        await Firebase.initializeApp();
      } else {
        await Firebase.initializeApp(
          options: FirebaseOptions(
            apiKey: apiKey,
            appId: appId,
            messagingSenderId: sender,
            projectId: project,
            iosBundleId: bundleId.isEmpty ? null : bundleId,
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
    final generation = ++_generation;
    _retry?.cancel();
    await refresh?.cancel();
    if (generation != _generation) return;
    // Subscribe before waiting: APNs can arrive later than the initial request.
    refresh = FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
      if (generation != _generation) return;
      try {
        await api.post('/api/push/devices', data: {'token': token});
        if (generation == _generation) _registeredToken = token;
      } catch (_) {}
    }, onError: (_) {});
    try {
      final settings = await FirebaseMessaging.instance.requestPermission();
      if (generation != _generation ||
          settings.authorizationStatus == AuthorizationStatus.denied) {
        return;
      }
      await _tryRegister(api, generation, 0);
    } catch (_) {}
  }

  static Future<void> _tryRegister(
    ApiClient api,
    int generation,
    int attempt,
  ) async {
    if (generation != _generation) return;
    try {
      if (_apple && await FirebaseMessaging.instance.getAPNSToken() == null) {
        _scheduleRetry(api, generation, attempt);
        return;
      }
      if (generation != _generation) return;
      final token = await FirebaseMessaging.instance.getToken();
      if (generation != _generation) return;
      if (token == null) {
        _scheduleRetry(api, generation, attempt);
        return;
      }
      await api.post('/api/push/devices', data: {'token': token});
      if (generation == _generation) _registeredToken = token;
    } catch (_) {
      _scheduleRetry(api, generation, attempt);
    }
  }

  static void _scheduleRetry(ApiClient api, int generation, int attempt) {
    if (generation != _generation || attempt >= 4) return;
    _retry?.cancel();
    _retry = Timer(
      const Duration(seconds: 15),
      () => _tryRegister(api, generation, attempt + 1),
    );
  }

  static Future<void> unregister(ApiClient api) async {
    ++_generation;
    _retry?.cancel();
    _retry = null;
    await refresh?.cancel();
    refresh = null;
    final token = _registeredToken;
    _registeredToken = null;
    if (!ready) return;
    try {
      if (token != null) {
        await api.delete('/api/push/devices', data: {'token': token});
      }
      if (!_apple || await FirebaseMessaging.instance.getAPNSToken() != null) {
        await FirebaseMessaging.instance.deleteToken();
      }
    } catch (_) {}
  }
}
