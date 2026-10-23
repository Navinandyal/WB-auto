import { protectSupabaseTables } from '../server/supabase-access.ts';
// Database pool and Drizzle client initialization
import * as dotenv from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { assertDatabaseTarget, applyLocalDatabaseEnvironment } from '../server/database-target.ts';
dotenv.config();
if (process.env.NODE_ENV !== 'production' && existsSync('.env')) {
  applyLocalDatabaseEnvironment(process.env, dotenv.parse(readFileSync('.env')));
}

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
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  assertDatabaseTarget(connectionString, process.env);
  if (global._postgresPool && process.env.DATABASE_TARGET_HOST &&
      global._postgresPool.options.connectionString !== connectionString) {
    throw new Error('Database configuration changed. Restart the backend to use the selected connection.');
  }
  if (!global._postgresPool) {

    if (process.env.NODE_ENV === 'production' && !connectionString) {
      throw new Error('DATABASE_URL is required in production. Configure the Supabase Session pooler DATABASE_URL on the backend service.');
    }

    if (connectionString) {
      const isLocal = /(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(connectionString);
      const sslDisabled = String(process.env.DATABASE_SSL || '').toLowerCase() === 'false';
      global._postgresPool = new Pool({
        connectionString,
        ssl: isLocal || sslDisabled ? false : { rejectUnauthorized: false },
        max: 10,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
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
          deletion_requested_at TIMESTAMP,
          purge_after TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'PENDING';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS business_address TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS business_logo_data TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by_id INTEGER;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS purge_after TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_version TEXT;
        CREATE INDEX IF NOT EXISTS users_purge_after_idx ON users(purge_after) WHERE purge_after IS NOT NULL;
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
        CREATE TABLE IF NOT EXISTS refresh_sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          revoked_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS refresh_sessions_user_idx ON refresh_sessions(user_id);
        CREATE TABLE IF NOT EXISTS biometric_credentials (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          credential_id TEXT NOT NULL UNIQUE,
          secret_hash TEXT NOT NULL,
          device_label TEXT NOT NULL DEFAULT 'Android device',
          last_used_at TIMESTAMP,
          revoked_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS biometric_credentials_user_idx ON biometric_credentials(user_id);
        CREATE INDEX IF NOT EXISTS biometric_credentials_active_idx ON biometric_credentials(user_id, revoked_at);
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
          business_phone TEXT,
          display_phone_number TEXT,
          verified_name TEXT,
          quality_rating TEXT,
          connection_status TEXT NOT NULL DEFAULT 'SAVED',
          last_connection_error TEXT,
          meta_business_id TEXT,
          status TEXT NOT NULL DEFAULT 'DISCONNECTED',
          last_tested_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS business_phone TEXT;
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'SAVED';
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS last_connection_error TEXT;
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS meta_business_id TEXT;
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS waba_name TEXT;
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS meta_business_name TEXT;
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS business_profile JSONB;
        CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_accounts_owner_user_unique_idx ON whatsapp_accounts(owner_user_id) WHERE owner_user_id IS NOT NULL;
        CREATE TABLE IF NOT EXISTS platform_meta_settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          meta_app_id TEXT NOT NULL DEFAULT '',
          meta_app_secret TEXT NOT NULL DEFAULT '',
          embedded_signup_config_id TEXT NOT NULL DEFAULT '',
          graph_api_version TEXT NOT NULL DEFAULT 'v21.0',
          public_base_url TEXT NOT NULL DEFAULT '',
          webhook_verify_token TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE platform_meta_settings ADD COLUMN IF NOT EXISTS public_base_url TEXT NOT NULL DEFAULT '';
        ALTER TABLE platform_meta_settings ADD COLUMN IF NOT EXISTS webhook_verify_token TEXT NOT NULL DEFAULT '';
        CREATE TABLE IF NOT EXISTS meta_embedded_signup_sessions (
          id SERIAL PRIMARY KEY,
          session_id TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          state_hash TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'PENDING',
          redirect_uri TEXT NOT NULL,
          error_message TEXT,
          waba_id TEXT,
          phone_number_id TEXT,
          display_phone_number TEXT,
          verified_name TEXT,
          expires_at TIMESTAMP NOT NULL,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE meta_embedded_signup_sessions ADD COLUMN IF NOT EXISTS pending_access_token TEXT;
        ALTER TABLE meta_embedded_signup_sessions ADD COLUMN IF NOT EXISTS selection_options JSONB;
        CREATE INDEX IF NOT EXISTS meta_embedded_signup_sessions_user_idx ON meta_embedded_signup_sessions(user_id);
        CREATE INDEX IF NOT EXISTS meta_embedded_signup_sessions_status_idx ON meta_embedded_signup_sessions(status);
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
          avatar_data TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS dob TEXT;
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birthday_automation_enabled BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_data TEXT;
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
          display_name TEXT,
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
        ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS display_name TEXT;
        UPDATE message_templates SET display_name = name WHERE display_name IS NULL;
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
        ALTER TABLE automations ADD COLUMN IF NOT EXISTS template_snapshot JSONB;
        ALTER TABLE automations ADD COLUMN IF NOT EXISTS send_request_id TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS automations_send_request_idx ON automations(send_request_id);
        ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS edit_submissions JSONB NOT NULL DEFAULT '[]'::jsonb;
        CREATE TABLE IF NOT EXISTS message_media (
          media_id TEXT PRIMARY KEY, owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          mime_type TEXT NOT NULL, file_name TEXT NOT NULL, data_base64 TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS meta_webhook_inbox (id BIGSERIAL PRIMARY KEY,payload JSONB NOT NULL,processed_at TIMESTAMP,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at TIMESTAMP NOT NULL DEFAULT NOW(),next_attempt_at TIMESTAMP NOT NULL DEFAULT NOW());
        ALTER TABLE meta_webhook_inbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP NOT NULL DEFAULT NOW();
        CREATE TABLE IF NOT EXISTS push_devices (
          token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS onboarding_mode TEXT NOT NULL DEFAULT 'CLOUD_API';
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS coexistence_sync_status TEXT NOT NULL DEFAULT 'NOT_STARTED';
        ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS coexistence_sync_requests JSONB NOT NULL DEFAULT '{}'::jsonb;
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
        -- Preserve historical direct sends in the same message activity list.
        INSERT INTO automations(owner_user_id,contact_id,template_id,variables,template_snapshot,scheduled_at,timezone,status,executed_at,error_message,send_request_id)
        SELECT m.owner_user_id,m.contact_id,t.id,COALESCE(m.variables,'{}'::jsonb)||'{"__send_now":"true","__legacy_preview":"true"}'::jsonb,
          jsonb_build_object('name',t.name,'language',t.language,'category',t.category,'components',t.components),
          COALESCE(m.sent_at,m.created_at,NOW()),'Asia/Kolkata',m.status,COALESCE(m.sent_at,m.created_at,NOW()),m.error_message,'legacy_message_'||m.id
        FROM messages m JOIN LATERAL(SELECT * FROM message_templates WHERE owner_user_id=m.owner_user_id AND name=m.template_name AND language=m.template_language LIMIT 1)t ON TRUE
        WHERE m.automation_id IS NULL AND m.direction='OUTBOUND' AND m.message_type='TEMPLATE'
        ON CONFLICT(send_request_id) DO NOTHING;
        UPDATE messages m SET automation_id=a.id FROM automations a WHERE m.automation_id IS NULL AND a.send_request_id='legacy_message_'||m.id;
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
        CREATE INDEX IF NOT EXISTS contacts_owner_phone_idx ON contacts(owner_user_id, phone);
        CREATE INDEX IF NOT EXISTS automations_status_schedule_idx ON automations(status, scheduled_at);
        CREATE INDEX IF NOT EXISTS messages_owner_created_idx ON messages(owner_user_id, created_at);
        CREATE INDEX IF NOT EXISTS templates_owner_status_idx ON message_templates(owner_user_id, status);
        CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          target_role TEXT NOT NULL DEFAULT 'BUSINESS',
          type TEXT NOT NULL DEFAULT 'SYSTEM',
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          entity_type TEXT,
          entity_id INTEGER,
          read_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS notifications_role_idx ON notifications(target_role, created_at DESC);
        CREATE TABLE IF NOT EXISTS subscription_packages (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          package_type TEXT NOT NULL DEFAULT 'BASE',
          benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
          message_limit INTEGER NOT NULL DEFAULT 0,
          contact_limit INTEGER NOT NULL DEFAULT 0,
          automation_limit INTEGER NOT NULL DEFAULT 0,
          price_paise INTEGER NOT NULL DEFAULT 0,
          duration_months INTEGER NOT NULL DEFAULT 1,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS user_subscriptions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          package_id INTEGER NOT NULL REFERENCES subscription_packages(id) ON DELETE RESTRICT,
          status TEXT NOT NULL DEFAULT 'PENDING',
          starts_at TIMESTAMP,
          ends_at TIMESTAMP,
          approved_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          price_paise_snapshot INTEGER NOT NULL DEFAULT 0,
          message_limit_snapshot INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS subscription_packages_active_idx ON subscription_packages(is_active, package_type);
        CREATE INDEX IF NOT EXISTS user_subscriptions_user_status_idx ON user_subscriptions(user_id, status);
        CREATE INDEX IF NOT EXISTS user_subscriptions_end_idx ON user_subscriptions(ends_at);
        CREATE TABLE IF NOT EXISTS template_suggestions (
          id SERIAL PRIMARY KEY,
          created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          festival TEXT,
          description TEXT,
          template_name TEXT NOT NULL,
          language TEXT NOT NULL DEFAULT 'en_US',
          category TEXT NOT NULL DEFAULT 'MARKETING',
          header TEXT,
          body TEXT NOT NULL,
          footer TEXT,
          buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
          active_from TIMESTAMP,
          active_until TIMESTAMP,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS template_suggestions_active_idx ON template_suggestions(is_active, active_from, active_until);
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          action TEXT NOT NULL,
          actor TEXT NOT NULL,
          details JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      if (process.env.DATABASE_PROVIDER === 'supabase') {
        await client.query(`CREATE TABLE IF NOT EXISTS greetsync_deployment_migrations (
          id TEXT PRIMARY KEY, backup_sha256 TEXT NOT NULL, target_fingerprint TEXT NOT NULL,
          row_counts JSONB NOT NULL DEFAULT '{}'::jsonb, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
        await protectSupabaseTables(client);
      }
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
        '  Production startup and scheduled sending remain stopped until the database is reachable.\n'
      );
    } else {
      console.warn('[Database Note] PostgreSQL is offline or unreachable:', msg);
    }
    return false;
  }
};
