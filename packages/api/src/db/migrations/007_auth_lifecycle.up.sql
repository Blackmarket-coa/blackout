-- Phase 2 of the production-readiness remediation: auth lifecycle tables.
--
-- Adds three tables so the API can support password reset, refresh-token
-- rotation with reuse detection, and explicit session revocation:
--
--   * password_reset_tokens — single-use, time-limited tokens.
--   * refresh_tokens — rotated on every use; family revoked on reuse.
--   * revoked_sessions — denylist for active access tokens (logout / admin).
--
-- All three tables hash secrets at rest. The plaintext token never lands in
-- the database; we store SHA-256 of the secret as `token_hash` and compare
-- in constant time at lookup.

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash CHAR(64),
  user_agent_hash CHAR(64)
);

CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens (user_id, created_at DESC);
CREATE INDEX idx_password_reset_tokens_expiry ON password_reset_tokens (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent_hash CHAR(64)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id, created_at DESC);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family_id);

-- Tracks tokens revoked before their natural expiry. The middleware checks
-- this denylist on every request; entries TTL out at original_exp + skew.
CREATE TABLE revoked_sessions (
  jti VARCHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  reason VARCHAR(64) NOT NULL
);

CREATE INDEX idx_revoked_sessions_user ON revoked_sessions (user_id, expires_at);
CREATE INDEX idx_revoked_sessions_expiry ON revoked_sessions (expires_at);
