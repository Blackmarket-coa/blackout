-- Phase 1 of the creator monetization rollout: outbound earnings primitives.
--
-- Every flow recorded here is a synthetic FBM order under the hood — FBM
-- remains the merchant of record and applies the 3% platform fee at
-- settlement. Blackout records gross/fee/net per row for display and
-- reconciliation; we never custody funds.
--
-- This migration introduces the `tips` table. Per-creator subscriptions,
-- gifts, event tickets, community boosts, and aid pools are added in
-- subsequent migrations as their respective routes ship.

CREATE TABLE tips (
  id UUID PRIMARY KEY,
  sender_user_id UUID NOT NULL REFERENCES users(id),
  recipient_user_id UUID NOT NULL REFERENCES users(id),
  context_kind VARCHAR(32) NOT NULL,
  context_ref TEXT,
  gross_cents INT NOT NULL CHECK (gross_cents >= 0),
  fee_cents INT NOT NULL CHECK (fee_cents >= 0),
  net_cents INT NOT NULL CHECK (net_cents >= 0),
  currency VARCHAR(8) NOT NULL,
  provider_id VARCHAR(64) NOT NULL,
  fbm_order_id VARCHAR(255),
  status VARCHAR(32) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  captured_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  CONSTRAINT tips_no_self_tipping CHECK (sender_user_id <> recipient_user_id),
  CONSTRAINT tips_split_balances CHECK (fee_cents + net_cents = gross_cents)
);

CREATE INDEX idx_tips_recipient_recent
  ON tips (recipient_user_id, created_at DESC);

CREATE INDEX idx_tips_sender_recent
  ON tips (sender_user_id, created_at DESC);

CREATE UNIQUE INDEX idx_tips_provider_order
  ON tips (provider_id, fbm_order_id)
  WHERE fbm_order_id IS NOT NULL;

-- Per-creator subscription tiers (Patreon / Twitch / X creator-subs).
-- Each tier becomes an FBM `subscription`-category creator listing the
-- first time it goes active; FBM handles dunning and renewals, we receive
-- webhook events to extend `current_period_ends_at` on the subscriber row.

CREATE TABLE creator_subscription_tiers (
  id UUID PRIMARY KEY,
  creator_user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(64) NOT NULL,
  description TEXT,
  price_cents INT NOT NULL CHECK (price_cents >= 199),
  currency VARCHAR(8) NOT NULL,
  provider_id VARCHAR(64) NOT NULL,
  fbm_listing_id VARCHAR(255),
  status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_creator_subscription_tiers_creator
  ON creator_subscription_tiers (creator_user_id);

CREATE TABLE creator_subscriptions (
  id UUID PRIMARY KEY,
  subscriber_user_id UUID NOT NULL REFERENCES users(id),
  creator_user_id UUID NOT NULL REFERENCES users(id),
  tier_id UUID NOT NULL REFERENCES creator_subscription_tiers(id),
  provider_id VARCHAR(64) NOT NULL,
  fbm_subscription_id VARCHAR(255),
  status VARCHAR(16) NOT NULL,
  started_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creator_subs_no_self_subscribe
    CHECK (subscriber_user_id <> creator_user_id)
);

CREATE INDEX idx_creator_subscriptions_subscriber
  ON creator_subscriptions (subscriber_user_id);

CREATE INDEX idx_creator_subscriptions_creator
  ON creator_subscriptions (creator_user_id);

CREATE UNIQUE INDEX idx_creator_subscriptions_active_pair
  ON creator_subscriptions (subscriber_user_id, creator_user_id)
  WHERE status = 'active';
