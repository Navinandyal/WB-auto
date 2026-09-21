# Mobile + Password Authentication Update

## Implemented

- Flutter login is now mobile number + password only.
- Google Sign-In/Firebase packages were removed from the Flutter project.
- Backend now issues signed application session tokens.
- Passwords are stored as salted `scrypt` hashes.
- A fixed admin account is seeded from backend environment variables.
- Admin-only business-user management APIs were added.
- Admin-only `Business Users` screen was added to Flutter.
- Business users can be created, edited, disabled/enabled, password-reset, and deleted.
- No public sign-up is exposed.
- Fixed admin cannot be deleted through the business-user endpoints.
- Existing WhatsApp, automation, scheduling, contact, template, and database workflows remain on the backend.

## Roles

- `admin`: fixed server-configured administrator.
- `business_user`: user created by admin.

## Required production environment

```env
ADMIN_MOBILE="+91..."
ADMIN_PASSWORD="strong-password"
ADMIN_NAME="System Administrator"
ADMIN_EMAIL="admin@example.com"
AUTH_TOKEN_SECRET="long-random-secret"
```

## Important

The current business application data model (contacts, templates, automations, WhatsApp settings) remains shared at backend level, exactly as it existed before this authentication change. This update adds authenticated business-user accounts and role-based admin user management; it does not introduce tenant-specific data partitioning.
