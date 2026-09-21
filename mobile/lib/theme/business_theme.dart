import 'package:flutter/material.dart';

class BusinessColors {
  static const green = Color(0xFF08A96B);
  static const greenDark = Color(0xFF007A4C);
  static const greenSoft = Color(0xFFE9FAF2);
  static const ink = Color(0xFF0D1738);
  static const muted = Color(0xFF66738E);
  static const line = Color(0xFFE4EAF2);
  static const surface = Color(0xFFFFFFFF);
  static const background = Color(0xFFF8FBFC);
}

ThemeData buildBusinessTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: BusinessColors.green,
    brightness: Brightness.light,
    primary: BusinessColors.green,
    surface: Colors.white,
  );
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
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: BusinessColors.green, width: 1.4)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Colors.redAccent)),
      labelStyle: const TextStyle(color: BusinessColors.muted),
      hintStyle: const TextStyle(color: Color(0xFF98A3B6)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: BusinessColors.green,
        foregroundColor: Colors.white,
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
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: BusinessColors.greenSoft,
      labelTextStyle: WidgetStatePropertyAll(TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
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
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(color: BusinessColors.green, borderRadius: BorderRadius.circular(16)),
          child: const Icon(Icons.chat_bubble_rounded, color: Colors.white, size: 28),
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
  const SoftIcon(this.icon, {super.key, this.color = BusinessColors.green});
  final IconData icon;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        width: 46,
        height: 46,
        decoration: BoxDecoration(color: color.withOpacity(.11), borderRadius: BorderRadius.circular(14)),
        child: Icon(icon, color: color),
      );
}
