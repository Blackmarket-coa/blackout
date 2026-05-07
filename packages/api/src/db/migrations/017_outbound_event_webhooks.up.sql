-- Phase 2 / Track B: outbound Discord-shape webhook subscriptions.
-- Counterpart to discord_compat_webhooks (inbound). A creator registers
-- a URL — typically a Discord channel webhook, or a Zapier / IFTTT / n8n
-- listener, or their own backend — and Blackout POSTs in Discord embed
-- shape every time a subscribed event fires. The receiver believes the
-- traffic is from a normal Discord webhook sender; the wire format is
-- a public spec so tools that consume it work unchanged.
--
-- HMAC-SHA256 of (timestamp + '.' + body) using the per-subscription
-- secret is sent in `X-Blackout-Signature`. Discord's own webhook URLs
-- ignore the header gracefully (HMAC is optional for them); custom
-- receivers can verify it.

CREATE TABLE outbound_event_webhooks (
  id UUID PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Display label only.
  name VARCHAR(80) NOT NULL,
  -- Target URL. We allow http(s) only and validate at the service layer.
  target_url VARCHAR(2048) NOT NULL,
  -- AES-256-GCM envelope of the HMAC signing secret (services/secretBox.ts
  -- format: `${keyId}:${nonce}:${ciphertext}:${tag}`). AAD binds the row
  -- so a leaked envelope can't be replayed against another subscription.
  signing_secret_ciphertext TEXT NOT NULL,
  encryption_key_id VARCHAR(32) NOT NULL,
  -- JSON array of event types this subscription wants
  -- (tip.created, follow.created, livestream.started, livestream.ended, chat.message.received).
  event_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Failure backoff bookkeeping. Three consecutive 5xx → auto-pause.
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_delivery_at TIMESTAMPTZ,
  last_status INTEGER,
  last_error VARCHAR(255),
  delivery_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbound_event_webhooks_user
  ON outbound_event_webhooks (blackout_user_id);
CREATE INDEX idx_outbound_event_webhooks_active
  ON outbound_event_webhooks (is_active) WHERE is_active = TRUE;
