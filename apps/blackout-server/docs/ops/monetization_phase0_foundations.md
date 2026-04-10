# Monetization Phase 0 Foundations (Operator Guide)

This document describes the Blackout monetization phase-0 backend foundations:
tier/entitlement primitives, billing webhook ingestion, and idempotent state transitions.

## Scope and protocol safety

Phase 0 does **not** change Matrix client-server or federation protocol behavior.
All functionality is additive and introduced via an internal admin webhook endpoint.

## Required secrets and config

Configure the `monetization` section:

```yaml
monetization:
  enabled: true
  billing_provider: "stub"
  default_tier: "free"
  billing_provider_api_key: "..."
  billing_webhook_secret: "..."
```

Secret wiring can also come from environment variables:

* `BLACKOUT_BILLING_PROVIDER_API_KEY`
* `BLACKOUT_BILLING_WEBHOOK_SECRET`

If both env and config keys are present, explicit config values win.

## Local development stubs

For local testing, use:

* `billing_provider: "stub"`
* a static `billing_webhook_secret` in local config
* manual POSTs to:
  * `/_synapse/admin/v1/monetization/webhook`

Webhook header requirement:

* `X-Blackout-Webhook-Secret: <billing_webhook_secret>`

Example payloads:

```json
{
  "event_id": "evt-upgrade-1",
  "event_type": "subscription.updated",
  "transition": "upgrade",
  "user_id": "@alice:example.com",
  "tier": "coalition"
}
```

```json
{
  "event_id": "evt-cancel-1",
  "event_type": "subscription.deleted",
  "transition": "cancel",
  "user_id": "@alice:example.com"
}
```

## Failure modes

1. **Missing webhook secret**
   * Symptom: webhook endpoint returns `503`.
   * Action: configure `billing_webhook_secret` (or env var) and restart.

2. **Invalid webhook secret**
   * Symptom: webhook endpoint returns `401`.
   * Action: ensure billing provider and Synapse share the same secret.

3. **Malformed transition payload**
   * Symptom: webhook endpoint returns `400`.
   * Action: verify required fields and enum values (`upgrade|downgrade|cancel`, valid tier names).

4. **Replay/delivered-twice webhook events**
   * Symptom: request returns `200` with `"processed": false`.
   * Action: none; this is expected idempotent behavior.

## Data model migration notes

Schema migration introduces:

* `blackout_user_entitlements`
* `blackout_billing_webhook_events`

These are additive tables only; no existing schema is rewritten.

## Rollback plan

1. Set `monetization.enabled: false` and restart Synapse.
2. Stop webhook delivery from the billing provider.
3. Optional: keep the new tables in place (safe for older code), or drop them manually
   during a maintenance window if strict schema parity is required.
