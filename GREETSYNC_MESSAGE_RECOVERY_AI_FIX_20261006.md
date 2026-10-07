# GreetSync message recovery and AI fix — 6 October 2026

This source update addresses the two latest screenshots: the birthday message stuck at **Awaiting delivery**, and the AI generator returning **The AI service is unavailable**. Android source version: **1.0.1+2**. Deploy the backend and build/install the mobile app together.

## What the investigation established

The birthday template header/body payload in the current sender matches the earlier package. Changing the status label does not itself stop a message from arriving. The earlier code could label a successful API acceptance as SENT before a delivery receipt; the updated app waits for actual WhatsApp status events.

There was a concrete gap in delivery setup: subscribing the business account did not explicitly bind its callbacks to this GreetSync backend. A stale/default Meta app callback could therefore leave activity pending. The repair now sets the WABA callback override and verification token, checks phone ownership and the subscribed app, and prefers the permanent production environment URL over a saved old tunnel. Direct sends and scheduled sends repair this setup before sending, with a short cache to avoid repeated subscription requests. A setup problem shows a warning in the message details and does not block a valid messaging-only token.

The screenshot alone cannot prove whether that particular message was held, rejected later, delivered without a received callback, or sent through a different deployment. Production Meta responses, delivery receipts and backend logs were unavailable. This package does not change pending messages to Delivered without evidence.

## Delivery changes

- Text, image, video, document, location and Flow templates use the shared sender. Birthday header/body variables retain their original values. Video/PDF attachment verification from the previous package remains in place.
- Every new direct or scheduled attempt carries an owner/activity correlation value. A signed callback can recover the WhatsApp message ID after an uncertain request timeout, without posting the message again. Early callbacks are retained for retry.
- A POST connection failure is recorded as an unknown outcome awaiting a callback, rather than an automatically retryable failed send. There is no automatic resend.
- Meta's held-for-quality-assessment or paused response is explained in the activity. New attempts from those pending states are blocked; investigate them in WhatsApp Manager first.
- Real SENT, DELIVERED and READ callbacks update both the message and activity, clear stale uncertainty notes, and preserve receipt timestamps and business isolation. Send-request replay also works after JSONB key ordering or receipt metadata changes.
- Scheduled messages record execution completion after the send response. Birthday Send Now opens the normal reviewed composer, including variables, media and preview. The legacy birthday API also creates tracked activity and enforces consent, quota and approved-template values.

## Send a message again

1. Update the backend and app. In WhatsApp connection settings, save the correct Phone Number ID, WABA ID, matching Meta App ID/App Secret, access token and verification token, then run **Test connection**. Keep the Meta app's WhatsApp **messages** webhook field subscribed; a WABA callback override does not configure that app field.
2. Open **Scheduled Messages → message details**. Read the latest delivery state and any Meta failure or setup warning. A recipient who has already received the message should not receive another attempt.
3. Choose **Review & send again**. For Awaiting delivery / Sent, wait at least five minutes and explicitly confirm you checked the recipient and accept the possibility of a duplicate. A delayed original can still arrive later.
4. Review the original recipient, approved template, variables, preview and attachment/location in the normal composer. Re-upload an expired video/PDF. Choose **Send now** when ready.

The new attempt has its own history entry linked to the original. Delivered/read messages cannot use this recovery flow. The backend rechecks the source state and recipient when a new attempt is created. Old missing receipts cannot reliably be reconstructed by polling WhatsApp; repair callbacks for future events and use the reviewed flow where appropriate.

## AI generator changes and setup

The generator now uses Google's REST API directly, with a server-only key header, structured JSON output, a bounded timeout and no automatic quota retries. `GEMINI_TEMPLATE_MODEL=auto` selects a supported text Flash model returned by this key's model list, rather than assuming one fixed model is available to every project. Explicit model overrides remain supported.

On the Railway **backend** service set:

```dotenv
GEMINI_API_KEY=your_active_Google_AI_Studio_key
GEMINI_TEMPLATE_MODEL=auto
PUBLIC_BASE_URL=https://your_current_backend_domain
```

`GOOGLE_API_KEY` is also accepted. Keep keys out of the mobile app. Update a manually pinned previous model to `auto` if it is unavailable to your project. The Windows setup script uploads the backend key and migrates its previous `gemini-3.8-flash` installer default to `auto`; other model overrides are preserved.

In **Templates → AI Template Generator**, press **Check AI connection**. It verifies the key can access a supported model's metadata; it does not generate content or prove generation quota is available. Then generate one short business message. Errors now distinguish missing/rejected keys, permissions, unavailable models, quota/billing, DNS/network, TLS, timeout, blocked prompts and incomplete output. Existing editor content is retained. A failure reference shown in the app matches a safe backend log record without printing keys or prompts.

## Confirm the deployment

Open your backend's `/api/health`. This version returns:

```json
{"build":"delivery-recovery-ai-rest-20261006"}
```

This is the build field within the normal health response. If it is missing or different, the mobile app is reaching an older backend. Deploy this backend, then rebuild using the existing production setup/build instructions and the correct API base URL. Installing only a new APK does not update server fixes.

## Validation and limits

See `TEST_REPORT.md` for this package's checks. Automated Meta/Google transport tests use mocks; database tests execute the production schema and webhook handler in an isolated PostgreSQL engine. No real message was sent, no actual Google key was tested, no production deployment was performed, and no APK/device test was available here. The ZIP contains source, existing Excel/CSV import samples and setup instructions. Existing account data and secrets must remain in your deployment.

Primary API references used for the implementation:

- [Meta WABA subscribed apps and callback overrides](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/subscribed-apps-api)
- [Meta message status callbacks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status)
- [Google Gemini models list/get](https://ai.google.dev/api/models)
- [Google Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
