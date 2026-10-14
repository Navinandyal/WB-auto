ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS waba_name TEXT;
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS meta_business_name TEXT;
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS business_profile JSONB;
