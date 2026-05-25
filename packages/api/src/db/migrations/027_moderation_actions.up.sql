-- Community moderation audit log (warn/mute/ban/remove_content).

CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL
    CHECK (action IN ('warn', 'mute', 'ban', 'remove_content')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moderation_actions_community ON moderation_actions (community_id, created_at DESC);
CREATE INDEX idx_moderation_actions_target ON moderation_actions (target_id);
