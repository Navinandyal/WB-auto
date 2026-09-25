# WishFlow Meta Business Login / WhatsApp Embedded Signup

This build implements a per-business Meta onboarding flow for WishFlow.

## What it does

1. Super Admin configures the WishFlow Meta Developer App once:
   - Meta App ID
   - Meta App Secret
   - Facebook Login for Business / WhatsApp Embedded Signup Configuration ID
   - Graph API version
   - optional public HTTPS base URL (ngrok is auto-detected for local development)
2. A business owner signs into WishFlow normally with mobile/password.
3. `Continue with Meta` creates a short-lived signup session in PostgreSQL and opens Meta/Facebook login in the external browser.
4. Meta returns an OAuth authorization code to `/meta/embedded-signup/callback`.
5. WishFlow exchanges the code server-side using the platform App Secret.
6. WishFlow discovers the WABA and phone number from the granted token, verifies the phone number, encrypts the access token, and stores it against the logged-in business owner only.
7. WishFlow subscribes the app to the WABA when allowed and immediately syncs that business's real message templates.
8. The mobile app polls the server-side signup session and switches to Connected when the callback completes.
9. Existing automation workers use the connected business's own encrypted access token and Phone Number ID.

## Per-business isolation

Each row in `whatsapp_accounts` is owned by `owner_user_id`. Business users never choose another tenant/business ID in normal APIs. Automations already resolve credentials by the automation owner.

## New database table

`meta_embedded_signup_sessions` tracks PENDING / CONNECTED / FAILED / EXPIRED signup sessions. The OAuth state is stored only as a SHA-256 hash.

## Local development

Keep the Node backend on port 3000 and run:

    ngrok http 3000

WishFlow detects the ngrok HTTPS URL from the local ngrok API. The exact redirect URI returned by Admin Meta Platform Settings must be registered in the Meta Developer App.

## Required Meta-side configuration

The code cannot create the external Meta Developer App or grant Meta permissions. In Meta, configure the WishFlow app for WhatsApp Embedded Signup / Facebook Login for Business and grant the WhatsApp management/messaging permissions required by the current Meta configuration. The redirect URI must exactly match WishFlow's displayed callback URL.

## Security

- Facebook password is never collected by WishFlow.
- Meta App Secret remains server-side.
- Business access tokens are encrypted before PostgreSQL storage.
- Mobile clients only receive masked credential values.
- Logout revokes WishFlow auth sessions but does not delete the saved WhatsApp connection.
