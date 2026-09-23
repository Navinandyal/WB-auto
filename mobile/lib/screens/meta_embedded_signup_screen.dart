import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../core/app_config.dart';
import '../providers/providers.dart';
import '../theme/business_theme.dart';
import '../widgets/common.dart';

class MetaEmbeddedSignupScreen extends ConsumerStatefulWidget {
  const MetaEmbeddedSignupScreen({super.key});

  @override
  ConsumerState<MetaEmbeddedSignupScreen> createState() =>
      _MetaEmbeddedSignupScreenState();
}

class _MetaEmbeddedSignupScreenState
    extends ConsumerState<MetaEmbeddedSignupScreen>
    with WidgetsBindingObserver {
  bool _loading = true;
  bool _launching = false;
  bool _waitingForMeta = false;
  String? _error;
  String? _errorCode;
  String? _signupUrl;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _prepare();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _waitingForMeta) {
      _checkConnection();
    }
  }

  Future<void> _prepare() async {
    setState(() {
      _loading = true;
      _error = null;
      _errorCode = null;
    });
    try {
      final data = (await ref.read(apiClientProvider).post(
        '/api/whatsapp/embedded-signup/session',
        data: {'baseUrl': AppConfig.apiBaseUrl},
      ) as Map)
          .cast<String, dynamic>();
      final rawUrl = '${data['url'] ?? ''}';
      if (rawUrl.isEmpty) {
        throw ApiException('Backend did not return a Meta signup URL.');
      }
      final url = rawUrl.startsWith('http')
          ? rawUrl
          : '${AppConfig.apiBaseUrl}$rawUrl';
      if (!mounted) return;
      setState(() {
        _signupUrl = url;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        if (e is ApiException) {
          _errorCode = e.code;
          _error = e.code == 'META_PLATFORM_NOT_CONFIGURED'
              ? 'WishFlow Meta Platform Setup is not configured yet. Ask the Super Admin to save and validate the Meta App ID, App Secret and Embedded Signup Configuration ID.'
              : e.message;
        } else {
          _error = '$e';
        }
        _loading = false;
      });
    }
  }

  Future<void> _openMeta() async {
    final raw = _signupUrl;
    if (raw == null || raw.isEmpty) return;
    setState(() {
      _launching = true;
      _error = null;
    });
    try {
      final uri = Uri.parse(raw);
      final ok = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!ok) {
        throw ApiException(
          'Could not open Meta Business Login. Make sure Chrome or another browser is installed.',
        );
      }
      if (!mounted) return;
      setState(() {
        _waitingForMeta = true;
        _launching = false;
      });
      _startPolling();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _launching = false;
        _error = e is ApiException ? e.message : '$e';
      });
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (mounted && _waitingForMeta) _checkConnection();
    });
  }

  Future<void> _checkConnection() async {
    try {
      final data = (await ref
              .read(apiClientProvider)
              .get('/api/whatsapp/connection') as Map)
          .cast<String, dynamic>();
      final status = '${data['connectionStatus'] ?? ''}'.toUpperCase();
      final exists = data['exists'] == true;
      if (status == 'CONNECTED') {
        _pollTimer?.cancel();
        ref.invalidate(whatsappAccountProvider);
        ref.invalidate(dashboardProvider);
        if (!mounted) return;
        showAppMessage(context, 'WhatsApp Business connected successfully');
        Navigator.pop(context, true);
        return;
      }
      if (exists && status == 'CONNECTION_ERROR') {
        _pollTimer?.cancel();
        if (!mounted) return;
        setState(() {
          _waitingForMeta = false;
          _error = '${data['lastConnectionError'] ?? 'Meta connection could not be verified.'}';
        });
      }
    } catch (_) {
      // Keep waiting. The browser may still be completing Meta signup.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Connect with Meta'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _prepare,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Connect WhatsApp Business',
                      style: TextStyle(
                        fontSize: 23,
                        fontWeight: FontWeight.w900,
                        color: BusinessColors.ink,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Meta/Facebook authentication opens in the phone’s secure browser. You sign in with your own Meta account, select your own Business Portfolio, WABA and WhatsApp number, then WishFlow stores that business authorization securely on the backend.',
                      style: TextStyle(
                        color: BusinessColors.muted,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 22),
                    _step(1, 'Sign in to Meta',
                        'Authenticate directly on Meta/Facebook.'),
                    _step(2, 'Select Business Portfolio & WABA',
                        'Choose or create your own WhatsApp Business Account.'),
                    _step(3, 'Select WhatsApp number',
                        'Choose/register the number used for messaging.'),
                    _step(4, 'Grant permissions',
                        'WishFlow receives your business authorization and stores it encrypted.'),
                    const SizedBox(height: 18),
                    if (_loading)
                      const Center(child: CircularProgressIndicator())
                    else if (_errorCode == 'META_PLATFORM_NOT_CONFIGURED') ...[
                      _errorCard(_error!),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: _prepare,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Check Again'),
                      ),
                    ] else ...[
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: (_launching || _waitingForMeta)
                              ? null
                              : _openMeta,
                          icon: _launching
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.open_in_browser_rounded),
                          label: Text(
                            _waitingForMeta
                                ? 'Waiting for Meta…'
                                : 'Continue with Meta',
                          ),
                        ),
                      ),
                      if (_waitingForMeta) ...[
                        const SizedBox(height: 14),
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEAF8F0),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                              SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  'Complete the Meta steps in the browser. When finished, return to WishFlow. This screen will detect the saved WhatsApp connection automatically.',
                                  style: TextStyle(height: 1.4),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        OutlinedButton.icon(
                          onPressed: _checkConnection,
                          icon: const Icon(Icons.sync),
                          label: const Text('I completed Meta setup — check now'),
                        ),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        _errorCard(_error!),
                      ],
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _step(int number, String title, String subtitle) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: const Color(0xFFEAF8F0),
            child: Text(
              '$number',
              style: const TextStyle(
                color: BusinessColors.greenDark,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w800)),
                Text(subtitle,
                    style: const TextStyle(
                        color: BusinessColors.muted, height: 1.35)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _errorCard(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFEEEE),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        text,
        style: const TextStyle(color: Color(0xFFB42318), height: 1.4),
      ),
    );
  }
}
