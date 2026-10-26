-- Release identities: the public keys a person publishes for dead-man switch
-- releases (docs/security/release-identities-2026-10-26.md; PR 2 of
-- docs/security/deadman-release-design-2026-10-24.md).
--
-- One row per identity an account published through
-- PUT /v1/release-identities/me: an Ed25519 signing key, an X25519 key and an
-- ML-KEM-768 encapsulation key, standard base64, with the account's own
-- signature over them, all exactly as sent and verified, and the fingerprint
-- the API computed. Nothing private is stored here: the private halves never
-- leave the person's devices and recovery files. Publishing a different
-- identity sets superseded_at on the current row and adds a new one; every row
-- is kept, and an identity an account published before is never published
-- again. At most 3 new rows per account in any 24 hours, and 1000 in all.
-- Account deletion removes the account's rows.
--
-- No uniqueness on the current row per account: the store writes the old
-- row's superseded_at and the new row as two ordered upserts, and reads take
-- the newest row without superseded_at as current.
CREATE TABLE IF NOT EXISTS release_identities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  format_version INTEGER NOT NULL,
  signing_key TEXT NOT NULL,
  x25519_key TEXT NOT NULL,
  mlkem768_key TEXT NOT NULL,
  signature TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  superseded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_release_identities_account ON release_identities (account_id);
