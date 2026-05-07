-- Phase 3 / Track B: OBS-WebSocket v5-compatible server passwords.
--
-- Mints bearer secrets a creator pastes into Stream Deck / Touch Portal /
-- Bitfocus Companion / any OBS-WS-aware control surface, plus a stable
-- per-row URL the surface points at: `wss://<api>/obs-ws/<row-id>`.
--
-- Wire-format compatible with OBS-WS v5 (https://github.com/obsproject/
-- obs-websocket/blob/master/docs/generated/protocol.md). Auth follows
-- the standard challenge/response: server sends Hello with a random
-- challenge + server-wide salt, client returns
--   base64(sha256(base64(sha256(password + salt)) + challenge))
--
-- Multiple per (blackout_user_id) allowed so a creator can run one
-- password per device and revoke individually. The PUBLIC slug is the
-- row id (UUID) — opaque + revocable, never leaks the creator id.

CREATE TABLE obs_ws_passwords (
  id UUID PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(80),
  -- AES-256-GCM envelope of the plaintext password (services/secretBox.ts
  -- format). Per-row AAD: `obs_ws_password|${id}` so a leaked envelope
  -- can't be replayed against another row.
  password_ciphertext TEXT NOT NULL,
  encryption_key_id VARCHAR(32) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at TIMESTAMPTZ,
  revoke_reason VARCHAR(255),
  last_used_at TIMESTAMPTZ,
  use_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_obs_ws_passwords_user ON obs_ws_passwords (blackout_user_id);
CREATE INDEX idx_obs_ws_passwords_active
  ON obs_ws_passwords (is_active) WHERE is_active = TRUE;
