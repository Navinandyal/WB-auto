# Railway CLI Login Fix — 29 Sep 2026

The previous production setup stopped after installing the Railway CLI because Windows PowerShell 5.1 resolved the npm PowerShell shim (`railway.ps1`). When Railway returned `Unauthorized`, the shim surfaced `node.exe` stderr as a terminating PowerShell error before the script could reach the intended login fallback.

## Fixed

- Prefers `railway.cmd` on Windows instead of `railway.ps1`.
- Native commands now use the process exit code instead of treating stderr as a fatal PowerShell exception.
- Detects whether Railway is authenticated.
- If not authenticated, automatically runs `railway login` and waits for browser authorization.
- Falls back to `railway login --browserless` if normal browser login fails.
- Supports `RAILWAY_TOKEN` / `RAILWAY_API_TOKEN` authentication when already configured.
- Verifies project linking after login and guides selection of the existing Railway project that contains PostgreSQL.
- Uses the resolved Railway executable for domain, variables, deploy and service commands.
- Keeps setup idempotent so rerunning it continues from an already migrated/built project.
- Removed `NODE_ENV=production` from local `.env` generation to avoid Vite's local `.env` warning; Railway still receives `NODE_ENV=production` as a service variable.

## Run

Double-click `RUN_PRODUCTION_SETUP.cmd`.

When the Railway browser opens, log in to the same Railway account that owns the PostgreSQL project, authorize the CLI, return to the terminal, and continue.
