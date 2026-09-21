# WishFlow Authentication / Admin / Multi-Business Update

## Authentication

- Login uses mobile number + password only.
- No Google Sign-In, Firebase auth, OAuth login or demo-login bypass is used by the Flutter app.
- The platform administrator remains a fixed backend account configured with `ADMIN_MOBILE` and `ADMIN_PASSWORD`.
- Business users self-register from the Flutter login screen.
- New business accounts are created with `approval_status = PENDING`.
- A pending user receives a clear "waiting for admin approval" response and cannot obtain a session token.
- The admin can approve or reject registrations from the separate Admin Panel.

## Admin experience

Admin uses a separate blue/white WishFlow interface based on the supplied admin references. It is not the normal business-user dashboard.

Current admin mobile sections:
- Dynamic Dashboard overview
- Businesses / users + approval queue
- Global contacts view
- Global templates view
- Global automations view

All counters are returned from PostgreSQL APIs; there are no hard-coded dashboard totals.

## Business data isolation

New business data now carries `owner_user_id` for:
- WhatsApp account credentials
- Contacts
- Automations
- Messages

Business-user APIs scope records to the logged-in user. Admin monitoring routes can inspect global data.

## WhatsApp / automation credentials

WhatsApp credentials are no longer loaded from automation `.env` variables.

Flow:
1. Admin approves business account.
2. Business user logs in.
3. If WhatsApp is not connected, Flutter immediately shows the credential onboarding screen.
4. User enters their own Phone Number ID, Access Token, WABA ID and optional Meta app/webhook details.
5. Backend encrypts secret values with AES-256-GCM before storing them in PostgreSQL.
6. Worker resolves credentials for the owner of each automation before sending.

The only server secret related to this is `CREDENTIAL_ENCRYPTION_KEY`, which is an encryption key, not a WhatsApp credential.

## No demo business data

Demo contacts and sandbox credential presets were removed. Local fallback contact data is empty. Only the template starter set is retained, per requirement.
