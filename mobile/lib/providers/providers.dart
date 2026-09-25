import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../core/api_client.dart';
import '../core/biometric_service.dart';
import '../models/models.dart';
import '../theme/business_theme.dart';

final secureStorageProvider = Provider((_) => const FlutterSecureStorage());
final apiClientProvider = Provider((ref) => ApiClient(ref.watch(secureStorageProvider)));


class AppThemePreference {
  const AppThemePreference({required this.accentKey, required this.accent, this.loaded = false});
  final String accentKey;
  final Color accent;
  final bool loaded;
}

class AppThemeController extends StateNotifier<AppThemePreference> {
  AppThemeController(this.ref)
      : super(AppThemePreference(accentKey: appAccentChoices.first.key, accent: appAccentChoices.first.color)) {
    _load();
  }
  final Ref ref;

  Future<void> _load() async {
    final key = await ref.read(secureStorageProvider).read(key: 'wishflow_accent_key') ?? 'green';
    final choice = accentChoiceForKey(key);
    state = AppThemePreference(accentKey: choice.key, accent: choice.color, loaded: true);
  }

  Future<void> setAccent(String key) async {
    final choice = accentChoiceForKey(key);
    await ref.read(secureStorageProvider).write(key: 'wishflow_accent_key', value: choice.key);
    state = AppThemePreference(accentKey: choice.key, accent: choice.color, loaded: true);
  }
}

final themeProvider = StateNotifierProvider<AppThemeController, AppThemePreference>((ref) => AppThemeController(ref));

class BiometricPreference {
  const BiometricPreference({required this.enabled, required this.available, this.deviceLabel = ''});
  final bool enabled;
  final bool available;
  final String deviceLabel;
}

final biometricPreferenceProvider = FutureProvider<BiometricPreference>((ref) async {
  final storage = ref.read(secureStorageProvider);
  final enabled = await storage.read(key: 'biometric_enabled') == 'true';
  final available = await BiometricService.isAvailable();
  final label = await storage.read(key: 'biometric_device_label') ?? '';
  return BiometricPreference(enabled: enabled, available: available, deviceLabel: label);
});

