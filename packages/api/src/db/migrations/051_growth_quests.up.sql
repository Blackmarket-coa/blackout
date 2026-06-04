-- Growth ledger: quest definitions + completions. Durable counterpart to the
-- in-process quest Maps from services/growth.ts. `criteria` is an opaque jsonb
-- payload interpreted by callers.

CREATE TABLE quests (
  id TEXT PRIMARY KEY,
  source_kind VARCHAR(16) NOT NULL CHECK (source_kind IN ('system', 'canopy', 'creator')),
  source_ref TEXT,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  reward_kind VARCHAR(16) NOT NULL CHECK (reward_kind IN ('tip', 'fbm_credit')),
  reward_cents INT NOT NULL CHECK (reward_cents >= 0),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quest_completions (
  id TEXT PRIMARY KEY,
  quest_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reward_tip_id TEXT,
  completed_at TIMESTAMPTZ NOT NULL
);

-- Each user can complete a given quest at most once.
CREATE UNIQUE INDEX idx_quest_completions_quest_user ON quest_completions (quest_id, user_id);
CREATE INDEX idx_quest_completions_user ON quest_completions (user_id);
