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
