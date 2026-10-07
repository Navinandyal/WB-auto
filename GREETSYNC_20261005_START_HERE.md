# Latest update

Read `GREETSYNC_MEDIA_AI_20261006.md` for the AI generator, video/PDF delivery checks and new backend environment requirements. The setup below remains applicable.

# GreetSync update — 5 October 2026

**Latest follow-up:** See `GREETSYNC_FOLLOWUP_20261005.md` for the eight subsequent changes and deployment/phone checks. This package includes them.

This source package contains the updated Flutter Android app, TypeScript backend and web administration build. It includes the earlier six fixes and the new mobile changes. Read this guide before the older dated notes in the project.

## What changed

| Request | Updated behavior |
| --- | --- |
| Automation preview | The composer review and automation details use one WhatsApp message bubble, including header, message body, footer, buttons and actual selected media/location. New activities save a template snapshot so later edits do not change their historical preview. |
| Send Message | The four steps are audience, template/content, delivery time and review. Use Template opens this same composer. Individual contacts have search. Send Now creates activity records visible under Scheduled Messages, including failed attempts. |
| Template setup | Choose Marketing or Utility, then Default or Flow, before editing. Notes explain category and Flow differences. The edit form shows the chosen setup instead of the old category-choice dropdown. |
| Language and variables | New templates offer English, Hindi and Marathi. Variable type offers Name and Number with a plain-language explanation and filled WhatsApp message example. Named variables remain named in Meta review and send payloads. |
| Documents | The picker explains GreetSync's PDF document-header support and its 16 MB limit. Convert other document types to PDF. Image selection supports JPG/JPEG/PNG up to 5 MB; video supports MP4, with MP4/3GP supported at send time, up to 16 MB. Selected files remain visible beside media controls and in message previews. |
| Location | Open the map, zoom and tap the exact point. Latitude and longitude fill automatically. Manual coordinates can also move the map. A starting map view does not count as a selected location. |
| Approval confirmation | Submit for Meta Approval opens a final message preview with Save as Draft and Submit for Approval. Utility submissions require confirmation that the message relates to a specific transaction/request and has no promotional content. |
| Template filters | All, Draft, Processing, Approved and Rejected sit below search. Processing groups Meta's pending/review states consistently. |
| Approved edits | Approved, rejected and paused Meta templates can be edited within Meta's restrictions. Meta identity/language and approved category remain fixed. Saving an edit as a draft preserves the live template and makes a separate draft copy. Processing templates cannot be edited. |
| Deactivate account | More now offers Deactivate Account. Business data is retained, future queued work is cancelled, sessions are revoked, and an administrator can reactivate the business. |
| Profile | Photo is on the left and business/owner information is on the right. Business Owner is larger normal text; the business name, owner name, phone and address also use larger text. The monthly analysis grid is removed. Failed message details no longer offer Resend. A compact account badge sits at the top right; suspension/billing notices remain when needed. |
| Fixed navigation | Home, Contacts, Send Message, Scheduled and More remain visible while navigating business screens. Space is reserved above the centre Send button so form actions remain accessible. |
| Coexistence | The new Embedded Signup path requests existing WhatsApp Business app onboarding with Cloud API. It verifies Coexistence, subscribes the WABA, starts consent-based contacts/history sync and processes Business App echoes. |

## Start the backend

Use Node.js 22 or newer and a PostgreSQL database. Copy `.env.example` to `.env` for local work, then supply the database URL and independent authentication/encryption secrets. Keep real credentials outside the ZIP and source control.

From the package root:

```bash
npm ci
npm run lint
npm test
npm run test:database
npm run build
npm start
```

The existing startup schema initializer adds the new snapshot, send-request, edit-history, media-preview, push-device, Coexistence and durable-webhook fields/tables. Back up an existing database before deploying a source update. The PostgreSQL integration checks use an isolated in-memory PostgreSQL engine and do not touch your production database.

Old direct-send messages are backfilled into the activity list when their original template still exists. Their original template version was not recorded by the older app; those previews are explicitly marked as using the current template version. New sends and schedules store their own text/button snapshot and selected media ID. Older/generated birthday jobs without a snapshot freeze the available template version when the worker claims them. Historical scheduled messages from older builds may still use the available template version because that original version was never saved. A direct message whose template was deleted remains in Messages and cannot be reconstructed as a template activity automatically.

The client supplies a stable request ID for Send Now. Retrying the same batch does not send completed recipients again. If the process crashes after Meta accepts a send but before the database records its response, the activity may remain Processing. Reconcile that case with Meta message/webhook records before deliberately starting a new send.

## Build the Android app

