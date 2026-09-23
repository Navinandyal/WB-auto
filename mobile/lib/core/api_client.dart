import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'app_config.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.code});
  final String message;
  final int? statusCode;
  final String? code;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(this._storage) {
    _dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(seconds: 30),
      headers: {'Accept': 'application/json'},
    ));
    _refreshDio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Accept': 'application/json'},
    ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'access_token') ?? await _storage.read(key: 'auth_token');
        if (token != null && token.isNotEmpty) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onError: (error, handler) async {
        if (kDebugMode) debugPrint('API ${error.requestOptions.method} ${error.requestOptions.path}: ${error.message}');
        final is401 = error.response?.statusCode == 401;
        final alreadyRetried = error.requestOptions.extra['authRetried'] == true;
        final isAuthPath = error.requestOptions.path.contains('/api/auth/login') || error.requestOptions.path.contains('/api/auth/refresh');
        if (is401 && !alreadyRetried && !isAuthPath) {
          final refreshed = await _refreshAccessToken();
          if (refreshed) {
            final token = await _storage.read(key: 'access_token');
            final opts = error.requestOptions;
            opts.extra['authRetried'] = true;
            if (token != null) opts.headers['Authorization'] = 'Bearer $token';
            try {
              final response = await _dio.fetch(opts);
              return handler.resolve(response);
            } catch (_) {}
          }
        }
        handler.next(error);
      },
    ));
  }

  final FlutterSecureStorage _storage;
  late final Dio _dio;
  late final Dio _refreshDio;
  bool _refreshing = false;

  Future<bool> _refreshAccessToken() async {
    if (_refreshing) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      return (await _storage.read(key: 'access_token'))?.isNotEmpty == true;
    }
    final refresh = await _storage.read(key: 'refresh_token');
    if (refresh == null || refresh.isEmpty) return false;
    _refreshing = true;
    try {
      final response = await _refreshDio.post('/api/auth/refresh', data: {'refreshToken': refresh});
      final data = response.data;
      if (data is Map && data['accessToken'] != null) {
        await _storage.write(key: 'access_token', value: data['accessToken'].toString());
        await _storage.write(key: 'auth_token', value: data['accessToken'].toString());
        return true;
      }
    } catch (_) {
      await _storage.delete(key: 'access_token');
      await _storage.delete(key: 'auth_token');
      await _storage.delete(key: 'refresh_token');
    } finally {
      _refreshing = false;
    }
    return false;
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) => _request(() => _dio.get(path, queryParameters: query));
  Future<dynamic> post(String path, {Object? data}) => _request(() => _dio.post(path, data: data));
  Future<dynamic> put(String path, {Object? data}) => _request(() => _dio.put(path, data: data));
  Future<dynamic> patch(String path, {Object? data}) => _request(() => _dio.patch(path, data: data));
  Future<dynamic> delete(String path, {Object? data}) => _request(() => _dio.delete(path, data: data));

  Future<dynamic> _request(Future<Response<dynamic>> Function() fn) async {
    try {
      final response = await fn();
      return response.data;
    } on DioException catch (e) {
      final data = e.response?.data;
      var message = 'Unable to connect to the server.';
      String? code;
      if (data is Map) {
        if (data['error'] != null) message = data['error'].toString();
        else if (data['message'] != null) message = data['message'].toString();
        code = data['code']?.toString();
      }
      if (e.type == DioExceptionType.connectionTimeout || e.type == DioExceptionType.receiveTimeout || e.type == DioExceptionType.connectionError) {
        message = 'Cannot reach the WishFlow backend. Make sure the backend is running on port 3000 and, for a USB-connected Android phone, run: adb reverse tcp:3000 tcp:3000';
      } else if (e.response?.statusCode == 401 && (data == null || data is! Map)) {
        message = 'Your session has expired. Please sign in again.';
      }
      throw ApiException(message, statusCode: e.response?.statusCode, code: code);
    }
  }
}
