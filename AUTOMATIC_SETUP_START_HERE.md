> Hosting update: use [RENDER_SUPABASE_START_HERE.md](RENDER_SUPABASE_START_HERE.md). The Railway instructions below are historical.

For the latest database precedence fix, read **GREETSYNC_DATABASE_FIX_20261015.md**. The selected .env/private database connection now takes precedence over an older backend connection, and the requested host/port/database are pinned.

For the latest production-default and Facebook flow update, read **GREETSYNC_ONE_COMMAND_START_HERE.md**. Normal `RUN_PRODUCTION_SETUP.cmd` deploys the backend and builds the APK; `-SkipApkBuild` intentionally does not.

# GreetSync — automatic Railway setup without repeated questions

This complete project is based only on your latest **GreetSync_iPhone_Xcode_Ready_20261007(4).zip**. It repairs the Windows deployment/build workflow and removes repeated account/project/database selection questions. The latest Android build/signing checks are described in **ANDROID_INSTALL_START_HERE.md**; app screens and backend behavior remain from your supplied source.

## Run

Extract the ZIP, open the extracted **GreetSync** folder and run:

```cmd
RUN_PRODUCTION_SETUP.cmd
```

The command automatically:

1. Reuses your existing Railway CLI login or a configured Railway token. It does not log out, ask which account to use, or open a login browser.
2. Links the configured project and production environment using explicit IDs.
3. Reads the backend and PostgreSQL service variables from that project, resolves the public connection URL, and keeps private PostgreSQL URLs for the deployed backend when available.
4. Reuses existing backend authentication/encryption keys; preserves extra local `.env` settings. It leaves sealed Railway secrets unchanged.
5. Copies the Gemini key from PostgreSQL variables to the backend when it is not already configured locally/on the backend. Values are read at runtime, not written into this ZIP or the APK.
6. Installs/validates the backend, migrates the configured database, deploys, checks health and builds/verifies **GreetSync-production.apk**, with an **APK_BUILD_REPORT.txt**.

There are no account, project or database menu prompts in this command. The final `Press any key` pause is only for keeping the completed/error window visible.

Node/npm, Flutter, the Android SDK and a compatible JDK must be installed as for your earlier successful build. The Railway CLI is installed automatically if needed. Gradle caches are retained to speed up repeated builds.

If you have an existing `.env` containing custom settings or owner Firebase configuration, copy it into the extracted GreetSync folder first. Setup can retrieve its required connection/crypto settings from the existing backend without needing you to retype the database password. Your current database remains the data source; this workflow does not create a replacement database or move data to another account.

## Already deployed? Build only the APK

```cmd
BUILD_APK_ONLY.cmd
```

This mode uses the configured HTTPS backend and Flutter. It does not call Railway, install/migrate the backend, request a login or redeploy. It first checks the backend's health. The APK is copied to **GreetSync-production.apk** in the project root.

## Supplied target is already configured

The non-secret **GREETSYNC_DEPLOYMENT.json** contains the project/environment from your working console logs:

| Setting | Value |
| --- | --- |
| Project | agile-forgiveness |
| Project ID | e1297f67-4f5b-4159-be56-73178b459d60 |
| Environment | production |
| Environment ID | d52cfe49-1c90-4449-9582-b853e74706f0 |
| Backend service | wishflow-backend |
| Existing HTTPS backend | https://wishflow-backend-production-e75d.up.railway.app |

The normal deploy command reads the service's actual Railway domain and uses that current address for the APK. APK-only mode uses the configured URL above. If you intentionally move to another project, edit this JSON once instead of selecting accounts on every run. If several PostgreSQL databases exist and the backend's URL cannot identify one, set **databaseService** once to the intended service's name/ID. A single PostgreSQL service is detected automatically.

## What the screenshot provides

Your screenshot shows PostgreSQL variables and a Gemini key. The `${{...}}` strings are Railway references, not complete connection strings for a Windows PC. Setup reads the resolved service deployment variables through Railway's CLI. It can also construct the public URL from resolved TCP proxy and PostgreSQL fields, safely encoding credentials. Unresolved references/private-only addresses are rejected for local migrations.

The screenshot's PostgreSQL password and Gemini key are not Railway login tokens. They are not embedded in this ZIP. Your previous console logs already show a valid Railway login; the new run command reuses it.

If you use a new PC or the saved Railway login expires, run **LOGIN_RAILWAY_ONCE.cmd** once and complete Railway's authentication. After that, normal runs reuse the saved login. The setup command stops with a clear message when authentication is missing rather than repeatedly opening account questions. An eligible Railway token can also be provided through **RAILWAY_TOKEN** or **RAILWAY_API_TOKEN**, but not both together. Existing token settings are not cleared.

## Previous errors repaired

- Bare interactive `railway link` is replaced with explicit project/environment IDs, so piping output cannot cause the earlier `--project required` failure.
- Link validation reads Railway's actual **projectId/environmentId** JSON fields, and also accepts explicit underscore aliases. Missing/conflicting/wrong IDs still stop setup before migration.
- The Windows launcher is rewritten with CRLF and valid `endlocal`/exit handling. No stray `end` command is included.
- Normal deployment no longer falls back to an unrelated old backend after authentication fails.
- Server variables are read silently. Command failures do not print their complete secret-bearing argument list.
- Process environment settings used during the local migration/build are restored on success/error, preventing an old parent DATABASE_URL from overriding the chosen database and preventing setup from leaving child secrets in the shell.

If Railway hides a variable as sealed, its null value is treated as an existing protected setting, not a reason to recreate it. If a public database URL cannot be read/reconstructed, enable the PostgreSQL TCP proxy or provide the local **-DatabaseUrl** parameter explicitly. Setup does not open another database prompt.

If the deployment domain changes, use the printed webhook and Embedded Signup callback URLs in Meta. This program does not change your Meta dashboard automatically.

## iPhone / Mac

The iOS/Xcode files and Mac commands from your uploaded ZIP are retained. Follow **IPHONE_MAC_START_HERE.md** for building on your Mac with your Apple signing team. The Windows automation above builds Android APKs. A signed iPhone IPA still requires Xcode/Apple signing; none is included in this source ZIP.

## Validation

**163 assertions across 21 mocked workflows passed** using PowerShell 7.4.13. Tests cover normal/repeated runs with no prompts, token authentication, explicit camelCase/underscore link data, automatic database discovery, raw-reference rejection, named/multiple databases, public migration/private backend URLs, secret preservation, sealed secrets, retaining extra `.env` fields, restoring process variables, APK-only mode, auth/link/status/variable/migration/build failures and correct build URL arguments.

For reproducible tests with PowerShell 7:

```powershell
pwsh -NoProfile -File .\tests\NO_PROMPT_SETUP_TESTS.ps1
```

External Railway/npm/Flutter commands are mocked by those tests. They do not touch your real `.env`, data or deployment. Temporary fake APK fixtures are deleted. This environment cannot execute your Windows account session, a production PostgreSQL migration, a real Gradle APK build, or Xcode signing. No newly built APK/IPA is included; the run commands produce them on your configured computer. The app/backend files are byte-identical to the uploaded ZIP, so their historical test results were not rerun for this setup-only update.

Official references checked: [Railway variables](https://docs.railway.com/cli/variable), [Railway login/tokens](https://docs.railway.com/cli/login), [explicit linking](https://docs.railway.com/cli/link), and [CLI variable controller](https://github.com/railwayapp/cli/blob/master/src/controllers/variables.rs).
