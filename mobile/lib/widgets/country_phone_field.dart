import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class CountryPhoneField extends StatefulWidget {
  const CountryPhoneField({super.key, required this.controller, this.label = 'Phone Number *', this.initialE164, this.onChangedE164});
  final TextEditingController controller;
  final String label;
  final String? initialE164;
  final ValueChanged<String>? onChangedE164;

  @override
  State<CountryPhoneField> createState() => _CountryPhoneFieldState();
}

class _CountryPhoneFieldState extends State<CountryPhoneField> {
  String iso = 'IN';
  String phoneCode = '91';
  String countryName = 'India';
  String flag = '🇮🇳';

  static const _lengthByIso = <String, int>{
    'IN': 10, 'US': 10, 'CA': 10, 'GB': 10, 'AU': 9, 'NZ': 8,
    'AE': 9, 'SA': 9, 'SG': 8, 'MY': 9, 'ID': 10, 'PH': 10,
    'DE': 10, 'FR': 9, 'IT': 10, 'ES': 9, 'NL': 9, 'BE': 9,
    'CH': 9, 'ZA': 9, 'BR': 11, 'MX': 10, 'JP': 10, 'KR': 10,
  };

  @override
  void initState() {
    super.initState();
    final initial = widget.initialE164 ?? '';
    if (initial.startsWith('+91')) widget.controller.text = initial.substring(3);
  }

  int? get expectedLength => _lengthByIso[iso];
  String get e164 => '+$phoneCode${widget.controller.text.replaceAll(RegExp(r'\D'), '')}';

  String? validate(String? value) {
    final digits = (value ?? '').replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return 'Phone number is required';
    final expected = expectedLength;
    if (expected != null && digits.length != expected) return '$countryName numbers require $expected digits';
    if (digits.length < 6 || digits.length > 14) return 'Enter a valid phone number';
    if (iso == 'IN' && !RegExp(r'^[6-9]').hasMatch(digits)) return 'Indian mobile number must start with 6, 7, 8 or 9';
    return null;
  }

  void _pickCountry() {
    showCountryPicker(
      context: context,
      showPhoneCode: true,
      onSelect: (c) => setState(() {
        iso = c.countryCode;
        phoneCode = c.phoneCode;
        countryName = c.name;
        flag = c.flagEmoji;
        widget.controller.clear();
        widget.onChangedE164?.call(e164);
      }),
      countryListTheme: const CountryListThemeData(
        bottomSheetHeight: 560,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        inputDecoration: InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search country'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controller,
      keyboardType: TextInputType.phone,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(expectedLength ?? 14)],
      validator: validate,
      onChanged: (_) => widget.onChangedE164?.call(e164),
      decoration: InputDecoration(
        labelText: widget.label,
        prefixIcon: InkWell(
          onTap: _pickCountry,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(flag, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 6),
              Text('+$phoneCode', style: const TextStyle(fontWeight: FontWeight.w800)),
              const Icon(Icons.arrow_drop_down),
            ]),
          ),
        ),
      ),
    );
  }
}
