# GreetSync Android Build Fix — 2026-09-30

## Problem
The release build failed inside `font_awesome_flutter 10.12.0` because that package subclasses Flutter `IconData`, while the installed Flutter SDK exposes `IconData` as a final class.

## Fix
- Removed the `font_awesome_flutter` dependency from `mobile/pubspec.yaml`.
- Removed the Font Awesome import from `contacts_screen.dart`.
- Replaced both WhatsApp contact action icons with a native Flutter `_WhatsAppIcon` built from `Container`, `BoxDecoration`, and `Icons.call_rounded`.
- Kept the existing `https://wa.me/<number>` launch behavior unchanged.

No backend or database change is required. Run `RUN_PRODUCTION_SETUP.cmd` again.
