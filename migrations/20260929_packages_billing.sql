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
