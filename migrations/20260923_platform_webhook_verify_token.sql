ALTER TABLE platform_meta_settings ADD COLUMN IF NOT EXISTS webhook_verify_token TEXT NOT NULL DEFAULT '';
