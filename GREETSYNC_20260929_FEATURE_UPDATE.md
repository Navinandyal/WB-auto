# GreetSync – Business Packages, Billing & UX Update

This build implements the requested GreetSync business-user and admin changes while preserving the existing WhatsApp connection, templates, contacts, birthday automation, message history and Railway production workflow.

## Included changes

1. **GreetSync branding** – user-facing product/app branding is now GreetSync. Android display name, Flutter title, web title, Meta deep link and admin UI are updated. Legacy internal API/channel identifiers remain compatible where changing them would break existing installations.
2. **Business bottom navigation** – the business shell now has a larger center-docked **Create / Send Automation** action, with a notched bottom bar. This change is not applied to the admin shell.
3. **Today's dashboard** – business dashboard analytics are scoped to the current day (Asia/Kolkata) and show today's send/delivery/read/failure/schedule/contact activity plus package quota.
4. **Monthly profile analytics** – the business profile shows current-month sent, delivered, read, failed, automation and contact-added counts.
5. **10,000-row imports** – CSV and XLSX imports are supported with a strict maximum of 10,000 contact rows per file on both client and server.
6. **Admin package management** – admins can create/edit/disable BASE and MESSAGE_ADDON packages, including name, description, benefits, message/contact/automation limits, INR price, duration in months and enabled state.
7. **Package access locking** – businesses without an active base package are routed to Billing & Packages for protected actions. Server-side middleware independently enforces package access so UI locks cannot be bypassed.
8. **Message quota enforcement** – message usage and scheduled reservations are counted against the active plan. Bulk sends/automations that exceed the available quota are rejected with the exact over-limit count. MESSAGE_ADDON packages increase only the message allowance.
9. **Opt-in default** – new/manual/device/imported contacts default to WhatsApp opt-in ON unless explicitly set otherwise.
10. **Missing birthday prompt** – contacts without a date of birth display **Add birth date**.
11. **WhatsApp contact shortcut** – contact rows and details include a WhatsApp icon that opens `wa.me/<number>` in the external WhatsApp/browser handler.
12. **Billing & Packages page** – businesses can view active plan, validity, sent/scheduled/remaining messages, contact/automation usage, add-ons, available packages, six-month usage report and package history. Paid package requests remain pending until an admin activates them because this source build does not include an online payment gateway.

## Package behavior

- `BASE` unlocks business operations.
- `MESSAGE_ADDON` requires an active BASE package and increases the message count only.
- `message_limit = 0`, `contact_limit = 0`, or `automation_limit = 0` means unlimited for that limit.
- Free packages auto-activate. Paid packages create a pending admin activation request.
- An automation cannot be scheduled beyond the active package end date.
- Message quota is checked when scheduling and again before actual sending, including birthday send-now.

## Database

Package/subscription tables are initialized by the backend and are also included in:

`migrations/20260929_packages_billing.sql`

## Build

Run the existing one-click production workflow:

`RUN_PRODUCTION_SETUP.cmd`

For developer workflows, preferred branded helper names are also included:

- `run-greetsync-android-dev.cmd`
- `build-greetsync-release-apk.cmd`
