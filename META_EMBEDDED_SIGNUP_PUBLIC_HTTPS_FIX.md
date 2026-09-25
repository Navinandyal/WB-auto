# Meta Embedded Signup public HTTPS fix

The previous mobile flow could render the WishFlow signup helper page through `127.0.0.1:3000` using ADB reverse, but Meta/Facebook Business Login is not a reliable OAuth/Embedded Signup origin on that local HTTP address. The result can be a blank or indefinitely loading Chrome page after **Continue with Meta**.

## Fixed architecture

1. Super Admin configures the WishFlow Meta Developer App once.
2. Admin also configures a **Public HTTPS Backend URL**, e.g. `https://api.wishflow.example.com`.
3. The business app requests `/api/whatsapp/embedded-signup/session`.
4. The backend creates a short-lived signed signup session and returns a URL on the configured HTTPS origin.
5. Chrome opens the public HTTPS WishFlow page.
6. The page loads Meta's official JavaScript SDK and calls Embedded Signup with the configured `config_id`.
7. The business owner signs into their own Meta account and selects their own Business Portfolio, WABA and phone number.
8. WishFlow receives the authorization code + WABA/phone mapping, exchanges the code server-side, encrypts the resulting token and stores it against that business.
9. The Flutter screen polls `/api/whatsapp/connection` and returns to Connected when the backend has persisted the connection.

## Required Meta dashboard setup

The host/domain from **Public HTTPS Backend URL** must be added to the Meta Developer App where required (App Domains / allowed JavaScript SDK domains / Business Login or Embedded Signup configuration). The URL must be HTTPS and publicly reachable from Meta and the phone browser.

Do not use these as the Meta signup origin:

- `http://127.0.0.1:3000`
- `http://localhost:3000`
- a private LAN IP

For local development use a stable HTTPS tunnel/custom development domain that points to port 3000, then register that exact domain in the Meta app.

## Credential handling

Business-specific WABA ID, Phone Number ID and access token remain tenant-isolated. Sensitive credentials are encrypted server-side and are not returned raw to Flutter after persistence.
