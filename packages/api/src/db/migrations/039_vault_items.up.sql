-- Encrypted personal vault (Workstream 5 / security).
--
-- Stores opaque, client-side-encrypted blobs: the server never sees plaintext.
-- `ciphertext` and `iv` are base64 of the AES-GCM output + nonce produced in
-- the browser from a passphrase-derived key. `label` is user-supplied plaintext
-- metadata (the entry's name) so the list is browsable without decrypting.
-- Column names mirror the camelCase fields of VaultItemRecord.

CREATE TABLE vault_items (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(160) NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  algo VARCHAR(32) NOT NULL DEFAULT 'AES-GCM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vault_items_owner ON vault_items (owner_user_id, updated_at DESC);
