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

### Subscription management (manage session)

Added 2026-10-06 (operator round 3, item 21). The FBM half is fixed by the
shared manage-session contract; FBM builds the endpoint and page, Blackout
integrates against it. It keeps the approved disclosure ("turn off automatic
renewal or cancel at any time under Account -> Subscriptions") true for
Blackout members, who have no FBM storefront login.

`POST /v1/subscriptions/manage-session` `{ returnUrl? }` →
`201 { url, expiresAt }` (`cache-control: no-store`).

-   **Auth**: `requireUser`. The user id sent to FBM is `user.sub` from the
    verified token. A `userId` in the body is not part of the schema and is
    stripped.
-   **Server switch**: `FBM_MANAGE_SESSION_ENABLED` (`1`/`true`). Unset or
    anything else answers `503 billing_unavailable` before FBM is called.
-   **returnUrl**: optional, at most 2048 characters (longer is `400`).
    Forwarded only when it is the native deep link `blackout://checkout/return`
    or an http(s) URL without credentials whose origin is in an explicit
    `CORS_ALLOWED_ORIGINS` list. A `*` wildcard (refused in production anyway)
    is not a list, so it forwards no web return link at all. A forwarded web
    link is cut to its origin plus `/`: the client's page URL names the open
    space, room and event, and none of that goes to FBM. The client sends
    only `${origin}/` in the first place (or the native deep link). Anything
    else is dropped, not refused. FBM applies its own `BLACKOUT_RETURN_ORIGINS`
    allowlist on top and may ignore it.
-   **Upstream call**: the FBM provider's
    `createSubscriptionManageSession` (capability `subscription-manage`)
    POSTs `{FREEBLACKMARKET_BASE_URL}{FREEBLACKMARKET_API_PREFIX}/subscriptions/manage-sessions`
    with the same bearer `FREEBLACKMARKET_API_KEY` as the checkout mint, body
    `{ blackout_user_id, return_url? }` (snake_case, strict), and no
    idempotency key: each mint revokes the member's earlier links, so a
    replayed key could only return a revoked one. FBM answers
    `201 { url, expires_at }`. The provider returns the link only when it is
    on the `FREEBLACKMARKET_BASE_URL` origin (so plain http only for a
    local-dev base URL) and its path is exactly
    `{prefix}/subscriptions/manage-sessions/{token}/page`, with no
    credentials, query or fragment; anything else is a `502`.
-   **Error mapping**: FBM `404 { code: "feature_disabled" }`, an
    unconfigured provider, or a provider without the method →
    `503 billing_unavailable`. A 404 without that body code (a wrong
    `FREEBLACKMARKET_API_PREFIX` or base URL) is a misconfiguration, not
    "FBM's flag is off", and is a `502 manage_session_failed`.
    FBM `409 identity_ambiguous` (more than one FBM customer carries the
    Blackout user id) → `409 billing_identity_ambiguous`; Blackout does not
    pick one either. Any other failure → `502 manage_session_failed`.
-   **The URL is a bearer capability**. Whoever holds it can manage that
    member's FBM subscriptions until it expires (15 minutes, per the
    contract; not yet verified against a live FBM).
    The API never logs it or writes it to the audit timeline; the audit row
    `billing.manage_session_created` records only the provider, `expiresAt`
    and whether a return URL was sent. Failure logs carry the error code only.
-   **Client** (`apps/blackout-client/src/app/features/settings/subscriptions/`):
    Settings -> Subscriptions, behind the client flag `accountSubscriptions`
    (default off; a beta build with `VITE_BLACKOUT_BETA_UNLOCK_ALL` turns
    every client flag on, this one included, and `BLACKOUT_ACCOUNT_SUBSCRIPTIONS=false`
    cannot override that, so there the section shows and the server switch
    alone keeps the endpoint at 503). Shows the plan from `GET /v1/subscriptions/me` and creator
    subscriptions from `GET /v1/creator-subs/subscriptions/me`, read-only.
    The "Manage billing on Free Black Market" button calls the endpoint once
    (no retry), checks the returned link's origin against
    `VITE_FBM_MANAGE_ORIGINS` (build time; default
    `https://api.freeblackmarket.com`) and its path against FBM's
    `/…/manage-sessions/{token}/page` (no query or fragment), and opens it
    with `openExternalCheckoutUrl` (new tab with `noopener,noreferrer`, the
    Capacitor system browser, or on the Tauri desktop shell the system browser
    through `tauri-plugin-opener`, https only). Never an iframe, on any
    platform; the contract also requires FBM to serve the page with
    `frame-ancestors 'none'` (not yet verified). The desktop path is
    compile-checked but not exercised in a running desktop build and falls
    back to `window.open`, so the copy says the page is hosted by FBM rather
    than that it opens outside Blackout. The button is hidden where
    `getExternalPurchasePolicy()` blocks purchase links (iOS outside the US).
-   **What changes where**: renewal and cancellation happen on FBM. Blackout
    learns of them through FBM's existing webhooks (§3 below), so the screen
    can lag behind the FBM page. Comped and gifted access is local to Blackout
    and does not appear on FBM.

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
| `FBM_MANAGE_SESSION_ENABLED`                                                             | server switch for `POST /v1/subscriptions/manage-session`; unset/off answers 503 (fail-closed)                          |
| `CORS_ALLOWED_ORIGINS`                                                                   | also the allowlist for a manage-session `returnUrl` origin (only origin + `/` is forwarded; `*` forwards none)          |
| `VITE_FBM_MANAGE_ORIGINS` (client, build time)                                           | origins the client will open a manage link on; default `https://api.freeblackmarket.com`                                |
| `BLACKOUT_ACCOUNT_SUBSCRIPTIONS` (client)                                                | overrides the `accountSubscriptions` flag (default off) for Settings -> Subscriptions; beta unlock-all wins             |
| removed                                                                                  | `STRIPE_*` (secret/public keys, price ids, checkout URLs, webhook secret, portal URL) and `LAGO_*` — nothing reads them |

## Non-goals / declared decisions

-   **Channel points are NON-MONETARY** (operator decision, W1b): per-channel
    engagement state like XP — creator-minted, earned in-channel, spent on
    redemptions, never purchasable and never convertible to CCR/USD or any
    FBM rail. Verified properties: mint only via self-channel grant, spend
    only via redeem, zero cents/CCR edges in the schema. Any future
    purchasable points product would be a NEW FBM-listed product, not a
    conversion of this ledger.
-   No Blackout-hosted billing portal and no card-on-file UI here. Creator
    subscriptions keep their local cancel route; renewal and cancellation of
    FBM-billed subscriptions happen on FBM's own hosted manage page, which
    Blackout only links to through a short-lived manage session (above). It
    is never framed.
