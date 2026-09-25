/**
 * Database Migration Script using Drizzle ORM
 * 
 * Initializes all PostgreSQL database tables including `whatsapp_accounts`,
 * seeds standard approved templates, and verifies connection parameters.
 * 
 * Run with: npm run db:migrate or tsx src/server/db/migrate.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema.ts';

const { Client } = pg;

export async function runMigration() {
  console.log('\n========================================');
  console.log('🚀 Starting PostgreSQL Database Migration');
  console.log('========================================\n');

  // Fix environment variable loading: Ensure password is typed as a string
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

  const clientConfig: pg.ClientConfig = connectionString
    ? { connectionString }
    : {
        host,
        port,
        user,
        database,
        password: password !== undefined ? String(password) : undefined,
      };

  console.log(`📡 Connecting to PostgreSQL at ${connectionString ? 'DATABASE_URL' : `${host}:${port}/${database}`} (user: ${user})...`);

  const client = new Client(clientConfig);

  try {
    await client.connect();
    console.log('✅ Connected successfully to PostgreSQL.');

    const db = drizzle(client, { schema });

    console.log('📦 Creating and verifying database tables with Drizzle ORM...');

    // 1. Users table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uid TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('   ✓ Table verified: users');

    await db.execute(sql`
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
    `);
    console.log('   ✓ Table verified: biometric_credentials');

    // 2. WhatsApp Accounts table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_accounts (
        id SERIAL PRIMARY KEY,
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
    `);
    console.log('   ✓ Table verified: whatsapp_accounts');

    // 3. Contacts table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        opt_in BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('   ✓ Table verified: contacts');

    // 4. Message Templates table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS message_templates (
        id SERIAL PRIMARY KEY,
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
    `);
    console.log('   ✓ Table verified: message_templates');

    // 5. Automations table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS automations (
        id SERIAL PRIMARY KEY,
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
    `);
    console.log('   ✓ Table verified: automations');

    // 6. Messages table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
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
    `);
    console.log('   ✓ Table verified: messages');

    // 7. Automation Executions table
    await db.execute(sql`
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
    `);
    console.log('   ✓ Table verified: automation_executions');

    // 8. Audit Logs table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('   ✓ Table verified: audit_logs');

    // Seed default approved templates if none exist
    const templateCheck = await db.execute(sql`SELECT count(*) as count FROM message_templates;`);
    const count = parseInt(String(templateCheck.rows[0]?.count || '0'), 10);
    if (count === 0) {
      console.log('🌱 Seeding initial approved WhatsApp templates...');
      await db.execute(sql`
        INSERT INTO message_templates (meta_template_id, name, language, category, status, components, variable_count)
        VALUES 
        (
          'meta_tpl_appointment_confirmation',
          'appointment_confirmation',
          'en_US',
          'UTILITY',
          'APPROVED',
          '[{"type": "BODY", "text": "Hello {{1}}, your appointment {{2}} has been confirmed for {{3}}. Reply STOP to unsubscribe."}]'::jsonb,
          3
        ),
        (
          'meta_tpl_payment_reminder',
          'payment_reminder',
          'en_US',
          'UTILITY',
          'APPROVED',
          '[{"type": "BODY", "text": "Dear {{1}}, this is a reminder that invoice {{2}} is due on {{3}}. Thank you!"}]'::jsonb,
          3
        ),
        (
          'meta_tpl_welcome_greeting',
          'welcome_greeting',
          'en_US',
          'MARKETING',
          'APPROVED',
          '[{"type": "BODY", "text": "Welcome {{1}}! We are thrilled to have you with us. Let us know if you need any assistance."}]'::jsonb,
          1
        )
        ON CONFLICT DO NOTHING;
      `);
      console.log('   ✓ Seeded 3 default approved templates.');
    }

    // No demo contacts are seeded. Business data must come from real user input.

    console.log('\n========================================');
    console.log('🎉 Migration Completed Successfully!');
    console.log('========================================\n');
    return true;
  } catch (err: any) {
    console.error('\n❌ Migration failed with error:', err.message);
    if (err.message.includes('SASL') || err.message.includes('client password must be a string') || err.message.includes('password')) {
      console.error(
        '👉 Authentication Hint: Set SQL_PASSWORD in your .env file as a string:\n' +
        '   SQL_PASSWORD="your_postgres_password"\n'
      );
    }
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

// Auto-run if executed directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('migrate.ts')) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
