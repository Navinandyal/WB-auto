# GreetSync – 25 Sep 2026 update

## Business dashboard template count
- Navin's business now has exactly two visible core templates: `hello_world` and `birthday`.
- The Birthday template is pinned to Meta template ID `1115812650837928` and APPROVED/en_US/MARKETING metadata.
- Dashboard approved-template count is calculated from the same tenant-filtered visible template set, so hidden legacy/demo templates no longer inflate Navin's count.
- Duplicate Birthday rows are consolidated safely; scheduled automations are re-pointed before an obsolete duplicate is removed.
- Birthday sends do not fall back to `hello_world` when the intended template is unavailable.

## Business UI redesign
- Contacts: modern summary, source selector, search, created groups immediately below search, import/manage-group actions and redesigned contact cards.
- Templates: summary banner, search/status filters, richer template cards/previews and clear use-template action.
- Automations: automation-center summary, queue/sent/failed metrics, filters and redesigned automation cards.
- Business profile icon: opens an account menu showing profile name, business name, View Profile and Logout.

## Account deletion
- Business owner must enter the current password.
- Access is disabled immediately, refresh sessions and biometric credentials are revoked, and pending automations are cancelled.
- Account/business data is retained for no longer than 30 days and then permanently purged by backend cleanup.
- Privacy Policy and Terms & Conditions now describe this retention/deletion policy.
- Added DB deletion timestamps and migration `20260925_account_deletion_retention.sql`.

## Admin UI
- Admin dashboard redesigned with a platform hero, animated KPI cards, approval health, activity indicators and admin-control status cards.
- Admin Settings profile area redesigned to avoid cramped/overflowing configuration/profile UI.
- Provider Meta configuration remains under the dedicated Configuration page and uses responsive section cards.

## Validation performed
- TypeScript syntax transpilation check passed for `server.ts`, `src/db/schema.ts`, and `src/db/index.ts`.
- Structural quote/comment/bracket validation passed for every Dart file under `mobile/lib`.
- Full Flutter build was not executed in this environment because the Flutter SDK is not installed here.
