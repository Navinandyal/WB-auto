-- GreetSync account deletion retention window
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS purge_after TIMESTAMP;
CREATE INDEX IF NOT EXISTS users_purge_after_idx ON users(purge_after) WHERE purge_after IS NOT NULL;
