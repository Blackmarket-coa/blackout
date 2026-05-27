-- Native channel-points engagement economy (the Twitch channel-points
-- equivalent). Viewers earn points on a creator's channel and redeem them for
-- creator-defined rewards.
--
-- Balances are NOT stored: a viewer's balance is the sum of channel_points_ledger
-- deltas for (channel_id, user_id) — earns positive, redemptions negative,
-- refunds positive. Append-only, so the ledger is an audit trail.

CREATE TABLE channel_points_rewards (
  id UUID PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  cost INTEGER NOT NULL,
  prompt VARCHAR(280),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channel_points_rewards_creator
  ON channel_points_rewards (creator_id);

CREATE TABLE channel_points_ledger (
  id UUID PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points_delta INTEGER NOT NULL,
  reason VARCHAR(16) NOT NULL,
  reward_id UUID,
  reward_title VARCHAR(120),
  user_input VARCHAR(280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Balance aggregation reads by (channel, viewer); redemption history reads by
-- (channel, reason) newest-first.
CREATE INDEX idx_channel_points_ledger_balance
  ON channel_points_ledger (channel_id, user_id);
CREATE INDEX idx_channel_points_ledger_redemptions
  ON channel_points_ledger (channel_id, created_at DESC);
