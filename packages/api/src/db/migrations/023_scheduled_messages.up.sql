-- Scheduled Matrix messages awaiting delivery by the dispatcher. Must be
-- shared so exactly one replica delivers each due message (the dispatcher
-- claims rows transactionally in the Postgres store).

CREATE TABLE scheduled_messages (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Matrix room id (e.g. !abc:server), not a local UUID.
  matrix_room_id TEXT NOT NULL,
  body TEXT NOT NULL,
  formatted_body TEXT,
  deliver_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- Dispatcher poll: pending rows that are now due, oldest first.
CREATE INDEX idx_scheduled_messages_due
  ON scheduled_messages (deliver_at) WHERE status = 'pending';
CREATE INDEX idx_scheduled_messages_user ON scheduled_messages (user_id);
