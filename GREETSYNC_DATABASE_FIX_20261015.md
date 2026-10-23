# GreetSync — Keep the selected PostgreSQL database

The setup bug was database precedence. Earlier setup discovered the database already linked to the Railway backend and wrote its URL into the local .env, even after you selected a different database locally. It could also migrate using one public URL while deploying with a different old server URL.

This update pins the requested target:

| Setting | Value |
| --- | --- |
| Host | iriguchi.proxy.rlwy.net |
| TCP port | 48009 |
| Database | railway |

Your supplied connection is prepared in **GREETSYNC_DATABASE.local.env**. It is private, excluded from Git, Docker build context and Railway code uploads, and is never compiled into the mobile app or backend bundle. Treat this ZIP as private because it contains that connection file.

## Run

Extract the complete update into your existing project folder. Keep your current .env, Firebase configuration and original signing files. Do not replace the rest of your private settings with a blank .env. Run:

```bat
RUN_PRODUCTION_SETUP.cmd
```

The command merges the selected database connection into .env while preserving unrelated settings, uses the same selected URL for the Railway backend, applies the schema to that database, deploys the updated backend, checks its new build identifier and builds/verifies GreetSync-production.apk. Your saved Railway account/project configuration remains in use without an account selection menu.

## How database selection now works

1. An explicit -DatabaseUrl parameter must match the pinned target.
2. An existing .env DATABASE_URL matching the target takes precedence. If you rotate the password and update .env, later runs keep that update.
3. When .env still points to the old database or has no URL, the supplied private connection file selects your requested target.
4. If no local connection is present, discovery can choose only the matching target. It cannot silently fall back to another TCP proxy or database.

Local migration and deployment use the same selected URL for this pinned configuration. Database-associated extra settings are read only from a matching database service, if available. Existing backend authentication/encryption secrets and unrelated local settings are preserved.

DATABASE_TARGET_HOST, DATABASE_TARGET_PORT and DATABASE_TARGET_NAME are written alongside the connection. Backend startup checks those fields before opening the pool. A stale/wrong deployment connection fails explicitly instead of silently using another database. Local development honors database values in .env over stale shell database variables; production continues to honor Railway service variables. Restart a running backend after changing database configuration.

To intentionally move to another database later, update databaseTarget in GREETSYNC_DEPLOYMENT.json and the private/local connection consistently. Do not change only the hostname or rely on an old service's connection. Setup does not copy records between databases.

## What was preserved / verification

The admin redesign, Meta/Facebook signup, automatic WABA/phone discovery, production mobile URL default and signing helpers are retained. No mobile UI/version change is needed for this backend/setup fix; current app source remains 1.0.5+6.

Automated tests cover local/private configuration precedence, repeated runs, password rotation, multiple database services, mismatched hosts/ports/names, runtime target checks and local-versus-production environment precedence. See TEST_REPORT.md for final results.

A read-only live connection check could not resolve the database host from this environment (EAI_AGAIN). Connectivity and authentication are therefore not verified here. No live schema migration, Railway variable update/deployment or APK build was performed. Run the command above on your configured PC to deploy and build.
