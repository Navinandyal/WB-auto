# Meta Setup + Logout Account Persistence Fix

## What changed

1. Meta Embedded Signup no longer requires you to edit `.env` for the platform App ID/App Secret/Config ID.
2. Super Admin can open **Admin → Settings → Meta Platform Setup** and save:
   - Meta App ID
   - Meta App Secret
   - Embedded Signup Configuration ID
   - Graph API version
3. The Meta App Secret is encrypted before it is stored in PostgreSQL.
4. Business owners can then open **WhatsApp Business → Connect with Meta** and complete Meta's actual Business Login flow in-app.
5. Each business's returned access token, WABA ID and Phone Number ID are stored against that business only. Sensitive token values remain encrypted.
6. Logout clears the authenticated session but keeps the last-used mobile number on the device, so the login screen remembers the account. It does not store the password.

## Important

GreetSync cannot invent valid Meta credentials. The Super Admin must create/configure a real Meta app and Embedded Signup configuration in Meta Developer/Business tools, then enter those values in Admin Settings.

The stored platform App Secret is used only by the backend during the authorization-code exchange. It is not returned in full to Flutter after saving.
