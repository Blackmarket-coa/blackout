-- Coalitions network: multi-member groups that replace the friends list.
-- Persisted via the write-through store. TEXT ids, no cross-table FKs,
-- upsert-only rows with `active` / `status` flags instead of deletes. Columns
-- mirror the Coalition* / Campaign* / ExternalActivity interfaces in
-- @blackout/core (coalitionNetwork.ts).
--
-- Money never lives in these tables: drive contributions settle through the
-- existing tips → FBM checkout → marketplace-webhook path; `raised_cents` is a
-- capture-time projection of that ledger.

CREATE TABLE coalitions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mission TEXT NOT NULL,
  banner_url TEXT,
  join_mode VARCHAR(16) NOT NULL,
  min_tier_to_join VARCHAR(16),
  space_room_id TEXT,
  created_by TEXT NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalitions_created_by ON coalitions (created_by);
CREATE INDEX idx_coalitions_space ON coalitions (space_room_id);

CREATE TABLE coalition_memberships (
  id TEXT PRIMARY KEY,
  coalition_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role VARCHAR(16) NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (coalition_id, user_id)
);
CREATE INDEX idx_coalition_memberships_coalition ON coalition_memberships (coalition_id);
CREATE INDEX idx_coalition_memberships_user ON coalition_memberships (user_id);

CREATE TABLE coalition_join_requests (
  id TEXT PRIMARY KEY,
  coalition_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message TEXT,
  status VARCHAR(16) NOT NULL,
  invited_by TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (coalition_id, user_id)
);
CREATE INDEX idx_coalition_join_requests_coalition ON coalition_join_requests (coalition_id, status);
CREATE INDEX idx_coalition_join_requests_user ON coalition_join_requests (user_id);

-- Per-platform auth mode. `credential_ref` is an opaque handle into the
-- integrations credential store; the secret itself is never stored here.
CREATE TABLE coalition_connections (
  id TEXT PRIMARY KEY,
  coalition_id TEXT NOT NULL,
  platform VARCHAR(16) NOT NULL,
  auth_mode VARCHAR(16) NOT NULL,
  credential_ref TEXT,
  display_handle TEXT,
  created_by TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (coalition_id, platform)
);

CREATE TABLE coalition_member_connections (
  id TEXT PRIMARY KEY,
  coalition_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  platform VARCHAR(16) NOT NULL,
  credential_ref TEXT NOT NULL,
  display_handle TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (coalition_id, user_id, platform)
);
CREATE INDEX idx_coalition_member_connections_user ON coalition_member_connections (user_id);

CREATE TABLE coalition_campaigns (
  id TEXT PRIMARY KEY,
  coalition_id TEXT NOT NULL,
  type VARCHAR(16) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  goal_cents BIGINT,
  goal_units INTEGER,
  raised_cents BIGINT NOT NULL DEFAULT 0,
  contributor_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL,
  requires_steward_approval BOOLEAN NOT NULL,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  project_id TEXT,
  bounty_id TEXT,
  aid_post_id TEXT,
  fbm_listing_id TEXT,
  fbm_order_cycle_id TEXT,
  logistics_drive_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_campaigns_coalition ON coalition_campaigns (coalition_id, status);
CREATE INDEX idx_coalition_campaigns_project ON coalition_campaigns (project_id);
CREATE INDEX idx_coalition_campaigns_aid_post ON coalition_campaigns (aid_post_id);

CREATE TABLE coalition_campaign_posts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  coalition_id TEXT NOT NULL,
  platform VARCHAR(16) NOT NULL,
  external_post_id TEXT,
  direction VARCHAR(8) NOT NULL,
  sync_status VARCHAR(16) NOT NULL,
  author_user_id TEXT,
  share_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_campaign_posts_campaign ON coalition_campaign_posts (campaign_id);
CREATE INDEX idx_coalition_campaign_posts_external
  ON coalition_campaign_posts (platform, external_post_id);

-- Inbound replies are quarantined here and are never visible until approved.
-- `external_author` is display text only; no Blackout profile is implied.
CREATE TABLE coalition_external_activity (
  id TEXT PRIMARY KEY,
  campaign_post_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  coalition_id TEXT NOT NULL,
  source_platform VARCHAR(16) NOT NULL,
  external_author TEXT NOT NULL,
  external_id TEXT,
  content TEXT NOT NULL,
  moderation_status VARCHAR(16) NOT NULL,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_external_activity_campaign
  ON coalition_external_activity (campaign_id, moderation_status);
CREATE UNIQUE INDEX idx_coalition_external_activity_dedupe
  ON coalition_external_activity (source_platform, external_id)
  WHERE external_id IS NOT NULL;

-- Explicit per-member, per-campaign, per-platform opt-in. Absent row = off.
CREATE TABLE coalition_campaign_sync_opt_ins (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  coalition_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  platform VARCHAR(16) NOT NULL,
  enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (campaign_id, user_id, platform)
);

-- One boost per (campaign, member, UTC day): a separate pool from Community
-- Boost pledges and Circle relays, so nothing is double-counted.
CREATE TABLE coalition_boosts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  coalition_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (campaign_id, user_id, day)
);
CREATE INDEX idx_coalition_boosts_campaign ON coalition_boosts (campaign_id);
CREATE INDEX idx_coalition_boosts_member_day ON coalition_boosts (coalition_id, user_id, day);

-- One row per captured contribution toward a campaign's goal. Keyed by the
-- tip id (unique), so a replayed FBM capture never double-counts; the campaign
-- row carries only the running totals derived from these.
CREATE TABLE coalition_campaign_contributions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  coalition_id TEXT NOT NULL,
  supporter_user_id TEXT NOT NULL,
  tip_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX idx_coalition_campaign_contributions_tip
  ON coalition_campaign_contributions (tip_id);
CREATE INDEX idx_coalition_campaign_contributions_campaign
  ON coalition_campaign_contributions (campaign_id, created_at);
