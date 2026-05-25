-- Shareable invitations and their redemption audit log. The token hash is
-- stored (plaintext only for public "personal" share links). Use-count must
-- be enforced atomically across replicas, so the Postgres store increments
-- via `UPDATE ... WHERE use_count < max_uses RETURNING` to prevent
-- double-spend of a limited-use link.

CREATE TABLE invitation_tokens (
  id UUID PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  -- Optional Matrix room id the redeemer is auto-invited into.
  matrix_room_id TEXT,
  label VARCHAR(255),
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Matching Synapse registration token (plaintext; Synapse stores it
  -- unhashed and the revoke API takes the literal value).
  synapse_registration_token TEXT,
  synapse_registration_token_expires_at TIMESTAMPTZ,
  -- Reusable links: never exhaust on use_count/max_uses.
  unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  -- The single reusable per-user personal share link.
  personal BOOLEAN NOT NULL DEFAULT FALSE,
  -- Plaintext token kept ONLY for personal links (public by design).
  personal_token TEXT
);

CREATE INDEX idx_invitation_tokens_created_by ON invitation_tokens (created_by);

CREATE TABLE invitation_redemptions (
  id UUID PRIMARY KEY,
  invitation_token_id UUID NOT NULL REFERENCES invitation_tokens(id) ON DELETE CASCADE,
  redeemed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Whether the Matrix room auto-invite succeeded.
  matrix_invite_ok BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitation_redemptions_token ON invitation_redemptions (invitation_token_id);
CREATE INDEX idx_invitation_redemptions_user ON invitation_redemptions (redeemed_by_user_id);
