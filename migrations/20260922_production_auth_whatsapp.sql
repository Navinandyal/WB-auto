BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL';
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users(phone) WHERE phone IS NOT NULL;

UPDATE users SET approval_status = 'PENDING_APPROVAL' WHERE approval_status = 'PENDING';
UPDATE users SET approval_status = 'ACTIVE' WHERE approval_status = 'APPROVED';

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS refresh_sessions_user_idx ON refresh_sessions(user_id);

ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS business_phone TEXT;
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'SAVED';
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS last_connection_error TEXT;
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS meta_business_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_accounts_owner_user_unique_idx ON whatsapp_accounts(owner_user_id) WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_owner_phone_idx ON contacts(owner_user_id, phone);
CREATE INDEX IF NOT EXISTS automations_status_schedule_idx ON automations(status, scheduled_at);
CREATE INDEX IF NOT EXISTS messages_owner_created_idx ON messages(owner_user_id, created_at);
CREATE INDEX IF NOT EXISTS templates_owner_status_idx ON message_templates(owner_user_id, status);

COMMIT;
