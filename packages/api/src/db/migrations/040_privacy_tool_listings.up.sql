-- Add the `privacy_tool` artifact/entitlement kind to creator_listings.
--
-- Backs the marketplace "Privacy Tools" digital item family (the advanced
-- tiers of EXIF metadata stripping and message link sanitization). Widens the
-- CHECK constraints introduced in migration 038 so these listings can be
-- persisted alongside the existing item families.
--
-- SAFETY: The migration runner (migrate.ts) wraps each migration in a
-- BEGIN...COMMIT transaction, so the DROP CONSTRAINT → ADD CONSTRAINT pattern
-- is atomic — there is no window where rows could be inserted with invalid
-- artifact_kind/entitlement_kind values.

ALTER TABLE creator_listings DROP CONSTRAINT creator_listings_artifact_kind_check;
ALTER TABLE creator_listings ADD CONSTRAINT creator_listings_artifact_kind_check CHECK (artifact_kind IN (
  'theme', 'manifest_plugin', 'code_plugin', 'asset_bundle', 'coalition_kit',
  'profile_cosmetic', 'sound_pack', 'community_template', 'stream_asset',
  'vault_item', 'ai_persona', 'automation_recipe', 'privacy_tool'
));

ALTER TABLE creator_listings DROP CONSTRAINT creator_listings_entitlement_kind_check;
ALTER TABLE creator_listings ADD CONSTRAINT creator_listings_entitlement_kind_check CHECK (entitlement_kind IN (
  'emoji_pack', 'asset_bundle', 'software_license', 'plugin_flag', 'subscription_tier',
  'post_unlock', 'event_ticket', 'role_grant', 'channel_access',
  'profile_cosmetic', 'sound_pack', 'community_template', 'stream_asset', 'vault_item',
  'privacy_tool'
));
