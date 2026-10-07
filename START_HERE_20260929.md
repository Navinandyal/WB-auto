# GreetSync — Start Here

This package is the consolidated build after the 29 Sep 2026 Android/Kotlin and Railway PostgreSQL fixes.

## Required local tools

- Flutter 3.44+ (Flutter 3.47+ preferred)
- Dart 3.12+
- JDK 17
- Android SDK / adb
- Node.js 20+
- npm

## 1. Configure database

Copy `.env.example` to `.env` and add the **rotated/new** Railway PostgreSQL URL:

```env
DATABASE_URL="postgresql://postgres:NEW_PASSWORD@HOST:PORT/railway"
DATABASE_SSL=true
```

Never put `DATABASE_URL` in Flutter source code or inside the APK.

## 2. Backend setup

```bat
npm install
npm run db:migrate
```

## 3. Run on USB Android device

Double-click:

```text
run-greetsync-android-dev.cmd
```

The runner:
- starts/checks the backend on port 3000;
- configures `adb reverse tcp:3000 tcp:3000`;
- cleans stale project Kotlin/Gradle caches;
- gets Flutter packages;
- runs the app with `API_BASE_URL=http://127.0.0.1:3000`.

Debug builds alone allow localhost cleartext HTTP. Release builds remain HTTPS-only.

## 4. Build release APK

Run:

```bat
build-greetsync-release-apk.cmd https://api.yourdomain.com
```

Output:

```text
mobile\build\app\outputs\flutter-apk\app-release.apk
```

## Build-stack versions

- Gradle 8.14.3
- AGP 8.11.1
- Kotlin 2.2.20
- Java 17
- flutter_contacts 2.5.0
- url_launcher 6.3.2

`webview_flutter` was removed because the current Meta connection flow opens the official Meta page in the external browser and no Dart code uses WebView.
