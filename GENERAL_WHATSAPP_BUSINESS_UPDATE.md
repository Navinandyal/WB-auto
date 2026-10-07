# GreetSync General WhatsApp Business Update

This build expands GreetSync from a birthday-focused workflow into a general WhatsApp Business messaging and automation application.

## Added

- Country-code-aware phone entry. India uses +91 with exactly 10 digits starting with 6/7/8/9. Other countries use international E.164 validation and a country selector.
- Fixed-format CSV bulk contact import. Exact header: `name,country_code,phone,email,date_of_birth,opt_in,notes`.
- Contact groups with create/edit/delete and multi-contact membership.
- Business users can create WhatsApp templates and submit them to Meta for approval.
- All business-owned/global templates are shown instead of only Hello World and Birthday.
- The approved Birthday template from the connected Meta account is supported through normal template sync.
- Bulk sending to multiple contacts or groups.
- Dashboard marketing quick action.
- Birthday contacts can still be selected together and sent in one bulk operation.
- Automation creation supports selecting multiple contacts for the same scheduled time and any approved template, not only birthday templates.
- Template variables: `{{1}}` defaults to each contact name; additional variables are collected from the user.

## CSV format

A sample is included at `sample_contacts.csv`.

Required columns, in this exact order:

`name,country_code,phone,email,date_of_birth,opt_in,notes`

For India use `91` as country code and the 10-digit mobile number in `phone`.

## Template approval

Creating a template submits it to the logged-in business user's Meta WhatsApp Business Account. It is not treated as sendable until Meta returns `APPROVED`. Use Sync Templates after Meta approval.

## Product positioning

Birthdays are one automation use case. The same contacts, groups, templates, bulk-send and scheduling flows support marketing offers, reminders, announcements, customer updates and other approved WhatsApp template campaigns.
