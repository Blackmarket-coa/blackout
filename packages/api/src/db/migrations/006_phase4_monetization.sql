-- Phase 4 of the creator monetization rollout: scale + community resilience.
--
-- Aid pools (mutual-aid crowdfunding) reuse the tips pipeline by setting
-- `tips.context_kind='aid_pool'` and `tips.context_ref=aid_pool_id`.
-- Raised totals are derived at read time from captured tips, so there is
-- no separate ledger for aid pool contributions — same pattern as
-- stream goals in phase 2.
--
-- Ad revenue share is an admin-driven batch payout. Each `period`
-- represents an accounting window (week/month). Per-creator allocations
-- live in `ad_revenue_shares`, each carrying the 3% commission split and
-- an FBM payout id once the platform initiates settlement. The same
-- table shape supports a future TikTok-RPM-style "Creator Fund" — admin
-- just creates a separate period funded from the platform pool instead
-- of advertising revenue.

CREATE TABLE aid_pools (
  id UUID PRIMARY KEY,
  organizer_user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  goal_cents INT NOT NULL CHECK (goal_cents > 0),
  currency VARCHAR(8) NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE INDEX idx_aid_pools_organizer
  ON aid_pools (organizer_user_id);

CREATE INDEX idx_aid_pools_open
  ON aid_pools (created_at DESC)
  WHERE status = 'open';

CREATE TABLE ad_revenue_periods (
  id UUID PRIMARY KEY,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_cents INT NOT NULL CHECK (total_cents >= 0),
  currency VARCHAR(8) NOT NULL,
  status VARCHAR(16) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT period_window CHECK (period_end > period_start)
);

CREATE TABLE ad_revenue_shares (
  id UUID PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES ad_revenue_periods(id),
  creator_user_id UUID NOT NULL REFERENCES users(id),
  gross_cents INT NOT NULL CHECK (gross_cents >= 0),
  fee_cents INT NOT NULL CHECK (fee_cents >= 0),
  net_cents INT NOT NULL CHECK (net_cents >= 0),
  currency VARCHAR(8) NOT NULL,
  provider_id VARCHAR(64) NOT NULL,
  fbm_payout_id VARCHAR(255),
  status VARCHAR(16) NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  CONSTRAINT ad_share_split CHECK (fee_cents + net_cents = gross_cents),
  UNIQUE (period_id, creator_user_id)
);

CREATE INDEX idx_ad_revenue_shares_creator
  ON ad_revenue_shares (creator_user_id, computed_at DESC);
