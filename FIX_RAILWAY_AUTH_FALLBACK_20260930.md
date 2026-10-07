# GreetSync Railway Authentication Fallback Fix — 2026-09-30

## Problem
`RUN_PRODUCTION_SETUP.cmd` stopped after the backend build when the local Railway CLI session expired. The script attempted a browser login and then `railway login --browserless`; when browserless login failed, the whole production setup terminated even though the already-deployed production backend was healthy.

A second issue cleared `PUBLIC_BASE_URL` before Railway authentication was checked, removing the URL that could have been used for a safe APK build fallback.

## Fix
- Preserve the last known `PUBLIC_BASE_URL`/`META_PUBLIC_BASE_URL` instead of clearing it.
- Use the existing deployment info as another URL source when available.
- Keep the current production backend URL as a final known fallback for this project.
- Verify the existing backend with `/api/health` when Railway CLI authentication is unavailable.
- If the backend is healthy, skip only Railway redeployment and continue directly to the Android release APK build.
- Do not force `railway login --browserless`.
- If the backend is not healthy and Railway is unauthenticated, normal Railway browser login is still required.

## Important
If backend source code changes and must be deployed, authenticate first with:

```cmd
railway login
```

Then rerun:

```cmd
RUN_PRODUCTION_SETUP.cmd
```

If only the APK needs to be rebuilt and the existing production backend is healthy, the setup now continues automatically even when the Railway login has expired.
