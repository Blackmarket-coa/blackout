-- Marketplace persistence: entitlements, webhook audit, license keys,
-- and a last-known catalog snapshot so restarts don't drop UX state on
-- degraded provider availability.

CREATE TABLE marketplace_entitlements (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  provider_id VARCHAR(64) NOT NULL,
  provider_listing_id VARCHAR(255) NOT NULL,
  sku VARCHAR(255),
  kind VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  source_event_id VARCHAR(255) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_marketplace_entitlements_user
  ON marketplace_entitlements (user_id);

CREATE INDEX idx_marketplace_entitlements_provider_listing
  ON marketplace_entitlements (provider_id, provider_listing_id);

CREATE TABLE marketplace_webhook_events (
  id UUID PRIMARY KEY,
  provider_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  signature_ok BOOLEAN NOT NULL,
  payload JSONB,
  UNIQUE (provider_id, event_id)
);

CREATE INDEX idx_marketplace_webhook_events_received_at
  ON marketplace_webhook_events (received_at DESC);

CREATE TABLE marketplace_license_keys (
  entitlement_id UUID PRIMARY KEY REFERENCES marketplace_entitlements(id),
  license_key VARCHAR(64) NOT NULL,
  activations_used INT NOT NULL DEFAULT 0,
  activations_max INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE marketplace_listings_cache (
  cache_key VARCHAR(512) PRIMARY KEY,
  provider_id VARCHAR(64) NOT NULL,
  listings JSONB NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_marketplace_listings_cache_provider
  ON marketplace_listings_cache (provider_id);
