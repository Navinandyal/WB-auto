# GreetSync Build + Railway Database Fixes — 29 Sep 2026

This build addresses the Android release-build failures and hosted PostgreSQL setup reported in the latest log.

## Android build fixes

The log showed Kotlin daemon/incremental cache collisions for `url_launcher_android`, `flutter_contacts`, and `webview_flutter_android` ("Storage ... is already registered" / "Could not close incremental caches").

Changes:
- Gradle wrapper: **8.14.3**
- Android Gradle Plugin: **8.11.1**
- Kotlin Gradle Plugin: **2.2.20**
- Java/JVM target remains **17**
- `gradle.properties` now disables Kotlin incremental compilation, Gradle build caching/parallelism/daemon use for stable Windows builds, and uses the in-process Kotlin compiler.
- Gradle wrapper download timeout increased to 120 seconds.
- Removed old forced AndroidX dependency pins that were only needed for AGP 8.7.x.
- Removed unused `webview_flutter`; Meta signup now uses external browser/direct OAuth.
- Updated `url_launcher` to 6.3.2.
- Updated `flutter_contacts` to 2.5.0, which migrated its Android plugin to Built-in Kotlin.
- Migrated GreetSync device-contact code to the flutter_contacts v2 permissions/getAll API.
- Added project-local cache cleanup before Flutter development runs.
- Added `build-greetsync-release-apk.cmd` for a clean release build.
- Debug builds now allow localhost cleartext only for `adb reverse`; release stays HTTPS-only.

## Railway PostgreSQL fixes

- Backend prefers `DATABASE_URL` / `POSTGRES_URL`.
- Remote connection-string databases use TLS automatically unless `DATABASE_SSL=false`.
- Increased remote DB connection timeout.
- `.env.example` now includes a Railway-safe `DATABASE_URL` placeholder and does not contain real credentials.
- `npm run db:migrate` now initializes the current GreetSync schema instead of the obsolete demo schema.
- Drizzle config now points at `src/db/schema.ts`, which is the schema used by `server.ts`.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set your new Railway `DATABASE_URL` in `.env`.
3. Do **not** place the PostgreSQL URL inside Flutter.
4. From project root run:

```bat
npm install
npm run db:migrate
run-greetsync-android-dev.cmd
```

For a release APK:

```bat
build-greetsync-release-apk.cmd
```

The APK is created at:

`mobile\build\app\outputs\flutter-apk\app-release.apk`

## Security note

If a real Railway PostgreSQL URL/password has been shared outside your secrets manager or `.env`, rotate the Railway database credentials and use the new URL. Never commit `.env`.