Use a Flutter stable release containing Dart 3.12 or newer, Android SDK and JDK 17. The mobile project adds `flutter_map`, `latlong2`, `firebase_core` and `firebase_messaging`; run dependency resolution after extracting this update.

```bash
cd mobile
flutter pub get
flutter analyze --no-fatal-infos --no-fatal-warnings
flutter test
flutter build apk --release --dart-define=API_BASE_URL=https://YOUR_BACKEND_DOMAIN
```

Use your actual public HTTPS backend URL. The release build's existing development signing configuration must be replaced with your production keystore for store distribution. No newly built or signed APK is included in this source ZIP.

For the import/model regression checks in a configured Flutter checkout:

```bash
dart run tool/check_import.dart
dart run tool/check_message_preview.dart
```

The map uses attributed OpenStreetMap tiles by default. For production volume, configure a tile provider you are authorized to use with `--dart-define=MAP_TILE_URL=https://YOUR_TILE_SERVICE/{z}/{x}/{y}.png`, and honor its usage rules. Map selection requires an internet connection; it does not request device GPS permissions or guess the business location.

## Configure background push

1. Register Android package `com.aikyam.whatsappautomation` in your Firebase project.
2. Download that project's `google-services.json` into `mobile/android/app/google-services.json`. The Gradle plugin is applied when this file exists. The file is excluded from source control and is not supplied in this ZIP.
3. Enable the Firebase Cloud Messaging HTTP v1 API. Supply a service account authorized to send FCM messages as the backend secret `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. Build and launch the app, sign in, and allow Android notification permission. GreetSync registers that device token to the signed-in business and removes it on logout/deactivation.
5. Test admin suspension/reactivation and package request/activation with the app open and then in the background. Account/billing notices are saved in Notifications; the backend also sends FCM notifications when configured.

Firebase initializes from native Android resources when available. Explicit Dart defines `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID` and `FIREBASE_PROJECT_ID` are also supported, but **native Android Firebase resources are still required for delivery after the app process has closed**. Configure the same Firebase project on client and server.

Without Firebase setup, the app continues to show in-app notifications and foreground local alerts. Background push cannot be claimed as enabled merely because the source code is present. Force-stopping Android applications can prevent notification delivery until they are opened again.

## Configure Meta Embedded Signup for Business App Coexistence

These settings belong to your Meta provider application; changing application source cannot grant provider eligibility or change your Meta dashboard configuration.

1. Use an approved Meta Tech Provider/Solution Partner application with the required advanced permissions, including `whatsapp_business_management` and `whatsapp_business_messaging`.
2. In App Dashboard → Facebook Login for Business → Configurations, create/update an **Embedded Signup** configuration using the current v4 Builder and include **Cloud API**. Existing WhatsApp Business app onboarding is requested through the official `whatsapp_business_app_onboarding` feature. Store that configuration ID in GreetSync admin settings or `META_EMBEDDED_SIGNUP_CONFIG_ID`.
3. Configure the real App ID, App Secret, public HTTPS backend URL, Graph version and webhook verification token. Add the bridge origin to the allowed Meta JavaScript SDK domains and use the correct live/test app mode and permissions for your business.
4. In App Dashboard → WhatsApp → Configuration, set the callback to `https://YOUR_BACKEND_DOMAIN/webhooks/whatsapp`. In addition to `messages`, subscribe **`history`, `smb_app_state_sync` and `smb_message_echoes`**, plus the template/account status topics used by your app. The backend verifies POST signatures using the platform App Secret; unsigned events are rejected.
5. From GreetSync, open Connect WhatsApp Business and complete the Meta flow using the **existing WhatsApp Business app number**. Follow Meta's Business App confirmation/QR steps. Meta must return `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`; an ordinary Cloud API FINISH event is not accepted as Coexistence.
6. The backend verifies `is_on_biz_app: true` and `platform_type: CLOUD_API`, verifies that the selected phone belongs to the granted WABA, and subscribes the provider app to that WABA. An existing Coexistence number is already registered; do not migrate it away from the Business App or register it again as a new Cloud-only number.
7. Complete contacts/history synchronization within Meta's 24-hour onboarding window. Each accepted request ID is saved so Retry Sync does not repeat an already accepted one-shot request. Declining history consent is represented separately and is not treated as permission to import history.
8. Test sending once from the WhatsApp Business app and once from GreetSync. Verify Business App echoes, delivery/read webhooks and history replay. Synced contacts start without marketing opt-in; obtain consent before automated messaging.

Meta requires a supported WhatsApp Business app version (documented minimum 2.24.17), eligible account/region, and an active installed Business App. Keep the Business App in use; Meta applies inactivity rules. Coexistence has its own throughput/feature limits. No UI can guarantee Meta eligibility or approval for every phone number.

