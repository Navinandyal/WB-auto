# Meta Webhook Validation Fix — 30 Sep 2026

## Fixed
- Railway now receives `META_WEBHOOK_VERIFY_TOKEN` during production setup.
- The default token for this deployment is `GreetSync_Webhook_2026_AIKYAM_9x7K2mP4` unless an existing `.env` token overrides it.
- `GET /api/webhooks/whatsapp` accepts either the encrypted platform token saved in PostgreSQL or the explicit Railway environment token.
- Verification no longer generates a new random token during Meta's verification request.
- If no token is configured, the endpoint returns HTTP 503 with a clear message instead of silently changing the expected token.

## Meta values
Callback URL:
`https://wishflow-backend-production.up.railway.app/api/webhooks/whatsapp`

Verify token:
`GreetSync_Webhook_2026_AIKYAM_9x7K2mP4`

Client certificate: OFF.
