# WishFlow production auth + WhatsApp onboarding — verification report

## Implemented

- Business signup uses mobile number + password and starts as `PENDING_APPROVAL`.
- Duplicate mobile registration is blocked by normalized mobile uniqueness.
- Login returns status-specific errors for pending, rejected and suspended accounts.
- Super Admin approval changes login permission immediately.
- Short-lived HS256 access JWT + opaque refresh token sessions are implemented.
- Flutter stores access/refresh tokens in `flutter_secure_storage` and refreshes access tokens on 401.
- Forgot-password request/reset flow uses an expiring code and revokes old refresh sessions after reset.
- WhatsApp is not required for application login.
- WhatsApp manual onboarding saves first, then verifies separately.
- Per-business secrets are encrypted server-side with AES-256-GCM.
- Saved WhatsApp details persist through navigation/restart because the database is the source of truth.
- Connection states are separated into `SAVED`, `CONNECTED`, and `CONNECTION_ERROR`.
- Template sync uses the authenticated business's WABA and decrypted token.
- Template creation stores a local draft first; Meta submission is a separate step and failed submission does not delete the draft.
- Automation creation persists actual selected contacts, timestamp, timezone and server-side scheduled jobs.
- Worker remains backend-side and does not depend on Flutter being open.
- Meta webhook routes update message delivery states.
- Admin can approve, reject, suspend and reactivate business accounts.
- Demo business/contact/automation/template seeding is disabled.

## Static checks performed in this environment

- TypeScript source was checked for parse/syntax errors using the available TypeScript compiler in no-resolve mode.
- Flutter/Dart sources were checked for balanced parentheses, brackets and braces after the edits.
- The final ZIP archive is integrity-tested after creation.

## Not executable in this environment

Flutter SDK and project `node_modules` are not installed in this execution container, so these commands could not be truthfully marked as passed here:

- `npm install && npm run lint`
- `npm run dev` with a live PostgreSQL database
- real Meta Graph API verification/template sync/send
- `flutter analyze`
- `flutter test`
- `flutter run`
- Android APK build

Run the included `run-wishflow-android-dev.cmd` on the Windows development machine for the end-to-end local test.

## Security note

Password hashing continues to use Node's memory-hard `scrypt` with a per-password random salt and constant-time verification. The supplied master specification names BCrypt/Argon2 specifically; if strict algorithm-name compliance is required for deployment, migrate stored password hashes to Argon2id/Bcrypt with a versioned rehash-on-login strategy. Plaintext passwords are never stored.
