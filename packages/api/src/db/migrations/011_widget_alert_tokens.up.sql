-- Phase 1 / Track A: per-creator browser-source tokens used by overlay
-- widgets (Streamlabs-shaped alerts). Each row is a long-lived
-- bearer credential the creator pastes into OBS's "browser source" URL.
-- Compromise of one token reveals only that creator's alert stream and
-- can be revoked individually.
--
-- We store the SHA-256 of the secret (never the plaintext). The plaintext
-- is shown to the creator exactly once at creation time; thereafter only
-- the hash is on disk so a DB dump alone can't sniff alerts.

CREATE TABLE widget_alert_tokens (
  id UUID PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Optional human label so a creator can distinguish "main OBS",
  -- "mobile", etc. from the dashboard.
  label VARCHAR(64),
  -- SHA-256 hex of the bearer secret. Plaintext is never persisted.
  secret_hash CHAR(64) NOT NULL UNIQUE,
  -- Currently always {'alerts:read'}; reserved as an array so future
  -- chat-relay / overlay-control surfaces can scope without a schema bump.
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(64),
  -- Diagnostics: when the SSE stream last delivered to this token.
  last_delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_widget_alert_tokens_user
  ON widget_alert_tokens (blackout_user_id);
CREATE INDEX idx_widget_alert_tokens_active
  ON widget_alert_tokens (blackout_user_id) WHERE revoked_at IS NULL;
