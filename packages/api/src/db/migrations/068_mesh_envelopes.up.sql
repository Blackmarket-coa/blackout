-- Store-and-forward mesh envelopes (G6 mesh transport). Opaque, end-to-end
-- encrypted payloads the relay node holds and gossips with peers; the relay
-- never inspects `payload`. Previously in-memory only (lost on restart); now
-- persisted via the write-through store. TEXT ids / no cross-table FKs to match
-- the string-keyed store. `seen_by` is a JSONB string array (epidemic-routing
-- dedup). Columns mirror MeshEnvelopeRecord by reflection.

CREATE TABLE mesh_envelopes (
  id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  hop_count INTEGER NOT NULL DEFAULT 0,
  max_hops INTEGER NOT NULL DEFAULT 8,
  seen_by JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX idx_mesh_envelopes_recipient ON mesh_envelopes (recipient);
CREATE INDEX idx_mesh_envelopes_expires ON mesh_envelopes (expires_at);
