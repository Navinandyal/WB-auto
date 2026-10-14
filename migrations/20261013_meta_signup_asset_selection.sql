ALTER TABLE meta_embedded_signup_sessions ADD COLUMN IF NOT EXISTS pending_access_token TEXT;
ALTER TABLE meta_embedded_signup_sessions ADD COLUMN IF NOT EXISTS selection_options JSONB;
