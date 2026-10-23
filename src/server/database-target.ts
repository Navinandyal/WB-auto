/** Local runs honor the owner's .env; deployed production honors service variables. */
export function applyLocalDatabaseEnvironment(
  env: Record<string, string | undefined>,
  local: Record<string, string>,
): void {
  if (env.NODE_ENV === 'production' || !local.DATABASE_URL?.trim()) return;
  for (const key of ['DATABASE_URL', 'DATABASE_SSL', 'DATABASE_TARGET_HOST', 'DATABASE_TARGET_PORT', 'DATABASE_TARGET_NAME', 'DATABASE_TARGET_USER']) {
    if (local[key] !== undefined) env[key] = local[key];
  }
}

/** Fail before opening a pool if deployment variables point at another database. */
export function assertDatabaseTarget(
  connectionString: string | undefined,
  env: Record<string, string | undefined>,
): void {
  if (!env.DATABASE_TARGET_HOST) return;
  const fail = () => {
    throw new Error('DATABASE_URL does not match the selected database host, port and name. Correct the database configuration and restart; no alternate database will be used.');
  };
  if (!connectionString) return fail();
  let url: URL;
  try { url = new URL(connectionString); } catch { return fail(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return fail();
  if ([...url.searchParams.keys()].some(key =>
    ['host', 'hostaddr', 'port', 'dbname', 'database', 'service', 'user', 'password'].includes(key.toLowerCase()))) return fail();
  let database: string;
  try { database = decodeURIComponent(url.pathname.slice(1)); } catch { return fail(); }
  const port = Number(url.port || 5432);
  if (url.hostname.toLowerCase() !== env.DATABASE_TARGET_HOST.toLowerCase() ||
      port !== Number(env.DATABASE_TARGET_PORT || 5432) ||
      database !== env.DATABASE_TARGET_NAME ||
      (!!env.DATABASE_TARGET_USER && decodeURIComponent(url.username) !== env.DATABASE_TARGET_USER)) return fail();
}
