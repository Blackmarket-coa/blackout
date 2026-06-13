-- Canary tokens (G5 active defense). Defensive deception primitive: an opaque
-- token an operator embeds in a honeypot artifact; an unauthorized access fires
-- the public tripwire (GET /ct/:token), which records the trip. Previously
-- in-memory only (lost on restart); now persisted via the write-through store.
-- TEXT ids / no cross-table FKs to match the string-keyed store. Columns mirror
-- CanaryTokenRecord by reflection (camelCase -> snake_case).

CREATE TABLE canary_tokens (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  last_tripped_at TIMESTAMPTZ,
  trip_count INTEGER NOT NULL DEFAULT 0,
  last_trip_user_agent TEXT
);
CREATE INDEX idx_canary_tokens_owner ON canary_tokens (owner_user_id);
