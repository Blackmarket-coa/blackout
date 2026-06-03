-- Growth ledger: bounty rewards. Durable counterpart to the in-process
-- bounty-reward Map from services/growth.ts. One reward per bounty (idempotent
-- on completion). `reward_type` mirrors the @blackout/core BountyRewardType
-- union; kept as TEXT so new reward types don't require a migration.

CREATE TABLE bounty_rewards (
  id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL,
  beneficiary_id TEXT NOT NULL,
  poster_id TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  reward_summary TEXT NOT NULL,
  reward_cents INT CHECK (reward_cents IS NULL OR reward_cents >= 0),
  status VARCHAR(16) NOT NULL CHECK (status IN ('earned', 'settled', 'voided')),
  earned_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  settled_ref TEXT
);

CREATE UNIQUE INDEX idx_bounty_rewards_bounty ON bounty_rewards (bounty_id);
CREATE INDEX idx_bounty_rewards_beneficiary ON bounty_rewards (beneficiary_id);
