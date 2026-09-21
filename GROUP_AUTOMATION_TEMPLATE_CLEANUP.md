# Group Automation + Template Cleanup Update

## Group audience in Create Automation
- Existing contact groups are displayed in Step 1 of Create Automation.
- Selecting a group expands the group to all WhatsApp opted-in members in one tap.
- The selected group names and final recipient count are shown in Review.
- Individual contacts can still be added/removed alongside group selection.

## Approved Birthday template
The Birthday template supplied by the user is treated as the approved reference template:
- Name: `birthday`
- Category: `MARKETING`
- Language: `en_US`
- Status: `APPROVED`
- Body: `Happy Birthday {{1}}! 🎂🎉 Wishing you a wonderful celebration and a fantastic year ahead filled with happiness, health, and success! Warmest regards from our team.`

Older `birthday` / `happy_birthday_wishes` copies are upgraded from `PENDING_APPROVAL` to `APPROVED` on backend startup so an old pending row does not continue appearing in the mobile UI.

## Demo templates removed
Legacy platform placeholder templates are no longer seeded. The local fallback template list is empty and the old seed-default endpoint is disabled.

Legacy seeded records from older builds are removed on backend startup. Real templates synced from the logged-in business's Meta account continue to be supported.

## Birthday scheduler
The birthday scheduler no longer depends on a hard-coded template ID. It resolves the approved Birthday template dynamically, avoiding references to deleted demo templates.
