-- Growth ledger: referrals. Durable counterpart to the in-process referral
-- Map that previously lived in services/growth.ts. Ids are app-generated
-- prefixed strings (ref_…), not UUIDs. User-id columns are TEXT (no FK) to
-- mirror fbm_vendor_rooms and tolerate non-UUID test ids. Column names are the
-- snake_case of ReferralRecord (the pg writer maps camelCase ↔ snake_case).

CREATE TABLE referrals (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  referee_user_id TEXT NOT NULL,
  source_kind VARCHAR(32) NOT NULL CHECK (source_kind IN (
    'invite_link', 'ambassador', 'migration_campaign', 'creator_invite', 'coalition'
  )),
  source_ref TEXT,
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'attributed', 'settled', 'voided')),
  reward_tip_id TEXT,
  reward_cents INT CHECK (reward_cents IS NULL OR reward_cents >= 0),
  attributed_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Each referee can only be referred once (enforced app-side; mirrored here).
CREATE UNIQUE INDEX idx_referrals_referee ON referrals (referee_user_id);
CREATE INDEX idx_referrals_referrer ON referrals (referrer_user_id);
