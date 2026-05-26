-- Coalition kit applications ledger (Phase 4).
--
-- Records that a coalition kit was applied to a coalition: the theme + feature
-- customization snapshot, the dens it provisioned, and the plugins it installed
-- at coalition scope. One row per (coalition, kit) so re-apply is idempotent;
-- the row also supports later teardown.

CREATE TABLE coalition_kit_applications (
  id VARCHAR(128) PRIMARY KEY,
  coalition_id VARCHAR(255) NOT NULL,
  kit_id VARCHAR(255) NOT NULL,
  applied_by_user_id VARCHAR(255) NOT NULL,
  -- CoalitionKitArchetype
  archetype VARCHAR(32) NOT NULL,
  -- BlackoutCustomizationBundle snapshot (theme + feature flags).
  customization JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Matrix room ids of dens this application provisioned.
  den_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Plugin ids installed at coalition scope by this application.
  bundled_plugin_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 'applied' | 'reverted'
  status VARCHAR(16) NOT NULL DEFAULT 'applied',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One application per (coalition, kit); re-apply updates this row.
CREATE UNIQUE INDEX uq_coalition_kit_applications_coalition_kit
  ON coalition_kit_applications (coalition_id, kit_id);

CREATE INDEX idx_coalition_kit_applications_coalition
  ON coalition_kit_applications (coalition_id);
