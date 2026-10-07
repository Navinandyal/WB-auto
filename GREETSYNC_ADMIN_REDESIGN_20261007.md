# GreetSync — admin redesign and simplified send status

Mobile version: **1.0.4+5**. Backend build: **admin-redesign-message-status-20261007**.
This source package carries forward the existing template, media, location, import,
AI, draft protection and WhatsApp Coexistence fixes.

## Business user changes

- Executed sends display **Sent** when WhatsApp accepts the request. Confirmed
  sent, delivered and read records also display Sent in the scheduled-message list.
  Failed requests and later failure callbacks display **Failed**.
- Removed Awaiting delivery wording, the delivery diagnosis/connection warning
  section, Check delivery connection and Review & send again from message details.
- Future messages remain queued; uncertain transport outcomes remain Processing.
  Simulation, paused and cancelled records retain their distinct states.
- Receipt timestamps and the original message preview remain in message activity.

**Sent is a send-status label, not proof that the recipient received the message.**
The backend still stores ACCEPTED/SENT/DELIVERED/READ/FAILED, processes signed
webhooks and updates failures. No pending record was changed to a fabricated
Delivered state. The screenshot's Meta App ID/App Secret rejection remains an
administrator configuration issue; hiding that user-facing section does not
repair invalid credentials. The existing Configuration page and preceding
webhook guide remain available to diagnose it.

## Admin changes

- Removed the drawer and separate Messages destination. Home, Businesses,
  Contacts, Templates and More use a fixed bottom navigation bar. Detail and
  editor pages use an inner navigator so the bar remains visible.
- Dashboard shows actual business/approval/contact/activity totals and today's
  outbound activity totals, with shortcuts to tracking, templates and packages.
- Businesses use spaced owner cards, search and status filters. Business details
  have a scrolling identity header, counts, confirmation before status changes,
  and Overview / WhatsApp / Contacts / Templates / Scheduled messages / Activity.
- Contacts can be filtered by available business names, including businesses
  with no contacts. Search includes contact details and owners. Pagination
  replaces the old silent 250-record UI cutoff.
- Templates have the same All / Draft / Processing / Approved / Rejected tabs.
  Open a template to see the WhatsApp bubble, header/media/location/buttons,
  example variables, category, language, Meta ID, timestamps and owner details.
- Suggestions are inside Templates. Search and All / Available / Hidden filters,
  preview, edit and availability controls are provided. Editors show a live
  message preview, preserve existing buttons and offer English/Hindi/Marathi.
- Scheduled messages combines jobs with standalone outbound messages. Search,
  business/status filters, Today/7 days/30 days/All time/custom dates, pagination,
  daily counts and full message details are provided. Scheduled controls require
  confirmation. No failed-message resend control is added.
- Packages have Requests / Plans / History tabs. Open a request to review the
  business owner, phone, email, address, account state, plan, price, validity and
  notes. Activation/rejection is available only on that review page and requires
  confirmation. Decision notes can contain payment reference/rejection reasons.
- Reports, Configuration and Settings use the shared admin visual style.
  Settings removes Notifications and opens Privacy/Terms on the existing
  Aikyam AI Systems website URLs in the external browser.
- Authenticated admins can preview saved business message media; business users
  can still retrieve only their own media. Preview endpoints remain private.

## Tracking rules

`GET /api/admin/scheduled-messages` is admin-only. It accepts `businessId`,
`start`/`end` (YYYY-MM-DD, inclusive), `search`, `status`, `page` and `limit`.
Summary and daily totals cover all matching business/date/search records, not
just the current page. The status filter applies to the activity list and its
matching count; summary cards/table continue to show all statuses in the range.

Each scheduled job contributes one activity, joined to its latest outbound
message. Standalone outbound messages contribute one activity each. Incoming
messages are excluded. Original template snapshots and real send variables
are used for previews. Date buckets use **Asia/Kolkata (IST)** explicitly,
independent of the PostgreSQL session timezone. The bucket uses sent time,
otherwise execution time, otherwise scheduled time. Future queued records
therefore appear on their planned day. Paused/cancelled/simulated records are
counted separately. All-time totals cover all records; the daily table returns
the most recent 90 days **with activity**, not 90 calendar days. Choose a custom
range to review earlier days. No-activity days are omitted.

A partial outbound-message index is created idempotently during database
initialization. It supports latest-message lookups without changing old data.

## Rollout and validation

Deploy the backend and mobile source together. Follow the existing production
setup/build guide; run `npm ci`, `npm test`, `npm run test:database`,
`npm run lint`, `npm run build` and use the existing production start command.
Database initialization adds the index automatically. Run normal `flutter pub
get`, `flutter analyze` and the Android release build in your Flutter environment.
The ZIP is source, not a newly built APK or a deployment.

100 backend tests, 18 isolated PostgreSQL integration scenarios, TypeScript
checking and the production build passed. Dart logic checks: 12 send-status and
22 existing editor-draft/prompt checks passed. Offline source analysis of the
13 changed mobile files found 0 errors and 0 warnings (existing informational
lint/deprecation notices remain). See TEST_REPORT.md for precise limits.

A resolved Flutter/native toolchain, emulator and signed production accounts were
not available here. Device layouts/navigation, website launching, live Meta
receipts, actual billing decisions and production delivery still need target
environment verification. No production sends or account/package changes were
performed while preparing this package.
