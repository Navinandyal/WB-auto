# GreetSync — Admin + In-App Meta Embedded Signup Update

## Admin side

The Flutter Super Admin now has a separate dark-blue admin navigation experience with these sections:

- Dashboard
- Businesses
- Contacts
- Templates
- Automations
- Messages
- Reports
- Settings / Admin Profile

### Business Details

Admin can open any real registered business and see:

- business name and owner name
- owner mobile and email
- business address
- account/approval status
- registration, approval and last-login timestamps
- contact/template/automation/message counts
- WhatsApp connection status
- Meta Business ID
- WABA ID
- Phone Number ID
- display WhatsApp number
- verified business name
- quality rating
- last Meta verification time/error
- business contacts
- business templates
- business automations
- business messages

Admin can approve, reject, suspend and reactivate businesses. Raw access tokens, App Secret and webhook secret are intentionally never returned to the admin UI.

## In-app Meta Embedded Signup

Business Owner > WhatsApp Business > Meta Embedded Signup now opens a real in-app WebView instead of an explanation-only sheet.

Flow:

1. Flutter requests a short-lived purpose-bound Embedded Signup session from GreetSync backend.
2. Backend returns an in-app onboarding URL.
3. Flutter loads the URL in WebView.
4. The screen runs Meta/Facebook JavaScript SDK Embedded Signup using the configured `config_id`.
5. The business authenticates directly on Meta's login UI.
6. User selects/creates Business Portfolio + WABA + WhatsApp phone number and grants permissions.
7. Meta returns an authorization code and WABA/Phone Number mapping.
8. GreetSync backend exchanges the authorization code using the platform Meta App Secret.
9. Backend stores the resulting business access token encrypted with AES-256-GCM.
10. WABA ID, Phone Number ID, Meta Business ID and verified phone information are stored against the logged-in GreetSync business.
11. GreetSync tests the phone connection using Meta Graph API.
12. App attempts to subscribe the WABA to the platform app for webhooks.
13. Flutter connection state becomes CONNECTED or CONNECTION_ERROR. Saved credentials are never deleted on verification error.

## Required platform Meta configuration

Add these platform-level values to backend `.env`:

```env
META_PLATFORM_APP_ID=YOUR_META_APP_ID
META_PLATFORM_APP_SECRET=YOUR_META_APP_SECRET
META_EMBEDDED_SIGNUP_CONFIG_ID=YOUR_EMBEDDED_SIGNUP_CONFIG_ID
META_GRAPH_API_VERSION=v21.0

# Required for secure encrypted storage
CREDENTIAL_ENCRYPTION_KEY=use-a-long-random-production-secret
AUTH_TOKEN_SECRET=use-another-long-random-production-secret
```

These are platform onboarding values. Per-business WhatsApp access tokens/WABA/Phone Number IDs are NOT loaded from environment variables. They are stored per business in PostgreSQL after onboarding.

## Credential access in the app

The business owner can see and manage:

- Meta App ID
- WABA ID
- Phone Number ID
- business WhatsApp number
- Graph API version
- masked access token
- masked App Secret
- masked webhook verify token
- Meta connection state

Manual Credential Setup remains available for POC/manual connection. It saves first and verifies second.

Sensitive values are never returned in full after storage. The owner can replace them by entering a new value.

## Automation use

The existing worker already resolves WhatsApp credentials by `ownerUserId` before every send. Therefore an automation created by Business A uses Business A's encrypted access token and Phone Number ID. It cannot use Business B's connection.

## New/expanded API endpoints

Admin:

- `GET /api/admin/businesses/:id/resources`
- `GET /api/admin/contacts`
- `GET /api/admin/templates`
- `GET /api/admin/automations`
- `GET /api/admin/messages`
- `GET /api/admin/reports`

Embedded Signup:

- `POST /api/whatsapp/embedded-signup/session`
- `GET /meta/embedded-signup?token=...`
- `POST /api/whatsapp/embedded-signup/complete`

## Flutter dependency

`webview_flutter` was added for the in-app Meta Business Login/onboarding page.

After extracting the project run:

```bat
cd D:\Aikyam\project
run-greetsync-android-dev.cmd
```

The runner executes `flutter pub get`, so the WebView package will be installed automatically.

## Verification note

The source was checked for balanced Dart delimiters and the new API routes are present. This environment does not contain Flutter/Dart SDK, so a real Android compilation was not executed here. The live Meta authorization itself requires a correctly configured Meta App and Embedded Signup Configuration ID in Meta Developer / WhatsApp Manager.
