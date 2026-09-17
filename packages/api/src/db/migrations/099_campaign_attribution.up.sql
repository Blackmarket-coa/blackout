-- What a campaign's shares actually produced, as counts.
--
-- Counts and not rows-per-visitor, deliberately. TRUST.md §2 states the rule:
-- "Connections you made are exported in full; inbound ones — your followers,
-- who redeemed your invites — are counted, not listed. Handing you a list of
-- everyone who follows you would export their associations under the banner of
-- your portability." A table of "this visitor arrived from that member's share
-- and then signed up" is exactly that list, so it is not kept.
--
-- There is therefore no visitor identifier anywhere in this schema: no cookie
-- id, no IP, no IP hash, no user agent. A share is identified by campaign +
-- channel + (optionally) the member who sent it, all of which are known before
-- any visitor exists, and everything a visitor does increments a number.
CREATE TABLE IF NOT EXISTS coalition_campaign_attribution (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  coalition_id TEXT NOT NULL,
  channel VARCHAR(16) NOT NULL,
  -- The member who shared, when a person did. NULL for an automated post.
  sharer_user_id TEXT,
  -- A stranger opened the campaign from this share.
  visits INTEGER NOT NULL DEFAULT 0,
  -- ...and went on to create an account.
  signups INTEGER NOT NULL DEFAULT 0,
  -- ...or to join the coalition, or to contribute. A visitor can do more than
  -- one, so these do not sum to `visits`.
  joins INTEGER NOT NULL DEFAULT 0,
  contributions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (campaign_id, channel, sharer_user_id)
);
CREATE INDEX IF NOT EXISTS idx_coalition_campaign_attribution_coalition
  ON coalition_campaign_attribution (coalition_id);
