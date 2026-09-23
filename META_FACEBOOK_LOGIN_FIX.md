# Meta/Facebook Login readiness fix

## What changed

- Admin Meta Platform Setup no longer misleadingly says `Loaded from: environment` when nothing is configured.
- Added `Validate Meta Setup` to check the WishFlow Meta App ID/App Secret with Meta before business owners use onboarding.
- Added explicit Embedded Signup readiness endpoint.
- Business-owner Meta screen now gives a clean platform-setup message rather than exposing raw environment variable names.
- Embedded Signup page now waits for the Meta JS SDK before enabling `Continue with Meta`, handles SDK load errors, and performs the authorization-code exchange on the WishFlow backend.
- After a business finishes Meta login, WishFlow stores that business's WABA ID, Phone Number ID, Meta Business ID and encrypted access token on the backend. Other businesses have separate records.

## Important: one-time platform requirement

Meta Embedded Signup cannot work without a Meta Developer App owned by the WishFlow platform. This is not a shared WhatsApp account. It is only the application that opens Meta's secure onboarding window.

Configure once as Super Admin:

1. Meta App ID
2. Meta App Secret
3. Embedded Signup Configuration ID
4. Graph API version

Then tap **Save Meta Setup** and **Validate Meta Setup**.

After that each business owner taps **Connect with Meta** and signs into their own Meta account. Their own WABA/phone/token are saved against their WishFlow business and are used by their automations.

## Security

- Facebook password is never collected by WishFlow.
- Meta App Secret is encrypted at rest.
- Each business access token is encrypted at rest.
- Business credentials are tenant-isolated.
- Logout does not delete the stored WhatsApp connection.
