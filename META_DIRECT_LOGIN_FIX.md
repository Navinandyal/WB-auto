# Meta Embedded Signup - Direct Facebook Login Fix

## What was broken
The previous local flow first opened a GreetSync helper page and then loaded `connect.facebook.net/sdk.js`. Browsers with tracking protection (especially Brave Shields) can block that SDK, leaving the page stuck at **Loading Meta...**.

## What changed
GreetSync no longer depends on the Facebook JavaScript SDK for the initial login button. The backend now creates a **Facebook Login for Business OAuth URL** directly and Flutter opens that URL in the phone browser.

Flow:

1. Business owner taps **Continue with Meta**.
2. GreetSync backend creates a short-lived tenant-bound `state` token.
3. Browser opens `facebook.com/.../dialog/oauth` directly with the GreetSync App ID and Embedded Signup Configuration ID.
4. Meta shows the business-owner login/onboarding flow.
5. Meta redirects to the exact HTTPS callback shown in Admin Settings.
6. Backend exchanges the authorization code for that business's Business Integration/System User token.
7. Backend resolves the WABA from token grants (`debug_token`), with a business/WABA enumeration fallback.
8. Backend resolves the selected WhatsApp phone number from the WABA.
9. Access token and secret values are encrypted and stored against the logged-in GreetSync business.
10. The existing automation worker uses that business's stored Phone Number ID + decrypted token when sending messages.

## Required Meta configuration
Create the configuration under **Facebook Login for Business** using the **WhatsApp Embedded Signup** login variation. For the intended server-side automation flow use:

- Access token: **System-user access token**
- Asset: **WhatsApp accounts**
- Permissions: `whatsapp_business_management` and `whatsapp_business_messaging`

Do not create a generic configuration for Pages, Ads, Pixels or Instagram for this WhatsApp-only onboarding flow.

## ngrok / local development
Run:

```bat
ngrok http 3000
```

GreetSync auto-detects the active HTTPS tunnel. In **Admin -> Settings -> Meta Platform Setup**, the app now displays the exact **Meta Valid OAuth Redirect URI**, for example:

```text
https://xxxx.ngrok-free.app/meta/embedded-signup/callback
```

Copy that exact URL into the Meta Developer App's valid OAuth redirect URI configuration. If your ngrok hostname changes, update the Meta redirect URI as well.

## Security
The Facebook password is entered only on Meta. GreetSync stores the resulting business access token encrypted on the backend and never asks the user to paste it manually during normal Embedded Signup.
