// Database pool and Drizzle client initialization
import * as dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

// Connection health tracking for resilient local fallback
export let isDatabaseConnected = false;

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: pg.Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

    if (connectionString) {
      global._postgresPool = new Pool({
        connectionString,
        max: 10,
        connectionTimeoutMillis: 4000,
      });
    } else {
      const rawPassword =
        process.env.SQL_PASSWORD ??
        process.env.SQL_ADMIN_PASSWORD ??
        process.env.POSTGRES_PASSWORD ??
        process.env.PGPASSWORD;

      const host = process.env.SQL_HOST || process.env.PGHOST || 'localhost';
      const port = parseInt(process.env.SQL_PORT || process.env.PGPORT || '5432', 10);
      const user = process.env.SQL_USER || process.env.SQL_ADMIN_USER || process.env.PGUSER || 'postgres';
      const database = process.env.SQL_DB_NAME || process.env.PGDATABASE || 'whatsapp_db';

      const poolConfig: pg.PoolConfig = {
        host,
        port,
        user,
        database,
        max: 10,
        connectionTimeoutMillis: 4000,
      };

      // Ensure password is always properly typed as a string to prevent SASL SCRAM-SHA-256 client password errors
      if (rawPassword !== undefined && rawPassword !== null) {
        poolConfig.password = String(rawPassword);
      }

      global._postgresPool = new Pool(poolConfig);
    }

    global._postgresPool.on('error', (err) => {
      // Quiet background pool connection notices
      isDatabaseConnected = false;
    });
  }
  return global._postgresPool;
};

export const pool = createPool();

export const db = drizzle(pool, { schema });

/**
 * Automatically ensures all required tables exist when starting up.
 * Enables seamless local device execution with zero manual migration steps.
 */
export const initDatabaseSchema = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          uid TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL,
          phone TEXT UNIQUE,
          password_hash TEXT,
          name TEXT,
          role TEXT NOT NULL DEFAULT 'business_user',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          approval_status TEXT NOT NULL DEFAULT 'PENDING',
          business_name TEXT,
          business_address TEXT,
          approved_at TIMESTAMP,
          approved_by_id INTEGER,
          last_login_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'PENDING';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS business_address TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by_id INTEGER;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
        CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users(phone) WHERE phone IS NOT NULL;
        CREATE TABLE IF NOT EXISTS password_reset_requests (
          id SERIAL PRIMARY KEY,
          reset_id TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code_hash TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          used_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS password_reset_requests_user_idx ON password_reset_requests(user_id);
        CREATE TABLE IF NOT EXISTS whatsapp_accounts (
          id SERIAL PRIMARY KEY,
          owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          meta_app_id TEXT NOT NULL DEFAULT '',
          meta_app_secret TEXT NOT NULL DEFAULT '',
          business_account_id TEXT NOT NULL DEFAULT '',
          phone_number_id TEXT NOT NULL DEFAULT '',
          access_token TEXT NOT NULL DEFAULT '',
          webhook_verify_token TEXT NOT NULL DEFAULT 'wa_verify_secret',
          api_version TEXT NOT NULL DEFAULT 'v21.0',
          display_phone_number TEXT,
          verified_name TEXT,
          quality_rating TEXT,
          status TEXT NOT NULL DEFAULT 'DISCONNECTED',
          last_tested_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_accounts_owner_user_unique_idx ON whatsapp_accounts(owner_user_id) WHERE owner_user_id IS NOT NULL;
        CREATE TABLE IF NOT EXISTS contacts (
          id SERIAL PRIMARY KEY,
          owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          opt_in BOOLEAN NOT NULL DEFAULT TRUE,
          dob TEXT,
          birthday_automation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          email TEXT,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS dob TEXT;
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birthday_automation_enabled BOOLEAN NOT NULL DEFAULT TRUE;
        CREATE TABLE IF NOT EXISTS contact_groups (
          id SERIAL PRIMARY KEY,
          owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS contact_group_members (
          id SERIAL PRIMARY KEY,
          group_id INTEGER NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
          contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(group_id, contact_id)
        );
        CREATE TABLE IF NOT EXISTS message_templates (
          id SERIAL PRIMARY KEY,
          owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          meta_template_id TEXT UNIQUE,
          name TEXT NOT NULL,
          language TEXT NOT NULL,
          category TEXT NOT NULL,
          status TEXT NOT NULL,
          components JSONB NOT NULL DEFAULT '[]'::jsonb,
          variable_count INTEGER NOT NULL DEFAULT 0,
          last_synced_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        CREATE TABLE IF NOT EXISTS automations (
          id SERIAL PRIMARY KEY,
          owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          template_id INTEGER NOT NULL REFERENCES message_templates(id) ON DELETE CASCADE,
          variables JSONB NOT NULL DEFAULT '{}'::jsonb,
          scheduled_at TIMESTAMP NOT NULL,
          timezone TEXT NOT NULL DEFAULT 'UTC',
          status TEXT NOT NULL DEFAULT 'SCHEDULED',
          locked_at TIMESTAMP,
          executed_at TIMESTAMP,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE automations ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          automation_id INTEGER REFERENCES automations(id) ON DELETE SET NULL,
          contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          direction TEXT NOT NULL DEFAULT 'OUTBOUND',
          message_type TEXT NOT NULL DEFAULT 'TEMPLATE',
          template_name TEXT,
          template_language TEXT,
          content TEXT,
          variables JSONB,
          whatsapp_message_id TEXT UNIQUE,
          status TEXT NOT NULL DEFAULT 'SENT',
          error_code TEXT,
          error_message TEXT,
          sent_at TIMESTAMP DEFAULT NOW(),
          delivered_at TIMESTAMP,
          read_at TIMESTAMP,
          failed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        CREATE TABLE IF NOT EXISTS automation_executions (
          id SERIAL PRIMARY KEY,
          automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
          status TEXT NOT NULL,
          attempt_number INTEGER NOT NULL DEFAULT 1,
          request_payload JSONB,
          response_payload JSONB,
          error_message TEXT,
          executed_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          action TEXT NOT NULL,
          actor TEXT NOT NULL,
          details JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      isDatabaseConnected = true;
      console.log('[Database] PostgreSQL connection verified and tables initialized.');
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    isDatabaseConnected = false;
    const msg = err?.message || String(err);
    if (msg.includes('SASL') || msg.includes('password') || msg.includes('client password')) {
      console.warn(
        '\n[Database Note] Local PostgreSQL requires authentication (SCRAM-SHA-256).\n' +
        '  To connect your local PostgreSQL database, set SQL_PASSWORD in your .env file:\n' +
        '  SQL_PASSWORD="your_postgres_password"\n' +
        '  (Running in resilient fallback mode in the meantime; all features will work locally)\n'
      );
    } else {
      console.warn('[Database Note] PostgreSQL is offline or unreachable:', msg);
    }
    return false;
  }
};
