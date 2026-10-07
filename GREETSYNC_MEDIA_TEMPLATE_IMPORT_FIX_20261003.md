# GreetSync media-template, import and send fix — 2026-10-03

This build addresses the six requested production fixes:

1. Removes old locally approved starter/sample template behavior. Approved templates shown to a business must be returned by that business's connected Meta WABA. Startup removes old local APPROVED rows without a Meta template ID, and Meta sync removes stale approved rows that are not returned by Meta.
2. Template IMAGE/VIDEO/DOCUMENT selections are retained as local preview metadata and shown in the media-selection area and template preview. Local-only preview metadata is stripped before the template is submitted to Meta.
3. Excel import now unwraps Excel 4.x cell value wrappers and supports file-path fallback on Android. The first workbook sheet is used. CSV and XLSX sample files are included at the project root.
4. "Use Template" now opens the same Send Message > Bulk > Audience > Message > Schedule > Review workflow as the center Send action, with the template preselected.
5. Bulk audience selection includes search by contact name or mobile number; Select All applies to the visible search result.
6. Media-header sending is fixed. Before scheduling an approved IMAGE/VIDEO/DOCUMENT-header template, GreetSync requires the matching media. The app uploads it to the WhatsApp media endpoint and stores the returned media ID with the automation. The worker then sends the required header component (`image`, `video`, or `document`) instead of omitting the header and triggering Meta #132012.

Template deletion was also hardened: Meta deletion uses template name + ID with name-only fallback. If historical automations reference the local template, the template is archived as DELETED instead of violating relational history; scheduled uses are cancelled before deletion.
