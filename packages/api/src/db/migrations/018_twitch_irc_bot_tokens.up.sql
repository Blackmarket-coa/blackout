-- Phase 2 / Track B: Twitch-IRC-compatible bot tokens.
--
-- Lets a creator mint a bearer token for use as the `PASS oauth:<token>`
-- value when an external Twitch chat bot (Nightbot, StreamElements,
-- Moobot, Fossabot, ...) connects to a future Blackout-side IRC shim.
-- The wire format is byte-compatible with Twitch IRC; bots run unmodified.
--
-- Authorization model: a token is owned by ONE creator, NOT one bot.
-- Multiple bots may share a token (tradeoff for setup simplicity); on
-- abuse the creator revokes one row, all sharing bots disconnect. The
-- `label` lets the creator distinguish multiple tokens (one per bot)
-- if they want stricter accounting.
--
-- Mirrors widget_alert_tokens in shape; both are bearer-secret CRUD.

CREATE TABLE twitch_irc_bot_tokens (
  id UUID PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(80),
  -- sha256 hex of the bearer secret. Plaintext only ever returned at create time.
  secret_hash VARCHAR(64) NOT NULL,
  -- Channel scope: which #channels this token can JOIN. A creator can
  -- restrict a bot's reach by listing only some of their channel slugs
  -- (room ids on the Blackout side); empty array = "all channels owned
  -- by this creator".
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at TIMESTAMPTZ,
  revoke_reason VARCHAR(255),
  last_used_at TIMESTAMPTZ,
  use_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_twitch_irc_bot_tokens_user
  ON twitch_irc_bot_tokens (blackout_user_id);
CREATE INDEX idx_twitch_irc_bot_tokens_secret_hash
  ON twitch_irc_bot_tokens (secret_hash) WHERE is_active = TRUE;
