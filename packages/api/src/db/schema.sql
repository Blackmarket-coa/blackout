CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  reputation_score INT DEFAULT 0,
  reputation_tier VARCHAR(50),
  pubkey_ed25519 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  matrix_room_id VARCHAR(255) UNIQUE,
  description TEXT,
  federation_tier VARCHAR(50),
  is_broadcast BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY,
  community_id UUID REFERENCES communities(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  channel_type VARCHAR(50),
  is_private BOOLEAN DEFAULT FALSE,
  matrix_room_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_listings_cache (
  provider_id VARCHAR(64) NOT NULL,
  provider_listing_id VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency VARCHAR(8) NOT NULL,
  seller_id VARCHAR(128),
  seller_display_name TEXT,
  entitlement_kind VARCHAR(64) NOT NULL,
  media_urls JSONB NOT NULL DEFAULT '[]',
  tags JSONB,
  available_skus JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (provider_id, provider_listing_id)
);

CREATE TABLE IF NOT EXISTS marketplace_entitlements (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id VARCHAR(64) NOT NULL,
  provider_listing_id VARCHAR(128) NOT NULL,
  sku VARCHAR(128),
  kind VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  source_event_id VARCHAR(256) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_marketplace_entitlements_user
  ON marketplace_entitlements (user_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_entitlements_listing
  ON marketplace_entitlements (provider_id, provider_listing_id);

CREATE TABLE IF NOT EXISTS marketplace_webhook_events (
  provider_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(256) NOT NULL,
  type VARCHAR(64) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  signature_ok BOOLEAN NOT NULL,
  PRIMARY KEY (provider_id, event_id)
);

CREATE TABLE IF NOT EXISTS marketplace_seller_profiles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id VARCHAR(64) NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  payout_id VARCHAR(128),
  reputation_tier VARCHAR(32),
  vacation_mode BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, provider_id)
);

CREATE TABLE IF NOT EXISTS marketplace_license_keys (
  entitlement_id UUID PRIMARY KEY REFERENCES marketplace_entitlements(id) ON DELETE CASCADE,
  license_key VARCHAR(64) NOT NULL UNIQUE,
  activations_used INTEGER NOT NULL DEFAULT 0,
  activations_max INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS marketplace_provider_config (
  provider_id VARCHAR(64) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  base_url TEXT,
  public_key TEXT,
  last_synced_at TIMESTAMPTZ
);

-- FBM → Matrix bridge (migrations 042–044).
CREATE TABLE IF NOT EXISTS fbm_vendor_rooms (
  vendor_id TEXT PRIMARY KEY,
  space_room_id TEXT NOT NULL,
  orders_room_id TEXT NOT NULL,
  inventory_room_id TEXT NOT NULL,
  ledger_room_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fbm_buyer_order_rooms (
  id UUID PRIMARY KEY,
  vendor_id TEXT NOT NULL,
  buyer_user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fbm_buyer_order_rooms_order ON fbm_buyer_order_rooms (order_id);
CREATE INDEX IF NOT EXISTS idx_fbm_buyer_order_rooms_buyer ON fbm_buyer_order_rooms (buyer_user_id);

CREATE TABLE IF NOT EXISTS fbm_deaddrop_deliveries (
  id UUID PRIMARY KEY,
  source_event_id TEXT NOT NULL UNIQUE,
  buyer_user_id TEXT NOT NULL,
  entitlement_id UUID,
  room_id TEXT NOT NULL,
  drop_id TEXT,
  clue TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  downloaded_at TIMESTAMPTZ,
  tombstoned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fbm_deaddrop_deliveries_sweep ON fbm_deaddrop_deliveries (tombstoned_at, expires_at);

CREATE TABLE IF NOT EXISTS fbm_dispute_rooms (
  dispute_id TEXT PRIMARY KEY,
  order_id TEXT,
  vendor_id TEXT NOT NULL,
  buyer_user_id TEXT NOT NULL,
  mediator_user_id TEXT,
  room_id TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  purge_after TIMESTAMPTZ,
  purged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fbm_dispute_rooms_purge ON fbm_dispute_rooms (status, purge_after);

-- Migration Hub (Phase 1): Discord server-import jobs + object→target mappings.
CREATE TABLE IF NOT EXISTS discord_server_imports (
  id TEXT PRIMARY KEY,
  blackout_user_id TEXT NOT NULL,
  discord_guild_id TEXT NOT NULL,
  guild_name TEXT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  degraded BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_discord_server_imports_user ON discord_server_imports (blackout_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discord_server_imports_user_guild ON discord_server_imports (blackout_user_id, discord_guild_id);

CREATE TABLE IF NOT EXISTS discord_import_mappings (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES discord_server_imports(id) ON DELETE CASCADE,
  discord_object_type TEXT NOT NULL,
  discord_object_id TEXT NOT NULL,
  discord_name TEXT NOT NULL,
  blackout_target_type TEXT NOT NULL,
  blackout_target_id TEXT NOT NULL DEFAULT '',
  power_level INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discord_import_mappings_obj ON discord_import_mappings (import_id, discord_object_id);

-- Migration Hub (Phase 2): den ↔ Discord channel bridge activations.
CREATE TABLE IF NOT EXISTS discord_bridge_activations (
  id TEXT PRIMARY KEY,
  blackout_user_id TEXT NOT NULL,
  matrix_room_id TEXT NOT NULL,
  discord_guild_id TEXT NOT NULL,
  discord_channel_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_discord_bridge_activations_user ON discord_bridge_activations (blackout_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discord_bridge_activations_link ON discord_bridge_activations (matrix_room_id, discord_channel_id);
