-- Who a campaign's money is for, and how it divides.
--
-- `beneficiary_user_id` is nullable because plenty of campaigns legitimately
-- have none: a drive pays its organiser, and a mutual-aid post mirrored in from
-- FreeBlackMarket has no payable author at all — that projection withholds the
-- requester's id on purpose. Absent means "fall back to the organiser".
--
-- Payees carry integer basis points rather than percentages so a three-way
-- split is exact and the active rows can be required to sum to 10000 with no
-- rounding argument. Upsert-only with an `active` flag, TEXT ids and no
-- cross-table foreign keys, matching every other table in 091.
ALTER TABLE coalition_campaigns ADD COLUMN IF NOT EXISTS beneficiary_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_coalition_campaigns_beneficiary
  ON coalition_campaigns (beneficiary_user_id);

CREATE TABLE coalition_campaign_payees (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  coalition_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  share_bps INTEGER NOT NULL CHECK (share_bps >= 0 AND share_bps <= 10000),
  role VARCHAR(40) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX idx_coalition_campaign_payees_member
  ON coalition_campaign_payees (campaign_id, user_id);
CREATE INDEX idx_coalition_campaign_payees_campaign
  ON coalition_campaign_payees (campaign_id, active);
