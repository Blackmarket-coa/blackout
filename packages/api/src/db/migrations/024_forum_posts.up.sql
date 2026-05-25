-- Long-form community forum posts.

CREATE TABLE forum_posts (
  id UUID PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  -- Optional channel scoping; no FK so a post can outlive a channel.
  channel_id UUID,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forum_posts_community ON forum_posts (community_id, created_at DESC);
CREATE INDEX idx_forum_posts_author ON forum_posts (author_id);
