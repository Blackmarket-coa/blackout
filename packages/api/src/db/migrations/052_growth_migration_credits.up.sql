-- Growth ledger: migration credits. Durable counterpart to the in-process
-- migration-credit Map from services/growth.ts. Idempotent app-side on
-- (user_id, source_kind, source_handle).

CREATE TABLE migration_credits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fbm_credit_id TEXT,
  source_kind VARCHAR(32) NOT NULL CHECK (source_kind IN (
    'discord_migration', 'twitch_migration', 'creator_invite', 'campaign'
  )),
  source_handle TEXT,
  value_cents INT NOT NULL CHECK (value_cents >= 0),
  currency VARCHAR(8) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_migration_credits_user ON migration_credits (user_id);
