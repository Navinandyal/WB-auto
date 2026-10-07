# GreetSync validation — 5 October 2026

For the latest package results, see the final **Webhook fields and dynamic AI form** section below. Earlier sections describe earlier packages.

| Check | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | Passed |
| Backend regression suite | 29 tests passed |
| Production Vite + backend esbuild | Passed |
| Isolated PostgreSQL integration | Startup and repeat migration, legacy Send Now history, deferred webhook retry, owner-scoped/deduplicated Coexistence echoes, delivery status ordering, history replay and immutable preview checks passed |
| Dart contact importer | 24 checks passed, including real Excel workbook and CSV sample consistency |
| Dart message preview models | 5 checks passed |
| Offline Dart analysis of mobile source | 0 errors; 8 existing warnings and other lint/deprecation notices |

Backend request tests mock Meta's transport; they inspect actual request bodies and validate failure behavior. Database integration uses PGlite's PostgreSQL engine in memory, with the production schema SQL and Coexistence handler. Import/model checks execute real Dart code. The offline analyzer uses framework/package source snapshots without running Flutter bootstrap or an Android toolchain.

Not verified in this environment: normal Flutter dependency solving, widget/device UI execution, Android release build/signing, live Meta category/approval/onboarding, or configured Firebase background delivery. No APK is included. Configure Meta and Firebase and run the phone checks in `GREETSYNC_20261005_START_HERE.md` before release.

## Follow-up verification — 5 October 2026

The updated package passed TypeScript checking, all 29 backend regression tests, and the production backend/web build. New cases cover location creation/edit payloads with local metadata stripped, mandatory name/address validation, complete location sending, business variable values and failed-message resend eligibility. The six existing isolated PostgreSQL integration scenarios were rerun successfully.

The Dart formatter parsed/formatted all six changed mobile UI files. Offline analysis of the full mobile source found zero errors and eight existing warnings. The Excel/CSV importer checks (24) and message model checks (5) were rerun successfully with real workbook/CSV data.

The offline analyzer uses framework source and manually selected package source snapshots. This does not verify a resolved Flutter dependency graph, native plugins, widget rendering or an Android build. A normal Flutter SDK was unavailable here; full dependency solving was not completed. Temporary SDK/source snapshots and manual analyzer configuration are excluded from this ZIP. Live Meta/Firebase testing and target-phone UI checks remain required.

## Latest Profile / failed-message adjustment

Only the mobile UI and accompanying documentation changed. Source inspection confirms that failed automation details have no Resend button, review text or handler, and that the Profile business name, owner name and contact text sizes have increased. The header uses flexible text to wrap beside the top-right status badge.

The earlier checks above belong to the prior package and were not rerun for this UI-only adjustment. A Dart/Flutter SDK is unavailable in the current environment, so formatter/analyzer and device rendering checks were not run for these two latest changes. ZIP integrity and inclusion of the updated source were checked.

## Media delivery and AI generator — 6 October 2026

TypeScript checking, all 48 backend regressions, nine isolated PostgreSQL scenarios and the production build passed. The new regressions include real ffprobe video checking, real pdfinfo PDF checking, metadata validation before video/document sends, false Meta successes without a message ID, owner-scoped AI context/revisions and the real Gemini SDK's structured request/response path with mocked transport. Location drafts retain partial metadata while approval still requires a valid location. Early delivery callbacks retry and accepted-media failures retain Meta code/details.

The formatter parsed/formatted the changed mobile files. Offline full-mobile source analysis found zero errors and eight existing warnings. The final AI editor screen was analyzed again after its last adjustment with zero errors/warnings. Framework/package sources were restored solely for offline analysis; these snapshots and manual analyzer config are excluded from the source ZIP. No live AI/Meta operation, normal Flutter package solving, native plugin execution, device UI test or APK build was performed. See GREETSYNC_MEDIA_AI_20261006.md for setup and phone validation.

## Delivery status and AI key fixes — 6 October 2026

TypeScript checking, the production web/backend build, all 66 backend regression tests and all 12 isolated PostgreSQL scenarios passed. New regressions verify manual app webhook signatures, body tampering and mixed business/phone payload rejection; WABA ownership/subscription/app confirmation and invalid WhatsApp tokens; AI key aliases/quote trimming, model overrides, missing or rejected keys, permissions, billing/region, quota and timeout error classification; and the actual Gemini SDK error path without repeated quota retries. Database scenarios confirm ACCEPTED → DELIVERED → READ for messages and activities, isolation, late/replayed receipt timestamps, UTC storage under a non-UTC database session, and owner-scoped delivery diagnostics. Timestamp assertions use PostgreSQL text values to avoid the embedded driver's session-dependent JavaScript Date decoding.

All three changed mobile screens were formatted and offline source analysis found zero errors and zero warnings, with 92 pre-existing lint/deprecation information items. Analysis uses framework/package source snapshots, not a resolved native Flutter build. The Windows/Railway PowerShell script was reviewed but not executed. No real Gemini-key request, live WhatsApp message, production deployment, device UI test or APK build was performed. The ZIP contains source and setup instructions, with dependencies, temporary SDK/analyzer files and secrets excluded.

