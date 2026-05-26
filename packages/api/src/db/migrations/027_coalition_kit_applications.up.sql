-- Records of Coalition Kits applied to a den/coalition scope. Persisted via the
-- write-through store. TEXT ids, no cross-table FKs. Columns mirror
-- CoalitionKitApplicationRecord in packages/api/src/db/types.ts.

CREATE TABLE coalition_kit_applications (
  id TEXT PRIMARY KEY,
  kit_id TEXT NOT NULL,
  scope_type VARCHAR(16) NOT NULL,
  scope_id TEXT NOT NULL,
  applied_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_kit_applications_scope
  ON coalition_kit_applications (scope_type, scope_id);
