import 'dotenv/config';
import { initDatabaseSchema, pool } from './index.ts';
import { ensureFixedAdminUser } from './users.ts';

export async function runMigration(): Promise<void> {
  const connected = await initDatabaseSchema();
  if (!connected) {
    throw new Error('Database migration failed: PostgreSQL is unreachable. Check DATABASE_URL / SQL_* settings.');
  }

  await ensureFixedAdminUser();
  console.log('[Database] GreetSync schema is ready.');
}

runMigration()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Database] Migration failed:', error?.message || error);
    try { await pool.end(); } catch (_) {}
    process.exit(1);
  });
