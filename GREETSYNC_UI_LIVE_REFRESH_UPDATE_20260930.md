# GreetSync UI + Live Refresh Update — 30 Sep 2026

## Business Dashboard
- Removed the large package/plan hero card.
- Removed the Sent / Delivered / Read / Scheduled / Failed / Contacts metric grid.
- Added one compact quota card with only Messages sent and Messages available.
- Dashboard now focuses on today's birthdays and today's scheduled messages.

## Contacts
- Removed Saved / Opted In / Birthdays counters from the top.
- Added quick actions directly below Add: Import CSV/Excel, Manage Groups, Create Group.
- Added three sources: Phone Contacts, GreetSync, Groups.
- Search filters the selected source.
- GreetSync contacts keep direct WhatsApp chat action and Add birth date indication.

## Send Message / Create Automation
- Center bottom action now uses a send-message icon.
- New Send Message screen has Individual and Bulk tabs.
- Individual lists GreetSync contacts and opens direct WhatsApp chat.
- Bulk keeps the complete audience -> message -> schedule -> review automation flow.

## Scheduled Messages
- Business navigation icon changed to a message icon.
- Business screen renamed from Automations to Scheduled Messages.
- Existing execution/message history and status details remain available.

## More / Profile
- Removed the pencil icon from the profile summary card.
- Removed Notifications from the More list; notifications remain available from the header bell.
- Message Templates now opens in a complete Scaffold/AppBar and template JSON parsing is defensive against encoded component payloads.

## Automatic refresh
- Live providers refresh every 8 seconds: notifications, scheduled messages, dashboard, billing/quota and birthdays.
- Content providers refresh every 25 seconds: contacts, groups, templates, WhatsApp account, birthday settings, history and monthly analysis.
- App resume triggers an immediate refresh.

## Android notifications
- Added an Android high-importance GreetSync notification channel.
- Android 13+ notification permission is requested natively.
- Scheduled-message reminders use AlarmManager so they can appear as heads-up/lock-screen notifications while the app is backgrounded/closed normally.
- New server notification rows are surfaced as native heads-up notifications while the Flutter app is running and on resume.

### Remote push note
This project does not contain Firebase/FCM credentials (`google-services.json` / server push key). Therefore arbitrary backend events cannot be delivered instantly to a force-closed app as true FCM remote push. The included implementation provides native scheduled lock-screen reminders plus automatic polling/resume notifications without adding an incompatible Flutter notification dependency. FCM can be wired later once the Firebase project credentials are supplied.
