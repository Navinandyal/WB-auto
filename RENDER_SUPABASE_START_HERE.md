# GreetSync — Render backend + Supabase PostgreSQL

The app's login, business/admin screens, contacts/groups, templates, WhatsApp connection, schedules, bulk sends and API routes remain the same. Hosting changes to Render + Supabase. No Railway CLI, account selection or Railway database fallback is used by the current production command.

## What is ready, and what you must supply once

This source project includes the migration, Git publishing, Render deployment, health verification and APK build workflow. It does not include a live Render service, Supabase project, your PostgreSQL backup, hosting credentials or a newly built APK.

1. Create an **empty Supabase project** and copy its **Session pooler connection string, port 5432**, from **Connect**. Use the database password, not the anon/publishable API key. URL-encode special password characters. A reachable direct connection on 5432 is also accepted; the Session pooler works on IPv4-only Windows networks. Transaction pooling on 6543 is deliberately rejected for this long-running backend/migration workflow.
2. Create a **dedicated backend Git repository**, with an initial commit and a branch such as `main`. Give your local Git credential manager write access, and connect the same repository/branch to a **Render Docker web service**. Use an empty Root Directory, the supplied Dockerfile and `/api/health` as the health-check path. Choose **Free** (the supplied `render.yaml` uses Free, one instance). The setup accepts Free and paid services without changing billing. Supabase Cron wakes the service every 20 minutes so it can sleep after 15 minutes without traffic. Scheduled jobs remain in PostgreSQL and are processed by the normal worker on wake. Timing is best effort: expect up to about 20 minutes of delay plus cold-start/queue time, potentially longer during provider downtime/limits. Active app use and incoming WhatsApp webhooks can keep it awake longer.
3. In `GREETSYNC_DEPLOYMENT.json`, fill only the actual `serviceId` (`srv-...`) and permanent HTTPS `backendUrl` shown by Render. Keep `provider: render` and `databaseProvider: supabase`. If you intentionally use a verified custom domain instead of Render's default URL, set `customDomainVerified` to true. The script checks that it serves the exact new release before accepting it.
4. Copy `GREETSYNC_RENDER.local.env.example` to **`GREETSYNC_RENDER.local.env`**. Set `RENDER_API_KEY`, `SUPABASE_DATABASE_URL` and the path to your backup in `DATABASE_RESTORE_FILE`. Keep your old private `.env` so its **original** `AUTH_TOKEN_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, Meta, AI and Firebase settings can be reused. You can also put those original values in the new private file. Do not paste secrets into Git or the mobile source.
5. Before the first restore, stop the old Railway backend/workers and take the final backup. Set `MIGRATION_SOURCE_STOPPED=true` only after doing this. This prevents old and new workers sending the same scheduled messages from two independent databases. The script does not delete or modify your old Railway database.

If Render deploys the initial repository before your import is ready, the backend intentionally refuses to start workers or seed an administrator until the Supabase restore marker is present. The completed setup triggers a fresh verified deployment afterwards.

## One command after that setup

In your normal project folder on Windows, run:

```bat
RUN_PRODUCTION_SETUP.cmd
```

It automatically:

1. Installs dependencies and validates/builds backend source.
2. Prepares the current application schema in the selected Supabase project.
3. Restores the Railway backup **once**, checks the original encryption key, preserves IDs/relationships/data, verifies per-table row counts and records completion.
4. Runs current application migrations.
5. Pushes the current backend source to the Render-connected Git branch using an isolated clone. No force push or reset of your working repository is performed.
6. Sets the required Render environment values individually, preserving unrelated service variables. Automatic deploy-on-push is disabled so the verified commit and environment are deployed together.
7. Deploys that exact commit and waits for it to be live. An ambiguous deploy response is not blindly repeated.
8. Verifies the public health endpoint reports the expected release, exact Git commit and Supabase project identity. An old backend cannot pass.
9. Installs/updates a named Supabase Cron job (`*/20 * * * *`) using pg_cron, pg_net and Vault. The purpose-specific wake token is encrypted in Vault, not embedded in the cron command or APK. If extension setup fails, enable Cron, pg_net and Vault in the Supabase dashboard and rerun with the owning postgres connection. No hosting account selection is added.
10. Saves the new API address for future Flutter builds, builds Android **1.0.8+9**, verifies package/signature/update compatibility, and publishes **`GreetSync-production.apk`**.

Later runs skip the completed database import and preserve existing Supabase data. They still push/deploy your code and build a fresh verified APK. Keep the same backup file or archive it; pointing a completed migration at a different backup is refused rather than overwriting live data.

`BUILD_APK_ONLY.cmd` builds against the already verified Render deployment and completed Supabase migration. `RUN_PRODUCTION_SETUP.cmd -SkipApkBuild` explicitly deploys without rebuilding Android. Do not use the old `-SkipRailwayDeploy` flag.

## Backup support and safeguards

Supported inputs are a PostgreSQL custom-format `pg_dump` archive (usually `.dump` or `.backup`) or a complete **UTF-8, COPY-format** `.sql` dump. PostgreSQL 18 client tools installed under `C:\Program Files\PostgreSQL\18\bin` are detected automatically; another location can be set using `POSTGRES_BIN`. Paths containing spaces work.

A custom archive is decoded with `pg_restore` first. The importer reads only known GreetSync COPY data and numeric sequence state; source schema, role, ownership and grant commands are not executed. The current app supplies the schema. Supabase-managed `auth`, `storage` and other schemas are not replaced. A nonempty GreetSync target, incomplete/unsupported dump, unexpected table or invalid relationship stops the import. Data import and its completion marker share a transaction; sequence values are not transactional in PostgreSQL but are restored/fixed to avoid ID collisions on retry.

Plain SQL exported with `--inserts`, directory/tar archives and unrelated schemas are not accepted automatically. Supply the backup for inspection if its format is different. Never use `pg_restore --clean`, `DROP SCHEMA public` or restore Railway roles into Supabase as a workaround.

The app continues to use its existing backend authentication and business isolation. It does not switch users to Supabase Auth. Application tables have RLS enabled and client-role grants revoked, so Supabase's public Data API does not expose WhatsApp credentials or business data. The privileged owning database role is used only by the backend.

The original encryption key is required to read stored encrypted WhatsApp/Meta credentials. The original auth secret preserves session signatures. Setup does not generate replacements for imported data. Backups, private configuration, signing keys and `.env` are excluded from publishing and Docker context.

In-flight `PROCESSING` messages in the backup are marked as uncertain at cutover and require receipt/review rather than being sent a second time. Other saved jobs and message history remain available. A backup cannot contain changes made after it was taken: stop source activity before the final dump.

## Meta settings that need the new domain once

After Render is live, use these addresses in your existing Meta app, replacing `YOUR-SERVICE` with its real domain:

- Webhook callback: `https://YOUR-SERVICE.onrender.com/api/webhooks/whatsapp`
- Embedded Signup / OAuth callback: `https://YOUR-SERVICE.onrender.com/meta/embedded-signup/callback`
- App domains / allowed website domain: your Render/custom backend domain
- Privacy policy: `https://YOUR-SERVICE.onrender.com/privacy-policy`
- Terms: `https://YOUR-SERVICE.onrender.com/terms-and-conditions`

