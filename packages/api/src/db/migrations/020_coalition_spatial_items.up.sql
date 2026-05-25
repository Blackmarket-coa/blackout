-- Coalition "Living Map" durable storage.
--
-- The spatial map previously lived only in an in-memory seed array, so any
-- mutual-aid post created at runtime was lost on restart. These two tables are
-- the schema-of-record for the map's two dynamic sources: spatial pins (events,
-- dens, streams, projects, communities, aid, vendors, governance, infra) and
-- mutual-aid requests/offers. Seller locations remain seeded/read-only for now.

CREATE TABLE coalition_spatial_items (
  id VARCHAR(128) PRIMARY KEY,
  -- SpatialLayerKey: vendors|jobs|gardens|votes|aid|infra|events|dens|streams|projects|communities|mycelium
  layer VARCHAR(32) NOT NULL,
  title VARCHAR(200) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  -- SpatialVisibility: public|community|private
  visibility VARCHAR(16) NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  severity VARCHAR(16),
  -- Participation density 0..1 used to weight the activity-heat overlay.
  activity_level DOUBLE PRECISION,
  -- Optional deep-link targets so a pin can open its den/stream/community.
  den_id VARCHAR(255),
  stream_id VARCHAR(255),
  canopy_id VARCHAR(255),
  source VARCHAR(32),
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coalition_spatial_items_layer ON coalition_spatial_items (layer);
-- Supports the Now / Today / This week temporal filter.
CREATE INDEX idx_coalition_spatial_items_window ON coalition_spatial_items (starts_at, ends_at);

CREATE TABLE coalition_aid_posts (
  id VARCHAR(128) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  -- AidPostType: need|offer
  type VARCHAR(16) NOT NULL,
  category VARCHAR(32) NOT NULL,
  title VARCHAR(140) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address VARCHAR(255),
  display_radius_meters INTEGER NOT NULL,
  -- AidPostUrgency: low|medium|high|critical
  urgency VARCHAR(16) NOT NULL,
  -- AidPostStatus: open|in_progress|fulfilled|expired|cancelled
  status VARCHAR(16) NOT NULL,
  expires_at TIMESTAMPTZ,
  fulfiller_id VARCHAR(255),
  fulfilled_at TIMESTAMPTZ,
  den_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coalition_aid_posts_den ON coalition_aid_posts (den_id);
