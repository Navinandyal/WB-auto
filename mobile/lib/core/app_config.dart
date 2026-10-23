import 'backend_defaults.dart';

class AppConfig {
  /// Plain Flutter builds use the saved production HTTPS backend.
  /// Setup refreshes backend_defaults.dart when the Render domain changes.
  /// To deliberately use another backend, pass:
  ///   --dart-define=API_BASE_URL=https://api.example.com
  /// Local USB development requires an explicit http://127.0.0.1:3000
  /// override, a debug build and adb reverse tcp:3000 tcp:3000.
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: defaultApiBaseUrl,
  );

  static const privacyPolicyUrl = String.fromEnvironment(
    'PRIVACY_POLICY_URL',
    defaultValue: '$apiBaseUrl/privacy-policy',
  );
  static const termsConditionsUrl = String.fromEnvironment(
    'TERMS_CONDITIONS_URL',
    defaultValue: '$apiBaseUrl/terms-and-conditions',
  );

  static String connectionErrorMessage({
    required String backendUrl,
    bool debug = false,
    bool timedOut = false,
  }) {
    final host = Uri.tryParse(backendUrl)?.host.toLowerCase();
    final local =
        host == 'localhost' ||
        host == '127.0.0.1' ||
        host == '::1' ||
        host == '10.0.2.2';
    if (debug && local) {
      return 'Cannot reach the local GreetSync backend. Start the development '
          'server and check the configured address. For a USB-connected '
          'Android phone, run: adb reverse tcp:3000 tcp:3000';
    }
    return timedOut
        ? 'GreetSync is taking too long to respond. Check your internet '
              'connection and try again. If this continues, contact support.'
        : 'Unable to reach GreetSync. Check your internet connection and try '
              'again. If this continues, contact support.';
  }
}
