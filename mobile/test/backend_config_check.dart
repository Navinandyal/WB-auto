// Run with: dart test/backend_config_check.dart
// Also accepts an expected --define override as its first argument.
import 'dart:convert';
import 'dart:io';

import '../lib/core/app_config.dart';
import '../lib/core/backend_defaults.dart';

void main(List<String> args) {
  var checks = 0;
  void check(bool ok, String label) {
    if (!ok) throw StateError(label);
    checks++;
  }

  final config = jsonDecode(
    File.fromUri(
      Platform.script.resolve('../../GREETSYNC_DEPLOYMENT.json'),
    ).readAsStringSync(),
  );
  check(
    defaultApiBaseUrl == config['backendUrl'],
    'Saved source matches deployment',
  );
  check(
    defaultApiBaseUrl.isEmpty || Uri.parse(defaultApiBaseUrl).scheme == 'https',
    'Production URL is unconfigured or HTTPS; never falls back to Railway',
  );
  check(
    !defaultApiBaseUrl.contains('railway.app'),
    'Retired hosting is not a fallback',
  );
  check(
    AppConfig.apiBaseUrl == (args.isEmpty ? defaultApiBaseUrl : args.first),
    'Compile-time override takes precedence; plain build uses production',
  );
  for (final debug in [true, false]) {
    for (final timeout in [true, false]) {
      final message = AppConfig.connectionErrorMessage(
        backendUrl: defaultApiBaseUrl,
        debug: debug,
        timedOut: timeout,
      );
      check(
        message.contains('internet connection'),
        'Cloud failure is actionable',
      );
      check(
        !message.contains('adb') && !message.contains('3000'),
        'Cloud failure has no local developer instructions',
      );
    }
  }
  for (final url in [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
    'http://10.0.2.2:3000',
  ]) {
    check(
      AppConfig.connectionErrorMessage(
        backendUrl: url,
        debug: true,
      ).contains('adb reverse'),
      'Explicit local debug supports development',
    );
    check(
      !AppConfig.connectionErrorMessage(
        backendUrl: url,
        debug: false,
      ).contains('adb'),
      'Release screen does not show developer commands',
    );
  }
  check(
    !AppConfig.connectionErrorMessage(
      backendUrl: 'https://localhost.example.com',
      debug: true,
    ).contains('adb'),
    'Hostname boundaries are respected',
  );
  print('Backend configuration: $checks checks passed');
}
