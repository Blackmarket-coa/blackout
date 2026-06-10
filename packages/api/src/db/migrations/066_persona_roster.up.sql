-- Persona roster (G3): compartments, alias-rotation epoch, and a root-key
-- commitment for burner identities. The raw persona root key is held only on
-- the client; the server stores root_key_commitment (SHA-256) so it can track
-- rotation epochs without ever holding key material. Column names are the
-- snake_case of the new BurnerIdentityRecord fields (mapped by reflection).

ALTER TABLE burner_identities ADD COLUMN compartment_id TEXT;
ALTER TABLE burner_identities ADD COLUMN rotation_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE burner_identities ADD COLUMN root_key_commitment TEXT;

CREATE INDEX idx_burner_identities_compartment
  ON burner_identities (owner_user_id, compartment_id);
