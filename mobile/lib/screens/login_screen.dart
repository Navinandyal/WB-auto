import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../providers/providers.dart';
import 'forgot_password_screen.dart';
import '../widgets/country_phone_field.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _loginKey = GlobalKey<FormState>();
  final _registerKey = GlobalKey<FormState>();

  final _mobile = TextEditingController();
  final _password = TextEditingController();
  String _loginFullPhone = '';
  String _registerFullPhone = '';

  final _name = TextEditingController();
  final _business = TextEditingController();
  final _address = TextEditingController();
  final _email = TextEditingController();
  final _registerMobile = TextEditingController();
  final _registerPassword = TextEditingController();
  final _confirmPassword = TextEditingController();

  bool _register = false;
  bool _registrationSubmitted = false;
  bool _obscure = true;
  bool _registerObscure = true;
  bool _confirmObscure = true;
  bool _rememberMe = true;
  bool _registering = false;
  String? _registerMessage;

  @override
  void initState() {
    super.initState();
    _loadRememberedLogin();
  }

  Future<void> _loadRememberedLogin() async {
    final storage = ref.read(secureStorageProvider);
    final remember = await storage.read(key: 'remember_login') == 'true';
    final mobile = await storage.read(key: 'remembered_mobile');
    if (!mounted) return;
    setState(() {
      _rememberMe = remember;
      if (remember && mobile != null && mobile.isNotEmpty) {
        _loginFullPhone = mobile;
        _mobile.text = mobile.startsWith('+91') ? mobile.substring(3) : mobile.replaceAll(RegExp(r'\D'), '');
      }
    });
  }

  @override
  void dispose() {
    for (final c in [
      _mobile,
      _password,
      _name,
      _business,
      _address,
      _email,
      _registerMobile,
      _registerPassword,
      _confirmPassword,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _signIn() async {
    FocusScope.of(context).unfocus();
    if (!(_loginKey.currentState?.validate() ?? false)) return;

    final normalized = _loginFullPhone.isNotEmpty ? _loginFullPhone : _normalizePhoneForDisplay(_mobile.text);
    final storage = ref.read(secureStorageProvider);
    if (_rememberMe) {
      await storage.write(key: 'remember_login', value: 'true');
      await storage.write(key: 'remembered_mobile', value: normalized);
    } else {
      await storage.write(key: 'remember_login', value: 'false');
      await storage.delete(key: 'remembered_mobile');
    }

    await ref.read(authProvider.notifier).signIn(
          mobile: normalized,
          password: _password.text,
        );
  }

  Future<void> _submitRegistration() async {
    FocusScope.of(context).unfocus();
    if (!(_registerKey.currentState?.validate() ?? false)) return;

    setState(() {
      _registering = true;
      _registerMessage = null;
    });

    try {
      final normalizedMobile = _registerFullPhone.isNotEmpty ? _registerFullPhone : _normalizePhoneForDisplay(_registerMobile.text);
      final data = await ref.read(apiClientProvider).post('/api/auth/register', data: {
        'name': _name.text.trim(),
        'businessName': _business.text.trim(),
        'businessAddress': _address.text.trim(),
        'email': _email.text.trim(),
        'mobile': normalizedMobile,
        'password': _registerPassword.text,
      });

      if (!mounted) return;
      final message = (data is Map ? data['message'] : null)?.toString() ??
          'Registration submitted. Please wait for administrator approval.';
      setState(() {
        _registerMessage = message;
        _registrationSubmitted = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _registerMessage = e is ApiException ? e.message : e.toString();
      });
    } finally {
      if (mounted) setState(() => _registering = false);
    }
  }

  void _backToLoginAfterRegistration() {
    final registeredMobile = _registerFullPhone.isNotEmpty ? _registerFullPhone : _normalizePhoneForDisplay(_registerMobile.text);
    setState(() {
      _register = false;
      _registrationSubmitted = false;
      _registerMessage = null;
      _mobile.text = registeredMobile;
      _password.clear();
    });
  }

  Future<void> _openForgotPassword() async {
    FocusScope.of(context).unfocus();
    final result = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => ForgotPasswordScreen(initialIdentifier: _mobile.text.trim()),
      ),
    );
    if (!mounted || result == null || result.isEmpty) return;
    setState(() {
      _mobile.text = result;
      _password.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    const blue = Color(0xFF0867FF);

    return Scaffold(
      backgroundColor: const Color(0xFFF4F8FF),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 900;
            final form = _register
                ? (_registrationSubmitted
                    ? _registrationSuccess(blue)
                    : _registerForm(blue))
                : _loginForm(auth, blue);

            if (!wide) {
              return Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 480),
                    child: _authCard(form),
                  ),
                ),
              );
            }

            return Row(
              children: [
                Expanded(flex: 11, child: _marketingPanel()),
                Expanded(
                  flex: 9,
                  child: Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(46),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 500),
                        child: _authCard(form),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _authCard(Widget child) => Card(
        elevation: 0,
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(26),
          side: const BorderSide(color: Color(0xFFE1E9F6)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 30),
          child: child,
        ),
      );

  Widget _marketingPanel() => Container(
        height: double.infinity,
        padding: const EdgeInsets.all(48),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF062650), Color(0xFF0E55B8)],
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                _BrandMark(size: 62),
                SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'WishFlow',
                      style: TextStyle(
                        fontSize: 31,
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      'Business Platform',
                      style: TextStyle(color: Color(0xFFBED5FF), fontSize: 17),
                    ),
                  ],
                ),
              ],
            ),
            const Spacer(),
            const Text(
              'One Platform.\nBrighter Celebrations.',
              style: TextStyle(
                color: Colors.white,
                fontSize: 43,
                height: 1.08,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Manage contacts, groups, approved templates, marketing campaigns and WhatsApp automations from one secure business account.',
              style: TextStyle(
                color: Color(0xFFD9E7FF),
                fontSize: 17,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 32),
            ...[
              ('Manage Your Business', Icons.apartment_rounded),
              ('Run Marketing & Automations', Icons.campaign_rounded),
              ('Manage Contacts & Templates', Icons.people_alt_outlined),
              ('Secure Account Access', Icons.verified_user_rounded),
            ].map(
              (e) => Padding(
                padding: const EdgeInsets.only(bottom: 15),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(.11),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(e.$2, color: Colors.white, size: 21),
                    ),
                    const SizedBox(width: 13),
                    Text(
                      e.$1,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const Spacer(),
            const Text(
              'Business accounts require administrator approval before first login.',
              style: TextStyle(color: Color(0xFFAEC9F4), fontSize: 12),
            ),
          ],
        ),
      );

  Widget _loginForm(AuthState auth, Color blue) => Form(
        key: _loginKey,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Align(child: _BrandMark(size: 68)),
            const SizedBox(height: 16),
            const Text(
              'WishFlow',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 31,
                color: Color(0xFF071A63),
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 3),
            const Text(
              'Sign in to continue',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF64739B), fontSize: 16),
            ),
            const SizedBox(height: 28),
            CountryPhoneField(controller: _mobile, initialE164: _loginFullPhone.isEmpty ? null : _loginFullPhone, onChangedE164: (v) => _loginFullPhone = v),
            const SizedBox(height: 14),
            TextFormField(
              controller: _password,
              obscureText: _obscure,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.password],
              decoration: _input('Password', Icons.lock_outline).copyWith(
                suffixIcon: IconButton(
                  onPressed: () => setState(() => _obscure = !_obscure),
                  icon: Icon(
                    _obscure
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                ),
              ),
              validator: (v) => (v == null || v.isEmpty)
                  ? 'Enter your password'
                  : null,
              onFieldSubmitted: (_) => auth.loading ? null : _signIn(),
            ),
            const SizedBox(height: 3),
            Row(
              children: [
                Checkbox(
                  value: _rememberMe,
                  activeColor: blue,
                  onChanged: auth.loading
                      ? null
                      : (value) => setState(() => _rememberMe = value ?? true),
                ),
                const Text('Remember me', style: TextStyle(fontSize: 13)),
                const Spacer(),
                TextButton(
                  onPressed: auth.loading ? null : _openForgotPassword,
                  child: const Text('Forgot Password?'),
                ),
              ],
            ),
            if (auth.error != null) ...[
              const SizedBox(height: 8),
              _messageBox(auth.error!, success: false),
            ],
            const SizedBox(height: 16),
            SizedBox(
              height: 54,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: blue,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(13),
                  ),
                ),
                onPressed: auth.loading ? null : _signIn,
                child: auth.loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'Sign In',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          SizedBox(width: 8),
                          Icon(Icons.arrow_forward_rounded, size: 20),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 20),
            const Row(
              children: [
                Expanded(child: Divider()),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12),
                  child: Text(
                    'NEW BUSINESS?',
                    style: TextStyle(color: Color(0xFF8290AE), fontSize: 12),
                  ),
                ),
                Expanded(child: Divider()),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 50,
              child: OutlinedButton(
                onPressed: auth.loading
                    ? null
                    : () => setState(() {
                          _register = true;
                          _registrationSubmitted = false;
                          _registerMessage = null;
                        }),
                child: const Text(
                  'Create business account',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFF0F6FF),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.verified_user_outlined, color: Color(0xFF0867FF)),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'New business accounts must be approved by the administrator before login is allowed.',
                      style: TextStyle(color: Color(0xFF33466B), height: 1.4),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _registerForm(Color blue) => Form(
        key: _registerKey,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: _registering
                      ? null
                      : () => setState(() {
                            _register = false;
                            _registerMessage = null;
                          }),
                  icon: const Icon(Icons.arrow_back),
                ),
                const Expanded(
                  child: Text(
                    'Create Business Account',
                    style: TextStyle(
                      fontSize: 24,
                      color: Color(0xFF071A63),
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Submit your details. An administrator must approve the account before you can sign in.',
              style: TextStyle(color: Color(0xFF64739B), height: 1.45),
            ),
            const SizedBox(height: 22),
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              decoration: _input('Full name', Icons.person_outline),
              validator: (v) => _requiredWithMin(v, 'Enter your full name', 2),
            ),
            const SizedBox(height: 13),
            TextFormField(
              controller: _business,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              decoration: _input('Business name', Icons.business_outlined),
              validator: (v) => _requiredWithMin(v, 'Enter your business name', 2),
            ),
            const SizedBox(height: 13),
            TextFormField(
              controller: _address,
              textCapitalization: TextCapitalization.sentences,
              minLines: 2,
              maxLines: 3,
              textInputAction: TextInputAction.next,
              decoration: _input('Business address', Icons.location_on_outlined),
              validator: (v) => _requiredWithMin(v, 'Enter your business address', 3),
            ),
            const SizedBox(height: 13),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.email],
              decoration: _input('Email (optional)', Icons.email_outlined),
              validator: _optionalEmailValidator,
            ),
            const SizedBox(height: 13),
            CountryPhoneField(controller: _registerMobile, onChangedE164: (v) => _registerFullPhone = v),
            const SizedBox(height: 13),
            TextFormField(
              controller: _registerPassword,
              obscureText: _registerObscure,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.newPassword],
              decoration: _input('Password', Icons.lock_outline).copyWith(
                helperText: 'Minimum 8 characters',
                suffixIcon: IconButton(
                  onPressed: () => setState(
                    () => _registerObscure = !_registerObscure,
                  ),
                  icon: Icon(
                    _registerObscure
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                ),
              ),
              validator: _passwordValidator,
            ),
            const SizedBox(height: 13),
            TextFormField(
              controller: _confirmPassword,
              obscureText: _confirmObscure,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.newPassword],
              decoration: _input('Confirm password', Icons.lock_outline).copyWith(
                suffixIcon: IconButton(
                  onPressed: () => setState(
                    () => _confirmObscure = !_confirmObscure,
                  ),
                  icon: Icon(
                    _confirmObscure
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                ),
              ),
              validator: (value) {
                if ((value ?? '').isEmpty) return 'Confirm your password';
                if (value != _registerPassword.text) return 'Passwords do not match';
                return null;
              },
              onFieldSubmitted: (_) => _registering ? null : _submitRegistration(),
            ),
            if (_registerMessage != null) ...[
              const SizedBox(height: 14),
              _messageBox(_registerMessage!, success: false),
            ],
            const SizedBox(height: 20),
            SizedBox(
              height: 54,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: blue,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(13),
                  ),
                ),
                onPressed: _registering ? null : _submitRegistration,
                child: _registering
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'Submit for Admin Approval',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
              ),
            ),
          ],
        ),
      );

  Widget _registrationSuccess(Color blue) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            child: Container(
              width: 80,
              height: 80,
              decoration: const BoxDecoration(
                color: Color(0xFFE9FBF3),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.hourglass_top_rounded,
                color: Color(0xFF11A36A),
                size: 40,
              ),
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'Registration Submitted',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 27,
              color: Color(0xFF071A63),
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            _registerMessage ??
                'Your account is waiting for administrator approval. You can sign in after it is approved.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xFF64739B), height: 1.5),
          ),
          const SizedBox(height: 22),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7E8),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFFFD98E)),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.admin_panel_settings_outlined, color: Color(0xFFE09200)),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Status: PENDING APPROVAL\nThe administrator must approve this business account before login is enabled.',
                    style: TextStyle(color: Color(0xFF6B4C00), height: 1.45),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            height: 52,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: blue),
              onPressed: _backToLoginAfterRegistration,
              child: const Text(
                'Back to Login',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      );

  Widget _messageBox(String text, {required bool success}) => Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: success ? const Color(0xFFE9FBF3) : const Color(0xFFFFEFF0),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: success ? const Color(0xFF116A49) : const Color(0xFFB4232F),
            fontWeight: FontWeight.w600,
          ),
        ),
      );

  InputDecoration _input(String label, IconData icon, {String? hint}) =>
      InputDecoration(
        labelText: label,
        hintText: hint,
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

  String? _requiredWithMin(String? value, String message, int min) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return message;
    if (text.length < min) return 'Please enter a valid value';
    return null;
  }

  String? _phoneValidator(String? value) {
    final digits = (value ?? '').replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return 'Enter your mobile number';
    if (digits.length < 10 || digits.length > 15) {
      return 'Enter a valid mobile number';
    }
    return null;
  }

  String? _optionalEmailValidator(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return null;
    final emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
    if (!emailPattern.hasMatch(text)) return 'Enter a valid email address';
    return null;
  }

  String? _passwordValidator(String? value) {
    final text = value ?? '';
    if (text.isEmpty) return 'Create a password';
    if (text.length < 8) return 'Use at least 8 characters';
    return null;
  }

  String _normalizePhoneForDisplay(String input) {
    final trimmed = input.trim();
    final digits = trimmed.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 10) return '+91$digits';
    if (trimmed.startsWith('+')) return '+$digits';
    return digits.isEmpty ? trimmed : '+$digits';
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark({this.size = 58});

  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF1B8BFF), Color(0xFF164DFF)],
          ),
          borderRadius: BorderRadius.circular(size * .25),
        ),
        child: Icon(
          Icons.celebration_rounded,
          color: Colors.white,
          size: size * .55,
        ),
      );
}
