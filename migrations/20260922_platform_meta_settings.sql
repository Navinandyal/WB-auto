CREATE TABLE IF NOT EXISTS platform_meta_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  meta_app_id TEXT NOT NULL DEFAULT '',
  meta_app_secret TEXT NOT NULL DEFAULT '',
  embedded_signup_config_id TEXT NOT NULL DEFAULT '',
  graph_api_version TEXT NOT NULL DEFAULT 'v21.0',
  webhook_verify_token TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE platform_meta_settings ADD COLUMN IF NOT EXISTS webhook_verify_token TEXT NOT NULL DEFAULT '';
