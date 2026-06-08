-- Ecosystem bounty board + producer↔creator applications. A bounty is a unit of
-- work ("Creator needed", "Tester needed", "Coalition builder needed") that moves
-- open → claimed → in_review → completed → closed; an application is one creator
-- pitching for an open bounty (pending → accepted/declined/withdrawn). Previously
-- in-memory only (lost on restart); now persisted via the write-through store.
-- TEXT ids / no cross-table FKs to match the string-keyed store. Columns mirror
-- Bounty + BountyApplication in @blackout/core. `requirements`/`deliverables`
-- are JSONB string arrays (same convention as outbound_event_webhooks.event_types);
-- `category`/`reward_type` stay short VARCHARs so new variants never need a migration.

CREATE TABLE bounties (
  id TEXT PRIMARY KEY,
  category VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  reward_type VARCHAR(32) NOT NULL,
  reward_summary TEXT NOT NULL,
  reward_amount_cents INTEGER,
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(16) NOT NULL,
  coalition_id TEXT,
  claimed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_bounties_status ON bounties (status);
CREATE INDEX idx_bounties_category ON bounties (category);
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
