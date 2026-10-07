# GreetSync — Media delivery and AI templates (6 October 2026)

For the latest delivery callback, icon, automatic refresh and API key deployment fixes, read GREETSYNC_DELIVERY_AI_KEY_FIXES_20261006.md first. This document describes the previous feature update.

This source package contains the new media fixes and AI Template Generator, plus all previous changes (including larger Profile details and removal of the failed-message Resend option). Deploy this backend and rebuild/install the Flutter app together. There is no APK in the ZIP.

## Video/PDF delivery fixes

The old direct-send and worker code marked a successful Meta HTTP response as SENT immediately. That response means the request was accepted; it does not confirm delivery to the customer. File selection also trusted the extension/MIME label without checking video codecs or whether a PDF was readable. These are confirmed code defects; the exact reason an earlier live message failed cannot be determined without its message ID and Meta webhook error.

- New sends are recorded as ACCEPTED and displayed under **Awaiting delivery**. Only Meta status callbacks confirm Sent, Delivered, Read or Failed. Accepted messages consume message capacity and cannot be run again by the worker.
- Uploads check strict base64 data, size, image signatures, readable/unlocked PDF pages, and MP4/3GP video codecs (H.264 and AAC audio if present; one video and at most one audio stream). Damaged, renamed, unsupported and encrypted files get an actionable error before submission.
- Before video/PDF sends, the backend checks that the real uploaded media ID is accessible for the connected phone number and has the correct MIME type. Expired/inaccessible media asks the owner to select/upload again. Video/PDF links cannot stand in for a verified attachment. Review header handles are never used as send-time media IDs.
- Failed delivery callbacks now preserve Meta's error code and detailed reason in the message and automation. Failure notifications use the existing in-app/push notification service. A late Sent callback cannot erase a known Failed result.
- A callback arriving during send persistence is retried from the durable inbox. Unrelated statuses are ignored. Automation Details refreshes every eight seconds while awaiting the outcome; use refresh on the list to see changes.
- Older send records are retained. This update does not invent a delivery result for historical attempts with no callback.

## AI Template Generator

Open Templates → **AI Template Generator**. Describe the message, choose English/Hindi/Marathi, and tap Generate Template. The new window contains chat, a WhatsApp preview, and editable template fields. AI uses the signed-in owner's saved name, business name, business address and phone. Ask for revisions or edit directly before approval.

The prompt can request an image, video, PDF or location header. AI generates the message and chooses one header type. Select the actual media file in the editor, or select the real map point and check name/address for a location. This feature does not synthesize image/video/PDF files or guess coordinates.

Tap **Submit for Meta Approval** to review the WhatsApp preview again. The confirmation offers **Save as Draft** and **Submit for Approval**. Drafts can retain an unfinished attachment/location setup; actual submission requires the real sample or valid coordinates/name/address. Template creation, category guidance, variable examples and Meta review stay in the existing validated flow. Generated content is not automatically saved, submitted or sent.

The backend validates AI output, corrects clearly promotional Utility content to Marketing, rejects unsupported language/OTP/variables and bounds conversation size. One generation runs at a time per business, with a maximum of 20 requests per hour per server process. This is a local quota; use a shared limiter if deploying multiple API replicas.

## Required backend setup

1. Add `GEMINI_API_KEY` to the backend environment. Keep the key out of Flutter configuration, source code and the APK. Configure the Gemini project/model's required API access and quota. Without this key, the generator gives a clear configuration message.
2. `GEMINI_TEMPLATE_MODEL` defaults to `gemini-3.8-flash`, a currently documented stable model. Override it with a supported structured-output model available to your Gemini project when needed.
3. Install `ffprobe` (FFmpeg) and `pdfinfo` (Poppler) on the backend host. The updated Dockerfile installs both. If using Railway's Docker build, redeploy this Dockerfile; otherwise install both tools in your build/runtime environment. Optional full executable paths: `FFPROBE_PATH` and `PDFINFO_PATH`. Missing tools block the corresponding upload with a clear configuration error.
4. Keep the WhatsApp `messages` webhook subscription active, with the correct callback URL, App Secret and connected WABA/phone number. Firebase configuration is still required for background push notifications.
5. Follow `GREETSYNC_20261005_START_HERE.md` for the existing database/Meta setup and Flutter build steps. No new database schema migration is required for these features; statuses use existing text columns.

## AI data handling

Generation sends the owner's name, business name/address/phone, selected language, bounded recent chat and current message text/category/header type to Google's Gemini API. It does not send WhatsApp access tokens, passwords, billing records, contact lists, uploaded file bytes or chat history from WhatsApp. Details typed manually into the prompt/message are included. This app does not persist the AI conversation; it remains in the current editor session. Templates are stored only when the owner saves or submits them. Update your published privacy policy to describe this optional AI service and its data transfer before releasing the feature, and select the appropriate provider account/data settings.

## Checks executed

- TypeScript checking: passed.
- Backend regressions: 48 tests passed, including the actual Gemini SDK with a mocked structured response, owner context, revisions, invalid AI output, category correction, all header types, video/PDF metadata checks, missing message IDs and draft location validation.
- Media tests use actual compatible/incompatible MP4 files through ffprobe and a readable PDF through pdfinfo.
- PostgreSQL integration: nine scenarios passed, including early delivery callback retries and accepted-media failures retaining their error details.
- Production web/backend build: passed.
- Dart formatter: passed. Offline full-mobile source analysis: zero errors and eight existing warnings. The final AI screen was checked again after its last UI adjustment and has zero errors/warnings.

AI/Meta HTTP responses in automated tests are mocked. Live Gemini generation, Meta approval and video/PDF delivery, signed webhooks, push notifications, phone rendering, normal Flutter dependency resolution and APK building/signing still need validation in your configured environment. The offline analyzer uses framework/package source snapshots, not a fully resolved native Flutter build.

## Phone checks after deployment

1. Send a small compatible MP4 and an unlocked PDF to an opted-in test contact. Check Awaiting delivery → Sent → Delivered/Read and verify the actual attachment in WhatsApp.
2. Try a renamed file, corrupt PDF and unsupported-codec video; each should show a local validation error. Use an expired media ID in an existing scheduled test to confirm the actionable failure.
3. Generate an English/Hindi/Marathi template. Request a revision, make a manual edit and confirm the WhatsApp preview matches.
4. Generate each media type, select real files/location, then exercise Save as Draft and Submit for Approval. Reopen a draft and check all text/media/location metadata.
5. Check a failing delivery event shows the Meta error details in Scheduled Messages. Failed-message details should have no Resend option.

References: [Meta delivery callback example](https://www.postman.com/meta/whatsapp-business-platform/request/u6uu1g9/status-message-delivered-user-initiated), [Meta media reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/), [Google structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [Google available models](https://ai.google.dev/gemini-api/docs/models).
