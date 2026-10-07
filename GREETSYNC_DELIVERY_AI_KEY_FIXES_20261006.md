# GreetSync delivery status and API key fixes — 6 October 2026

Read this first. This package includes the previous media validation, AI generator, profile changes, contact samples and removal of the failed-message Resend option. It contains source code, not an APK.

## Why the screenshot shows Awaiting delivery

Both supplied screenshots show an accepted message ID. Meta accepted the send request, but GreetSync has no confirmed recipient delivery recorded. This alone cannot tell whether the recipient received the message. A missing callback can leave a received message pending; a later failure callback can explain a message that did not arrive.

The gray blocked icon was an app defect. Pending acceptance now shows an amber hourglass. Confirmed Sent has a green check, Delivered has green double checks, and Read has blue double checks. Exact states appear in the list, details and activity history. The list and detail screen refresh pending states automatically, pause refreshes while the app is in the background, and keep the last confirmed detail during a refresh failure. The web history also displays and refreshes these states.

## Enable and check delivery updates

1. Deploy this backend and install a rebuilt mobile app. Updating only the APK will not fix server webhook handling.
2. Open More → WhatsApp Business → **Verify & repair delivery updates**. This checks the phone belongs to the saved WABA, subscribes the WABA to the token's app and confirms the configured Meta app is subscribed. Invalid/expired tokens, wrong WABA IDs and permission failures produce an error; the saved credentials remain available for correction.
3. In that Meta app's WhatsApp → Configuration, set the permanent HTTPS callback shown in the Delivery updates card, generally `https://YOUR-BACKEND/webhooks/whatsapp`. Verify it using your configured Webhook Verify Token. Subscribe the **messages** field. The WABA subscription and app callback configuration are both required.
4. Manual connections must have the matching Meta App Secret saved. Embedded Signup uses the platform app secret. The backend now verifies manual apps' signatures as well, with business/phone isolation. Unsigned and mismatched events remain rejected.
5. Send one approved text template to a consented test recipient, then a supported PDF/video. The card shows the last delivery status callback received for this phone and any queued processing error. A recorded callback is evidence of receipt, not a guarantee every future message will be delivered.

Callbacks update both the message and automation. Late/replayed Sent or Delivered events cannot downgrade Read or overwrite its timestamp. Timestamps are stored in UTC. Meta failure code and details appear in activity history. Accepted messages are not automatically resent. This repair does not recreate historical delivery reports Meta never supplied; existing pending sends remain pending until an actual callback arrives.

Embedded Signup still uses WhatsApp Business app + Cloud API Coexistence. Previously missing onboarding/sync fields are now included in the connection response, so the existing Coexistence card can show them.

## Fix the AI API key setup

The AI Template Generator uses a **Google AI Studio Gemini key**, separate from the Meta WhatsApp access token. Set `GEMINI_API_KEY` in the deployed Railway **backend service Variables**, then redeploy. `GOOGLE_API_KEY` is accepted when `GEMINI_API_KEY` is empty. If both exist, GEMINI_API_KEY takes precedence. Never enter a Gemini key in WhatsApp connection fields or compile it into the APK.

The setup script previously preserved GEMINI_API_KEY in local `.env` but did not upload it to Railway. It now uploads nonempty AI/Meta settings before deployment, accepts either local key name or a process environment key, and preserves `GEMINI_TEMPLATE_MODEL`. Empty local key values do not erase an existing Railway key. If you use the setup script, add the key to the local `.env` before running RUN_PRODUCTION_SETUP.cmd. If you skip deployment, update Railway Variables yourself.

The default model remains `gemini-3.8-flash`. For a Google project with different model access, set GEMINI_TEMPLATE_MODEL to an available text model supporting structured JSON output. The generator distinguishes missing key, malformed/wrong-provider key, Google-rejected or blocked key, permission restrictions, unavailable model, project billing/region setup, exhausted quota and timeouts. It shows the error persistently beside the generator without losing the prompt or existing draft. Surrounding quotes/whitespace are trimmed. SDK automatic retries are bounded to one attempt within the mobile request timeout. Configuration failures do not consume the app's hourly generation allowance.

A revoked, blocked or invalid key requires replacement in Google AI Studio; a code update cannot make such a key valid. Check project/API restrictions and usage/billing for permission or quota errors. No production credentials were supplied here, so a real-key Google request and live WhatsApp delivery were not tested.

## Validation

- TypeScript checking and production web/backend build passed.
- All 66 backend regression tests passed, including actual Gemini SDK requests with mocked invalid-key/quota responses and no repeated retries.
- All 12 PostgreSQL integration scenarios passed, including accepted → delivered → read, late callbacks, owner isolation, UTC timestamps with a non-UTC DB session, and delivery diagnostics.
- The three changed mobile screens were formatted and analyzed with zero errors or warnings using the available offline framework/package source setup. Existing lint/deprecation information remains.
- PowerShell changes were inspected, but the Windows/Railway setup script was not executed here. No production deployment, native Flutter dependency resolution, device UI test or APK build was performed. ZIP integrity and source inclusion were verified.

Official references: [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key), [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting), [Gemini models](https://ai.google.dev/gemini-api/docs/models), [Meta WABA webhook subscriptions](https://www.postman.com/meta/whatsapp-business-platform/folder/ozgs3jn/webhook-subscriptions), [Meta webhook signature handling](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/).