class AuthState {
  const AuthState({this.user, this.loading = true, this.error});
  final AppUser? user;
  final bool loading;
  final String? error;
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this.ref) : super(const AuthState()) { restore(); }
  final Ref ref;

  Future<void> restore() async {
    final storage = ref.read(secureStorageProvider);
    final remember = await storage.read(key: 'remember_login') == 'true';
    if (!remember) {
      await storage.delete(key: 'access_token');
      await storage.delete(key: 'auth_token');
      await storage.delete(key: 'refresh_token');
      state = const AuthState(loading: false);
      return;
    }
    final token = await storage.read(key: 'access_token') ?? await storage.read(key: 'auth_token');
    if (token == null || token.isEmpty) {
      final refresh = await storage.read(key: 'refresh_token');
      if (refresh == null || refresh.isEmpty) {
        state = const AuthState(loading: false);
        return;
      }
      try {
        final refreshed = await ref.read(apiClientProvider).post('/api/auth/refresh', data: {'refreshToken': refresh});
        final map = (refreshed as Map).cast<String, dynamic>();
        final newToken = map['accessToken']?.toString() ?? '';
        if (newToken.isEmpty) throw ApiException('Unable to restore session.');
        await storage.write(key: 'access_token', value: newToken);
        await storage.write(key: 'auth_token', value: newToken);
      } catch (_) {
        await _clearSession();
        state = const AuthState(loading: false);
        return;
      }
    }
    try {
      final data = await ref.read(apiClientProvider).get('/api/auth/me');
      final u = (data as Map)['user'] as Map;
      final user = AppUser.fromJson(u.cast<String, dynamic>());
      await storage.write(key: 'logged_in_user_id', value: '${user.id}');
      await storage.write(key: 'business_id', value: '${user.id}');
      state = AuthState(loading: false, user: user);
    } catch (_) {
      await _clearSession();
      state = const AuthState(loading: false);
    }
  }

  Future<bool> signIn({required String mobile, required String password, bool rememberMe = true}) async {
    state = const AuthState(loading: true);
    try {
      final data = await ref.read(apiClientProvider).post('/api/auth/login', data: {
        'mobile': mobile.trim(),
        'password': password,
        'rememberMe': rememberMe,
      });
      final map = (data as Map).cast<String, dynamic>();
      final accessToken = (map['accessToken'] ?? map['token'])?.toString() ?? '';
      final refreshToken = map['refreshToken']?.toString() ?? '';
      if (accessToken.isEmpty) throw ApiException('The server did not return an access token.');
      final storage = ref.read(secureStorageProvider);
      await storage.write(key: 'access_token', value: accessToken);
      await storage.write(key: 'auth_token', value: accessToken);
      if (refreshToken.isNotEmpty) await storage.write(key: 'refresh_token', value: refreshToken);
      await storage.write(key: 'remember_login', value: rememberMe ? 'true' : 'false');
      await storage.write(key: 'last_login_mobile', value: mobile.trim());
      final u = (map['user'] as Map).cast<String, dynamic>();
      final user = AppUser.fromJson(u);
      await storage.write(key: 'logged_in_user_id', value: '${user.id}');
      await storage.write(key: 'business_id', value: '${user.id}');
      _invalidateTenantScopedData();
      state = AuthState(loading: false, user: user);
      return true;
    } catch (e) {
      state = AuthState(loading: false, error: e is ApiException ? e.message : e.toString());
      return false;
    }
  }


  Future<bool> updateProfile({
    required String name,
    required String email,
    required String businessName,
    required String businessAddress,
  }) async {
    if (state.user == null) return false;
    try {
      final data = await ref.read(apiClientProvider).put('/api/profile', data: {
        'name': name.trim(),
        'email': email.trim(),
        'businessName': businessName.trim(),
        'businessAddress': businessAddress.trim(),
      });
      final map = (data as Map).cast<String, dynamic>();
      final user = AppUser.fromJson((map['user'] as Map).cast<String, dynamic>());
      state = AuthState(user: user, loading: false);
      return true;
    } catch (e) {
      state = AuthState(user: state.user, loading: false, error: e is ApiException ? e.message : e.toString());
      return false;
    }
  }

  Future<bool> enableBiometricLogin({String deviceLabel = 'Android device'}) async {
    final current = state.user;
    if (current == null) return false;
    final available = await BiometricService.isAvailable();
    if (!available) {
      state = AuthState(user: current, loading: false, error: 'Biometric authentication is not available or not enrolled on this device.');
      return false;
    }
    final authenticated = await BiometricService.authenticate(reason: 'Confirm your identity to enable biometric login');
    if (!authenticated) return false;
    try {
      final data = (await ref.read(apiClientProvider).post('/api/auth/biometric/enable', data: {
        'deviceLabel': deviceLabel,
      }) as Map).cast<String, dynamic>();
      final credentialId = '${data['credentialId'] ?? ''}';
      final secret = '${data['secret'] ?? ''}';
      if (credentialId.isEmpty || secret.isEmpty) throw ApiException('Server did not return a biometric credential.');
      final storage = ref.read(secureStorageProvider);
      await storage.write(key: 'biometric_credential_id', value: credentialId);
      await storage.write(key: 'biometric_secret', value: secret);
      await storage.write(key: 'biometric_enabled', value: 'true');
      await storage.write(key: 'biometric_device_label', value: deviceLabel);
      await storage.write(key: 'last_login_mobile', value: current.mobile);
      ref.invalidate(biometricPreferenceProvider);
      return true;
    } catch (e) {
      state = AuthState(user: current, loading: false, error: e is ApiException ? e.message : e.toString());
      return false;
    }
  }

  Future<void> disableBiometricLogin() async {
    final storage = ref.read(secureStorageProvider);
    final credentialId = await storage.read(key: 'biometric_credential_id');
    if (state.user != null && credentialId != null && credentialId.isNotEmpty) {
      try {
        await ref.read(apiClientProvider).post('/api/auth/biometric/disable', data: {'credentialId': credentialId});
      } catch (_) {}
    }
    for (final key in ['biometric_credential_id', 'biometric_secret', 'biometric_enabled', 'biometric_device_label']) {
      await storage.delete(key: key);
    }
    ref.invalidate(biometricPreferenceProvider);
  }

  Future<bool> signInWithBiometric() async {
    final storage = ref.read(secureStorageProvider);
    final enabled = await storage.read(key: 'biometric_enabled') == 'true';
    final credentialId = await storage.read(key: 'biometric_credential_id') ?? '';
    final secret = await storage.read(key: 'biometric_secret') ?? '';
    if (!enabled || credentialId.isEmpty || secret.isEmpty) return false;

    final authenticated = await BiometricService.authenticate(reason: 'Use biometrics to sign in to WishFlow');
    if (!authenticated) return false;
    state = const AuthState(loading: true);
    try {
      final data = await ref.read(apiClientProvider).post('/api/auth/biometric/login', data: {
        'credentialId': credentialId,
        'secret': secret,
      });
      final map = (data as Map).cast<String, dynamic>();
      final accessToken = '${map['accessToken'] ?? map['token'] ?? ''}';
      final refreshToken = '${map['refreshToken'] ?? ''}';
      if (accessToken.isEmpty) throw ApiException('Biometric login did not return an access token.');
      await storage.write(key: 'access_token', value: accessToken);
      await storage.write(key: 'auth_token', value: accessToken);
      if (refreshToken.isNotEmpty) await storage.write(key: 'refresh_token', value: refreshToken);
      await storage.write(key: 'remember_login', value: 'true');
      final user = AppUser.fromJson((map['user'] as Map).cast<String, dynamic>());
      await storage.write(key: 'logged_in_user_id', value: '${user.id}');
      await storage.write(key: 'business_id', value: '${user.id}');
      await storage.write(key: 'last_login_mobile', value: user.mobile);
      _invalidateTenantScopedData();
      state = AuthState(loading: false, user: user);
      return true;
    } catch (e) {
      state = AuthState(loading: false, error: e is ApiException ? e.message : e.toString());
      return false;
    }
  }

  Future<void> signOut() async {
    final storage = ref.read(secureStorageProvider);
    final refresh = await storage.read(key: 'refresh_token');
    if (refresh != null && refresh.isNotEmpty) {
      try { await ref.read(apiClientProvider).post('/api/auth/logout', data: {'refreshToken': refresh}); } catch (_) {}
    }
    await _clearSession();
    _invalidateTenantScopedData();
    state = const AuthState(loading: false);
  }

  void _invalidateTenantScopedData() {
    ref.invalidate(dashboardProvider);
    ref.invalidate(contactsProvider);
    ref.invalidate(contactGroupsProvider);
    ref.invalidate(templatesProvider);
    ref.invalidate(automationsProvider);
    ref.invalidate(birthdaysProvider);
    ref.invalidate(birthdaySettingsProvider);
    ref.invalidate(wishHistoryProvider);
    ref.invalidate(whatsappAccountProvider);
    ref.invalidate(businessUsersProvider);
    ref.invalidate(adminOverviewProvider);
  }

  Future<void> _clearSession() async {
    final storage = ref.read(secureStorageProvider);
    for (final key in ['access_token','auth_token','refresh_token','logged_in_user_id','business_id']) {
      await storage.delete(key: key);
    }
  }
}

