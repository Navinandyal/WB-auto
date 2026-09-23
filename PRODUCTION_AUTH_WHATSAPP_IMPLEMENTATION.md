# WishFlow Production Authentication + WhatsApp Onboarding Update

This build implements the production flow requested in `Pasted text(20260922-062301).txt` on top of the existing WishFlow codebase.

## Authentication

- Business login is mobile number + password only.
- Registration creates a `BUSINESS_OWNER` with `PENDING_APPROVAL`.
- Admin states supported: `PENDING_APPROVAL`, `ACTIVE`, `REJECTED`, `SUSPENDED`.
- WhatsApp connection is never required for software login.
- Access tokens are short-lived HS256 JWTs (15 minutes).
- Refresh sessions are persistent, hashed in PostgreSQL, and revocable.
- Flutter stores access token, refresh token, user id, business id and remember-me state using `flutter_secure_storage`.
- Forgot-password has dedicated request/reset endpoints and invalidates refresh sessions after password reset.

## WhatsApp onboarding

The business can enter the app immediately after admin approval even when WhatsApp is not connected.

Dashboard status states:

1. `NOT_CONNECTED` — no credentials saved.
2. `SAVED` — credentials persisted, Meta not checked yet.
3. `CONNECTED` — Meta phone-number verification succeeded.
4. `CONNECTION_ERROR` — Meta verification failed; saved credentials are retained.

Manual POC flow:

- Save credentials first.
- Sensitive credentials are AES-256-GCM encrypted server-side.
- App displays masked token/secret previews after navigation/restart.
- `Verify with Meta` performs the Graph API check separately.
- Verification failure updates only connection status/error and never deletes saved values.

Meta Embedded Signup is documented in-app as the production onboarding target. It requires a production Meta App / Embedded Signup configuration before a live authorization URL can be enabled.

## Templates

- Demo/local fallback rows are no longer returned to business users.
- Template list is tenant-scoped.
- Template creation saves a local `DRAFT` first.
- Optional Meta submission changes it to `PENDING`, then sync updates to `APPROVED`, `REJECTED`, `PAUSED`, etc.
- Meta remains authoritative for sendability.

## Automations

- Create Automation accepts multiple selected contact IDs in one request.
- Server validates tenant ownership, opt-in and Meta-approved template status.
- One persistent scheduled row is created per recipient so existing worker/message status logic remains compatible.
- Worker claims only `SCHEDULED` rows and moves them to `PROCESSING` atomically.
- `pause` and `run-now` endpoints were added.
- Message log endpoints were added.

## Webhooks

Both URLs are supported:

- `/webhooks/whatsapp`
- `/api/webhooks/whatsapp`

Meta status webhooks update persisted message status and linked automation status.

## Migration

`migrations/20260922_production_auth_whatsapp.sql` contains the schema upgrade.
The normal server startup also performs idempotent `CREATE/ALTER` statements for local development.

## Important production secrets

`.env` may contain only platform-level secrets such as PostgreSQL credentials, `AUTH_TOKEN_SECRET`, and `CREDENTIAL_ENCRYPTION_KEY`.
Per-business WhatsApp tokens/IDs are stored in PostgreSQL and sensitive fields are encrypted.

## WhatsApp verified-business screen behavior

The business user does **not** need a verified WhatsApp account to sign in to WishFlow. Software login is controlled only by mobile/password plus WishFlow admin approval/account status.

After login, the WhatsApp screen has four persistent states:

1. **NOT_CONNECTED** — dashboard says "WhatsApp Business not connected" and offers Manual Setup or an explanation of Meta Embedded Signup.
2. **SAVED** — credentials have been encrypted and saved in PostgreSQL. The screen displays non-sensitive IDs and masked secret previews. Meta has not yet confirmed the connection.
3. **CONNECTED** — the user taps Verify with Meta; the backend decrypts that business's token, calls Meta using its Phone Number ID/WABA, and stores verified name/display number/quality/status. The UI then shows WhatsApp Connected.
4. **CONNECTION_ERROR** — Meta verification failed, but all saved credentials remain stored and visible as masked previews. The user can edit and retry without re-entering every value.

For production Meta Embedded Signup, Meta itself opens the authentication/onboarding UI. The business owner signs in directly with Meta, selects/creates a Business Portfolio, WABA and phone number, grants permissions, and Meta returns authorization to the WishFlow backend. WishFlow never asks for or stores the Facebook password.
