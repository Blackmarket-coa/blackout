-- Account-lifecycle one-time tokens: email verification and account
-- deletion. Only SHA-256 hashes are stored. These MUST be shared so a token
-- minted on one replica can be consumed on another, and consumed exactly once
-- (the Postgres store consumes via `UPDATE ... WHERE consumed_at IS NULL`).

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Email this token was issued for; pinned to detect email-change races.
  email VARCHAR(320) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  revoked_reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash VARCHAR(64),
  user_agent_hash VARCHAR(64)
);

CREATE INDEX idx_email_verification_tokens_user ON email_verification_tokens (user_id);

CREATE TABLE account_deletion_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash VARCHAR(64),
  user_agent_hash VARCHAR(64)
);

CREATE INDEX idx_account_deletion_tokens_user ON account_deletion_tokens (user_id);
