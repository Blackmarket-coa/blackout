-- Plugin dens (Phase 5 den factory).
--
-- Records the companion dens (Matrix rooms) a plugin install provisioned. Each
-- row links an installation to a created den and the purpose it serves. One den
-- per (installation, purpose) so re-provisioning is idempotent.

CREATE TABLE plugin_dens (
  id VARCHAR(128) PRIMARY KEY,
  installation_id VARCHAR(128) NOT NULL,
  plugin_id VARCHAR(255) NOT NULL,
  -- Matrix room id of the provisioned den.
  den_id VARCHAR(255) NOT NULL,
  -- PluginDenPurpose: support|tutorial|collaboration|update
  purpose VARCHAR(32) NOT NULL,
  -- DenType the den was classified as.
  den_type VARCHAR(16) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One den per purpose per installation; re-provision is a no-op on this key.
CREATE UNIQUE INDEX uq_plugin_dens_installation_purpose
  ON plugin_dens (installation_id, purpose);

-- Reverse lookups: every den a plugin spun up, and the dens for an install.
CREATE INDEX idx_plugin_dens_plugin ON plugin_dens (plugin_id);
CREATE INDEX idx_plugin_dens_installation ON plugin_dens (installation_id);
