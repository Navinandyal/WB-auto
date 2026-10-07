# GreetSync Contact / Template / Automation Fix – 2026-10-03

Implemented in this build:

- CSV/XLSX contact import hardened for Android file selection and UTF-8/BOM input.
- Added ready-to-import test files: `GreetSync_Contact_Import_Test.csv` and `GreetSync_Contact_Import_Test.xlsx`.
- GreetSync contacts are returned and displayed alphabetically by name.
- Imported/manual contacts with Date of Birth + Birthday Automation enabled trigger birthday scheduling automatically when an approved birthday template exists.
- Contact save/import refreshes birthdays and scheduled messages automatically.
- Template review sample fields are no longer prefilled with `Navin`; Meta review samples are explicit user-entered examples only.
- Added automatic template variable meanings: contact name, first name, age, phone, email, birthday date, scheduled date, scheduled time, and scheduled date/time.
- Automatic variables resolve independently for each recipient. Age is calculated from the recipient DOB using the scheduled date.
- Meta review sample values are never used as message data.
- Template button limits aligned to the provided Meta UI: total 10; website max 2; phone max 1; WhatsApp call max 1; Flow max 1; Copy Offer Code max 1; Share Contact Info max 1 and exclusive.
- Added Request Contact Info / `Share Contact Info` template button support.
- Template delete no longer requires an active GreetSync package; Meta delete retries by name if the ID-qualified delete fails and treats already-missing templates as deleted.
- Fixed contact Notes limit-state check to 128 characters.
