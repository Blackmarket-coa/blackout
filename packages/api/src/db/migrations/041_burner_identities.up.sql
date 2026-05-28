-- Burner identities: disposable Matrix accounts an owner provisions and burns.
--
-- The owner is the primary account (API JWT `sub`) that created the burner;
-- only that owner may list or burn it. `burned_at` is set when the throwaway
-- Synapse account is deactivated, leaving the row as an audit trail.
-- Column names are the snake_case of BurnerIdentityRecord (the pg writer maps
-- camelCase fields ↔ snake_case columns by reflection).

CREATE TABLE burner_identities (
  id UUID PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  burner_user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  burned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_burner_identities_owner ON burner_identities (owner_user_id);
CREATE UNIQUE INDEX idx_burner_identities_burner_user ON burner_identities (burner_user_id);
