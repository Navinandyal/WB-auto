# WishFlow — Meta Embedded Signup Builder Flow

This build uses the Meta **Embedded Signup Builder Configuration ID** saved by the WishFlow Super Admin. It no longer constructs a generic Facebook OAuth URL for the normal business-owner connection flow.

## Provider configuration (one time)

In WishFlow Admin > Meta Platform Setup, save:

- Meta App ID
- Meta App Secret
- Embedded Signup Configuration ID created in Meta
- Graph API version
- HTTPS origin (production) or leave blank while `ngrok http 3000` is running locally
- generated Meta webhook verify token

Recommended Builder configuration:

- Login variation: WhatsApp Embedded Signup
- Access token: System-user access token
- Asset: WhatsApp accounts
- Permissions: `whatsapp_business_management`, `whatsapp_business_messaging`

The HTTPS hostname detected/shown in Admin Settings must be allowed for the Facebook JavaScript SDK / App Domains in the provider Meta app.

## Business-owner flow

1. Business owner logs into WishFlow.
2. Opens WhatsApp Business > Connect with Meta.
3. WishFlow creates a 15-minute tenant-bound signup session.
4. WishFlow opens an HTTPS page on the backend/ngrok origin.
5. That page loads Meta's JavaScript SDK.
6. The user presses Continue with Meta.
7. `FB.login()` launches the provider's Embedded Signup Builder using the saved `config_id`.
8. The user authenticates with their own Meta account and selects/creates their own Business Portfolio, WABA, and WhatsApp phone number.
9. Meta returns a short-lived authorization code to the page.
10. The page posts that code to WishFlow's backend over the same HTTPS origin.
11. WishFlow exchanges the code server-side using the provider App ID/App Secret.
12. WishFlow resolves the connected WABA and Phone Number ID, verifies the number, subscribes the provider app to the WABA where permitted, encrypts the business access token, and stores everything against the logged-in business tenant.
13. WishFlow immediately synchronizes real Meta templates.
14. The mobile app polls the tenant signup session and switches to Connected.

## Stored per business

The provider App ID/App Secret are platform settings. Each business receives separate stored WhatsApp data:

- WABA ID
- Phone Number ID
- display WhatsApp number
- Meta business ID when available
- encrypted Business Integration System User access token
- verified name
- quality rating
- connection status

A business logout does not delete these credentials. They are removed only by an explicit disconnect/revoke operation or if Meta invalidates authorization.

## Automation

Every automation is tenant-bound. When it runs, the backend loads the automation's business owner, decrypts only that business's token, uses only that business's Phone Number ID and approved templates, sends through WhatsApp Cloud API, and stores the resulting message IDs/statuses.

Super Admin can view/manage automations across tenants, but running a business automation always uses that business's own WhatsApp connection.

## Local development

Run the backend on port 3000 and expose it with HTTPS:

```bat
ngrok http 3000
```

WishFlow detects the ngrok HTTPS tunnel automatically. The Flutter API can still use `127.0.0.1:3000` through `adb reverse`; only Meta Embedded Signup needs the HTTPS origin.

If Brave blocks `connect.facebook.net`, the hosted signup page shows a warning. Turn Brave Shields off for the temporary ngrok page or open the page in Chrome.

## Meta app availability

The code path is ready for Embedded Signup. Meta still controls who may use the provider app. While the Meta app is in development/unpublished mode, Meta can restrict login to app-role/test accounts. To onboard normal external businesses, complete Meta's required provider/business verification, access review, and app publishing requirements for the WhatsApp Embedded Signup app.