## Message recovery and AI REST fix — 6 October 2026

The latest package passed all **75 backend regressions**, **16 isolated PostgreSQL scenarios**, TypeScript checking and the production web/backend build. New request-level regressions verify the unchanged birthday header/body values with callback correlation; explicit HTTPS WABA callback override and safe verification; an uncertain template POST making only one attempt; idempotency comparison after JSONB ordering/receipt metadata changes; pending send-again age/duplicate acknowledgement/recipient rules; project-aware AI model listing, safe pagination and key headers; a metadata-only AI connection check; blocked/truncated/empty AI results; and distinct safe DNS/TLS/timeout diagnostics. Existing text, image, video, PDF, location and named-variable tests continue passing.

Database checks additionally cover correlation when an early receipt lacks recipient_id; recovery of the WhatsApp ID after an uncertain send; clearing stale uncertainty only after a real status; cross-owner rejection; production URL precedence over a saved tunnel; fallback verification configuration; deduplicated/cached delivery setup; and safe setup warnings that do not block a valid sender. The integration harness uses the production database migration and callback handler with PGlite; external requests are mocked.

All four changed mobile screens were formatted. Offline source analysis returned **zero errors and zero warnings**, with 113 lint/deprecation information items. Flutter framework/dependency sources and dart:ui metadata were supplied only for this offline analysis; this does not establish a resolved Flutter dependency graph, native compilation or device rendering. These temporary sources/analyzer files are excluded from the ZIP.

The Windows production setup script was reviewed but not executed. No production credentials/logs, real Meta delivery, real Gemini response, deployment, Android APK build or device UI test was available. The screenshots establish symptoms, not the production root cause for an individual message. The new backend health build identifier and AI failure references make it possible to distinguish stale deployment, configuration, provider and network failures on the deployed server. Use GREETSYNC_MESSAGE_RECOVERY_AI_FIX_20261006.md for rollout and manual recovery.

## Guided AI, device drafts and delivery reasons — 6 October 2026

All **87 backend tests**, **18 isolated PostgreSQL scenarios**, **19 executable Dart draft/prompt checks**, TypeScript checking and the production Vite/esbuild build passed. New AI regressions cover saved business identity, preview-name variables, role/age/tone validation before provider calls, birthday word-count/closing/media enforcement, bilingual Meta language codes, edited revision context, per-contact AGE meaning and Marketing categories. New delivery regressions distinguish absent receipts from actual failed/processing/inconsistent/held/paused/unknown states and expose actual received error details. Database tests prove per-message receipt evidence is restricted to the verified WABA, phone and owned message ID or exact owner/activity correlation. Pure Dart checks exercise partial form/media restoration, owner/backend scope isolation, targeted discard, stable message request IDs, storage failures, corrupt envelopes, size limits and purpose/revision prompts.

The formatter parsed/formatted all nine changed mobile source files and the new Dart check. Offline source analysis found **0 errors and 0 warnings**, with **159 lint/deprecation information items**. This uses temporary framework/dependency source snapshots and dart:ui metadata rather than a native Flutter build. Temporary SDKs, analyzer configuration, dependencies, secrets and build outputs are excluded from the deliverable.

The public production health endpoint returned HTTP 200 and the prior `delivery-recovery-ai-rest-20261006` build. This was a read-only check, not deployment or authenticated message diagnosis. The new package build identifier is `guided-ai-drafts-delivery-reasons-20261006`. No authenticated production message/callback records, real AI/Meta credentials, native secure-storage execution, widget/device tests, production deployment or APK build were available. An absent receipt establishes missing delivery evidence; it does not establish a particular Meta error code. The accompanying guide explains this distinction and the phone checks still needed.

## Webhook fields and dynamic AI form — 6 October 2026

Passed **93 backend tests**, **18 isolated PostgreSQL scenarios**, **22 executable Dart draft/prompt checks**, TypeScript checking and the production Vite/esbuild build. New regressions inspect server-only read-only app-subscription requests, missing/inactive messages fields, rejected App ID/Secret, incomplete/unreadable/network responses without invented readiness, secret-free diagnostics, stale/missing callback overrides despite successful POST, and custom bounded purpose/tone/audience with saved business ownership. The setup integration mock now covers both the read-back WABA override and app-level messages field while preserving deduplication/caching and safe sender warnings.

All four changed mobile source files and the Dart check were formatted and analyzed offline: **0 errors / 0 warnings**, with **116 lint/deprecation information items**. The temporary analyzer SDK needed dart:ui framework metadata restored before it could analyze Flutter source; that environment repair is not a mobile source change. Temporary snapshots and manual analyzer configuration are excluded from the ZIP.

Two actual attached screenshots were inspected locally. The production public health endpoint reported the preceding guided-AI build; both callback aliases rejected an intentionally incorrect verification token with HTTP 403. These are read-only reachability checks, not a valid-token challenge, authenticated delivery diagnosis, signature verification or deployment. No native build, widget/device execution, live Meta/AI generation, message send, production settings change or new backend deployment was performed. A pending label with a message ID and no recorded receipt does not prove a specific Meta delivery error or identify which setting is wrong in production.
