-- Creator marketplace listings.
--
-- Persists the lifecycle of a seller's listing (previously in-memory). The
-- artifact payload itself is not stored here — it is handed to the marketplace
-- provider at create time; this table tracks only the sellable listing's
-- metadata + status so it survives restarts. Column names mirror the
-- camelCase fields of CreatorListingRecord (snake_cased by the pg writer).

CREATE TABLE creator_listings (
  id UUID PRIMARY KEY,
  provider_id VARCHAR(64) NOT NULL,
  provider_listing_id TEXT,
  seller_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_kind VARCHAR(64) NOT NULL CHECK (artifact_kind IN (
    'theme', 'manifest_plugin', 'code_plugin', 'asset_bundle', 'coalition_kit',
    'profile_cosmetic', 'sound_pack', 'community_template', 'stream_asset',
    'vault_item', 'ai_persona', 'automation_recipe'
  )),
  category VARCHAR(64) NOT NULL CHECK (category IN (
    'emoji-sticker', 'meme-asset', 'stego-software', 'plugin-curated', 'subscription',
    'profile-cosmetic', 'audio-pack', 'community-template', 'creator-asset',
    'security-tool', 'ai-automation'
  )),
  entitlement_kind VARCHAR(64) NOT NULL CHECK (entitlement_kind IN (
    'emoji_pack', 'asset_bundle', 'software_license', 'plugin_flag', 'subscription_tier',
    'post_unlock', 'event_ticket', 'role_grant', 'channel_access',
    'profile_cosmetic', 'sound_pack', 'community_template', 'stream_asset', 'vault_item'
  )),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  currency VARCHAR(8) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN (
    'draft', 'pending_review', 'published', 'rejected', 'archived'
  )),
  fee_bps_override INT CHECK (fee_bps_override IS NULL OR (fee_bps_override BETWEEN 0 AND 10000)),
  public_slug TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_creator_listings_seller ON creator_listings (seller_user_id);
CREATE INDEX idx_creator_listings_status ON creator_listings (status, category);
