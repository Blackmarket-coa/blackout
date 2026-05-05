-- Phase 2 of the creator monetization rollout: live commerce primitives.
--
-- Gifts (Twitch Bits / TikTok live gifts) are modeled as single-shot tips
-- carrying a `gift_sku` from the in-process gift catalog. This avoids
-- stored-value licensing concerns until the prepaid-balance flow is
-- legally cleared (see plan: phase-2 risk note). The recipient is paid
-- immediately via the same FBM checkout pipeline as a tip.
--
-- Paywalled posts and event tickets do NOT need new tables — they reuse
-- `marketplace_entitlements` with the new `post_unlock` and `event_ticket`
-- entitlement kinds, gated by a shared "active entitlement for listing"
-- helper.

ALTER TABLE tips ADD COLUMN gift_sku VARCHAR(64);

CREATE INDEX idx_tips_gift_sku
  ON tips (gift_sku)
  WHERE gift_sku IS NOT NULL;
