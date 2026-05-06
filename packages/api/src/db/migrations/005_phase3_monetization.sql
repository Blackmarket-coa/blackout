-- Phase 3 of the creator monetization rollout: communities & channels.
--
-- Community boosts (Discord-equivalent) are recurring pledges that
-- increment a community's boost_level. Pledges ride the same FBM
-- subscription pipeline as creator-subs — FBM handles renewal,
-- Blackout records the obligation. Boost level is derived at read time
-- from the count of active pledges, but we cache the most recent value
-- on `communities.boost_level` for cheap channel-list queries.
--
-- Role purchases and paid voice rooms (channel access) reuse the
-- existing `marketplace_entitlements` table with the new `role_grant`
-- and `channel_access` entitlement kinds — no new tables. The
-- entitlement metadata carries `roleId` / `channelId` so the access
-- helper in services/entitlementChecks.ts can resolve them.

CREATE TABLE community_boost_pledges (
  id UUID PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities(id),
  pledger_user_id UUID NOT NULL REFERENCES users(id),
  monthly_cents INT NOT NULL CHECK (monthly_cents >= 199),
  fee_cents INT NOT NULL CHECK (fee_cents >= 0),
  net_cents INT NOT NULL CHECK (net_cents >= 0),
  currency VARCHAR(8) NOT NULL,
  provider_id VARCHAR(64) NOT NULL,
  fbm_subscription_id VARCHAR(255),
  status VARCHAR(16) NOT NULL,
  started_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT boost_pledge_split CHECK (fee_cents + net_cents = monthly_cents)
);

CREATE INDEX idx_boost_pledges_community
  ON community_boost_pledges (community_id);

CREATE INDEX idx_boost_pledges_pledger
  ON community_boost_pledges (pledger_user_id);

CREATE UNIQUE INDEX idx_boost_pledges_active_per_pledger
  ON community_boost_pledges (community_id, pledger_user_id)
  WHERE status = 'active';

ALTER TABLE communities ADD COLUMN boost_level INT NOT NULL DEFAULT 0;
ALTER TABLE communities ADD COLUMN boost_perks JSONB NOT NULL DEFAULT '{}'::JSONB;
