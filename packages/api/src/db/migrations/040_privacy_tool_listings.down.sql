-- Revert the `privacy_tool` artifact/entitlement kind from creator_listings,
-- restoring the CHECK constraints to their migration-038 shape.

ALTER TABLE creator_listings DROP CONSTRAINT creator_listings_artifact_kind_check;
ALTER TABLE creator_listings ADD CONSTRAINT creator_listings_artifact_kind_check CHECK (artifact_kind IN (
  'theme', 'manifest_plugin', 'code_plugin', 'asset_bundle', 'coalition_kit',
  'profile_cosmetic', 'sound_pack', 'community_template', 'stream_asset',
  'vault_item', 'ai_persona', 'automation_recipe'
));

ALTER TABLE creator_listings DROP CONSTRAINT creator_listings_entitlement_kind_check;
ALTER TABLE creator_listings ADD CONSTRAINT creator_listings_entitlement_kind_check CHECK (entitlement_kind IN (
  'emoji_pack', 'asset_bundle', 'software_license', 'plugin_flag', 'subscription_tier',
  'post_unlock', 'event_ticket', 'role_grant', 'channel_access',
  'profile_cosmetic', 'sound_pack', 'community_template', 'stream_asset', 'vault_item'
));
