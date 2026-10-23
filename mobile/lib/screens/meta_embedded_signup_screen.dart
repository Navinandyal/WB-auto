import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
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
  String? _sessionId;
  String? _redirectUri;
  Timer? _pollTimer;
  static const MethodChannel _browserChannel = MethodChannel(
    'wishflow/browser',
  );

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
      _checkSession();
    }
  }

  Future<void> _prepare() async {
    _pollTimer?.cancel();
    setState(() {
      _loading = true;
      _waitingForMeta = false;
      _error = null;
      _errorCode = null;
      _sessionId = null;
      _signupUrl = null;
      _redirectUri = null;
    });
    try {
      final data =
          (await ref
                      .read(apiClientProvider)
                      .post(
                        '/api/whatsapp/embedded-signup/session',
                        data: const {},
                      )
                  as Map)
              .cast<String, dynamic>();
      final url = '${data['url'] ?? ''}'.trim();
      final sessionId = '${data['sessionId'] ?? ''}'.trim();
      if (url.isEmpty || sessionId.isEmpty) {
        throw ApiException(
          'Backend did not return a complete Meta signup session.',
        );
      }
      if (!mounted) return;
      setState(() {
        _signupUrl = url;
        _sessionId = sessionId;
        _redirectUri = '${data['redirectUri'] ?? ''}'.trim();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        if (e is ApiException) {
          _errorCode = e.code;
          _error = e.code == 'META_PLATFORM_NOT_CONFIGURED'
              ? 'GreetSync Meta Platform Setup is incomplete. Ask the Super Admin to save the Meta App ID, App Secret and Embedded Signup Configuration ID.'
              : e.code == 'META_TUNNEL_REQUIRED'
              ? 'Meta/Facebook login needs HTTPS. On the laptop run `ngrok http 3000`, then tap Check Again. GreetSync will use that HTTPS tunnel only for the Meta callback.'
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
      bool opened = false;
      if (Platform.isAndroid) {
        try {
          await _browserChannel.invokeMethod<bool>('openChrome', {'url': raw});
          opened = true;
        } on PlatformException {
          opened = false;
        }
      }
      if (!opened) {
        opened = await launchUrl(
          Uri.parse(raw),
          mode: LaunchMode.externalApplication,
        );
      }
      if (!opened) {
        throw ApiException(
          'Could not open Meta Embedded Signup. Enable your default browser and try again.',
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
    _pollTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      if (mounted && _waitingForMeta) _checkSession();
    });
  }

  Future<void> _checkSession() async {
    final sessionId = _sessionId;
    if (sessionId == null || sessionId.isEmpty) return;
    try {
      final data =
          (await ref
                      .read(apiClientProvider)
                      .get('/api/whatsapp/embedded-signup/session/$sessionId')
                  as Map)
              .cast<String, dynamic>();
      final status = '${data['status'] ?? ''}'.toUpperCase();
      if (status == 'CONNECTED') {
        _pollTimer?.cancel();
        ref.invalidate(whatsappAccountProvider);
        ref.invalidate(dashboardProvider);
        if (!mounted) return;
        final phone = '${data['displayPhoneNumber'] ?? ''}'.trim();
        showAppMessage(
          context,
          phone.isEmpty
              ? 'WhatsApp Business connected successfully'
              : 'WhatsApp Business $phone connected successfully',
        );
        Navigator.pop(context, true);
        return;
      }
      if (status == 'FAILED' || status == 'EXPIRED') {
        _pollTimer?.cancel();
        if (!mounted) return;
        setState(() {
          _waitingForMeta = false;
          _error =
              '${data['error'] ?? 'Meta connection could not be completed.'}';
        });
      }
    } catch (_) {
      // Browser may still be completing the Meta flow. Keep polling.
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
                      'WhatsApp Business app + GreetSync',
                      style: TextStyle(
                        fontSize: 23,
                        fontWeight: FontWeight.w900,
                        color: BusinessColors.ink,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Sign in with your own Meta/Facebook account. GreetSync never asks for your Facebook password. After Meta approval, your WABA ID, Phone Number ID and business access token are captured by the backend and stored encrypted for your business only.',
                      style: TextStyle(
                        color: BusinessColors.muted,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Requires a supported WhatsApp Business app account, app version 2.24.17 or later and a Meta-approved Coexistence provider configuration. Meta checks eligibility. Keep the Business app installed and active. Synced contacts still need consent before automation.',
                      style: TextStyle(
                        fontSize: 12,
                        color: BusinessColors.muted,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 22),
                    _step(
                      1,
                      'Sign in to Meta',
                      'GreetSync opens Meta’s secure Embedded Signup in your browser. Sign in using your business Meta account.',
                    ),
                    _step(
                      2,
                      'Choose Business Portfolio',
                      'Select the portfolio that owns your WhatsApp Business account.',
                    ),
                    _step(
                      3,
                      'Choose WABA & phone number',
                      'Choose your existing WhatsApp Business app number. Confirm the connection in the Business app; keep using it alongside GreetSync.',
                    ),
                    _step(
                      4,
                      'Grant WhatsApp permissions',
                      "Meta applies the WhatsApp assets and permissions configured in your provider app's Login for Business / Embedded Signup configuration.",
                    ),
                    _step(
                      5,
                      'GreetSync stores credentials',
                      "GreetSync exchanges Meta's authorization code server-side, encrypts the business token, saves the WABA/Phone Number ID, subscribes webhooks and syncs approved templates.",
                    ),
                    const SizedBox(height: 18),
                    if (_loading)
                      const Center(child: CircularProgressIndicator())
                    else if (_errorCode == 'META_PLATFORM_NOT_CONFIGURED' ||
                        _errorCode == 'META_TUNNEL_REQUIRED') ...[
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
                              : const Icon(Icons.login_rounded),
                          label: Text(
                            _waitingForMeta
                                ? 'Waiting for Meta…'
                                : 'Continue with Meta in Chrome',
                          ),
                        ),
                      ),
                      if (_redirectUri != null && _redirectUri!.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text(
                          'Callback: $_redirectUri',
                          style: const TextStyle(
                            fontSize: 11,
                            color: BusinessColors.muted,
                          ),
                        ),
                      ],
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
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              ),
                              SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  'Complete the Meta steps in Chrome. GreetSync is securely waiting for Meta to return the authorization result.',
                                  style: TextStyle(height: 1.4),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        OutlinedButton.icon(
                          onPressed: _checkSession,
                          icon: const Icon(Icons.sync),
                          label: const Text('Check connection now'),
                        ),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        _errorCard(_error!),
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          onPressed: _prepare,
                          icon: const Icon(Icons.restart_alt),
                          label: const Text('Start Meta setup again'),
                        ),
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
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: BusinessColors.muted,
                    height: 1.35,
                  ),
                ),
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
