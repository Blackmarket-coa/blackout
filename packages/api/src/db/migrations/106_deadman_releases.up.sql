-- Dead-man switch releases: PR 3 of
-- docs/security/deadman-release-design-2026-10-24.md; the envelope's format is
-- docs/security/release-envelope-2026-10-26.md.
--
-- A switch armed in the release format holds a release envelope instead of a
-- payload the server cannot tell apart from plaintext: the owner's device
-- encrypts the message once under a fresh key, seals that key to each
-- recipient's release identity and to the owner's own, and signs each sealed
-- copy. encrypted_payload then holds the envelope's header (the ciphertext, a
-- commitment to the key) and the owner's public release identity as it was at
-- arming; deadman_release_wraps holds one sealed copy per account. When the
-- sweep fires such a switch it records released_at and writes one
-- deadman_release_notices row per recipient, which the notifier sends as a
-- pointer-only notice from the Blackout bot. 365 days after released_at the
-- content and the copies are removed.
--
-- Existing switches become 'legacy' and behave as before: on trigger only the
-- status changes, and nothing is sent. A release switch has no room, so
-- room_id becomes nullable; legacy rows keep theirs.
--
-- Without these columns and tables the Postgres-backed store would keep the
-- copies and notices in memory only (it writes only columns that exist), and a
-- restart would lose every recipient's copy.
ALTER TABLE deadman_switches ADD COLUMN IF NOT EXISTS release_format VARCHAR(16) NOT NULL DEFAULT 'legacy';
ALTER TABLE deadman_switches ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
ALTER TABLE deadman_switches ALTER COLUMN room_id DROP NOT NULL;

-- One sealed copy per switch and account: the owner's own and each
-- recipient's, with the owner's signature. Re-sealing replaces a recipient's
-- row; cancel, account deletion and the 365-day removal blank sealed_key and
-- signature in place (the store writes targeted upserts, never deletes).
CREATE TABLE IF NOT EXISTS deadman_release_wraps (
  switch_id TEXT NOT NULL,
  recipient_account_id TEXT NOT NULL,
  recipient_fingerprint TEXT NOT NULL,
  sealed_key TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (switch_id, recipient_account_id)
);
CREATE INDEX IF NOT EXISTS idx_deadman_release_wraps_recipient
  ON deadman_release_wraps (recipient_account_id);

-- One notice per fired release switch and recipient: the room it went to,
-- attempts, the last error, when it was sent, or when it stopped being retried
-- (30 days after it was written).
CREATE TABLE IF NOT EXISTS deadman_release_notices (
  switch_id TEXT NOT NULL,
  recipient_account_id TEXT NOT NULL,
  room_id TEXT,
  status VARCHAR(16) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (switch_id, recipient_account_id)
);
CREATE INDEX IF NOT EXISTS idx_deadman_release_notices_due
  ON deadman_release_notices (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_deadman_release_notices_recipient
  ON deadman_release_notices (recipient_account_id);
