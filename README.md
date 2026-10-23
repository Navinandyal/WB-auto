# GreetSync

**Current hosting: Render backend + Supabase PostgreSQL.** Start with [RENDER_SUPABASE_START_HERE.md](RENDER_SUPABASE_START_HERE.md).

After filling your one-time private configuration and backup path, run:

```bat
RUN_PRODUCTION_SETUP.cmd
```

This restores the database once, pushes backend source to the configured Render Git repository, deploys and verifies the exact release, then builds/signature-checks `GreetSync-production.apk` (Android **1.0.8+9**). It retains existing business/admin workflows, WhatsApp connections, contacts/groups, templates, scheduled jobs and bulk sending.

The new Render/Supabase settings and your database backup have not been supplied. There is no prebuilt APK or live cloud deployment inside this ZIP. Preserve your existing `.env` encryption/auth secrets and Android signing files. Private files and backups are not pushed with backend source.

Read the setup guide for the free Render instance with Supabase wake scheduler, Supabase Session pooler, first restore, Meta callback/domain changes and test limitations. Other dated guides describe older releases; their Railway hosting instructions are historical.
