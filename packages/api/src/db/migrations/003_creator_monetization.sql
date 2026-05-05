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
