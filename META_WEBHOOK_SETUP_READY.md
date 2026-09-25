# Meta Webhook Setup — Ready Build

This build fixes Meta webhook verification for WishFlow.

## What changed

- One platform-level Meta webhook verify token is generated automatically using 32 cryptographically random bytes.
- The token is encrypted before storage in `platform_meta_settings.webhook_verify_token`.
- Super Admin → Settings → Meta Platform Setup displays the exact token required by Meta.
- Super Admin can regenerate the token at any time.
- `GET /api/webhooks/whatsapp` verifies Meta's `hub.verify_token` and returns the exact `hub.challenge` as plain text with HTTP 200.
- `POST /api/webhooks/whatsapp` remains the receiver for real WhatsApp delivery/status webhooks.

## Meta Production Setup

In Meta → Connect on WhatsApp → Basic setup → Step 2 Production setup → Configure Webhooks:

- Callback URL: copy **Meta Webhook Callback URL** from WishFlow Admin Settings.
- Verify token: copy **Meta Webhook Verify Token** from WishFlow Admin Settings.
- Keep client certificate disabled unless you intentionally configure mutual TLS.

Then press **Verify and save**.

## Manual verification test

Before pressing Verify and save, open this URL in a browser, replacing the placeholders with the values shown by WishFlow:

`<CALLBACK_URL>?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=12345`

The response body must be exactly:

`12345`

If ngrok changes its public hostname, restart WishFlow/ngrok and use the newly displayed callback URL.
