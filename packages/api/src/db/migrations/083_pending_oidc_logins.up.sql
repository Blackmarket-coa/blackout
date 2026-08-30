-- W2 (consolidation D4): native OIDC login against MAS.
--
-- Short-lived (≤10 min) state for in-flight /v1/auth/oidc login flows —
-- the login-shaped sibling of pending_oauth_links (008). Two deliberate
-- differences from that table:
--
--   * NO blackout_user_id: at `begin` time there is no authenticated user —
--     the whole point of the flow is to establish one. Ownership is proven
--     by presenting the plaintext state token at `continue`.
--   * nonce_hash: OIDC id_tokens carry a `nonce` claim that must match the
--     value minted at `begin`; storing its SHA-256 lets `continue` verify
--     the binding without persisting the plaintext.
--
-- As in 008, only hashes of the state/nonce are stored (a DB dump cannot
-- hijack an in-flight login) and the PKCE code_verifier is an AES-256-GCM
-- envelope under LINKED_ACCOUNT_ENCRYPTION_KEYS.

CREATE TABLE pending_oidc_logins (
  -- SHA-256 hex of the random state token round-tripped via MAS.
  state_hash CHAR(64) PRIMARY KEY,
  -- AES-256-GCM ciphertext envelope of the PKCE code_verifier (S256).
  code_verifier_ciphertext TEXT NOT NULL,
  -- SHA-256 hex of the id_token nonce minted at `begin`.
  nonce_hash CHAR(64) NOT NULL,
  redirect_uri TEXT NOT NULL,
  encryption_key_id VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pending_oidc_logins_expiry ON pending_oidc_logins (expires_at) WHERE consumed_at IS NULL;
