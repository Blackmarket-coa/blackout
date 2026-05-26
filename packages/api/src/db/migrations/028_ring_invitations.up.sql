-- Ring invitations: the path to join private rings. Persisted via the
-- write-through store; upsert-only with a status field. One invitation per
-- (ring, invitee). TEXT ids, no cross-table FKs. Columns mirror RingInvitation
-- in @blackout/core.

CREATE TABLE ring_invitations (
  id TEXT PRIMARY KEY,
  ring_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (ring_id, invitee_id)
);
CREATE INDEX idx_ring_invitations_ring ON ring_invitations (ring_id);
CREATE INDEX idx_ring_invitations_invitee ON ring_invitations (invitee_id);
