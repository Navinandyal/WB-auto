export { runMigration } from '../server/db/migrate.ts';
import { runMigration } from '../server/db/migrate.ts';

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('migrate.ts')) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
