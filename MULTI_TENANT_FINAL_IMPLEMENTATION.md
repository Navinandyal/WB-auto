# GreetSync — Final Multi-Tenant WhatsApp Architecture

## What is implemented

Each approved business owner is an isolated GreetSync tenant. In the current schema, the business tenant key is the `users.id` of the `BUSINESS_OWNER`; business-owned tables use `owner_user_id` as the tenant foreign key.

Each business has its own:

- GreetSync login
- Meta/Facebook onboarding session
- WhatsApp Business Account (WABA)
- Phone Number ID and business WhatsApp number
- encrypted access token / app secret / webhook token
- contacts and groups
- Meta templates
- automations
- message logs

The Super Admin can monitor and operate every tenant from admin-only APIs and screens, but message delivery always resolves credentials by the automation's owning business. The Super Admin's own credentials are never used to send a tenant's messages.

## Isolation rules

Normal business API requests derive the tenant from the authenticated access token. The mobile app does not submit an arbitrary business id for tenant-owned CRUD operations.

Server-side ownership checks now cover contacts, groups, templates, bulk sends and automations. The worker also verifies that the automation, contact and template all have the same owner before a message is sent.

## WhatsApp credentials

`whatsapp_accounts.owner_user_id` is unique, so one active WhatsApp connection is stored per business in the current POC. Sensitive fields are encrypted server-side.

Logout revokes only the GreetSync login session. It does not delete the business WhatsApp connection. When the same business logs in again, its saved connection is loaded from PostgreSQL.

## Super Admin controls

Admin can:

- view every business and owner
- approve, reject, suspend and reactivate businesses
- inspect tenant contacts, templates, automations, messages and activity
- inspect WABA / Phone Number ID / display number / verification state
- see whether secrets are securely stored (without revealing raw secrets)
- test a business's WhatsApp connection
- force template sync for a business
- run-now, pause, resume or cancel a business automation

All these operations use the selected business tenant's credentials/data.

## Important API paths

Business:

- `GET /api/whatsapp/connection`
- `PUT /api/whatsapp/connection`
- `POST /api/whatsapp/connection/test`
- `POST /api/whatsapp/templates/sync`
- `POST /api/automations`
- `POST /api/whatsapp/send-bulk`

Admin:

- `GET /api/admin/businesses`
- `GET /api/admin/businesses/:id`
- `GET /api/admin/businesses/:id/resources`
- `POST /api/admin/businesses/:id/whatsapp/test`
- `POST /api/admin/businesses/:id/templates/sync`
- `POST /api/admin/automations/:id/run-now`
- `POST /api/admin/automations/:id/pause`
- `POST /api/admin/automations/:id/resume`
- `POST /api/admin/automations/:id/cancel`

## Security notes

The Admin UI deliberately does not return raw access tokens, app secrets or webhook secrets. It displays whether each value is stored. Raw secrets remain encrypted at rest and are decrypted only on the backend when Meta calls are performed.

## Migration

Run the existing migration process after updating the project:

```bat
npm run db:migrate
```

The added migration creates tenant indexes and uniqueness rules for contact phone numbers and group membership.
