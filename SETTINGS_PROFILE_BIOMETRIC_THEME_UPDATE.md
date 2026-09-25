# WishFlow Settings / Profile / Biometric / Theme update

Implemented 25 September 2026.

## Editable profile
- Business owner: name, email, business name and business address are editable.
- Admin: name and email are editable.
- Login mobile remains read-only from the profile screen to avoid silently changing the account login identifier.
- Backend endpoint: `PUT /api/profile`.

## Biometric login
- Android biometric prompt is implemented natively through the `wishflow/biometric` Flutter MethodChannel.
- No account password is stored for biometric login.
- Enabling biometrics while signed in creates a random device credential.
- Device secret is stored in Flutter secure storage; only a one-way hash is stored in PostgreSQL.
- `POST /api/auth/biometric/enable` creates/replaces the credential for the device label.
- `POST /api/auth/biometric/login` exchanges a successfully-unlocked device credential for a fresh WishFlow access/refresh session.
- `POST /api/auth/biometric/disable` revokes the device credential.
- Manual WishFlow logout ends the current app session but does not silently remove the user's biometric preference; the user can sign in again using biometrics.
- This biometric login is only for WishFlow app login. It does not bypass Meta/Facebook authentication or device security.

## Privacy Policy and Terms
Two in-app legal pages were added under Settings. They describe WishFlow account information, contacts, Meta/WhatsApp credentials, automations, consent, security and business responsibilities. They should receive legal/compliance review before public release.

## Themes
- White/off-white base design remains unchanged.
- One-tap accent selection is persisted on-device.
- Available accents: Green, Blue, Purple, Black, Red, Light Green, Light Blue, Pink, Yellow, Cream, Teal, Orange, Lavender, Rose, Mint and Sky.
- Material primary buttons, selected navigation, inputs, switches, checkboxes, progress indicators, common WishFlow icons and supported highlights update immediately.

## Main files
- `mobile/lib/screens/profile_screen.dart`
- `mobile/lib/screens/security_settings_screen.dart`
- `mobile/lib/screens/appearance_screen.dart`
- `mobile/lib/screens/legal_pages.dart`
- `mobile/lib/screens/settings_screen.dart`
- `mobile/lib/providers/providers.dart`
- `mobile/lib/theme/business_theme.dart`
- `mobile/lib/core/biometric_service.dart`
- `mobile/android/app/src/main/kotlin/com/aikyam/whatsappautomation/MainActivity.kt`
- `server.ts`
- `src/db/index.ts`
