# Flutter Migration Report

## Existing architecture found
- React 19 + Vite web frontend.
- Express 4 backend in `server.ts`, port 3000.
- PostgreSQL through `pg` + Drizzle ORM.
- Mobile-number/password authentication through the existing Express/PostgreSQL backend.
- Meta WhatsApp Cloud API integration remains server-side.
- Background automation worker starts on backend startup.
- GreetSync birthday scheduling/synchronization remains server-side.

## Web screen inventory
1. Login
2. Dashboard
3. Birthday GreetSync
4. Scheduled Messages
5. Create Automation
6. Contacts
7. Templates
8. WhatsApp Settings

All eight functional areas have corresponding Flutter screens under `mobile/lib/screens`.

## Backend preservation
No backend API contract was changed for the Flutter conversion. Flutter uses the same `/api/*` endpoints and same database as the web frontend.

## Security observation
Authentication has been updated to mobile number + password. Google/Firebase login and the demo-admin bypass route are no longer used. The fixed administrator is seeded from backend environment variables, and business users are created by the administrator.

## Realtime / notifications
The inspected repository uses the backend worker and Meta webhook status updates but exposes no WebSocket/SSE/FCM client channel in the current web frontend. Therefore the Flutter client refreshes backend state through the same REST APIs instead of inventing a new realtime backend.

## Device contacts
The current web application manages backend contacts through `/api/contacts`; it does not use native device contacts. Accordingly the Flutter conversion does not request `READ_CONTACTS` and avoids an unnecessary permission.

## File uploads
No file-upload UI/API was found among the existing functional screens, so no upload flow was invented.
