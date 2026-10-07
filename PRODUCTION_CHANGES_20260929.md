# GreetSync Production/Railway Changes — 29 Sep 2026

This build is prepared so the installed Android APK talks to a permanent Railway backend rather than the developer laptop.

## Code changes

- Backend listens on `process.env.PORT` with local fallback `3000`.
- Production startup now fails fast if `DATABASE_URL` is missing.
- PostgreSQL/TLS remote connection support remains enabled for Railway.
- Database schema initialization must succeed before the HTTP server and automation worker start.
- Background automation worker starts only after PostgreSQL is ready and therefore runs independently of the Android phone.
- Account deletion purge worker remains server-side and continues while Railway is online.
- Production Meta callback URL resolution prefers permanent Railway environment URLs over stale ngrok/database URLs.
- `PUBLIC_BASE_URL`, `META_PUBLIC_BASE_URL`, `APP_URL`, and `RAILWAY_PUBLIC_DOMAIN` are supported.
- Graceful Railway shutdown stops the worker and closes the PostgreSQL pool.
- `railway.json` configures Railpack build, database migration, start command, health check, and restart policy.
- `.railwayignore` prevents the Flutter mobile source/build output from being uploaded to the backend service.
- Flutter already uses `API_BASE_URL` through `--dart-define`; the production script compiles the Railway HTTPS backend URL into the APK.
- Android release continues to disallow cleartext HTTP.
- Local developer runner explicitly forces `NODE_ENV=development` so production `.env` values do not break local Vite development.

## One file to run

Double-click:

`RUN_PRODUCTION_SETUP.cmd`

It calls the included `SETUP_PRODUCTION_AND_BUILD.ps1` and handles backend validation, Railway CLI/login/linking, service creation/reuse, Railway variables, deployment, public domain, health check and release APK build.

The only unavoidable interactive steps are authenticating to the owner's Railway account, choosing the existing Railway project that contains PostgreSQL, and providing the rotated PostgreSQL URL when it is not already configured.

Meta app publishing/review and dashboard permission changes remain Meta-account-owner actions; the script prints the permanent webhook/callback URLs needed for those settings.
