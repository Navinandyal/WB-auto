import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../core/api_client.dart';
import '../models/models.dart';

final secureStorageProvider = Provider((_) => const FlutterSecureStorage());
final apiClientProvider = Provider((ref) => ApiClient(ref.watch(secureStorageProvider)));

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
