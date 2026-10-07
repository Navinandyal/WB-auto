# GreetSync production setup TypeScript fix

This build fixes the production setup errors reported during `npm run lint`.

## Fixed

- Admin WhatsApp test route now types Express request as `AuthRequest` so `req.user` is valid.
- Admin template sync route now types Express request as `AuthRequest`.
- Admin automation control route now types Express request as `AuthRequest`.
- Automation contact ID normalization now produces an explicit `number[]`, fixing Drizzle `inArray()` typing.
- Obsolete Firebase/Google-auth helper files from older project copies are excluded from TypeScript and automatically deleted by the one-click production setup script. GreetSync production auth is mobile/password based and does not require Firebase.
- The Windows PowerShell 5.1 compatible secure-secret generator from the previous fix is retained.

## Important when updating an existing folder

You may extract this ZIP over the current project. `RUN_PRODUCTION_SETUP.cmd` removes the obsolete `src/lib/firebase.ts` and `src/lib/firebase-admin.ts` files before running TypeScript validation, so old files left behind by previous builds do not break compilation.

## Run

Double-click:

`RUN_PRODUCTION_SETUP.cmd`

The script will continue with backend validation, Railway database migration, Railway backend deployment, permanent HTTPS domain setup and Android release APK build.
