# Railway domain + PowerShell warning fix

This build fixes the setup failure that occurred after a successful Railway deployment when `railway domain list` printed a harmless warning to stderr. Windows PowerShell 5.1 converted that warning into a terminating `NativeCommandError`.

Changes:
- added a safe native-output capture helper for Railway CLI commands;
- domain discovery now uses the current `railway domain list --service ... --json` command;
- Railway domain creation retries safely and ignores non-fatal stderr warnings;
- removed deprecated `railway.json`/`railway.toml` usage;
- added a Dockerfile for deterministic Node 22/npm deployment;
- removes stale `railway.json`, `railway.toml`, and `bun.lock` automatically before upload;
- removed duplicate `vite` declaration from package.json;
- keeps Railway PostgreSQL, HTTPS domain, health verification, and release APK build flow.
