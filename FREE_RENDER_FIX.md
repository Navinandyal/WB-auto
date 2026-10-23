# Fix: free Render setup

The previous setup rejected Free instances. This release accepts them and installs a Supabase Cron wake job automatically during the same production command.

1. Extract this project over your existing project, preserving `.env`, `GREETSYNC_RENDER.local.env`, your filled `GREETSYNC_DEPLOYMENT.json`, backup and Android signing files. The ZIP contains an empty deployment example; do not replace your filled configuration with it.
2. Keep your existing Render service on Free.
3. Run `RUN_PRODUCTION_SETUP.cmd`.

The command deploys the fix, verifies the backend, configures the Supabase job and builds `GreetSync-production.apk`. It does not ask you to select a Railway account or change your billing plan. If Supabase refuses extension creation, enable Cron (pg_cron), pg_net and Vault in its dashboard and rerun. Use the owning postgres Session pooler connection, port 5432.

Render automatically sleeps after 15 idle minutes. The external job wakes it every 20 minutes; it does not forcibly shut down active requests or send operations. Scheduled messages can be delayed about 20 minutes plus startup/queue time; outages or free-plan limits can delay them further. Existing send statuses and per-recipient failure handling still apply. No promise of exact-time delivery is possible on this sleeping service.

This source ZIP is tested locally. It does not contain a newly built APK or claim your live Render/Supabase scheduler has been configured here.
