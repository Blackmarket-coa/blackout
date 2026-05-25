-- Plugin install-scoping (Phase 1).
--
-- Separates ownership (marketplace_entitlements, user-scoped) from
-- activation-at-scope (this table). A row records that a plugin is turned on
-- at a User / Den / Coalition / Creator scope, referencing the entitlement
-- that authorizes it (NULL for free / in-tree plugins).
--
-- Coalition installs use per-den opt-in: a coalition-scope row is stored with
-- status 'available' and never auto-activates any den; each den activates by
-- creating its own den-scope 'enabled' row. There is no scope inheritance.

CREATE TABLE plugin_installations (
  id VARCHAR(128) PRIMARY KEY,
  plugin_id VARCHAR(255) NOT NULL,
  -- FK to marketplace_entitlements.id; NULL for free / in-tree plugins.
  entitlement_id VARCHAR(128),
  -- InstallScopeType: user|den|coalition|creator
  scope_type VARCHAR(16) NOT NULL,
  -- userId | denId (matrix room id) | coalitionId | creatorId
  scope_id VARCHAR(255) NOT NULL,
  installed_by_user_id VARCHAR(255) NOT NULL,
  -- InstallStatus: enabled|disabled|available|pending|error
  status VARCHAR(16) NOT NULL DEFAULT 'enabled',
  -- CreatorArtifactKind of the installed plugin.
  artifact_kind VARCHAR(32) NOT NULL,
  -- PluginDomain (Phase 0 taxonomy); NULL when uncategorized.
  domain VARCHAR(32),
  granted_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One installation per plugin per scope; re-install is an upsert on this key.
CREATE UNIQUE INDEX uq_plugin_installations_scope
  ON plugin_installations (plugin_id, scope_type, scope_id);

-- The hot read path: "what is active in this scope?" / scope dashboards.
CREATE INDEX idx_plugin_installations_scope ON plugin_installations (scope_type, scope_id);
-- Reverse lookup: every scope a given plugin is installed in.
CREATE INDEX idx_plugin_installations_plugin ON plugin_installations (plugin_id);
