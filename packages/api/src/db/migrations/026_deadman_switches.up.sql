-- Deadman switches: an encrypted payload released to recipients if the owner
-- stops checking in. The trigger sweep runs on a scheduler, so the armed set
-- must be shared across replicas.

CREATE TABLE deadman_switches (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Matrix room id the payload is released into; not a local UUID.
  room_id TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'armed'
    CHECK (status IN ('armed', 'grace', 'triggered', 'cancelled')),
  check_in_interval_seconds INTEGER NOT NULL,
  grace_period_seconds INTEGER NOT NULL,
  last_check_in_at TIMESTAMPTZ NOT NULL,
  trigger_at TIMESTAMPTZ NOT NULL,
  release_at TIMESTAMPTZ NOT NULL,
  -- Matrix user ids to notify on release.
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  encrypted_payload TEXT NOT NULL,
  headline VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deadman_switches_owner ON deadman_switches (owner_id);
-- Sweep: armed/grace switches whose trigger time has arrived.
CREATE INDEX idx_deadman_switches_trigger
  ON deadman_switches (trigger_at) WHERE status IN ('armed', 'grace');
