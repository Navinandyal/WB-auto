# GreetSync — Admin redesign (14 October 2026)

## Included changes

1. The old drawer is removed. Fixed bottom navigation provides Home, Businesses, Contacts, Templates and More. Admin detail/editor routes stay inside the admin navigator so the bottom bar remains visible. More contains Scheduled messages, Packages, Reports, Configuration and Settings.
2. Dashboard, business directory, business details, contacts, templates, suggestions, scheduled messages, packages, reports, configuration and settings share clearer headings, spaced cards, compact status badges and responsive wrapping. Business details have Overview, WhatsApp, Contacts, Templates, Scheduled messages and Activity tabs.
3. Contacts can be searched and filtered using available business names/owners. Contact details show the owning business. Pagination removes the old 250-record display cap.
4. Tapping a template opens the complete WhatsApp preview, template/category/language/status/Meta ID/timestamps and owner name, phone, email, address and business ID. Saved media previews are available to authenticated admins; business users cannot call that endpoint.
5. Suggestions are inside Templates, with consistent status filters, previews, editing and availability controls. Suggestions remain reusable drafts; each business needs its own Meta approval.
6. Automations are shown as Scheduled messages. The admin can track scheduled and immediate/Send Now outbound activities, recipient numbers, business owners, message previews, overall totals and daily IST counts. Date presets/custom ranges, status/business/search filters and server pagination are available. Schedule controls use the existing owner-specific sending flow.
7. The standalone Messages tab and old Messages screen are removed. Message records and receipt details are available from Scheduled messages instead.
8. Packages contain plans, pending requests and subscription history. Before activation/rejection, the review screen displays owner name, phone, email, business/address/status, price, allowance, dates and request notes, then asks for confirmation.
9. Admin Settings has no Notifications option. Privacy Policy and Terms & Conditions open an external browser. Public HTML pages use the existing in-app policy wording and are served from the deployed GreetSync site at `/privacy-policy` and `/terms-and-conditions`. The header notification bell remains available.

## Deploy and build

Extract this complete source into your existing project folder, keeping your private .env/Firebase files, original signing key, android/key.properties and .android-signing directory. Run:

```bat
RUN_PRODUCTION_SETUP.cmd
```

Normal execution deploys the backend, waits for this admin update's health/build identifier, builds the release APK with the actual public HTTPS backend, verifies signing/package metadata and publishes `GreetSync-production.apk` in the project root. There is no Railway account selection menu. App version is **1.0.5+6**. Install that newly generated APK; an older APK cannot show these redesigned Flutter screens.

The latest production URL default, automatic WABA/phone discovery, Meta SDK security-policy repair, Coexistence checks and signing verification corrections are preserved. No private key or production token is included in this ZIP.

## Policy URLs

After deployment, the default browser destinations are:

- `https://wishflow-backend-production-e75d.up.railway.app/privacy-policy`
- `https://wishflow-backend-production-e75d.up.railway.app/terms-and-conditions`

If your company later hosts dedicated policy pages elsewhere, Flutter supports `PRIVACY_POLICY_URL` and `TERMS_CONDITIONS_URL` Dart defines with public HTTPS URLs. The default pages work with the supplied backend deployment and do not depend on an unpublished company website path. This update changes navigation/presentation; policy wording is copied from the existing app.

## Reporting meaning and validation

A scheduled activity is counted once using its latest outbound result, avoiding a duplicate count for its schedule plus message log. Standalone outbound messages are also included; inbound chats are excluded. A confirmed WhatsApp API acceptance is labelled Sent, while an unknown transport result stays Processing. Delivery/read receipts remain visible in details. Daily grouping is IST and uses send/execution time when available, otherwise scheduled time. The All time daily table shows the latest 90 days with activity; overall totals cover the full filtered history. Use custom date ranges for older days.

134 backend tests passed, including real HTTP/JWT/admin-role checks with PGlite, owner metadata, encrypted/sensitive field exclusions, daily totals, original snapshots, pagination and public policy pages. TypeScript checking and production backend build passed. Source-only Dart analysis reports zero errors; existing lints/deprecation warnings remain. Production URL configuration checks and database regressions passed. Setup workflow checks are documented in TEST_REPORT.md.

No production deployment, full Flutter native build or physical-phone UI test was performed here. The one-command workflow builds with the signing identity on your PC. The ZIP contains source and sample imports, not a generated APK or signed IPA.
