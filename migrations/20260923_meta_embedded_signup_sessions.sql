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
CREATE INDEX IF NOT EXISTS meta_embedded_signup_sessions_user_idx ON meta_embedded_signup_sessions(user_id);
CREATE INDEX IF NOT EXISTS meta_embedded_signup_sessions_status_idx ON meta_embedded_signup_sessions(status);
