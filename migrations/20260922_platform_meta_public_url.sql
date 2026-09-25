ALTER TABLE platform_meta_settings
ADD COLUMN IF NOT EXISTS public_base_url TEXT NOT NULL DEFAULT '';
