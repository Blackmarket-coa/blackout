-- Plugin social layer (Phase 6): ratings/reviews, forks, showcases.

CREATE TABLE plugin_reviews (
  id VARCHAR(128) PRIMARY KEY,
  plugin_id VARCHAR(255) NOT NULL,
  provider_listing_id VARCHAR(255),
  user_id VARCHAR(255) NOT NULL,
  rating SMALLINT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One review per (plugin, user); re-review updates in place.
CREATE UNIQUE INDEX uq_plugin_reviews_plugin_user ON plugin_reviews (plugin_id, user_id);
CREATE INDEX idx_plugin_reviews_plugin ON plugin_reviews (plugin_id);

CREATE TABLE plugin_forks (
  id VARCHAR(128) PRIMARY KEY,
  plugin_id VARCHAR(255) NOT NULL,
  forked_from_plugin_id VARCHAR(255) NOT NULL,
  owner_user_id VARCHAR(255) NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_plugin_forks_source ON plugin_forks (forked_from_plugin_id);
CREATE INDEX idx_plugin_forks_owner ON plugin_forks (owner_user_id);

CREATE TABLE plugin_showcases (
  id VARCHAR(128) PRIMARY KEY,
  plugin_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  scope_type VARCHAR(16) NOT NULL,
  scope_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_plugin_showcases_scope ON plugin_showcases (scope_type, scope_id);
CREATE INDEX idx_plugin_showcases_plugin ON plugin_showcases (plugin_id);
