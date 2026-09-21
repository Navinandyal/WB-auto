# WishFlow Auth UI + Validation Update

This build adapts the authentication UI/validation patterns from the supplied
`WP_automation_auth_forgot_registration_final_fixed (7).zip` reference into the
current WishFlow multi-tenant/admin-approval project.

## Preserved WishFlow rules

- Login uses mobile number + password only.
- No Google/Firebase/OAuth login.
- New business accounts register first and remain `PENDING`.
- Admin approval is required before the business user can log in.
- Admin and business dashboards remain separate.
- No demo business/contact/message data is added.

## Login screen

- Mobile-number validation (10–15 digits after formatting characters are removed).
- Password required validation.
- Show/hide password.
- Remember-me support for the mobile number.
- Forgot Password action.
- Server error/approval-state messages are displayed inline.
- New Business → Create Business Account flow.

## Registration screen

Required:
- Full name
- Business name
- Business address
- Mobile number
- Password
- Confirm password

Optional:
- Email (validated when supplied)

Validation:
- Full name must be present.
- Business name must be present.
- Business address must be present.
- Mobile must contain 10–15 digits.
- Optional email must use valid email syntax.
- Password minimum length is 8 characters.
- Confirm password must match.
- Duplicate mobile number is rejected by backend.

After successful registration the UI shows a dedicated **Pending Admin Approval**
state instead of signing the user in automatically.

## Forgot password

Added working local-development reset flow:

1. Enter registered mobile number or email.
2. Backend generates a six-digit, 15-minute verification code.
3. Code is stored only as a password hash in PostgreSQL.
4. In non-production/local development the code is returned to the app so the
   flow can be tested without an SMS/email provider.
5. Enter six-digit code.
6. New password must contain at least 8 characters.
7. Confirm password must match.
8. Used/expired codes cannot be reused.

For production, connect an SMS/email provider to deliver the verification code.
The backend intentionally does not return the code when `NODE_ENV=production`.

## Database

A new table is created automatically on backend startup:

`password_reset_requests`

No manual migration is required for the local auto-initializing setup.

## Physical Android device

The included `run-wishflow-android-dev.cmd` starts/validates the backend, detects
the USB Android phone, configures `adb reverse tcp:3000 tcp:3000`, runs Flutter
package resolution, and launches the application.
