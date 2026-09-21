class AppConfig {
  /// Local Android development default.
  ///
  /// For a physical device connected over USB, run:
  ///   adb reverse tcp:3000 tcp:3000
  ///
  /// Then the phone can reach the computer's backend through 127.0.0.1.
  /// Production/staging can still override this with:
  ///   --dart-define=API_BASE_URL=https://api.example.com
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:3000',
  );
}
