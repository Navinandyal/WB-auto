# GreetSync: bulk sending and contact imports — 22 October 2026

## Run the update

Extract this complete project into your project folder. Preserve your existing private configuration and Android signing files, then run:

```bat
RUN_PRODUCTION_SETUP.cmd
```

This deploys the backend using the saved Railway configuration, waits for release `bulk-import-production-20261022`, and builds/verifies `GreetSync-production.apk` (version **1.0.6+7**). Install that APK as an update. Do not add `-SkipApkBuild` for this update: both backend and mobile UI changed. No new account-selection menu was added.

## What caused the screenshot error

The screenshot reports **Meta error 131049**. WhatsApp restricted a marketing message for that particular recipient under its per-user marketing limits. It is not proof that a batch of 150–200 recipients is too large. Repeated immediate retries can prolong the restriction. Meta requires waiting at least 24 hours before another marketing attempt; delivery afterwards is still subject to its limits.

GreetSync now shows this reason without repeating Meta's title/message/details. It displays a retry time, blocks immediate repeat attempts to that recipient, and lets other eligible recipients continue. This does not change a template's category or falsely mark a failed or merely accepted message as delivered.

Official references:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits
- https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes

## Bulk sending

Send Now now saves the complete validated audience in PostgreSQL and returns promptly instead of keeping the mobile HTTP request open for 150–200 Meta calls. The existing worker drains saved jobs in batches of 25 with conservative pacing. Sending continues when the app closes; queued jobs survive backend restarts.

A stable request/recipient key protects against duplicates if the HTTP response is lost and the same request is repeated. Individual failures do not stop the rest of the queue. Known throughput/pair rate-limit rejections can retry at 30, 60 and 120 seconds, with a strict three-retry limit. Accepted sends, transport outcomes that are unknown, and error 131049 are never automatically replayed. An in-flight send interrupted by a crash needs receipt reconciliation/review, since blindly repeating it could duplicate a real message.

Send Now entries appear in Scheduled Messages immediately and the list refreshes while jobs are queued. Queueing, Meta acceptance, sent receipts and confirmed delivery remain distinct states. Open an entry for the real recipient result. A 200-recipient batch takes time to drain; it is not 200 simultaneous API calls. Approved templates, valid media, recipient consent, active package capacity and Meta account/recipient eligibility remain required.

## Contact imports and names

- CSV/Excel import: enable **Create a group**, enter the group name, then import.
- Phone Contacts: select contacts, enable **Create a group**, enter the name, then tap **Add selected**.
- The group is created in the import transaction. If that name already exists in your business, imported contacts are added to it. Duplicate saved contacts are included in the selected group once without changing their existing details or consent. Invalid rows are reported and excluded. No empty group is created when no valid contacts are found.
- Imports count actual new contacts against package capacity. A capacity/database failure rolls back both new contacts and group changes.
- Contact names use sentence case: `RAHUL SHARMA` becomes `Rahul sharma`. This applies to manual create/edit, CSV/Excel, device imports and displayed saved contacts. Business and group names retain their spelling. Existing contact rows are not mass-updated.

## Validation and limits

Passed locally: TypeScript checking; 147 Node tests; isolated PostgreSQL regressions; production web/backend build; 310 setup/database-selection/backend-health assertions; Android signing-helper fixtures; 40 executable Dart import/name/preview checks. Offline analysis of the full mobile source reports zero errors and three existing warnings.

The new tests include a 200-recipient saved queue, partial failures and uncertain results, fresh worker instances, overlapping-worker claims, request replay, quota rollback, owner-scoped group reuse and the 24-hour marketing cooldown. Meta transport and worker send results are mocked; these tests do not send messages to real recipients.

No production deployment, live 200-recipient WhatsApp campaign, Android APK build, iOS build or device UI execution was performed here. This ZIP contains source and the existing build commands, not a newly built APK. Run the command above on your development PC and validate with opted-in test recipients before a real campaign.
