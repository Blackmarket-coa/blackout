# Monetization Go-Live Runbook

This runbook flips the Blackout monetization surface from "built but dark" to
live: a discoverable marketplace of individual items and package subscriptions,
with real payments and real entitlement gating.

The architecture is already merged. Everything below is **configuration** plus a
one-time catalog seed — no further code changes are required to go live. The
system ships in a **config switch, default-unlocked** posture: while beta-unlock
is on, the full catalog is visible but every premium feature resolves as owned,
so nothing is charged. Going live is a deliberate flip.

Spans two repos: **`blackout`** (client + API) and **`free-black-market` / FBM**
(commerce backend: catalog, subscriptions, entitlements, Stripe rails).

## How it fits together

-   FBM holds the priced catalog (`creator_listing` rows) and emits purchase /
    subscription events to Blackout.
-   Each listing carries `feature_keys` — the `features.*` entitlements it grants.
    One key (or none) for an individual item; the whole tier bundle for a
    `subscription_tier` listing.
-   Blackout reads the catalog via `GET /v1/marketplace/listings` (FBM provider),
    and on purchase the granted entitlement carries `featureKeys`, which the client
    unions into `grantedFeatureKeysAtom` to unlock gated features and Town Square
    premium widgets.
-   Until a real entitlement is held, gating falls back to beta-unlock.

## Step 1 — FBM: enable the integration and seed the catalog

In FBM `backend` env (see `backend/.env.template`):

```
FBM_BLACKOUT_INTEGRATION=1
BLACKOUT_CLIENT_ID=...            # OAuth client for the Blackout bridge
BLACKOUT_CLIENT_SECRET=...
BLACKOUT_API_BASE=https://api.theblackout.app
FREEBLACKMARKET_WEBHOOK_SECRET=... # HMAC secret shared with Blackout
FREEBLACKMARKET_API_KEY=...        # bearer key Blackout uses to read the catalog
```

Run the migration (adds `creator_listing.feature_keys`) and seed the first-party
catalog (idempotent, upserts by seller+slug):

```
pnpm medusa db:migrate
pnpm medusa exec ./src/scripts/seed-blackout-catalog.ts
```

The seed publishes the candidate items (privacy tools, cosmetics, templates,
AI persona, automation) and the three package subscriptions (**Signal**,
**Coalition**, **Sovereign**), each with `feature_keys` and, for tiers, a
`metadata.tier`.

## Step 2 — Blackout API: point at the real FBM provider

In `packages/api` env (see `packages/api/.env.example`):

```
FREEBLACKMARKET_ENABLED=true
FREEBLACKMARKET_API_KEY=...        # same key issued by FBM above
FREEBLACKMARKET_WEBHOOK_SECRET=... # same shared secret
FREEBLACKMARKET_BASE_URL=https://api.freeblackmarket.com
```

> Production boot **fails** if `FREEBLACKMARKET_ENABLED` is on without both
> secrets (`assertFreeblackmarketSecretsForProduction`), and if any placeholder
> marketplace (Blamazon / MayhemMarketplaze / AntinAmazon) is enabled. Do **not**
> set `FREEBLACKMARKET_STUB=1` in production — that serves demo data.

## Step 3 — Stripe: real checkout

Set the secret key and a Stripe Price id per plan; then subscription checkout
creates a real hosted Checkout Session instead of the mock URL. Without
`STRIPE_SECRET_KEY` the deterministic mock is used (dev/test).

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_CANOPY_SPROUT_MONTHLY=price_...
STRIPE_PRICE_CANOPY_SPROUT_ANNUAL=price_...
STRIPE_PRICE_CANOPY_PRO_MONTHLY=price_...
STRIPE_PRICE_CANOPY_PRO_ANNUAL=price_...
STRIPE_CHECKOUT_SUCCESS_URL=https://app.theblackout.app/billing/success
STRIPE_CHECKOUT_CANCEL_URL=https://app.theblackout.app/billing/cancel
```

Checkout passes `client_reference_id` (the Blackout user id), not a fabricated
customer id, so Stripe collects the real customer. The Billing Portal stays on
the mock path until the `checkout.session.completed` webhook syncs a real
`cus_…` onto the subscription record — wire that sync before advertising the
portal. Stripe webhook signatures are already verified
(`billingWebhookSignature.ts`).

## Step 4 — Reveal the marketplace surface

Client flag (env key `BLACKOUT_MONETIZATION_MARKETPLACE`, exposed to the client
build):

```
BLACKOUT_MONETIZATION_MARKETPLACE=true
```

Beta-unlock forces this on anyway, so this step matters only once beta-unlock is
turned off.

## Step 5 — Flip to real gating (charge for real)

While beta-unlock is on, premium is free and buy CTAs read "Included in your
access." To start charging, turn it off (both keys, client + node contexts):

```
VITE_BLACKOUT_BETA_UNLOCK_ALL=false
BLACKOUT_BETA_UNLOCK_ALL=false
```

Now entitlements resolve from real purchases/subscriptions: a paid tier grants
its `features.*` bundle, gated features and Town Square premium widgets light up,
and unlocked items show a purchase CTA.

## Verify end-to-end

1. `GET /v1/marketplace/listings` returns the seeded FBM rows, each with
   `featureKeys`.
2. Buy an individual item → webhook grants a `NormalizedEntitlement` carrying its
   `featureKeys`; the client shows it owned.
3. Subscribe to a tier → the entitlement carries the tier bundle; the client
   unions it into `grantedFeatureKeysAtom`; the matching Town Square premium
   widget becomes addable (no paywall).
4. With beta-unlock ON vs OFF the catalog **structure** is identical — only the
   CTA copy differs. (Regression covered by the beta-parity expectation.)
5. Refund → the entitlement is revoked and the unlock disappears on next boot.
