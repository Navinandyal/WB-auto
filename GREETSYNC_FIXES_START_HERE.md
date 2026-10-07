# GreetSync app fixes — 3 October 2026

This ZIP contains the updated Flutter app (`mobile/`), its Node.js backend,
and matching Excel/CSV import examples. Update both the backend and the app.

## Changes

1. Removed locally approved sample/default template behavior and the web sample
   approval action. Old local sample rows are hidden without deleting message
   history. Approved templates come from the connected business's Meta account.
2. Selected images, videos and documents appear under media selection and in
   template/message previews. Images retain their full aspect ratio, videos
   support playback, and documents show their filename and a view action.
3. Fixed Excel text/rich-text, numeric phone, date and consent parsing. Added
   compatibility for absolute worksheet paths, XML namespace prefixes and
   plain-text cells used by spreadsheet exporters. Excel finds the worksheet
   with name/phone headings. CSV supports LF, CRLF, CR and quoted commas.
4. Use Template opens Send Message > Bulk > Audience > Message > Schedule >
   Review with that template already selected. Existing direct bulk-send
   shortcuts share this composer and default to Send now.
5. Bulk audience selection searches by contact name or mobile number. Select All
   selects the visible results and existing selections remain while searching.
6. Fixed the missing IMAGE header behind the screenshot's Meta #132012 error.
   Send-time media is uploaded to the connected WhatsApp number and the message
   contains the correct image/video/document header parameter with a media ID.
   Missing or mismatched media is rejected before scheduling/sending. The BODY
   component supplies the message preview; stale custom text no longer replaces
   the approved body. Template sync loads all pages and requests full components.

The backend also validates every scheduled recipient before inserting a batch,
so a missing variable cannot leave a partially created schedule on retry.

## Apply the update

1. Extract into a new folder and preserve your existing backend environment
   settings, Android signing configuration and Flutter backend URL settings.
2. At the project root run `npm ci`, `npm run lint`, `npm test`, and
   `npm run build`. Deploy/restart the updated backend using your existing setup.
3. In `mobile/`, run `flutter pub get`, `flutter analyze`,
   `dart run tool/check_import.dart`, and your normal APK build command.
   The media viewer adds video_player, path_provider and open_filex dependencies.
4. Install the rebuilt app. Open Message Templates and tap Sync from Meta once
   to replace stale local template content with the actual approved content.

For an already FAILED automation, create a new schedule after selecting the
required image. Updating code cannot retroactively deliver that failed message.

## Sample import files

- `GreetSync_Contacts_Import_Sample.xlsx`
- `GreetSync_Contacts_Import_Sample.csv`

The same files are bundled in the app. Import Contacts > Sample Excel / Sample CSV
lets the user save an example. Replace the demo rows with your own contacts.
Mandatory headings: `name`, `phone`. Optional: `country_code`, `email`,
`date_of_birth`, `opt_in`, `notes`. Maximum: 10,000 rows. Phone columns should be
text; dates should be YYYY-MM-DD or actual Excel dates. Replace formulas with
their values. Duplicate phone numbers are skipped by the backend.

## Verification

- Backend TypeScript compile and production bundle: passed.
- Backend regression suite: 12 tests passed using mocked Meta responses;
  no customer messages were sent during testing.
- Offline Dart importer/model checks: passed, including reading both bundled
  samples and comparing every sample contact, plus rich text, numeric phones,
  dates, consent, CSV quoting and actual approved-body previews.
- Offline Dart analysis of the importer, app models and import regression script: no issues found.
- Changed Dart files: syntax/format checks passed.
- Full Flutter analyzer, APK build, native media playback and live Meta delivery
  have not been verified in this environment. Automatic approval review blocked
  Flutter setup because it attempted access to a cloud instance metadata endpoint.

## Quick app check after installing

1. Sync your real templates. Confirm local approved sample rows are absent.
2. Open Use Template and confirm the same Bulk scheduling steps.
3. Search contacts, select results, change the search, and confirm selection stays.
4. Choose the media required by a template. Review the media and complete message
   body, header, footer and button labels before scheduling.
5. Import the supplied Excel and CSV examples into a test business. Importing the
   second format after the first should skip the matching duplicate numbers.
6. Send a media template to your opted-in test number. Check the automation
   status, delivered media and webhook activity.

Uploaded WhatsApp media IDs expire. This composer limits ID-based schedules to
28 days after upload. Documents need a compatible viewer installed on the phone.
