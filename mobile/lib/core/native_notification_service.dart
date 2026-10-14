import 'package:flutter/services.dart';

/// Android/iOS native local notifications without an additional Flutter package.
///
/// GreetSync uses this for heads-up notifications when new backend notification
/// rows arrive and for scheduled-message reminders that can appear while the
/// phone is locked or the app is in the background.
class NativeNotificationService {
  NativeNotificationService._();

  static const MethodChannel _channel = MethodChannel(
    'greetsync/notifications',
  );

  static Future<void> requestPermission() async {
    try {
      await _channel.invokeMethod<void>('requestPermission');
    } catch (_) {
      // Keep the app usable when native notifications are unavailable.
    }
  }

  static Future<void> show({
    required int id,
    required String title,
    required String body,
  }) async {
    try {
      await _channel.invokeMethod<void>('show', {
        'id': id,
        'title': title,
        'body': body,
      });
    } catch (_) {}
  }

  static Future<void> schedule({
    required int id,
    required String title,
    required String body,
    required DateTime when,
  }) async {
    try {
      await _channel.invokeMethod<void>('schedule', {
        'id': id,
        'title': title,
        'body': body,
        'epochMillis': when.millisecondsSinceEpoch,
      });
    } catch (_) {}
  }

  static Future<void> syncSchedules(List<Map<String, dynamic>> items) async {
    try {
      await _channel.invokeMethod<void>('syncSchedules', {'items': items});
    } catch (_) {}
  }

  static Future<void> cancel(int id) async {
    try {
      await _channel.invokeMethod<void>('cancel', {'id': id});
    } catch (_) {}
  }
}
