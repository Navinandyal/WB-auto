# GreetSync Template Build Hotfix — 2026-10-03

Fixed Android release build failure in `mobile/lib/screens/templates_screen.dart`.

## Fix
- Removed duplicate `initState()` from `_CreateTemplateScreenState`.
- Removed invalid `_sync(silent: true)` call from `_CreateTemplateScreenState`.
- Kept `_sync()` lifecycle call only in `_TemplatesScreenState`, where `_sync()` is defined.

This resolves:
- `Error: 'initState' is already declared in this scope.`
- `Error: The method '_sync' isn't defined for the type '_CreateTemplateScreenState'.`
