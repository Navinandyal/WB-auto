# GreetSync UI, Reports, Notifications and Template Fix Update

## Implemented in this build

### 1. Admin Meta setup moved to Configuration
The large provider Meta configuration form is no longer kept inside the regular Admin Settings page.

Admin navigation now includes **Configuration**, containing:
- Meta App ID
- encrypted Meta App Secret
- Embedded Signup Configuration ID
- Graph API version
- HTTPS/ngrok origin override
- generated webhook verify token
- webhook callback URL
- Meta setup validation
- Open Meta for Developers

Admin Settings now focuses on profile, security/biometric login, theme, notifications, privacy/terms and logout.

### 2. Admin Reports & Analytics
The Reports page now loads live backend data and provides:
- businesses, contacts, messages and automation KPIs
- animated 7-day message trend graph
- delivery/read/failure ring visualization
- operational automation/template status
- top businesses by message volume
- template category breakdown
- refresh support

No static demo report numbers are used.

### 3. Contact groups below search
The Business Contacts page now shows existing groups directly underneath the search box.
- horizontal group cards
- group name and real member count
- Manage link
- empty group state

### 4. Navin template cleanup and birthday-template bug fix
For the Navin account/business, the Templates API/UI is restricted to:
- Hello World
- Birthday

The older demo templates are not exposed to that account and creation is hidden for that account.

Birthday sends no longer silently fall back to `hello_world`. Immediate birthday wishes locate the business owner's real Meta-approved Birthday template and send that template only. If the Birthday template is unavailable/not approved, the API returns an explicit error instead of sending the wrong message.

Scheduled automation template sends also keep the selected template and do not enable the Hello World fallback.

### 5. Notifications for Admin and Business users
A tenant-aware notification system was added.

Admin notifications include events such as:
- new business registration awaiting approval
- business automation/message failures

Business notifications include events such as:
- account approval/rejection/suspension changes
- automation scheduled
- message sent
- message failed

UI includes:
- notification bell + unread badge for Admin and Business
- Notifications screen
- mark one read
- mark all read
- refresh
- dynamic event icons/status styling

The backend creates the `notifications` table automatically. A migration is also included at `migrations/20260925_notifications_and_reports.sql`.

### 6. Redesigned Business Dashboard
The dashboard was redesigned around real tenant data with:
- personalized greeting
- WhatsApp connection hero/status
- total messages/contacts/scheduled metrics
- delivery progress
- delivered/approved-template/group/failed metric cards
- today's birthdays banner
- birthday multi-send entry point
- marketing/groups/CSV import/WhatsApp quick actions
- recent message activity
- upcoming scheduled messages

### Multi-tenant behavior
All business-owned records remain scoped to the logged-in owner. Admin reporting can aggregate platform-wide information, but business users only receive their own contacts, groups, templates, automations, messages and notifications.