final authProvider = StateNotifierProvider<AuthController, AuthState>((ref) => AuthController(ref));

final dashboardProvider = FutureProvider<DashboardData>((ref) async => DashboardData.fromJson((await ref.read(apiClientProvider).get('/api/dashboard/stats') as Map).cast<String,dynamic>()));
final contactsProvider = FutureProvider<List<Contact>>((ref) async => ((await ref.read(apiClientProvider).get('/api/contacts')) as List).whereType<Map>().map((e)=>Contact.fromJson(e.cast<String,dynamic>())).toList());
final contactGroupsProvider = FutureProvider<List<ContactGroup>>((ref) async => ((await ref.read(apiClientProvider).get('/api/contact-groups')) as List).whereType<Map>().map((e)=>ContactGroup.fromJson(e.cast<String,dynamic>())).toList());
final templatesProvider = FutureProvider<List<MessageTemplate>>((ref) async => ((await ref.read(apiClientProvider).get('/api/whatsapp/templates')) as List).whereType<Map>().map((e)=>MessageTemplate.fromJson(e.cast<String,dynamic>())).toList());
final automationsProvider = FutureProvider<List<Automation>>((ref) async => ((await ref.read(apiClientProvider).get('/api/automations')) as List).whereType<Map>().map((e)=>Automation.fromJson(e.cast<String,dynamic>())).toList());
final birthdaysProvider = FutureProvider<List<BirthdayItem>>((ref) async => ((await ref.read(apiClientProvider).get('/api/wishflow/summary')) as List).whereType<Map>().map((e)=>BirthdayItem.fromJson(e.cast<String,dynamic>())).toList());
final birthdaySettingsProvider = FutureProvider<BirthdaySettings>((ref) async => BirthdaySettings.fromJson((await ref.read(apiClientProvider).get('/api/wishflow/settings') as Map).cast<String,dynamic>()));
final wishHistoryProvider = FutureProvider<List<Map<String,dynamic>>>((ref) async => ((await ref.read(apiClientProvider).get('/api/wishflow/history')) as List).whereType<Map>().map((e)=>e.cast<String,dynamic>()).toList());
final whatsappAccountProvider = FutureProvider<Map<String,dynamic>>((ref) async => (await ref.read(apiClientProvider).get('/api/whatsapp/connection') as Map).cast<String,dynamic>());
final businessUsersProvider = FutureProvider<List<BusinessUser>>((ref) async => ((await ref.read(apiClientProvider).get('/api/admin/users')) as List).whereType<Map>().map((e)=>BusinessUser.fromJson(e.cast<String,dynamic>())).toList());

final adminOverviewProvider = FutureProvider<AdminOverview>((ref) async => AdminOverview.fromJson((await ref.read(apiClientProvider).get('/api/admin/overview') as Map).cast<String,dynamic>()));
