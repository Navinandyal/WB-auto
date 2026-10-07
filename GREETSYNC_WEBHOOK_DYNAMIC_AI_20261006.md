# Webhook checks and simplified AI template form

Current package: mobile **1.0.3+4**, backend build **`webhook-fields-dynamic-ai-20261006`**. This ZIP contains the updated source and all previous import samples; it is not an APK.

## What the screenshot proves

The 4:21 PM screenshot shows an accepted birthday request with a WhatsApp message ID and **no recorded sent/delivered/read/failed receipt**. The notice is a pending status, not a Meta rejection code. It cannot prove whether the recipient received the message, and it cannot identify which webhook setting is wrong. The app already has the previous reason panel, so this is not explained by an old app lacking that panel.

Read-only checks during this update found the production health endpoint running `guided-ai-drafts-delivery-reasons-20261006`. Both `/webhooks/whatsapp` and `/api/webhooks/whatsapp` returned HTTP 403 to an intentionally incorrect verification token, confirming that both verification handlers are reachable and reject a wrong token. This does not validate your actual token, App Secret, WABA subscription, messages field or real POST delivery. No authenticated production credentials or callback logs were available here.

## Exact settings to use

| Setting | Value |
| --- | --- |
| Meta callback URL | `https://wishflow-backend-production.up.railway.app/webhooks/whatsapp` |
| Railway `PUBLIC_BASE_URL` | `https://wishflow-backend-production.up.railway.app` |
| Meta webhook object | `whatsapp_business_account` / WhatsApp Business Account |
| Required status field | `messages` |
| Verify Token | Exactly the same value saved as **Webhook Verify Token** in GreetSync, or the platform `META_WEBHOOK_VERIFY_TOKEN` when using that platform token. |
| App ID / App Secret | The matching credentials from the Meta app that issued this business's WhatsApp token. App Secret is used to verify signed POST updates; it is different from Verify Token. |

If the URL already matches, keep it and check the field/token/App Secret. The older `/api/webhooks/whatsapp` path remains supported; switching between these two paths alone will not repair an unsubscribed messages field or invalid signature. Do not change the stable credential encryption key during deployment, since existing encrypted credentials depend on it.

1. Deploy this backend and confirm `/api/health` reports `webhook-fields-dynamic-ai-20261006`. Rebuild/install the mobile app source.
2. In the correct Meta App Dashboard, open **WhatsApp → Configuration**, or **Webhooks → WhatsApp Business Account**, according to the dashboard layout. Enter the callback URL above and the saved matching Verify Token. Select **Verify and save**.
3. Under webhook fields, explicitly subscribe to **messages**. This field includes message status updates. Keep the other existing Coexistence and template fields as needed; the new app check does not rewrite shared app settings.
4. In GreetSync → More → WhatsApp Business, confirm the business's WABA ID, Phone Number ID, Meta App ID/App Secret and Verify Token. Choose **Verify & repair / Test connection**. This subscribes the correct WABA and verifies the saved callback override after checking that the phone belongs to it.
5. Read the result. A missing/inactive messages field, rejected app credentials or missing/wrong callback override gives an actionable failure. If Meta does not permit the read-only app-field check, the result explicitly says the field is **unverified** and asks for a manual dashboard check. It does not invent a successful verification.
6. Send one approved template to an opted-in test contact, then check Automation details. A signed status callback should update the real status or expose the actual Meta delivery failure. Merely pressing Refresh cannot create a callback that Meta did not send to this server.

The Meta dashboard's sample webhook test can prove routing, but its fake message ID does not prove delivery of an actual GreetSync message. Existing pending attempts remain pending unless their own real status callbacks arrive. Correcting the configuration cannot reconstruct a receipt never received, and the app does not automatically send another copy.

## Code fixes

The connection test previously checked phone ownership, subscribed the WABA and confirmed the app ID, but did not verify the returned callback override or app-level messages field. A successful subscription POST could therefore be reported as ready with missing routing/field evidence.

The updated code reads back the WABA subscription and requires its saved `override_callback_uri` to match this backend. It also reads the app subscription settings with server-only credentials. Missing/inactive messages, or rejected app credentials, cannot claim readiness. Permissions, incomplete responses and network errors remain explicitly unverified rather than falsely reported as a missing field. Existing send-time setup warnings remain non-blocking for a legitimate send and are stored for its reason panel.

Admin configuration previously preferred `META_PUBLIC_BASE_URL` while delivery configuration preferred `PUBLIC_BASE_URL`. These now use the same precedence, avoiding a stale secondary URL being shown to the administrator. Admin output now advertises the canonical `/webhooks/whatsapp` path; both old and canonical GET/POST routes remain supported.

The mobile Test connection action now displays the backend's actual result instead of a fixed success toast. Awaiting delivery uses an informational blue style. The duplicate orange generic waiting notice is omitted when the detailed reason panel is available. Actual error details and genuine sent/delivered/read/failed states remain based on provider evidence.

## AI form changes

- Removed the **recipient name, school/organization, age and achievement** inputs, including their local draft fields.
- Removed the separate **Brain/business-name heading** inside Create with AI. The saved business identity still supplies the correct AI context and closing; it is not hardcoded as Brain for other businesses.
- **Purpose, tone and audience** now accept typed custom values and offer suggestions. For example: purpose “Annual alumni reunion”, tone “Warm and celebratory”, audience “Alumni and their families”. Each is limited to 120 characters.
- Known purpose suggestions retain their corresponding generation rules. Custom purposes use Other internally with the actual purpose label supplied to AI. Birthday keeps the earlier 60–120-word guidance and reusable customer-name variable.
- Language/attachment choices, small change note, regenerated preview, manual editing, draft/discard navigation protection and the Draft/Submit approval popup remain available. Legacy backend clients may still send the former optional recipient fields; this app no longer sends them from the form.

## Verification

Passed **93 backend tests**, **18 isolated PostgreSQL scenarios**, **22 executable Dart draft/prompt checks**, TypeScript checking and the production Vite/esbuild build. Offline analysis of the four changed mobile source files and Dart check returned **0 errors and 0 warnings**, with **116 lint/deprecation information items**. New cases cover read-only app field checks, inactive/missing/incomplete/denied responses, rejected app credentials without secret leakage, stale overrides despite successful subscription, and custom AI descriptions with owner isolation.

External requests in automated tests are mocked. The database harness uses the production schema and callback handler with PGlite. No live Meta settings were modified, message was sent, authenticated message logs were accessed, new backend deployed, APK built, native plugin/widget executed or real AI generation performed. On a phone, verify typed and suggested AI values, restoration after draft save, preview/regeneration/approval, the new connection result, and real signed delivery/failure callbacks after configuring Meta.

## Primary references

- Meta's official WhatsApp collection: [Webhook payloads and status meanings](https://www.postman.com/meta/whatsapp-business-platform/folder/vzaxn16/webhook-payload-reference).
- Meta's official collection: [Embedded Signup, WABA callback overrides and reading the saved override](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup).
- Meta Graph API: [App subscriptions reference](https://developers.facebook.com/docs/graph-api/reference/app/subscriptions/). This page returned a rate-limit response during this work; the implementation treats unsupported/unreadable app-setting responses as unverified and retains the manual dashboard check.
