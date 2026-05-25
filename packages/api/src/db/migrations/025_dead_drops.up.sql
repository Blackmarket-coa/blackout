-- One-shot encrypted "dead drop" messages: a sender leaves an encrypted
-- payload for a recipient, opened at most once.

CREATE TABLE dead_drops (
  id UUID PRIMARY KEY,
  -- Channel context; no FK (drops can reference ad-hoc channels).
  channel_id UUID NOT NULL,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dead_drops_recipient ON dead_drops (recipient_id, created_at DESC);
