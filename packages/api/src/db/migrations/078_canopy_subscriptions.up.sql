-- Durable Canopy subscription billing state. These four record families were
-- module-level Maps/Sets in services/subscriptions.ts and vanished on every
-- restart — losing real Stripe customer ids (cus_…), paid tiers, comps, the
-- webhook de-dupe ledger, and pay-it-forward gifts. TEXT ids / no cross-table
-- FKs to match the string-keyed write-through store, like 074_canary_tokens.
-- Column names are camelToSnake of the record fields in db/types.ts.

-- One live subscription record per user (keyed by user_id, not id).
CREATE TABLE canopy_subscriptions (
  user_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  lago_customer_external_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  tier TEXT NOT NULL,
  interval TEXT NOT NULL,
  status TEXT NOT NULL,
  trial_ends_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  comped BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Append-only billing audit timeline (checkouts, webhooks, admin actions, gifts).
CREATE TABLE subscription_audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_subscription_audit_events_user
  ON subscription_audit_events (user_id, occurred_at);

-- Processed billing-webhook ledger (Stripe event ids) — idempotency across restarts.
CREATE TABLE processed_billing_webhook_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL
);

-- Pay-it-forward subscription gifts (donate/claim/forward chain).
CREATE TABLE subscription_gifts (
  id TEXT PRIMARY KEY,
  donor_user_id TEXT NOT NULL,
  donor_plan_code TEXT NOT NULL,
  donor_tier TEXT NOT NULL,
  status TEXT NOT NULL,
  claimed_by_user_id TEXT,
  claimed_at TIMESTAMPTZ,
  forwarded_to_gift_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  root_gift_id TEXT NOT NULL,
  chain_depth INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_subscription_gifts_donor ON subscription_gifts (donor_user_id);
CREATE INDEX idx_subscription_gifts_status ON subscription_gifts (status);
