-- Coalition events (scheduled gatherings) + attendee RSVPs. Persisted via the
-- write-through store, mirroring coalition_aid_posts. TEXT ids / no cross-table
-- FKs to match the string-keyed store; location is flattened to lat/lng/address
-- and recurrence is stored as JSONB. Columns mirror CoalitionEvent / EventRsvp
-- in @blackout/core.

CREATE TABLE coalition_events (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  category VARCHAR(32) NOT NULL,
  visibility VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL,
  den_id TEXT,
  capacity INTEGER,
  recurrence JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_events_starts_at ON coalition_events (starts_at);
CREATE INDEX idx_coalition_events_den ON coalition_events (den_id);

CREATE TABLE event_rsvps (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (event_id, user_id)
);
CREATE INDEX idx_event_rsvps_event ON event_rsvps (event_id);
