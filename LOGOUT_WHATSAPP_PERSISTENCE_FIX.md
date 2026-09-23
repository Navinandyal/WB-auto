# Logout + WhatsApp Credential Persistence Fix

## Expected behavior

Logout removes/revokes only the WishFlow authentication session:
- access JWT removed from the phone
- refresh token revoked on the backend
- refresh token removed from the phone
- authenticated user/business session cleared from Flutter

Logout does **not** delete the business WhatsApp connection.

The following remain stored against the same backend business/user record:
- Meta App ID
- WABA ID
- Phone Number ID
- connected WhatsApp number
- encrypted access token
- encrypted app secret
- encrypted webhook verify token
- connection/verification status

When the same business logs in later (including days later), Flutter invalidates any cached tenant data and reloads `/api/whatsapp/connection` from the backend. If credentials already exist, the app shows the saved/connected WhatsApp screen and does not ask for the token again.

Credentials are removed only if the user explicitly chooses **Disconnect WhatsApp** / deletes the WhatsApp connection.

## Security fix

Tenant-scoped Riverpod providers are invalidated on both login and logout. This prevents cached Business A data from being shown after Business B logs in on the same device.