Keep the existing Meta verify token and app/WABA credentials. Update the Meta dashboard's allowed domains, valid OAuth redirect URI and messages webhook callback to the new domain, then test the WhatsApp connection in GreetSync. Changing the hosting provider cannot silently add an unapproved domain to Facebook Login settings. The app's screens and Embedded Signup flow are retained; source URL detection and callback overrides now use Render. Existing APKs that still point to Railway must be updated to the newly built APK.

## Verification and practical limits

Local validation covers backend TypeScript/build, all existing regressions, PostgreSQL COPY/foreign-key/sequence restoration, rollback, Supabase client-role isolation, Git publishing against an isolated bare repository, mocked Render API deployment ordering and exact health checks, APK signing/install helper fixtures, mobile source analysis and executable import/name/preview/backend checks.

No real backup or new account credentials were supplied in this session. No cloud resources were created, database restored online, Git branch pushed online, Meta dashboard changed, or real Android/iOS package built here. The command is ready to perform those configured operations on your development PC. Flutter, Android SDK and the original signing files must remain available there. A signed IPA still requires your Mac/Xcode/Apple signing setup.

Official documentation:
- https://render.com/docs/deploy-an-image#dockerfile
- https://render.com/docs/free
- https://api-docs.render.com/reference/create-deploy
- https://api-docs.render.com/reference/update-env-var
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres
- https://supabase.com/docs/guides/database/postgres/row-level-security


## Free Render sleep and scheduler

Render controls idle sleep automatically after 15 minutes without inbound traffic. The app does not kill its process or suspend the service every 15 minutes: doing that could interrupt a bulk send, webhook or login. A Supabase Cron HTTP POST wakes it at minutes 00, 20 and 40 of each hour (UTC). The endpoint authenticates a dedicated HMAC token and only confirms startup; it never accepts recipient IDs or forces/replays messages. Existing due-date checks and atomic per-message claims remain in effect.

Supabase Dashboard → Cron shows the job named `greetsync-wake-srv-...`. Cron success means the HTTP request was queued, not that a WhatsApp message was delivered. Check `net._http_response` for HTTP status/timeouts and the app for per-recipient send outcomes. A cold start can take longer than the 120-second HTTP timeout; the request may still wake the backend, whose workers then resume. If Supabase is paused, Render is suspended, or provider limits are reached, the scheduler cannot guarantee execution. Free service limits still apply.

You can disable only this job in Supabase Cron if you want no automatic wakeups; scheduled messages then wait for an app request or incoming webhook to wake Render. Do not disable unrelated jobs. Re-running production setup re-enables this named job and updates its Vault token/URL without adding duplicate jobs. Changing the original authentication key also affects existing login sessions and is not needed for this update.

Supabase Cron docs: https://supabase.com/docs/guides/cron/quickstart
Vault docs: https://supabase.com/docs/guides/database/vault
