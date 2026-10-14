# GreetSync — select the Railway account before automatic setup

This is a **replacement-script update**, based on the automatic setup scripts from the GreetSync ZIP already used in this conversation. It does not replace your app, database, backend source, `.env`, or mobile screens.

## Install and run

1. Extract this ZIP.
2. Copy **SETUP_PRODUCTION_AND_BUILD.ps1** and **RUN_PRODUCTION_SETUP.cmd** into your existing GreetSync project root, replacing those two files. They must sit beside your existing `package.json` and `mobile` folder. Keep your existing `.env` and application files.
3. Double-click **RUN_PRODUCTION_SETUP.cmd**, or run it from Command Prompt as before.

You will now see this menu before database migrations or deployment:

```text
Which Railway account should this run use?
  1. Use current account: your-current-email
  2. Sign in with another Railway account
  0. Cancel
```

If no account is logged in, the menu offers sign-in and cancel instead.

Choose **2** to change accounts. Complete Railway's browser login with your new account. If your browser shows the old account, switch accounts on its Railway sign-in page. Return to the command window; the script displays the email that was actually authorized. Choose **1** to use that verified account.

Then choose the **workspace, existing project and environment** from Railway's interactive selector. Select the project that contains the database you want this deployment to use. The remaining setup continues: validate/build the backend, initialize the chosen database, deploy, obtain its HTTPS domain, check health and build **GreetSync-production.apk** using that domain.

The script still targets the backend service name `wishflow-backend` by default, preserving the earlier installer. If the service in your selected project uses another name, run from Command Prompt:

```bat
RUN_PRODUCTION_SETUP.cmd -ServiceName "your-backend-service-name"
```

The launcher now forwards PowerShell arguments. If the configured backend service does not exist in the selected project, the existing installer flow creates it. Do not use the PostgreSQL database service name as the backend service name.

## Database when changing accounts

Changing a Railway login does not transfer an existing database to another account/project. If you moved the project between workspaces/accounts while retaining its database, explicitly choose `y` to reuse that same saved database URL.

If the new account uses a different PostgreSQL database, enter its **DATABASE_PUBLIC_URL** from the selected project's PostgreSQL service. The Windows PC needs the public connection URL for migrations; Railway-private hostnames are not reachable from a normal PC. The password-containing URL is entered using a masked prompt. Pressing Enter at the saved-database reuse question now defaults to **No** so it cannot automatically migrate the previous database.

The existing installer preserves your auth/encryption keys and local AI/Meta settings. A genuinely new database starts with its own data; this script does not copy customers, templates or WhatsApp credentials between databases.

## Account and backend behavior

- Every normal run asks which account to use, even if Railway is already logged in.
- Railway's CLI stores one active login. This update offers the current identity and a new browser login; it does not claim to list every account signed into your browser or keep extra account tokens in the project.
- Every normal run prompts to link the intended project/environment. A cancelled/failed selector stops setup instead of using the old project link.
- Environment variables `RAILWAY_TOKEN` and `RAILWAY_API_TOKEN` are temporarily ignored in this script's process during interactive selection/deployment, because Railway otherwise uses them in place of the chosen browser login. Their original values are restored in `finally` on success, cancellation and errors. Saved user/system environment settings are not deleted.
- The chosen account email and project ID are rechecked after local validation/build, before Railway variable writes and deployment. If either changed, setup stops.
- The old hardcoded production domain and automatic unauthenticated fallback are removed. Failed login/deployment does not produce an APK for an unrelated old backend. A normal successful run gets the domain from the selected deployment and compiles it into the APK.
- `-SkipRailwayDeploy` remains an explicit bypass for the earlier existing-backend workflow. It does not ask for a Railway account or deploy. Use a valid backend already recorded in your `.env` (or explicitly provide `-KnownBackendUrl`). This preserves the original skip mode; it still performs the installer's local backend/database validation.

If the backend URL changes, use the new URLs printed by the script in your Meta webhook and Embedded Signup configuration. This update does not change Meta dashboard settings automatically.

## What was tested

PowerShell 7.4.13 syntax parsing and **86 assertions across 12 mocked workflow scenarios passed**, including current-account reuse, switching accounts, first login, wrong browser account, invalid menu input, cancellation, login/link/status failure, account/project changes during setup, and choosing a new database instead of the old default. The mocked successful runs continued through the backend/deploy/build steps and targeted the selected domain. Tests also check token restoration, secret redaction, key preservation and ordering before migrations.

No real Railway login, deployment, database migration or APK build was performed here. The test APK is a temporary fixture, is deleted after tests, and is not part of this ZIP. Windows PowerShell 5.1 / native `.cmd` execution and your real credentials/project must be verified on your Windows PC. The script retains 5.1-compatible constructs and the existing native-command error handling.

Optional reproducible checks are in `tests/RAILWAY_ACCOUNT_TESTS.ps1`. With PowerShell 7 installed:

```powershell
pwsh -NoProfile -File .\tests\RAILWAY_ACCOUNT_TESTS.ps1
```

The tests mock all external commands and do not deploy or touch your real `.env`/database. Only the two setup files are required for normal use.

Official references checked:

- [Railway CLI authentication and tokens](https://docs.railway.com/cli/login)
- [Railway current-user identity](https://docs.railway.com/cli/whoami)
- [Railway interactive project/environment linking](https://docs.railway.com/cli/link)
- [Railway status and JSON output](https://docs.railway.com/cli/status)
- [Railway public PostgreSQL networking](https://docs.railway.com/guides/postgresql)
