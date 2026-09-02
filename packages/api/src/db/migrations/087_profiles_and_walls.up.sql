-- Member profiles and their walls.
--
-- Completes what 085 started. `services/profileStore.ts` held these in two
-- module-level Maps and lost them on every restart, exactly like the follow
-- graph did — and the profile now carries real state a person arranged by hand:
-- their block layout, chosen palette, per-relationship Circle-map consent, and
-- pinned relays. Losing a Circle-map opt-in on deploy would silently re-hide (or
-- worse, re-expose) relationships someone made a deliberate decision about, so
-- this is a correctness fix rather than a convenience.
--
-- `profile` is the whole `BmcProfileEvent` as JSONB: it is a sanitized, versioned
-- blob the client round-trips, and flattening it into columns would mean a
-- migration every time a profile gains a field. `role_badges` / `mutual_spaces`
-- are JSONB arrays, matching 065_bounties' requirements/deliverables.
--
-- TEXT ids / no cross-table FKs to match the string-keyed write-through store.
-- Column names are camelToSnake of the record fields in db/types.ts.

CREATE TABLE member_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  primary_role TEXT,
  role_badges JSONB NOT NULL DEFAULT '[]'::jsonb,
  mutual_spaces JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_friend BOOLEAN,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Stamped by the server on first write and immutable afterwards.
  member_since TIMESTAMPTZ
);

-- Wall posts, keyed by their own id. `profile_user_id` is the wall they live on;
-- `author_id` is who wrote them, and the two differ whenever someone posts on
-- another person's wall.
CREATE TABLE profile_wall_posts (
  id TEXT PRIMARY KEY,
  profile_user_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
-- Rendering one wall, newest first.
CREATE INDEX idx_profile_wall_posts_profile
  ON profile_wall_posts (profile_user_id, created_at);
-- The Circle-ring query: everything a followed author wrote, anywhere.
CREATE INDEX idx_profile_wall_posts_author ON profile_wall_posts (author_id, created_at);
