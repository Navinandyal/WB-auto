import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../providers/providers.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialIdentifier = ''});

  final String initialIdentifier;

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _requestKey = GlobalKey<FormState>();
  final _resetKey = GlobalKey<FormState>();

  late final TextEditingController _identifier;
  final _code = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmPassword = TextEditingController();

  bool _busy = false;
  bool _codeRequested = false;
  bool _obscure = true;
  bool _confirmObscure = true;
  String _resetId = '';
  String _developmentCode = '';
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _identifier = TextEditingController(text: widget.initialIdentifier);
  }

  @override
  void dispose() {
    _identifier.dispose();
    _code.dispose();
    _newPassword.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    FocusScope.of(context).unfocus();
    if (_busy || !(_requestKey.currentState?.validate() ?? false)) return;

    setState(() {
      _busy = true;
      _errorText = null;
    });

    try {
      final result = await ref.read(apiClientProvider).post(
        '/api/auth/forgot-password',
        data: {'identifier': _identifier.text.trim()},
      );
      final map = (result as Map).cast<String, dynamic>();
      final resetId = (map['resetId'] ?? '').toString();
      if (resetId.isEmpty) throw ApiException('Unable to start password reset.');

      if (!mounted) return;
      setState(() {
        _resetId = resetId;
        _developmentCode = (map['verificationCode'] ?? '').toString();
        _codeRequested = true;
        if (_developmentCode.isNotEmpty) _code.text = _developmentCode;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorText = e is ApiException ? e.message : e.toString();
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resetPassword() async {
    FocusScope.of(context).unfocus();
    if (_busy || !(_resetKey.currentState?.validate() ?? false)) return;

    setState(() {
      _busy = true;
      _errorText = null;
    });

    try {
      await ref.read(apiClientProvider).post('/api/auth/reset-password', data: {
        'resetId': _resetId,
        'code': _code.text.trim(),
        'newPassword': _newPassword.text,
      });
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Password reset successfully. Sign in with your new password.'),
        ),
      );
      Navigator.of(context).pop(_identifier.text.trim());
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorText = e is ApiException ? e.message : e.toString();
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F8FF),
      appBar: AppBar(
        title: const Text('Forgot Password'),
        backgroundColor: const Color(0xFFF4F8FF),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 500),
              child: Card(
                elevation: 0,
                color: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                  side: const BorderSide(color: Color(0xFFE1E9F6)),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: _codeRequested ? _resetForm() : _requestForm(),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _requestForm() => Form(
        key: _requestKey,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.lock_reset_rounded, color: Color(0xFF0867FF), size: 58),
            const SizedBox(height: 16),
            const Text(
              'Reset your password',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: Color(0xFF071A63),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Enter the mobile number or optional email registered with your business account.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF64739B), height: 1.45),
            ),
            const SizedBox(height: 26),
            TextFormField(
              controller: _identifier,
              enabled: !_busy,
              textInputAction: TextInputAction.done,
              decoration: _input('Mobile number or email', Icons.person_search_outlined),
              validator: (value) {
                final text = value?.trim() ?? '';
                if (text.isEmpty) return 'Enter your registered mobile number or email';
                if (text.contains('@')) {
                  if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(text)) {
                    return 'Enter a valid email address';
                  }
                } else {
                  final digits = text.replaceAll(RegExp(r'\D'), '');
                  if (digits.length < 10 || digits.length > 15) {
                    return 'Enter a valid mobile number';
                  }
                }
                return null;
              },
              onFieldSubmitted: (_) => _requestCode(),
            ),
            if (_errorText != null) ...[
              const SizedBox(height: 14),
              _errorBox(_errorText!),
            ],
            const SizedBox(height: 20),
            SizedBox(
              height: 52,
              child: FilledButton(
                onPressed: _busy ? null : _requestCode,
                child: _busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Send Reset Code', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        ),
      );

  Widget _resetForm() => Form(
        key: _resetKey,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.verified_user_outlined, color: Color(0xFF0867FF), size: 58),
            const SizedBox(height: 16),
            const Text(
              'Verify & create new password',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w900,
                color: Color(0xFF071A63),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Enter the 6-digit verification code and choose a new password.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF64739B), height: 1.45),
            ),
            if (_developmentCode.isNotEmpty) ...[
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFF0F6FF),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'Local development verification code: $_developmentCode',
                  style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF33466B)),
                ),
              ),
            ],
            const SizedBox(height: 20),
            TextFormField(
              controller: _code,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              decoration: _input('6-digit verification code', Icons.password_rounded),
              validator: (value) => (value ?? '').trim().length == 6
                  ? null
                  : 'Enter the 6-digit verification code',
            ),
            const SizedBox(height: 13),
            TextFormField(
              controller: _newPassword,
              obscureText: _obscure,
              decoration: _input('New password', Icons.lock_outline).copyWith(
                helperText: 'Minimum 8 characters',
                suffixIcon: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                ),
              ),
              validator: (value) {
                if ((value ?? '').isEmpty) return 'Enter a new password';
                if ((value ?? '').length < 8) return 'Password must be at least 8 characters';
                return null;
              },
            ),
            const SizedBox(height: 13),
            TextFormField(
              controller: _confirmPassword,
              obscureText: _confirmObscure,
              decoration: _input('Confirm new password', Icons.lock_outline).copyWith(
                suffixIcon: IconButton(
                  onPressed: () => setState(() => _confirmObscure = !_confirmObscure),
                  icon: Icon(_confirmObscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                ),
              ),
              validator: (value) {
                if ((value ?? '').isEmpty) return 'Confirm your new password';
                if (value != _newPassword.text) return 'Passwords do not match';
                return null;
              },
            ),
            if (_errorText != null) ...[
              const SizedBox(height: 14),
              _errorBox(_errorText!),
            ],
            const SizedBox(height: 20),
            SizedBox(
              height: 52,
              child: FilledButton(
                onPressed: _busy ? null : _resetPassword,
                child: _busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Reset Password', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
            TextButton(
              onPressed: _busy
                  ? null
                  : () => setState(() {
                        _codeRequested = false;
                        _resetId = '';
                        _developmentCode = '';
                        _code.clear();
                        _errorText = null;
                      }),
              child: const Text('Use a different mobile/email'),
            ),
          ],
        ),
      );

  Widget _errorBox(String text) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFEFF0),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          text,
          style: const TextStyle(color: Color(0xFFB4232F), fontWeight: FontWeight.w600),
        ),
      );

  InputDecoration _input(String label, IconData icon) => InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        filled: true,
        fillColor: const Color(0xFFFBFDFF),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: const BorderSide(color: Color(0xFFD5E0F3)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: const BorderSide(color: Color(0xFFD5E0F3)),
        ),
      );
}
