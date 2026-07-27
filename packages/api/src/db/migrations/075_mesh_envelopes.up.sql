-- Durable store for the mesh relay store-and-forward queue (audit M17):
-- previously an in-memory array in services/meshRelay.ts, lost on restart.
-- Opaque end-to-end-encrypted envelopes the server relay node holds and gossips
-- with peers. TEXT ids / no cross-table FKs to match the string-keyed
-- write-through store, like 071_coalition_surge_notifications.
CREATE TABLE mesh_envelopes (
  id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  hop_count INT NOT NULL,
  max_hops INT NOT NULL,
  seen_by TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_mesh_envelopes_recipient ON mesh_envelopes (recipient);
CREATE INDEX idx_mesh_envelopes_expires ON mesh_envelopes (expires_at);
