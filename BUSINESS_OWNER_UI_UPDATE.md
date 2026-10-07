# GreetSync Business Owner Mobile UI Update

This build redesigns the Flutter business-owner experience using the supplied green WhatsApp-business mobile references while keeping all functional data connected to the existing GreetSync backend.

## Business owner navigation

- Home dashboard
- Contacts
- Templates
- Automations / scheduled messages
- More / profile / WhatsApp configuration

The shell now uses an `IndexedStack`, so switching bottom-navigation tabs does not recreate the current tab every time. This also avoids the repeated refresh/flicker behavior caused by rebuilding pages during navigation.

## Real data only

No dashboard counts, contacts, templates or scheduled messages were hardcoded. Screens use the existing providers and REST endpoints:

- `/api/dashboard/stats`
- `/api/contacts`
- `/api/whatsapp/templates`
- `/api/automations`
- `/api/wishflow/summary`
- `/api/whatsapp/account`

## Input validation

### Contacts
- Full name required, 2-80 valid name characters
- Indian mobile required, exactly 10 digits and must start with 6/7/8/9
- App submits E.164 format (`+91xxxxxxxxxx`)
- Date of birth uses a date picker and cannot be in the future
- Notes limited to 500 characters
- Explicit WhatsApp consent toggle
- Birthday automation toggle

### Automation
- Requires an opted-in contact
- Requires an approved WhatsApp template
- Schedule must be a future date/time
- Template variables are converted to numbered variables expected by the current backend

### WhatsApp configuration
- Phone Number ID required and numeric
- Meta App ID / WABA ID numeric when supplied
- Access token required on initial setup and basic length checked
- Graph API version must use format such as `v21.0`
- Secrets remain backend-encrypted and are not stored as plain text in Flutter

## UI

The business portal now follows the supplied design language:

- green GreetSync Business branding
- white cards and soft green surfaces
- mobile-first bottom navigation
- business header/avatar
- metric cards
- search and filter chips
- full-page contact add/edit/details flows
- template list/details
- scheduled-message list/details
- step-based automation creation
- profile/settings menu
- WhatsApp configuration screen

The admin portal and admin authorization logic remain separate from the business-owner portal.
