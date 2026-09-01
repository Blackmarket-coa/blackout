-- Circle graph + relay chains: the persisted spine of the Circle/Reach feed.
--
-- `circle_edges` replaces the module-level Map in services/follows.ts, whose own
-- header admitted it was "process-memory only and resets on restart". Every
-- Circle/Reach feature reads this graph, so losing it on deploy was not
-- survivable. Same shape as the follow edges it supersedes; /v1/follows stays as
-- an alias over the same table.
--
-- `relay_edges` records who relayed what, and — via parent_relay_id — which edge
-- they saw it through. Storing the chain rather than recomputing it makes the
-- visible [You] -> [X] -> [Y] path a parent-pointer walk instead of a graph
-- search, and makes cycles impossible: a parent must exist before its child.
--
-- TEXT ids / no cross-table FKs to match the string-keyed write-through store,
-- like 074_canary_tokens and 078_canopy_subscriptions. Column names are
-- camelToSnake of the record fields in db/types.ts.

-- Directional: follower_id put followee_id in their Circle. Two rows pointing
-- both ways is what "circles overlap" means; there is no mutual table.
CREATE TABLE circle_edges (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL,
  followee_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (follower_id, followee_id)
);
-- Feed reads walk follower -> followees on every request; the reverse index
-- serves follower counts and the "who put me in their Circle" profile block.
CREATE INDEX idx_circle_edges_follower ON circle_edges (follower_id, created_at);
CREATE INDEX idx_circle_edges_followee ON circle_edges (followee_id);

-- One row per (relayer, subject); `active` toggles off on un-relay and rows are
-- never deleted, matching coalition_feed_likes. The UNIQUE constraint is the
-- target of the generic upsert's ON CONFLICT.
CREATE TABLE relay_edges (
  id TEXT PRIMARY KEY,
  relayer_user_id TEXT NOT NULL,
  subject_source TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  parent_relay_id TEXT,
  root_relay_id TEXT NOT NULL,
  chain_depth INT NOT NULL DEFAULT 0,
  origin_author_id TEXT,
  note TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (relayer_user_id, subject_source, subject_id)
);
-- The Reach query: active edges by anyone in my Circle, newest first.
CREATE INDEX idx_relay_edges_relayer ON relay_edges (relayer_user_id, created_at);
-- Dedupe + "who else relayed this" on a subject already in the feed.
CREATE INDEX idx_relay_edges_subject ON relay_edges (subject_source, subject_id);
-- Chain walks climb parents; grouping counts sibling chains by root.
CREATE INDEX idx_relay_edges_parent ON relay_edges (parent_relay_id);
CREATE INDEX idx_relay_edges_root ON relay_edges (root_relay_id);
