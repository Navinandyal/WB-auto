-- GreetSync multi-tenant hardening.
-- In the current project, each BUSINESS_OWNER user row is the tenant/business record.
-- owner_user_id therefore acts as business_id across business-owned tables.

CREATE INDEX IF NOT EXISTS idx_contacts_owner_user_id ON contacts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_contact_groups_owner_user_id ON contact_groups(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_templates_owner_user_id ON message_templates(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_automations_owner_user_id_status_scheduled ON automations(owner_user_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_messages_owner_user_id_created_at ON messages(owner_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_owner_user_id ON whatsapp_accounts(owner_user_id);

-- Add uniqueness only when existing data is already clean, so this migration does not
-- break an upgraded installation that contains legacy duplicates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM contacts GROUP BY owner_user_id, phone HAVING COUNT(*) > 1 LIMIT 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_contacts_owner_phone ON contacts(owner_user_id, phone);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM contact_group_members GROUP BY group_id, contact_id HAVING COUNT(*) > 1 LIMIT 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_contact_group_member ON contact_group_members(group_id, contact_id);
  END IF;
END $$;
