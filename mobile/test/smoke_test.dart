import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:greetsync_mobile/core/app_config.dart';
import 'package:greetsync_mobile/core/backend_defaults.dart';

void main() {
  test('plain builds use the saved HTTPS production backend', () {
    final saved = jsonDecode(
      File('../GREETSYNC_DEPLOYMENT.json').readAsStringSync(),
    );
    expect(defaultApiBaseUrl, saved['backendUrl']);
    expect(Uri.parse(defaultApiBaseUrl).scheme, 'https');
    expect(Uri.parse(AppConfig.apiBaseUrl).host, isNot('127.0.0.1'));
  });

  test('cloud connection failures never instruct users to run adb', () {
    for (final debug in [true, false]) {
      for (final timedOut in [true, false]) {
        final text = AppConfig.connectionErrorMessage(
          backendUrl: defaultApiBaseUrl,
          debug: debug,
          timedOut: timedOut,
        );
        expect(text, contains('internet connection'));
        expect(text, isNot(contains('adb')));
        expect(text, isNot(contains('3000')));
      }
    }
  });

  test('local development advice is limited to explicit debug local URLs', () {
    expect(
      AppConfig.connectionErrorMessage(
        backendUrl: 'http://127.0.0.1:3000',
        debug: true,
      ),
      contains('adb reverse'),
    );
    expect(
      AppConfig.connectionErrorMessage(
        backendUrl: 'http://127.0.0.1:3000',
        debug: false,
      ),
      isNot(contains('adb')),
    );
    expect(
      AppConfig.connectionErrorMessage(
        backendUrl: 'https://localhost.example.com',
        debug: true,
      ),
      isNot(contains('adb')),
    );
  });
}
