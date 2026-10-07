# GreetSync QA Bug-Fix Pass — 2026-10-02

This build applies the QA report against the current GreetSync product flow. Items from older screenshots that were intentionally removed by the newer product redesign (old dashboard metric tiles and old Contacts summary counters) are not reintroduced.

## Fixed / addressed

1. Full Name validation is enforced in Flutter and the backend. Names accept Unicode letters plus spaces, apostrophes, periods and hyphens; digits and symbols such as @/# are rejected.
2. Contact/profile email syntax is validated. Manual contact/profile saves also perform backend domain resolution and reject conclusively non-existent domains.
3. Add/Edit Contact now supports assignment to one or more existing groups.
4. Create Group disables Save while the request is in progress, and the backend rejects duplicate names per business.
5. Contact Groups has search by group name/description.
6. CSV/XLSX import validates mandatory Name + Phone columns before upload and returns row-level missing-field errors from the backend.
7. Template language/category controls use responsive stacked layout on narrow screens to prevent field collisions.
8. Draft and Rejected templates expose Edit. Approved templates expose Duplicate & Edit because Meta-approved templates are immutable in place.
9. Template search is cleared when switching status tabs and on pull-to-refresh.
10. Template variables are counted from {{...}} placeholders and shown in details.
11. The obsolete dashboard metric-tile layout was removed by the newer Dashboard design, eliminating the clipped-tile issue.
12–13. Home branding now uses GreetSync instead of the previous product branding; the old ambiguous LIVE card was replaced by a clear WhatsApp connection status chip.
14. Business Profile supports uploading/changing/removing a business logo (PNG/JPG/WebP with size validation).
15. The business logo is displayed with the business identity in the app header; GreetSync's app logo remains the product identity.
16. Contact source labels are Phone Contacts / GreetSync / Groups.
17. The duplicate legacy View All groups action is removed; Contacts has one Manage Groups action plus the Groups tab.
18. Contact overflow menus use the same white surface styling as the rest of the application.
19. Save Contact focuses/scrolls to the first invalid required field and shows a clear error message.
20. Notes is capped at 500 characters and shows an explicit limit message when the maximum is reached.
21. The unwanted Notes prefix/hamburger icon is removed.
22. Consent and Birthday Automation use standard Flutter switches with a visible thumb.
23. Cancel on Add/Edit Contact now closes immediately when clean, or asks to discard unsaved changes when edited.
24. GreetSync now preserves phone/device contact photos during import and allows manual contact-photo upload, with initials as fallback. The official WhatsApp Cloud API does not provide an API for fetching arbitrary customer WhatsApp profile photos, so a WhatsApp-only DP cannot be fetched directly by GreetSync.
25. The legacy Birthdays summary counter was removed by the newer Contacts redesign, eliminating the old inconsistent counter.
26. Android app label/icon and in-app branding are GreetSync.
27. Templates summary includes a Rejected label and count.
28. Templates filters include Draft.
29. Hindi/Marathi display names and message content are accepted. GreetSync generates a Meta-compatible ASCII internal template name while preserving the user's Unicode display name.
30. Eligible templates can be edited; approved templates can be duplicated into an editable new version.
31. Locale codes are shown with user-facing labels such as English (US), Hindi and Marathi.
32. Scheduled Messages uses message/schedule-send iconography rather than the old automation icon.
33. Duplicate profile-edit pencil navigation was removed; the More screen exposes one Editable Profile entry.
34. Subscription & Billing is available in More with package validity, quota, add-ons and reports.
35. Secondary/outlined buttons derive their foreground/border from the selected app accent theme.
36. Logout action styling derives from the selected theme accent.
37. Logout dialog heading is confirmation-oriented: “Are you sure you want to logout?”
38. Cancelling logout keeps the session and provides “Logout cancelled.” feedback.
39. Logout dialog text uses GreetSync branding.

## Additional hardening included

- Contact group IDs are ownership-validated on create/update.
- Contact avatar and business-logo payloads are type/size validated on the backend.
- Device contact import supports multi-select and preserves available device thumbnails.
- Existing newer GreetSync features remain intact: package enforcement, billing, live refresh, notification integration, admin template suggestions, Meta template editor fields, webhook fixes, and GreetSync launcher/notification artwork.

## Production build hotfix - 2026-10-02
- Fixed Drizzle `inArray()` TypeScript overload errors in contact-group create/update routes.
- `contactIds` and `ids` are now explicitly normalized and typed as `number[]` before querying `contacts.id`.
- Invalid, non-numeric and non-positive contact IDs are discarded before the database query.
