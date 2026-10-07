# GreetSync follow-up fixes — 5 October 2026

This package includes the latest adjustments: the failed-message Resend option is removed and Profile business/owner details use larger text. It also retains the earlier follow-up fixes. Deploy the backend and rebuild/install the Android app together. Updating only the APK will leave the older backend's location validation and payload logic in place.

## Changes

1. **Bottom navigation:** Send is a fixed tile inside the bottom bar between Contacts and Scheduled. The floating action button, notch and extra content gap have been removed. The existing nested navigator retains this bar on business screens.
2. **Profile:** The business photo remains on the left, with larger owner/business information and contact rows on the right (business name 24, owner name 18, phone/address 15 logical pixels). The Business Owner label is also larger and can wrap beside the status badge. A small rectangular account badge appears at the top right. The large Active card and This Month analysis have been removed. Suspension and billing notices remain visible when needed.
3. **Recipient/template selection:** Contacts, groups and approved templates have more space, distinct rounded cards and a visible selected state. Contact search remains available.
4. **Template totals/filters:** Both use All, Draft, Processing, Approved, Rejected in that order, with the same status grouping and data source.
5. **Variables:** Shop/business name, business address, combined business details, business phone and business email are available alongside customer fields. Business values come from the owner's saved profile; the editor supplies review examples and the composer shows personalized previews. Named variable examples include shop_name and business_address.
6. **Location submission/editing:** The editor requires the selected coordinates, location name and full street address before submission. Validation reports missing details in a visible dialog instead of silently returning. The final preview displays those details. Location templates send only the generic location header to Meta for creation/editing; GreetSync stores the chosen location locally for preview and sending. Approved edits retain Meta's immutable identity/category restrictions and edit limits.
7. **Location sending:** Name and address are included with coordinates in the outbound location parameter. Missing details fail locally before calling Meta. This fixes the screenshot error: "address is mandatory for component parameter type location". Old failed attempts remain unchanged. New location messages require the full address.
8. **Failed messages:** The Resend message button and its review text have been removed from failed automation details, as requested. Failure information and message history remain visible.

## WhatsApp Business App + Cloud API

Embedded Signup continues to use the Coexistence path (`whatsapp_business_app_onboarding`). The bridge requires the Business App onboarding completion event and the backend verifies that the selected number uses the Business App with Cloud API. Successful eligible connections allow the owner to continue using the WhatsApp Business App while GreetSync sends API automations from that same number. The existing owner-scoped history/contact/echo handlers are retained.

Your Meta app still needs the correct live Builder configuration, permissions and provider/business eligibility. Configure these using `GREETSYNC_20261005_START_HERE.md`; source code cannot grant Meta approval or eligibility. Existing ordinary Cloud API connections are not automatically converted to Coexistence; reconnect through the Business App path when eligible.

## Install and check

Follow the backend and Flutter build steps in `GREETSYNC_20261005_START_HERE.md`. No database change is added by this follow-up over that previous version. The earlier startup migrations still apply when upgrading from older releases. No real secrets or APK are included.

On your phone:

- Open Profile and check the badge, information layout, removed analysis and fixed bottom Send tile.
- Check contact/group spacing, selection, search and template status order.
- Create/edit a location template, select a map point and enter its real name/address; check the final preview and submit. Sync Meta status afterward.
- Send an approved location template; confirm the recipient receives the correct location and the details show the same preview.
- Open a failed message and confirm its error/history remain visible with no Resend option. Check that Profile details are readable and wrap correctly on your phone.
- Check the Coexistence connection using an eligible real Business App number, then test a manual Business App chat and an API automation.

## Official references

- [Meta template components: location creation and send syntax](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components)
- [Meta template management/editing](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-management)
- [Meta Business App onboarding / Coexistence](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)

See `TEST_REPORT.md` for the checks actually executed and their limits. Live Meta approval/delivery, phone UI behavior and APK generation must be verified in your configured development environment.
