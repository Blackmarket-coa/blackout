DROP INDEX IF EXISTS idx_coalition_campaign_payees_campaign;
DROP INDEX IF EXISTS idx_coalition_campaign_payees_member;
DROP TABLE IF EXISTS coalition_campaign_payees;
DROP INDEX IF EXISTS idx_coalition_campaigns_beneficiary;
ALTER TABLE coalition_campaigns DROP COLUMN IF EXISTS beneficiary_user_id;
