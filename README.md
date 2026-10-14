# GreetSync

Start with [GREETSYNC_ONE_COMMAND_START_HERE.md](GREETSYNC_ONE_COMMAND_START_HERE.md). Run **`RUN_PRODUCTION_SETUP.cmd`** to deploy and build **GreetSync-production.apk**. Plain Flutter builds now use the saved Railway HTTPS backend; app version is **1.0.4+5**.

For the latest Facebook/WhatsApp connection update, start with [GREETSYNC_META_CONNECT_START_HERE.md](GREETSYNC_META_CONNECT_START_HERE.md). It fixes the blocked Meta SDK and automatically discovers authorized business/WhatsApp details. Run `RUN_PRODUCTION_SETUP.cmd` to deploy the backend and build the APK using the saved Railway configuration. Manual Flutter builds now default to the saved HTTPS backend.

For the Android installation error, start with [ANDROID_INSTALL_START_HERE.md](ANDROID_INSTALL_START_HERE.md). The certificate parser now supports numbered, SDK-range and Build-Tools 37 scheme-prefixed output such as V2 Signer:. VERIFY_ANDROID_APK.cmd verifies/publishes your already-built APK without rebuilding. BUILD_APK_ONLY.cmd verifies new builds; INSTALL_ANDROID_USB.cmd reports installation errors and checks update compatibility without uninstalling the app.

Start with [AUTOMATIC_SETUP_START_HERE.md](AUTOMATIC_SETUP_START_HERE.md) for this update. RUN_PRODUCTION_SETUP.cmd now uses the preconfigured Railway project and saved login without account/project/database questions. BUILD_APK_ONLY.cmd builds against the existing backend without Railway login or redeployment.

For this iPhone update, start with [IPHONE_MAC_START_HERE.md](IPHONE_MAC_START_HERE.md). It adds the iOS/Xcode project and Mac preparation, device Run and signed IPA export commands to the supplied Oct 6 ZIP. An actual signed IPA must be built on your Mac; none is included here.

Read [GREETSYNC_WEBHOOK_DYNAMIC_AI_20261006.md](GREETSYNC_WEBHOOK_DYNAMIC_AI_20261006.md) first for the exact callback settings, strengthened connection checks and simplified AI form with custom purpose/tone/audience. Earlier guides describe their respective prior screens.

Read the preceding [GREETSYNC_GUIDED_AI_DRAFTS_20261006.md](GREETSYNC_GUIDED_AI_DRAFTS_20261006.md) for the guided Birthday/Campaign/Marketing generator, save-or-discard editor drafts, per-message delivery reasons and rollout instructions. The AI connection-check button is removed in this version.

The preceding [GREETSYNC_MESSAGE_RECOVERY_AI_FIX_20261006.md](GREETSYNC_MESSAGE_RECOVERY_AI_FIX_20261006.md) documents callback routing repair, uncertain-send recovery and reviewed Send again.

Read [GREETSYNC_DELIVERY_AI_KEY_FIXES_20261006.md](GREETSYNC_DELIVERY_AI_KEY_FIXES_20261006.md) for the preceding status icon, connection and AI key fixes.

Read [GREETSYNC_MEDIA_AI_20261006.md](GREETSYNC_MEDIA_AI_20261006.md) for video/PDF validation and the AI Template Generator.

Read [GREETSYNC_FOLLOWUP_20261005.md](GREETSYNC_FOLLOWUP_20261005.md) for the earlier fixed bottom bar, profile redesign, location/address fixes, business variables, larger Profile details and removal of the failed-message Resend option.

Open [GREETSYNC_20261005_START_HERE.md](GREETSYNC_20261005_START_HERE.md) for this update's changes, build instructions, contact import samples, Meta Coexistence configuration, Firebase push setup and validation results.

The Android and iPhone Flutter app is in `mobile/`. The Express/TypeScript backend starts from `server.ts`; database schema and server helpers are under `src/`. The ZIP contains source code and sample data, not a newly built APK.
