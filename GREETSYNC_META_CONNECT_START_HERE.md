> Hosting update: use [RENDER_SUPABASE_START_HERE.md](RENDER_SUPABASE_START_HERE.md). The Railway instructions below are historical.

# GreetSync — Facebook / WhatsApp business connection

## What was fixed

The screenshot's “Meta SDK could not load” error was caused by GreetSync's own page security policy blocking `connect.facebook.net`. The updated page allows the required Meta SDK and popup resources with a nonce-based policy. It includes retry and timeout handling and uses GreetSync branding throughout.

After Facebook authorization, the backend exchanges the authorization code securely, verifies that the token belongs to the configured app and has `whatsapp_business_management` and `whatsapp_business_messaging`, then retrieves the authorized WhatsApp business account and phone number. It saves the confirmed WABA ID, phone number ID, display number, verified name and available business/profile details. Browser-provided IDs are verified against Meta's responses. Tokens are encrypted and records remain bound to the signed-in GreetSync business owner.

The connection uses WhatsApp Business App Coexistence with Cloud API. It checks Meta's actual phone state (`is_on_biz_app` and `platform_type`); it does not register or migrate an existing Business App number. Webhook subscription is required. A contacts/history sync problem is reported separately without incorrectly marking an otherwise established connection as failed.

If Meta returns several eligible phone numbers, the owner selects a number from the fetched list. No manually typed WABA/phone ID or repeated Facebook login is needed. The temporary token is encrypted, tied to the protected session and cleared after completion/failure/expiry. Refreshing the selection page resumes the same protected session.

## Deploy this update on your Windows PC

1. Extract this complete project into `D:\Aikyam\project`. Keep your existing private `.env`, Firebase configuration, signing keys, `key.properties` and `.android-signing` files. The ZIP deliberately excludes private credentials and generated builds.
2. Open a terminal in that folder and run:

```bat
RUN_PRODUCTION_SETUP.cmd
```

This deploys the backend and builds/verifies `GreetSync-production.apk` using the existing configured Railway project and saved Railway login. It does not introduce an account selection menu. If Railway's saved authorization expires, Railway requires a login before deployment can continue.

Install the newly generated `GreetSync-production.apk` for the corrected default backend address. Use `-SkipApkBuild` only when you deliberately want a backend-only update; that flag does not build an APK. Existing Android verification/signing fixes and iPhone preparation files are preserved. This ZIP contains source, not a new APK or signed IPA.

## Configure your own GreetSync Meta app once

Use your own Meta App ID, App Secret and Facebook Login for Business configuration ID in the existing Admin Meta Platform settings or the corresponding server environment configuration. Do not use the reference provider's app/configuration ID. GreetSync controls its own connection page; Meta controls its hosted consent screens, whose provider name comes from your Meta app display name. Set that display name to GreetSync.

In Meta's Facebook Login for Business settings/configuration:

- Configure WhatsApp Embedded Signup with WhatsApp Business App Coexistence enabled and the applicable provider eligibility requirements met.
- Include `whatsapp_business_management` and `whatsapp_business_messaging`. `business_management` is only needed for the optional business-portfolio discovery fallback; it is not required when Embedded Signup returns the authorized WABA.
- Enable the relevant client/web OAuth, HTTPS, strict redirect, embedded browser and JavaScript SDK login settings described in Meta's implementation documentation.
- Allow your deployed backend domain for the JavaScript SDK and configure the appropriate domains/HTTPS URLs in Meta's fields. Do not configure localhost or an old ngrok domain for production.

For the currently configured deployment:

| Purpose | Value |
| --- | --- |
| Domain / hostname | `wishflow-backend-production-e75d.up.railway.app` |
| HTTPS origin | `https://wishflow-backend-production-e75d.up.railway.app` |
| GreetSync signup page | `https://wishflow-backend-production-e75d.up.railway.app/meta/embedded-signup/start` |
| Legacy callback, if used by your existing OAuth configuration | `https://wishflow-backend-production-e75d.up.railway.app/meta/embedded-signup/callback` |
| WhatsApp webhook | `https://wishflow-backend-production-e75d.up.railway.app/webhooks/whatsapp` |

The existing `/api/webhooks/whatsapp` webhook alias also works. Use the server's configured verification token and subscribe to the necessary WhatsApp message/status fields. The secure signup session URL is generated inside the app; opening the bare signup page without a session is not a valid test. The SDK code flow does not invent an OAuth redirect URI during token exchange.

**Meta must grant the required Advanced Access for other customers' business assets.** A code update cannot grant permission or bypass App Review. Until approval, test only with assets/accounts permitted by your app's current access and roles. Business verification, app mode and provider/Coexistence eligibility must also meet Meta's requirements.

## Check the real flow / permission-review demonstration

Open GreetSync as a business owner, choose Connect with Meta, continue with Facebook, select the intended business/WhatsApp Business App number and grant the requested permissions. Finish Meta's flow. GreetSync should show server-confirmed business/number details without asking for manual IDs. If multiple authorized numbers are available, choose from the fetched list. Return to the app and reopen the connection page to confirm the details persist; show the connected business's real templates to demonstrate management permission usage.

Use an actual authorized business for review recordings. The automated test fixtures are not App Review evidence. If Meta denies a scope, app access, asset or Coexistence eligibility, the page now reports the corresponding connection error instead of silently inventing account details.

## Verification and limits

- TypeScript check, production backend build and all **122 tests passed**.
- Database regression checks passed, including Coexistence and owner-scoped delivery behavior.
- A real Chromium browser loaded the updated page under its emitted security policy and completed the mocked SDK/authorization flow without JavaScript errors.
- Meta login/Graph responses were mocked for these checks. No live Meta consent, Railway deployment, physical-phone run or new APK build was performed here. Deploy the backend and test with your approved Meta app to verify real account access.

Official Meta documentation:

- [Embedded Signup implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation)
- [Coexistence / onboarding Business App users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [WhatsApp permissions](https://developers.facebook.com/documentation/business-messaging/whatsapp/permissions)
- [Provider App Review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review)
