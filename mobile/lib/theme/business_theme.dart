import 'package:flutter/material.dart';

class BusinessColors {
  // Semantic colors remain stable. Accent-aware UI should use Theme.of(context).colorScheme.primary.
  static const green = Color(0xFF08A96B);
  static const greenDark = Color(0xFF007A4C);
  static const greenSoft = Color(0xFFE9FAF2);
  static const ink = Color(0xFF0D1738);
  static const muted = Color(0xFF66738E);
  static const line = Color(0xFFE4EAF2);
  static const surface = Color(0xFFFFFFFF);
  static const background = Color(0xFFF8FBFC);
}

class AccentChoice {
  const AccentChoice(this.key, this.label, this.color);
  final String key;
  final String label;
  final Color color;
}

const appAccentChoices = <AccentChoice>[
  AccentChoice('green', 'Green', Color(0xFF08A96B)),
  AccentChoice('blue', 'Blue', Color(0xFF2563EB)),
  AccentChoice('purple', 'Purple', Color(0xFF7C3AED)),
  AccentChoice('black', 'Black', Color(0xFF202124)),
  AccentChoice('red', 'Red', Color(0xFFDC2626)),
  AccentChoice('light_green', 'Light Green', Color(0xFF55B96C)),
  AccentChoice('light_blue', 'Light Blue', Color(0xFF4EA5F5)),
  AccentChoice('pink', 'Pink', Color(0xFFE95D9A)),
  AccentChoice('yellow', 'Yellow', Color(0xFFE0A800)),
  AccentChoice('cream', 'Cream', Color(0xFFC9A66B)),
  AccentChoice('teal', 'Teal', Color(0xFF0F9D8A)),
  AccentChoice('orange', 'Orange', Color(0xFFE97824)),
  AccentChoice('lavender', 'Lavender', Color(0xFF8B7DD8)),
  AccentChoice('rose', 'Rose', Color(0xFFD85F7A)),
  AccentChoice('mint', 'Mint', Color(0xFF43BFA3)),
  AccentChoice('sky', 'Sky', Color(0xFF3D93D1)),
];

AccentChoice accentChoiceForKey(String key) => appAccentChoices.firstWhere(
      (e) => e.key == key,
      orElse: () => appAccentChoices.first,
    );

ThemeData buildBusinessTheme({Color accent = BusinessColors.green}) {
  final scheme = ColorScheme.fromSeed(
    seedColor: accent,
    brightness: Brightness.light,
    primary: accent,
    surface: Colors.white,
  );
  final soft = Color.alphaBlend(accent.withOpacity(.10), Colors.white);

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: BusinessColors.background,
    fontFamily: 'Roboto',
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: BusinessColors.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: BusinessColors.ink),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: BusinessColors.line),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: BusinessColors.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: BusinessColors.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: accent, width: 1.4)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Colors.redAccent)),
      labelStyle: const TextStyle(color: BusinessColors.muted),
      hintStyle: const TextStyle(color: Color(0xFF98A3B6)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: accent,
        foregroundColor: scheme.onPrimary,
        minimumSize: const Size(0, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 50),
        foregroundColor: BusinessColors.ink,
        side: const BorderSide(color: BusinessColors.line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? scheme.onPrimary : null),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? accent : null),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? accent : null),
    ),
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? accent : null),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: accent),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: soft,
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? accent : BusinessColors.muted)),
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: s.contains(WidgetState.selected) ? accent : BusinessColors.ink)),
    ),
  );
}

class BusinessHeader extends StatelessWidget {
  const BusinessHeader({super.key, this.title, this.subtitle, this.trailing});
  final String? title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(16)),
          child: Icon(Icons.chat_bubble_rounded, color: Theme.of(context).colorScheme.onPrimary, size: 28),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title ?? 'WishFlow Business', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: BusinessColors.ink)),
            const SizedBox(height: 2),
            Text(subtitle ?? 'Connect • Automate • Grow', style: const TextStyle(fontSize: 12, color: BusinessColors.muted)),
          ]),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.action});
  final String title;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Row(children: [
        Expanded(child: Text(title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: BusinessColors.ink))),
        if (action != null) action!,
      ]);
}

class SoftIcon extends StatelessWidget {
  const SoftIcon(this.icon, {super.key, this.color});
  final IconData icon;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final resolved = color ?? Theme.of(context).colorScheme.primary;
    return Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(color: resolved.withOpacity(.11), borderRadius: BorderRadius.circular(14)),
      child: Icon(icon, color: resolved),
    );
  }
}
