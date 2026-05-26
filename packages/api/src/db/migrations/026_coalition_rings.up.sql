-- Coalition Rings: persistent trusted circles/crews/guilds + memberships.
-- Persisted via the write-through store. Memberships are upsert-only with an
-- `active` flag (leave toggles it — no deletes). TEXT ids, no cross-table FKs;
-- optional ring location flattened to lat/lng/address. Columns mirror
-- CoalitionRing / RingMembership in @blackout/core.

CREATE TABLE coalition_rings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  kind VARCHAR(16) NOT NULL,
  visibility VARCHAR(16) NOT NULL,
  owner_id TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT,
  den_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_rings_owner ON coalition_rings (owner_id);

CREATE TABLE ring_memberships (
  id TEXT PRIMARY KEY,
  ring_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role VARCHAR(16) NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (ring_id, user_id)
);
CREATE INDEX idx_ring_memberships_ring ON ring_memberships (ring_id);
CREATE INDEX idx_ring_memberships_user ON ring_memberships (user_id);
