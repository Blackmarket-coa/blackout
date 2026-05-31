-- Migration Hub (Phase 2): product-level activation of the mautrix-discord
-- bridge for a den ↔ Discord channel pair.
--
-- The mautrix-discord appservice does the actual message relaying (see
-- deploy/docker/blackout-backend/integrations/mautrix-discord/). This table is
-- the Blackout-side toggle + status mirror so a community owner can see the
-- link in the Migration Hub and pause / tear it down from the product instead
-- of the ops runbook. See packages/api/src/services/discordBridgeActivation.ts.

CREATE TABLE IF NOT EXISTS discord_bridge_activations (
  id TEXT PRIMARY KEY,
  blackout_user_id TEXT NOT NULL,
  matrix_room_id TEXT NOT NULL,
  discord_guild_id TEXT NOT NULL,
  discord_channel_id TEXT NOT NULL,
  -- 'one-way' (Matrix→Discord) | 'two-way' | 'read-only' (Discord→Matrix)
  mode TEXT NOT NULL,
  -- 'active' | 'paused' | 'error'
  status TEXT NOT NULL,
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_discord_bridge_activations_user
  ON discord_bridge_activations (blackout_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discord_bridge_activations_link
  ON discord_bridge_activations (matrix_room_id, discord_channel_id);
