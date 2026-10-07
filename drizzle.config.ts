import * as dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

dotenv.config();

const rawPassword =
  process.env.SQL_PASSWORD ??
  process.env.SQL_ADMIN_PASSWORD ??
  process.env.POSTGRES_PASSWORD ??
  process.env.PGPASSWORD;

const password = rawPassword !== undefined && rawPassword !== null ? String(rawPassword) : undefined;
const host = process.env.SQL_HOST || process.env.PGHOST || 'localhost';
const port = parseInt(process.env.SQL_PORT || process.env.PGPORT || '5432', 10);
const user = process.env.SQL_USER || process.env.SQL_ADMIN_USER || process.env.PGUSER || 'postgres';
const database = process.env.SQL_DB_NAME || process.env.PGDATABASE || 'whatsapp_db';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: connectionString
    ? { url: connectionString }
    : {
        host,
        port,
        user,
        password: password ? String(password) : '',
        database,
        ssl: false,
      },
  verbose: true,
});