Meta's current documentation says Embedded Signup v2 is deprecated on **15 October 2026**. Update the Builder configuration to v4 rather than assuming the session logging version number alone upgrades the Builder.

## Template category and editing rules

Marketing includes promotions, offers, greetings and re-engagement. Utility is nonpromotional content tied to a specific customer action, account, order, payment or request, with limited essential-update cases. Mixed promotional and transactional content is Marketing. Local category advice is a conservative warning, not Meta's classifier; Meta's returned category and webhook changes remain authoritative.

Default is a normal WhatsApp message. Flow adds an interactive published Meta form to a Marketing/Utility message; it is not a third template category. Create/publish the Flow in Meta first, then provide its real Flow ID and initial screen ID. This update supports a navigate Flow with no required initial custom data; a Flow that requires custom initial data needs its own data mapping/integration. It does not create or host Flow JSON or a Flow data endpoint for you.

The editor validates body/header/footer lengths, Name/Number consistency, required review examples, button length/count/grouping, Flow prerequisites, location and file limits. Named placeholders use lowercase letters/underscores such as `{{customer_name}}`; numbered placeholders start at `{{1}}` with no gaps. The footer cannot contain variables. New dynamic website URLs are created in WhatsApp Manager; this editor accepts complete static URLs, and the sending composer can fill dynamic URL values for existing imported Meta templates.

Approved templates keep their category; Meta name/language/parameter format remain fixed on an edit. Approved edits are limited to one in 24 hours and ten in 30 days, with Meta enforcing its own additional rules. Rejected and paused templates can be resubmitted. Meta can reapprove an edit immediately or place it in review, so GreetSync reads the returned/current status rather than manufacturing approval. Scheduled activities detect a changed template before sending and fail with a review/reschedule instruction, keeping the original preview.

Authentication/OTP templates require Meta's Authentication format and are created/managed in WhatsApp Manager. This Marketing/Utility editor does not invent an Authentication body. Meta may reject, pause, recategorize or restrict a template despite local validation.

## Contact import demonstration

Use `GreetSync_Contacts_Import_Sample.xlsx` or `GreetSync_Contacts_Import_Sample.csv` in the package root. The same files are bundled in `mobile/assets/samples/` and can be downloaded from the contact-import screen. They contain example data, not real customer consent.

Keep headings in the first contact-data row, use international phone numbers and normal date cells or YYYY-MM-DD dates, and save CSV as UTF-8. Keep phone columns as text so Excel does not remove plus signs or leading zeros. The importer handles Excel typed cells and rich text, common heading aliases, quoted CSV values, BOM and common line endings; review row validation before saving. Legacy binary `.xls` should be resaved as `.xlsx` or CSV. Do not send demo imports to real recipients without replacing the data and confirming opt-in.

## Validation completed for this update

- TypeScript type check and production backend/web build passed.
- 29 backend regression tests passed, including actual Meta request payload checks with a mocked transport.
- Isolated PostgreSQL integration checks passed for startup/migration replay, legacy Send Now backfill, deferred webhook retry, Coexistence echo ownership/deduplication, delivery status ordering, history replay and historical previews after template edits.
- 24 Dart Excel/CSV importer checks passed against real workbook/CSV data.
- 5 Dart message-model checks passed for historical previews, Send Now, Meta identity, named examples and dynamic URL values.
- Offline Dart analysis of mobile source found no type errors using downloaded framework/package sources. Existing lint/deprecation notices remain. This is not a substitute for normal Flutter dependency resolution, widget/device tests or an Android build.

A full Flutter/Android build, device screenshot review, real Meta approval/onboarding and configured Firebase delivery were not run here. The follow-up screenshots were inspected and used for the profile, navigation, template-order and location-error fixes. Check the final app on your target phone sizes before publishing.

## Primary references checked

- [Meta template management and editing](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-management)
- [Meta template categorization](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)
- [Meta template components](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components)
- [Meta parameter formats](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)
- [Meta media templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-media)
- [Meta's document-header example](https://www.postman.com/meta/whatsapp-business-platform/request/ep5w4rc/create-template-w-document-header-text-body-a-phone-number-button-and-a-url-button)
- [Meta Flow message example](https://www.postman.com/meta/whatsapp-business-platform/request/cgamr2u/send-flow-template-message)
- [Meta Business App Coexistence onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Meta Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4)
- [Firebase Flutter setup](https://firebase.google.com/docs/flutter/setup)
- [Firebase messaging setup](https://firebase.google.com/docs/cloud-messaging/flutter/client)
- [Firebase Android configuration](https://firebase.google.com/docs/android/google-services-plugin-and-file)
- [Firebase server HTTP v1 authorization](https://firebase.google.com/docs/cloud-messaging/auth-server)
