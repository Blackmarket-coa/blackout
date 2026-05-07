-- Phase 2 / Track B: Discord-compatible incoming webhooks. We expose URLs
-- shaped like Discord's `/api/webhooks/{id}/{token}` so any 3rd-party
-- service that already speaks "Discord webhook" (GitHub, Sentry, Stripe,
-- IFTTT, Zapier, Grafana, ...) can post to a Blackout den without code
-- changes — the user just swaps the URL prefix.
--
-- Each row is one webhook URL → one Matrix room. The token is the
-- shared secret in the URL (Discord's model); we store its bcrypt hash
-- and verify on POST. The id is the public part of the URL.
--
-- name + avatar_url cosmetics let creators distinguish multiple
-- inbound integrations in the UI.

CREATE TABLE discord_compat_webhooks (
  id UUID PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matrix_room_id VARCHAR(255) NOT NULL,
  -- Display label only; Discord-style senders pick their own
  -- username/avatar per-call but creators want to recognise the source.
  name VARCHAR(80) NOT NULL,
  avatar_url VARCHAR(2048),
  -- sha256(token) hex. Plaintext only ever returned at create time.
  token_hash VARCHAR(64) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  delivery_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_discord_compat_webhooks_user
  ON discord_compat_webhooks (blackout_user_id);
CREATE INDEX idx_discord_compat_webhooks_active
  ON discord_compat_webhooks (is_active) WHERE is_active = TRUE;
