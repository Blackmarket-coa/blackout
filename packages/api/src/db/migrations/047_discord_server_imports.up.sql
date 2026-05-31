-- Migration Hub (Phase 1): Discord server-import jobs + object→target mappings.
--
-- A community owner links Discord (existing linked_accounts / OAuth), then
-- imports their guild structure into Blackout: guild → Coalition space,
-- text/forum channels → Dens (Matrix rooms), roles → governance role intents.
--
-- One discord_server_imports row exists per (user, guild) import attempt. The
-- discord_import_mappings rows record what was created on the Blackout side so
-- an apply is idempotent — re-running skips any Discord object already mapped.
-- See packages/api/src/services/discordServerImport.ts.

CREATE TABLE IF NOT EXISTS discord_server_imports (
  id TEXT PRIMARY KEY,
  blackout_user_id TEXT NOT NULL,
  discord_guild_id TEXT NOT NULL,
  guild_name TEXT NOT NULL,
  -- 'pending' (snapshot captured) | 'applied' | 'failed'
  status TEXT NOT NULL,
  -- 'preview' (OAuth-only, no channels/roles) | 'full' (bot token present)
  mode TEXT NOT NULL,
  degraded BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_discord_server_imports_user
  ON discord_server_imports (blackout_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discord_server_imports_user_guild
  ON discord_server_imports (blackout_user_id, discord_guild_id);

CREATE TABLE IF NOT EXISTS discord_import_mappings (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES discord_server_imports(id) ON DELETE CASCADE,
  -- 'guild' | 'category' | 'channel' | 'role'
  discord_object_type TEXT NOT NULL,
  discord_object_id TEXT NOT NULL,
  discord_name TEXT NOT NULL,
  -- 'space' | 'den' | 'role-intent'
  blackout_target_type TEXT NOT NULL,
  blackout_target_id TEXT NOT NULL DEFAULT '',
  power_level INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discord_import_mappings_obj
  ON discord_import_mappings (import_id, discord_object_id);
