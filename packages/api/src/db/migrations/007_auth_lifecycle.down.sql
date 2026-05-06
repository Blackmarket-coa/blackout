-- Reverses 007_auth_lifecycle.up.sql.
DROP INDEX IF EXISTS idx_revoked_sessions_expiry;
DROP INDEX IF EXISTS idx_revoked_sessions_user;
DROP TABLE IF EXISTS revoked_sessions;

DROP INDEX IF EXISTS idx_refresh_tokens_family;
DROP INDEX IF EXISTS idx_refresh_tokens_user;
DROP TABLE IF EXISTS refresh_tokens;

DROP INDEX IF EXISTS idx_password_reset_tokens_expiry;
DROP INDEX IF EXISTS idx_password_reset_tokens_user;
DROP TABLE IF EXISTS password_reset_tokens;
