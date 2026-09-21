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
    final token = await ref.read(secureStorageProvider).read(key: 'auth_token');
    if (token == null || token.isEmpty) {
      state = const AuthState(loading: false);
      return;
    }
    try {
      final data = await ref.read(apiClientProvider).get('/api/auth/me');
      final u = (data as Map)['user'] as Map;
      state = AuthState(loading: false, user: AppUser.fromJson(u.cast<String, dynamic>()));
    } catch (_) {
      await ref.read(secureStorageProvider).delete(key: 'auth_token');
      state = const AuthState(loading: false);
    }
  }

  Future<bool> signIn({required String mobile, required String password}) async {
    state = const AuthState(loading: true);
    try {
      final data = await ref.read(apiClientProvider).post('/api/auth/mobile-login', data: {
        'mobile': mobile.trim(),
        'password': password,
      });
      final map = (data as Map).cast<String, dynamic>();
      final token = map['token']?.toString() ?? '';
      if (token.isEmpty) throw ApiException('The server did not return a login token.');
      await ref.read(secureStorageProvider).write(key: 'auth_token', value: token);
      final u = (map['user'] as Map).cast<String, dynamic>();
      state = AuthState(loading: false, user: AppUser.fromJson(u));
      return true;
    } catch (e) {
      state = AuthState(loading: false, error: e is ApiException ? e.message : e.toString());
      return false;
    }
  }

  Future<void> signOut() async {
    await ref.read(secureStorageProvider).delete(key: 'auth_token');
    state = const AuthState(loading: false);
  }
}

final authProvider = StateNotifierProvider<AuthController, AuthState>((ref) => AuthController(ref));

final dashboardProvider = FutureProvider<DashboardData>((ref) async => DashboardData.fromJson((await ref.read(apiClientProvider).get('/api/dashboard/stats') as Map).cast<String,dynamic>()));
final contactsProvider = FutureProvider<List<Contact>>((ref) async => ((await ref.read(apiClientProvider).get('/api/contacts')) as List).whereType<Map>().map((e)=>Contact.fromJson(e.cast<String,dynamic>())).toList());
final templatesProvider = FutureProvider<List<MessageTemplate>>((ref) async => ((await ref.read(apiClientProvider).get('/api/whatsapp/templates')) as List).whereType<Map>().map((e)=>MessageTemplate.fromJson(e.cast<String,dynamic>())).toList());
final automationsProvider = FutureProvider<List<Automation>>((ref) async => ((await ref.read(apiClientProvider).get('/api/automations')) as List).whereType<Map>().map((e)=>Automation.fromJson(e.cast<String,dynamic>())).toList());
final birthdaysProvider = FutureProvider<List<BirthdayItem>>((ref) async => ((await ref.read(apiClientProvider).get('/api/wishflow/summary')) as List).whereType<Map>().map((e)=>BirthdayItem.fromJson(e.cast<String,dynamic>())).toList());
final birthdaySettingsProvider = FutureProvider<BirthdaySettings>((ref) async => BirthdaySettings.fromJson((await ref.read(apiClientProvider).get('/api/wishflow/settings') as Map).cast<String,dynamic>()));
final wishHistoryProvider = FutureProvider<List<Map<String,dynamic>>>((ref) async => ((await ref.read(apiClientProvider).get('/api/wishflow/history')) as List).whereType<Map>().map((e)=>e.cast<String,dynamic>()).toList());
final whatsappAccountProvider = FutureProvider<Map<String,dynamic>>((ref) async => (await ref.read(apiClientProvider).get('/api/whatsapp/account') as Map).cast<String,dynamic>());
final businessUsersProvider = FutureProvider<List<BusinessUser>>((ref) async => ((await ref.read(apiClientProvider).get('/api/admin/users')) as List).whereType<Map>().map((e)=>BusinessUser.fromJson(e.cast<String,dynamic>())).toList());

final adminOverviewProvider = FutureProvider<AdminOverview>((ref) async => AdminOverview.fromJson((await ref.read(apiClientProvider).get('/api/admin/overview') as Map).cast<String,dynamic>()));
