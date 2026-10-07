# GreetSync Meta Direct Browser Login Flow

## Why this build exists

The previous Embedded Signup page waited for `https://connect.facebook.net/en_US/sdk.js` before enabling the Meta button. On some phones/networks this script never becomes available, leaving the page permanently on **Loading Meta...** even in Chrome.

This build removes that dependency from the customer launch page. The customer taps **Continue with Facebook / Meta** and GreetSync performs a full-page redirect to Meta's own Facebook Login for Business authorization dialog using the configured Meta App ID and Login for Business / Embedded Signup Configuration ID.

## Flow

1. The authenticated GreetSync business owner creates a one-time signup session.
2. GreetSync opens the public HTTPS `/meta/embedded-signup/start` page.
3. The page immediately shows **Continue with Facebook / Meta**; it does not download the Facebook JavaScript SDK.
4. Clicking the button redirects to Meta with:
   - `client_id` = GreetSync provider App ID
   - `config_id` = provider Login for Business / Embedded Signup configuration ID
   - `response_type=code`
   - `override_default_response_type=true`
   - exact HTTPS GreetSync callback URI
   - cryptographically random `state`
5. The business owner authenticates on Meta and completes the WhatsApp business authorization allowed by the configuration.
6. Meta redirects to `/meta/embedded-signup/callback` with a short-lived authorization code.
7. GreetSync validates `state`, exchanges the code server-side with the provider App Secret, and never exposes the resulting token to Flutter/browser JavaScript.
8. GreetSync discovers the granted WABA/phone using token granular scopes and Business/WABA Graph API edges.
9. The business access token is encrypted and saved against that GreetSync business only.
10. GreetSync tests the phone-number connection, subscribes the WABA to webhooks, syncs real templates, and marks the signup session `CONNECTED`.
11. The mobile app is already polling the signup session, refreshes the WhatsApp account state, and automation can use that business's stored credentials.

## Meta-side requirements

The provider Meta app must still be configured correctly. Code cannot bypass Meta app availability rules. For normal external Business A / Business B accounts, the provider app/configuration must be allowed for those users (for example published/live and with required access/review according to Meta's current requirements). If Meta shows **App not active**, that must be resolved in the Meta Developer dashboard.

The exact HTTPS callback URL used by the active ngrok tunnel must be accepted by the Meta Login for Business configuration. Free ngrok hostnames can change between runs.

## Tenant isolation

A business owner's token, WABA ID and Phone Number ID are stored against that business/user. Admin can inspect/manage all businesses, but sending always resolves credentials from the automation's owner business.
