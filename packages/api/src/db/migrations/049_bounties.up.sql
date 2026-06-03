-- Ecosystem bounties, producer↔creator applications, and the bounty reward
-- ledger. Previously lived only in in-memory Maps (bountyStore / growth), so any
-- bounty, application, or earned reward was lost on restart. Persisted via the
-- write-through store; TEXT ids / no cross-table FKs to match the string-keyed
-- store. Columns mirror Bounty / BountyApplication / BountyReward in
-- @blackout/core (pg writer maps camelCase fields ↔ snake_case columns).

CREATE TABLE bounties (
  id TEXT PRIMARY KEY,
  category VARCHAR(16) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  reward_type VARCHAR(24) NOT NULL,
  reward_summary TEXT NOT NULL,
  reward_amount_cents INTEGER,
  requirements TEXT[] NOT NULL DEFAULT '{}',
  deliverables TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(16) NOT NULL,
  coalition_id TEXT,
  claimed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_bounties_status ON bounties (status);
CREATE INDEX idx_bounties_creator ON bounties (creator_id);
CREATE INDEX idx_bounties_coalition ON bounties (coalition_id);

CREATE TABLE bounty_applications (
  id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL,
  applicant_id TEXT NOT NULL,
  message TEXT,
  status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_bounty_applications_bounty ON bounty_applications (bounty_id);
CREATE INDEX idx_bounty_applications_applicant ON bounty_applications (applicant_id);

CREATE TABLE bounty_rewards (
  bounty_id TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  beneficiary_id TEXT NOT NULL,
  poster_id TEXT NOT NULL,
  reward_type VARCHAR(24) NOT NULL,
  reward_summary TEXT NOT NULL,
  reward_cents INTEGER,
  status VARCHAR(16) NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  settled_ref TEXT
);
CREATE INDEX idx_bounty_rewards_beneficiary ON bounty_rewards (beneficiary_id);
