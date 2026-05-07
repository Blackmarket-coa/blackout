-- Phase 1 / Track A core deliverable: per-creator RTMP simulcast
-- destinations. The fan-out worker (apps/blackout-server/rtmp-fanout/,
-- not yet shipped) will read this table to discover where each
-- creator's incoming RTMP stream should be re-broadcast to alongside
-- Blackout's own Owncast origin.
--
-- Stream keys are AES-256-GCM-encrypted at rest using the existing
-- secretBox key set (LINKED_ACCOUNT_ENCRYPTION_KEYS). Plaintext is
-- accepted only at create time and never returned afterwards — same
-- one-time-reveal posture as widget tokens.
--
-- `provider` is a free-form short label so the same table covers
-- Twitch / YouTube / Kick / Trovo / arbitrary RTMP endpoints without
-- schema churn. The fan-out worker doesn't care about the label; it
-- only needs ingest_url + the decrypted key.

CREATE TABLE simulcast_destinations (
  id UUID PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Short label like 'twitch', 'youtube', 'kick'. Free-form for v1.
  provider VARCHAR(32) NOT NULL,
  -- Optional creator-friendly name ('Main Twitch', 'Backup YT', ...).
  label VARCHAR(64),
  -- RTMP / RTMPS endpoint URL the fan-out worker pushes to. Public per
  -- the protocol; not encrypted.
  ingest_url VARCHAR(512) NOT NULL,
  -- AES-256-GCM envelope of the per-destination stream key. See
  -- services/secretBox.ts for the format.
  stream_key_ciphertext TEXT NOT NULL,
  encryption_key_id VARCHAR(64) NOT NULL,
  -- Whether the fan-out worker should currently restream to this
  -- destination. Allows pause/resume without re-entering the key.
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  -- Diagnostics: when the worker last tried to use this destination.
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_simulcast_destinations_user
  ON simulcast_destinations (blackout_user_id);
CREATE INDEX idx_simulcast_destinations_enabled
  ON simulcast_destinations (blackout_user_id) WHERE is_enabled = TRUE;
