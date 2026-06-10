-- Reverse 066_persona_roster: drop the persona-roster columns + index.

DROP INDEX IF EXISTS idx_burner_identities_compartment;
ALTER TABLE burner_identities DROP COLUMN IF EXISTS root_key_commitment;
ALTER TABLE burner_identities DROP COLUMN IF EXISTS rotation_epoch;
ALTER TABLE burner_identities DROP COLUMN IF EXISTS compartment_id;
