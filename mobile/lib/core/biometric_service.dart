import 'package:flutter/services.dart';

class BiometricService {
  static const MethodChannel _channel = MethodChannel('wishflow/biometric');

  static Future<bool> isAvailable() async {
    try {
      return await _channel.invokeMethod<bool>('isAvailable') ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> authenticate({String reason = 'Authenticate to continue to WishFlow'}) async {
    try {
      return await _channel.invokeMethod<bool>('authenticate', {'reason': reason}) ?? false;
    } on PlatformException {
      return false;
    }
  }
}
