# WishFlow Update — Automation, Today Birthdays, Phone Contacts and Templates

## Business dashboard
- Shows the number of birthdays today.
- Shows the names and phone numbers of today's birthday contacts (up to five, with a remaining count).
- Shows a clear "No birthdays today" state when there are none.

## Contacts
- Added Android `READ_CONTACTS` permission.
- Added a Phone Contacts tab.
- The app requests device contact permission when the Phone Contacts tab is opened.
- Device contacts are displayed with name and phone number.
- A device contact can be saved to WishFlow.
- Imported device contacts are saved with WhatsApp consent disabled by default; the business owner must explicitly enable consent before automation/message sending.

## Templates
- Business users see at most two templates:
  1. Hello World
  2. Birthday
- If several birthday templates exist, an APPROVED one is preferred.
- Admin remains able to inspect the full template inventory.

## Automation creation
- Only opted-in contacts are selectable.
- Only Hello World and Birthday templates are shown.
- Non-approved templates are visible but disabled.
- Birthday template variable `{{1}}` is automatically populated with the selected contact's name.
- Backend validates template variables and future scheduling.
- Newly created automation status is QUEUE (`SCHEDULED` internally).

## Automation execution states
Business UI intentionally shows only:
- QUEUE
- MESSAGE SENT
- FAILED

`Run Automation` is available only while the internal status is `SCHEDULED`.
After a message is sent or fails, the run button is removed.
The backend also rejects attempts to rerun an automation that is no longer queued.

## Worker safety
- Forced execution now selects only `SCHEDULED` automations.
- A job whose lock cannot be acquired is not executed.
- Failed/completed automations are no longer automatically reset to SCHEDULED during server startup.
