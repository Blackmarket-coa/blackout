-- Active-defense canary tokens (OSS-manifest group G5). Durable replacement for
-- the former in-memory stub in services/activeDefense.ts. TEXT ids / no cross-
-- table FKs to match the string-keyed write-through store, like
-- 071_coalition_surge_notifications. Column names are camelToSnake of
-- CanaryTokenRecord.
CREATE TABLE canary_tokens (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_tripped_at TIMESTAMPTZ,
  trip_count INT NOT NULL DEFAULT 0,
  last_trip_user_agent TEXT
);
CREATE INDEX idx_canary_tokens_owner ON canary_tokens (owner_user_id);
-- Tokens are the public tripwire lookup key; keep them unique.
CREATE UNIQUE INDEX idx_canary_tokens_token ON canary_tokens (token);
