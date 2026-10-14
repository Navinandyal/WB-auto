# GreetSync — complete project with Railway selection fix

This complete source ZIP contains the app/backend from **GreetSync_iPhone_Xcode_Ready_20261007.zip**, with the corrected Windows Railway account/project selector. Android, iPhone/Xcode, backend source and contact import samples are included. No application screens or backend behavior were changed for this setup-script repair. No newly compiled APK/IPA, `.env`, account tokens, signing keys, Pods or build caches are included.

## Latest correction: valid link was falsely rejected

Railway's current link JSON uses **projectId** and **environmentId**. The previous script looked for **project_id** and **environment_id**, so it rejected a correctly linked project as an unexpected target. This was a script validation error. Your account/project selection succeeded, and setup stopped before database migration/deployment.

This revision reads the current camelCase fields, also accepts explicit underscore aliases, and still rejects missing, conflicting or genuinely mismatched IDs. The regression fixture now matches Railway's actual serializer format instead of the earlier incorrect mock.

For the quickest repair in your existing folder, replace **SETUP_PRODUCTION_AND_BUILD.ps1** from this ZIP in **D:\Aikyam\project**, keep your existing **.env**, then run **RUN_PRODUCTION_SETUP.cmd** again. The complete app source is also included if you prefer a fresh extraction.

## Run on Windows

1. Extract the ZIP to a project folder, for example `D:\Aikyam\GreetSync-fixed`.
2. If keeping your existing deployment/data, copy your existing **.env** into this new project folder. Preserve any owner-supplied Android signing/Firebase configuration that is not in the source ZIP. Keep your auth/encryption keys when using the same database.
3. Run **RUN_PRODUCTION_SETUP.cmd** from the extracted GreetSync folder.
4. Choose **1** for the current Railway account, or **2** to authorize a different account in the browser. After login, the script displays the email Railway actually authorized; choose **1** to use it.
5. The script lists accessible projects in numbered PowerShell menus. Select the intended project, such as **agile-forgiveness** from your log. If only one project exists, it is selected automatically. Choose its environment if several are available; a single environment is selected automatically.
6. For the same database, explicitly answer **y** to reuse `.env`'s database. For a different database/account/project, supply that PostgreSQL service's **DATABASE_PUBLIC_URL** using the masked prompt. Pressing Enter at the reuse question defaults to **No**.
7. The existing setup continues automatically: install dependencies, validate/migrate/build the backend, deploy, determine its HTTPS domain, check health and build **GreetSync-production.apk** in the project root.

Node/npm, Flutter, Android SDK and a compatible JDK must be installed as for your previous successful build. Railway CLI is installed automatically if missing. Changing a login does not copy the old database into a new account; use the correct database for the project you selected.

### Optional explicit selection

The same launcher now accepts all script parameters:

```bat
RUN_PRODUCTION_SETUP.cmd -RailwayProject "agile-forgiveness" -RailwayEnvironment "production"
```

Use an environment that actually exists in that project; the numbered menu shows available ones. Project/environment IDs are also accepted, which is useful if different workspaces contain projects with the same name. Account selection still appears. The script validates the requested target against the logged-in account's project list.

The backend service name remains **wishflow-backend** by default, preserving your existing installer and successful deployment. If your selected project uses a different backend service name:

```bat
RUN_PRODUCTION_SETUP.cmd -ServiceName "your-backend-service-name"
```

Do not use the PostgreSQL database service's name here. The existing installer creates the configured backend service if it does not exist.

## Why the previous run failed

Your earlier log shows a **successful APK build** and backend setup. Java messages about `source value 8`, `target value 8` and deprecated APIs are compiler warnings; they did not prevent that APK from being created.

The account-selector update failed later at bare **railway link**. The script piped Railway output through PowerShell, which made Railway detect a non-interactive output stream. Its built-in selector then stopped with **--project required in non-interactive mode**, even though the account login was valid.

The repaired script:

- Uses **railway list --json** to retrieve accessible projects, including workspaces/environments.
- Parses both JSON arrays and objects; filters inaccessible environments.
- Uses ordinary PowerShell input for numbered menus, independently of Railway's terminal detection.
- Calls **railway link --project PROJECT_ID --environment ENVIRONMENT_ID --json** and verifies the returned IDs before any database migration.
- Automatically selects a project/environment when only one is available.
- Preserves current-account/new-account selection, process-only token isolation/restoration, correct backend URL selection and account/project rechecks before deployment.
- Keeps cancellations/list/auth/link failures from falling through into the old project/backend.
- Only accepts a domain from a successful Railway command.
- Ships a clean CRLF Windows launcher ending with **endlocal & exit /b %RC%**. There is no standalone **end** command. Replace the previous launcher completely if it had extra appended lines.

When changing the backend domain, use the newly printed Meta webhook and Embedded Signup callback URLs in your Meta dashboard. This script does not change that dashboard automatically.

## Validation

PowerShell syntax parsing and **193 assertions across 27 mocked setup scenarios passed**. The regression mock deliberately rejects bare `railway link`, reproducing the reported non-interactive error. It requires explicit project/environment IDs and JSON output. Its normal successful response uses **projectId/environmentId**, matching Railway’s current LinkOutput serializer. Separate cases check underscore aliases, missing fields, conflicting aliases and incorrect project/environment IDs. Scenarios include single/multiple projects and environments, first login/account switching, duplicate/invalid input, cancellation, inaccessible/empty lists, incorrect link IDs, account/project changes before deployment, secret redaction, token restoration and compiling the selected backend URL into the build request.

Commands in these tests are mocked. No production login, migration, deployment, Windows `.cmd` execution, real APK build or Xcode build was performed here. Your earlier 62.6 MB APK build was successful on your PC; it is not included in this source ZIP. Backend/mobile source is unchanged from the previous complete ZIP, so its historical tests were not rerun for this script-only fix.

For optional reproducible regression checks, use PowerShell 7:

```powershell
pwsh -NoProfile -File .\tests\RAILWAY_ACCOUNT_TESTS.ps1
```

The tests do not deploy, invoke real npm/Flutter or touch your real database/.env. Temporary test APK fixtures are deleted after the run.

For iPhone builds on your Mac, retain the separate **IPHONE_MAC_START_HERE.md** workflow. This Railway fix targets the Windows automated production/APK installer.

Official references: [Railway project listing](https://docs.railway.com/cli/list), [explicit project/environment linking](https://docs.railway.com/cli/link), and [CLI source](https://github.com/railwayapp/cli).
