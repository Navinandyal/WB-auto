# GreetSync — One-Click Production Setup

Use **RUN_PRODUCTION_SETUP.cmd** from the project root.

For the AI generator, add GEMINI_API_KEY (or GOOGLE_API_KEY) to the local `.env` before deploying. The script now uploads nonempty server AI/Meta settings and preserves GEMINI_TEMPLATE_MODEL. If you skip Railway deployment, set the key directly in the backend service Variables and redeploy. See GREETSYNC_DELIVERY_AI_KEY_FIXES_20261006.md for delivery webhook setup and verification.

The script:

1. validates Node/npm;
2. asks for the new/rotated Railway PostgreSQL `DATABASE_URL` if needed;
3. generates production auth/encryption secrets when missing;
4. creates `.env` without putting secrets in Flutter;
5. installs backend dependencies;
6. type-checks/builds the backend;
7. migrates/initializes Railway PostgreSQL;
8. installs/authenticates Railway CLI when needed;
9. links you to the existing Railway project containing PostgreSQL;
10. creates or reuses the `wishflow-backend` service;
11. configures production variables;
12. deploys the backend;
13. generates/reuses a permanent `*.up.railway.app` HTTPS domain;
14. changes GreetSync's production callback resolution to use that permanent URL rather than stale ngrok settings;
15. verifies `/api/health`;
16. builds the release APK with the Railway backend URL compiled through `API_BASE_URL`;
17. copies it to `GreetSync-production.apk` in the project root;
18. writes `PRODUCTION_DEPLOYMENT_INFO.txt` with the non-secret URLs required for Meta configuration.

## Important

Railway login/project selection is necessarily interactive because only the Railway account owner can authorize access. When prompted, choose the existing Railway project that contains your PostgreSQL database.

The script does **not** put `DATABASE_URL`, Meta App Secret, WhatsApp tokens, JWT secrets or encryption keys inside the APK.

Before using the database URL that was previously shared in chat, rotate its PostgreSQL password in Railway and use the new URL.

For Meta production onboarding, the Meta Developer dashboard still needs its public webhook/callback configuration and app publishing/review to be completed by the Meta app administrator. The generated `PRODUCTION_DEPLOYMENT_INFO.txt` gives the permanent URLs to use.
