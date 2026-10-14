# GreetSync — deploy backend and build APK with one command

Run this from your existing project folder:

```bat
RUN_PRODUCTION_SETUP.cmd
```

Do not add `-SkipApkBuild` when you want an APK. That flag intentionally skips it. Normal execution reuses your saved Railway login/project, deploys the backend, waits for the updated backend health response, builds a release APK with that exact HTTPS address, verifies its signature/package and publishes `GreetSync-production.apk` in the project root. There are no account selection menus. If authorization expires, Railway still requires you to refresh login once.

## Apply this complete ZIP

1. Extract the `GreetSync` folder's contents into `D:\Aikyam\project`, replacing the supplied source/scripts. Avoid creating an extra nested `project\GreetSync` directory by mistake.
2. Keep your existing private `.env`, Firebase configuration, original signing keys, `mobile\android\key.properties` and `.android-signing` folder. Do not delete your installed app or signing identity.
3. Run `RUN_PRODUCTION_SETUP.cmd` and wait for its final success. Node/npm, Flutter, Android SDK and a compatible JDK must be installed on the PC as for your earlier successful build.
4. Install the newly created `D:\Aikyam\project\GreetSync-production.apk`. This version is **1.0.4 (build 5)**. Use the new root APK rather than a copy from an earlier build.

## Why the screenshot could not connect

The prior app default was `http://127.0.0.1:3000`. A plain manual `flutter build apk` omitted the production `API_BASE_URL` define and therefore tried to contact a server on the phone itself. The production Android app also disables cleartext HTTP. A running Railway backend does not make a phone's localhost point to Railway.

Plain Flutter builds now default to the saved public HTTPS backend. Setup refreshes both `GREETSYNC_DEPLOYMENT.json` and `mobile/lib/core/backend_defaults.dart` after checking the resolved Railway domain, so later APK-only or manual builds keep the current address. The full script still passes an explicit `API_BASE_URL` to Flutter. Production network errors give internet/retry guidance; `adb reverse` instructions are limited to explicit local debug development.

If the backend is already deployed and you only want a verified APK, use `BUILD_APK_ONLY.cmd`. It uses the saved HTTPS domain without calling Railway. For deploy plus build, use the main command above.

## Facebook / WhatsApp connection

The previous Meta SDK security-policy repair and protected automatic WABA/phone/business discovery are included. Normal deployment checks the new backend build identifier instead of accepting an older healthy deployment. Credentials stay on the backend and are not compiled into the APK. Read `GREETSYNC_META_CONNECT_START_HERE.md` for your own GreetSync App ID, configuration ID, Coexistence and permission settings.

Connect with Meta after signing in to the updated app. Meta's own consent screen uses your Meta app's display name. The reference provider's name is not added to GreetSync. Correct Meta configuration and access approval remain required for live customer onboarding; software cannot grant Advanced Access on Meta's behalf.

## Verification

See `TEST_REPORT.md` for the executed checks and build outcome. Live customer Facebook consent and physical-phone installation are separate from automated tests. The source ZIP intentionally contains no private signing key or account secret.
