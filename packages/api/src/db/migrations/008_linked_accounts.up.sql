-- Phase 0 of the multi-platform compatibility layer (see
-- docs/multi-platform-third-party-compat-plan.md).
--
-- Two tables for cross-platform OAuth identity linking:
--
--   * linked_accounts — durable association between a Blackout user and a
--     third-party identity on Twitch / Discord / Patreon / YouTube / TikTok /
--     Kick. Holds AES-256-GCM ciphertexts of the access + refresh tokens so a
--     DB dump alone cannot impersonate the linked account. The encryption key
--     id is stored alongside so we can rotate keys without re-encrypting in
--     bulk.
--
--   * pending_oauth_links — short-lived (≤10 min) state for in-flight OAuth
--     authorization-code flows. Holds the CSRF state, the (encrypted) PKCE
--     code_verifier, the requested scopes, and the redirect URI so the
--     callback can validate everything before issuing a token exchange.

CREATE TABLE linked_accounts (
  id UUID PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  provider_username VARCHAR(255),
  -- AES-256-GCM ciphertext envelope: "<keyId>:<nonce_b64>:<ciphertext_b64>:<tag_b64>"
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  -- ISO 8601 timestamp at which the access token expires (NULL = unknown / non-expiring).
  expires_at TIMESTAMPTZ,
  encryption_key_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blackout_user_id, provider),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_linked_accounts_user ON linked_accounts (blackout_user_id);
CREATE INDEX idx_linked_accounts_provider_user ON linked_accounts (provider, provider_user_id);

CREATE TABLE pending_oauth_links (
  -- SHA-256 of the random state token presented in the OAuth redirect.
  -- We never store the plaintext state — only its hash — to neutralize a DB
  -- dump as an attack vector for hijacking in-flight links.
  state_hash CHAR(64) PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  -- AES-256-GCM ciphertext envelope of the PKCE code_verifier (S256).
  code_verifier_ciphertext TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  encryption_key_id VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pending_oauth_links_user ON pending_oauth_links (blackout_user_id, created_at DESC);
CREATE INDEX idx_pending_oauth_links_expiry ON pending_oauth_links (expires_at) WHERE consumed_at IS NULL;
