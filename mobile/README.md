# GreetSync Flutter

## Current login flow

The Flutter app uses **mobile number + password only**.

### Business registration
1. Open login screen.
2. Choose **Create business account**.
3. Enter owner name, business name, address, mobile number, optional email, and password.
4. Registration is saved as `PENDING`.
5. The user cannot log in until the fixed administrator approves the account.

### Admin
The fixed administrator logs in through the same mobile/password screen. Admin is routed to a separate Admin Panel UI and can approve/reject business registrations.

### Business WhatsApp onboarding
After approval and first login, if no WhatsApp credentials exist for that business, the app asks for that business's own credentials before opening automation features.

Credentials are encrypted by the backend and stored per business in PostgreSQL. They are not stored in the Flutter app and are not read from automation `.env` variables.

## Run

Backend:
```bash
npm install
npm run dev
```

Flutter:
```bash
cd mobile
flutter clean
flutter pub get
flutter run -d <device-id> --dart-define=API_BASE_URL=http://127.0.0.1:3000
```

Plain Flutter builds use the saved Railway HTTPS backend. The explicit override above is for local debug development; a USB Android phone also requires `adb reverse tcp:3000 tcp:3000`. For deploy plus a verified APK, run `RUN_PRODUCTION_SETUP.cmd` from the project root.

## Android build compatibility

`android/app/build.gradle` uses Java 17 for both Java and Kotlin targets to avoid JVM target mismatch build failures.
