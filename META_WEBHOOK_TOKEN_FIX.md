# Meta webhook verification fix

WishFlow now uses one platform-level webhook verify token for the Meta Developer App.

- Admin Settings displays the current token.
- The token is generated with 32 random bytes and stored encrypted in PostgreSQL.
- `GET /api/webhooks/whatsapp` validates `hub.verify_token` and returns `hub.challenge` as plain text.
- `POST /api/webhooks/whatsapp` continues to receive message status events.
- Use the callback URL and verify token shown in Admin Settings in Meta Production Setup.
