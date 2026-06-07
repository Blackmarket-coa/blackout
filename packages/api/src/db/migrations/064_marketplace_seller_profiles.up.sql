-- Marketplace seller/producer profiles. One row per (user, provider). Persisted
-- via the write-through store; TEXT ids / no cross-table FKs to match the
-- string-keyed store (same convention as the coliseum_challenges family).
-- Columns mirror SellerProfileRecord. payout_id is private (never served in the
-- public producer read-view).

CREATE TABLE marketplace_seller_profiles (
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  payout_id TEXT,
  reputation_tier TEXT,
  vacation_mode BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, provider_id)
);
