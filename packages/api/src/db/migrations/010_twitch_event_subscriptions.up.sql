-- Phase 1 / Track A: Twitch EventSub subscriptions persisted alongside
-- the chat bridges they belong to.
--
-- One row per (blackout creator, twitch channel, EventSub subscription type)
-- triple. We declare these subscriptions on Twitch's side via Helix
-- (POST /eventsub/subscriptions) when a chat bridge is created, and remove
-- them when the bridge is deleted. Twitch will deliver follow / sub /
-- sub-gift / cheer / raid notifications to /v1/integrations/twitch/eventsub
-- which finds the row by helix_subscription_id (or by twitch_user_id +
-- type) and forwards the normalized event into the bridge's Matrix room.
--
-- We do NOT store per-subscription HMAC secrets here — Phase 1 uses a
-- single TWITCH_EVENTSUB_SECRET env to verify every delivery. That's a
-- conscious trade-off: simpler operationally (one secret to rotate) at
-- the cost that an attacker who learns the secret can forge events for
-- any subscription. A follow-up will switch to per-subscription secrets
-- with secretBox encryption when the threat model upgrades.

CREATE TABLE twitch_event_subscriptions (
  id UUID PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Numeric Twitch user id of the broadcaster being watched. Mirrors
  -- linked_accounts.provider_user_id for the linked Twitch account that
  -- owns this subscription.
  twitch_user_id VARCHAR(64) NOT NULL,
  -- e.g. 'channel.follow', 'channel.subscribe', 'channel.subscription.gift',
  -- 'channel.cheer', 'channel.raid'.
  subscription_type VARCHAR(64) NOT NULL,
  -- The subscription id Twitch returned from POST /eventsub/subscriptions.
  -- Used to call DELETE /eventsub/subscriptions?id=<...> on cleanup, and
  -- as a fast lookup key when an inbound notification arrives.
  helix_subscription_id VARCHAR(64) NOT NULL UNIQUE,
  -- 'enabled', 'webhook_callback_verification_pending', 'authorization_revoked',
  -- 'user_removed', etc. — mirrors Twitch's status field.
  status VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blackout_user_id, twitch_user_id, subscription_type)
);

CREATE INDEX idx_twitch_event_subscriptions_user
  ON twitch_event_subscriptions (blackout_user_id);
CREATE INDEX idx_twitch_event_subscriptions_twitch_user
  ON twitch_event_subscriptions (twitch_user_id);
