# GreetSync update — 2026-10-02

This release adds the requested business-user and admin workflow changes:

- Registration now requires explicit acceptance of the GreetSync Terms & Conditions and Privacy Policy, using the exact AIKYAM URLs supplied for the product. Acceptance is enforced by both Flutter and the backend and timestamped in PostgreSQL.
- Contacts quick actions are positioned directly below the Contacts header/Add action: Import CSV/Excel, Manage Groups, and Create Group.
- Phone Contacts supports multi-select, Select All, and one-tap batch import into GreetSync (maximum 10,000 selected contacts; package/contact limits still apply).
- Message Templates now includes Meta-style template setup fields for name/language/category, optional header, body, optional footer, variables, buttons, preview, limits and direct Meta submission.
- Super Admin can create/edit/enable/delete festival/campaign template suggestions. Active suggestions appear to business users, who can copy/edit them and submit their own template to Meta. Only Meta-approved templates are usable in automations.
- The centered Send button no longer rises above the Android keyboard. It is hidden while typing and returns to its center-docked position when the keyboard closes.
- The supplied GreetSync logo is used for in-app branding and Android launcher icons. Android notifications use a system-compatible monochrome small icon derived from the logo and the full-color GreetSync logo as the large notification icon.

No manual SQL is required: `npm run db:migrate` / `RUN_PRODUCTION_SETUP.cmd` adds the new legal-consent columns and template-suggestions table idempotently.
