# FBM Billing — Blackout consumer contract (W1b)

Status: **active**. As of W1b the FreeBlackMarket marketplace provider is
Blackout's **only** billing rail: creator subscriptions, Canopy platform
plans, tips, and one-off marketplace purchases all move money on FBM and loop
back into Blackout as webhooks. The former direct Stripe/Lago rail
(`services/stripeCheckout.ts`, `services/billingWebhookSignature.ts`,
`/v1/subscriptions/portal`, `/v1/subscriptions/webhooks/lago`,
`/v1/subscriptions/webhooks/stripe`) is **deleted** — it was never live (no
credentials ever existed; zero real subscriptions), so this was a pre-launch
rewiring, not a migration.

The FBM-side provider contract is
`free-black-market/docs/contracts/blackout-integration.md` (§"Blackout
checkout (W1b)"). This file is the Blackout-side mirror: what our code sends,
what comes back, and which local records each leg resolves against. Sibling:
`docs/contracts/fbm-entitlements-consumer.md` (read-side entitlements).

## The delegation pattern

Money movement is always: **local pending record → FBM checkout session
(with a metadata correlation echo) → member pays on FBM → FBM webhook
returns the echo → local record resolves.** No Blackout code ever touches a
card, a charge, or a payment processor.

| Flow                  | Local record                          | Echo key                         | Resolver                                                             |
| --------------------- | ------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| Tips                  | `tips` row (pending)                  | `metadata.tipId`                 | `captureTip` / `refundTip`                                           |
| Creator subscriptions | `creator_subscriptions` row (pending) | `metadata.creatorSubscriptionId` | `captureSubscription` / `refundSubscription`                         |
| Canopy platform plans | `canopy_subscriptions` (user-keyed)   | `metadata.canopyPlanCode`        | `applySubscriptionWebhookEvent` (`invoice.paid` / `charge.refunded`) |
| Community boosts      | `boost_pledges` row                   | `metadata.boostPledgeId`         | `captureBoostPledge` / `refundBoostPledge`                           |

All resolution happens in ONE place —
`services/marketplaceWebhook.ts#dispatchMonetizationEvent` — off the signed
`POST /v1/marketplace/webhooks/freeblackmarket` receiver (HMAC-SHA256 over
exact bytes, `x-fbm-signature` / `x-fbm-event-id`, durable event-id de-dupe).

## Outbound: checkout session creation

`CheckoutInput` (packages/core `marketplace/provider.ts`) now carries:

-   `metadata?: Record<string,string>` — the bounded echo (≤20 keys, ≤64-char
    keys, ≤500-char values, FBM-enforced). Never put PII here.
-   `embedOrigin?: string` — https origin allowed to frame the embedded
    checkout (FBM pins CSP `frame-ancestors` to it). Only forwarded when the
    caller's `Origin` is https; dev uses the same-origin stub instead.
-   `idempotencyKey` is **load-bearing** on FBM now (stateful session row with
    a unique index): the same key returns the SAME session/cart/order.
    Server-driven callers use deterministic keys —
    `creator-sub:<subscriptionId>`, `canopy:<userId>:<planCode>:<yyyy-mm-dd>` —
    so retries can never double-charge.

### Creator subscriptions

`POST /v1/creator-subs/subscribe` `{ tierId, embed?, returnUrl? }` →
`201 { subscription, redirectUrl, sessionId, embed }`. The route starts the
pending row, then opens the FBM session for `tier.fbmListingId` with
`metadata.creatorSubscriptionId`. `redirectUrl: null` means billing is not
available (tier has no FBM listing / provider disabled) — nothing was
charged. The client (`CreatorSubscribeCta`) opens `redirectUrl` via the
embed overlay when `embed`, else a new tab.

### Canopy plans

`POST /v1/subscriptions/checkout` `{ planCode, successUrl?, cancelUrl?, embed? }`
→ `201 { sessionId, redirectUrl, provider: 'freeblackmarket', embed }`.
Plan → FBM listing resolution is the operator-maintained env mapping
`CANOPY_FBM_LISTING_IDS` (JSON `{planCode: listingId}`); the listings are
seeded on FBM as unpriced drafts carrying `metadata.canopy_plan_code` equal
to our plan codes. Unmapped plan → `503 billing_unavailable` (fail-safe,
never a charge). Unknown plan → `400 invalid_plan`.

Canopy state transitions ride the return leg: `purchase.succeeded` ⇒
`invoice.paid` (activates the plan, resets grace), `purchase.refunded` /
`purchase.chargebacked` ⇒ `charge.refunded` (cancels). Renewal/lapse arrive
via the §3 subscription bridge events below. The local grace machinery
(`entitlementActiveFor`, `graceDays`) and `comped` overrides (gift chain,
admin comp) are untouched — FBM is the money truth, Blackout remains the
access-policy truth.

## Inbound: §3 subscription bridge events

`subscription.activated` / `subscription.lapsed` (tier room ACL sync) are
unchanged, and now carry `occurredAt` for last-write-wins ordering under
webhook retry. New in W1b:

-   `subscription.payment_failed` `{ userId, tier, subscriptionId, attempt,
willRetry, nextRetryAt?, occurredAt }` — one per FBM dunning attempt.
    **Advisory**: recorded on the member's billing audit timeline
    (`billing.payment_failed`); access only lapses via `subscription.lapsed`.

## Lifecycle guarantees

-   **Renewals** happen on FBM (hourly cron charging the saved payment
    method). Blackout sees `purchase.succeeded` per renewal order (creator
    subs extend `currentPeriodEndsAt`; Canopy re-applies `invoice.paid`).
-   **Lapse**: creator subscriptions self-repair at read time — an `active`
    row past `currentPeriodEndsAt` + 3-day grace flips to `expired` on any
    read (emitting `creator_sub.expired`), so the unique-active index can
    never block a resubscribe. A late renewal charge still re-activates the
    original row (money moved ⇒ access); only `refunded` is terminal.
-   **Refunds**: FBM cancels the subscription + revokes its entitlements on
    its side and emits `purchase.refunded`; local records mirror to
    `refunded`/`canceled`.
-   **Gifts / pay-it-forward**: local-only `comped` overrides, deliberately
    NOT a payment flow (a stored gift-credit rail would violate FBM's
    Posture-A no-balance-holding stance). FBM is never the sole truth for
    comped access.

## Configuration

| Var                                                                                      | Meaning                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `FREEBLACKMARKET_ENABLED` / `FREEBLACKMARKET_API_KEY` / `FREEBLACKMARKET_WEBHOOK_SECRET` | provider auth (unchanged)                                                                                               |
| `FREEBLACKMARKET_STUB=1`                                                                 | in-memory provider for dev/CI; its stub sessions echo `metadata` onto the synthesized webhook exactly like live FBM     |
| `CANOPY_FBM_LISTING_IDS`                                                                 | JSON planCode→FBM listing id mapping (go-live step)                                                                     |
| removed                                                                                  | `STRIPE_*` (secret/public keys, price ids, checkout URLs, webhook secret, portal URL) and `LAGO_*` — nothing reads them |

## Non-goals / declared decisions

-   **Channel points are NON-MONETARY** (operator decision, W1b): per-channel
    engagement state like XP — creator-minted, earned in-channel, spent on
    redemptions, never purchasable and never convertible to CCR/USD or any
    FBM rail. Verified properties: mint only via self-channel grant, spend
    only via redeem, zero cents/CCR edges in the schema. Any future
    purchasable points product would be a NEW FBM-listed product, not a
    conversion of this ledger.
-   No Blackout-side billing portal: subscription management is local
    (cancel routes) + FBM-side checkout; there is no card-on-file UI here.
