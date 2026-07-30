# Blackout Marketplace — Full Workflow Audit

_Cross-repo audit of every marketplace offering and its end-to-end workflow,
spanning `blackout` (client + API) and `free-black-market` / FBM (commerce
backend). Produced during the `claude/blackout-marketplace-audit-y51303` work._

## 1. Executive summary

The Blackout marketplace is a **cross-repo** system. FBM holds the priced catalog
(`creator_listing` rows) and serves a "§5 commerce" API; the Blackout app surfaces
it through a provider abstraction and grants `features.*` entitlements on purchase.
The whole surface is **"built but dark"** — merged, config-gated, default-unlock
beta (`docs/operations/MONETIZATION_GO_LIVE.md`).

**Headline finding (fixed here):** the go-live runbook claims "no further code
changes are required to go live," but the real FBM provider called the wrong API
paths, so the entire real-money path was broken against a live FBM backend while
the in-memory stub kept local/CI green. See §3.

Most _other_ open items fall into three buckets: **already-fixed money bugs**
(need verification, not rebuild), **deferred roadmap** (Featured Placement,
Commerce Hub), and **legal/compliance** (ToS/Privacy/KYC/1099/money-transmitter)
— the last of which is the dominant _launch_ blocker on both sides but is not code.

Status legend: **✅ fixed here** · **🔧 fix designed (reuse target named)** ·
**📋 documented / intentional** · **⚖️ out of code scope (legal/roadmap)**.

## 2. Architecture & the "offerings"

-   **Blackout monetization catalog** (the offerings "for Blackout"): individual
    items (privacy tools, cosmetics, sticker packs, stream overlays, community
    templates, AI personas, automations) + three subscription tiers
    (**Signal / Coalition / Sovereign**). Defined by
    `free-black-market/backend/src/scripts/seed-blackout-catalog.ts`; each row
    carries `feature_keys` bridging to Blackout's `features.*` entitlements.
-   **Contract:** `free-black-market/docs/contracts/blackout-integration.md`
    (§5 commerce, §4 entitlements, §1–§3 webhooks). Commerce is served under
    `/v1/integrations/blackout/commerce/**`; Blackout reads it via the
    `freeblackmarket` provider and mounts marketplace routes at `/v1/marketplace`.
-   **FBM general listing-types** (the broader cooperative marketplace): 9 catalog
    types — `physical_product`, `event`, `digital`, `recurring`, `wholesale`,
    `consignment`, `unique_inventory`, `bookable`, `campaign`
    (`backend/src/modules/listing-type/catalog/index.ts`).

## 3. The cross-repo commerce integration (§5) — FIXED

**Defect:** `blackout/packages/api/src/integrations/marketplace/freeblackmarket.ts`
targeted the bare work-order paths instead of FBM's integration surface:

| Provider call (was)              | Real FBM route                     | Failure against real FBM               |
| -------------------------------- | ---------------------------------- | -------------------------------------- |
| `GET /v1/catalog/listings`       | `…/commerce/catalog/listings`      | 404 → empty catalog                    |
| `GET /v1/catalog/listings/{id}`  | `…/commerce/catalog/listings/{id}` | 404                                    |
| `POST /v1/checkout/sessions`     | `…/commerce/checkout/sessions`     | hit the **public** storefront checkout |
| `POST /v1/seller/listings`       | `…/commerce/seller/listings`       | hit the **seller-JWT** route → 401     |
| `…/seller/listings/{id}/publish` | `…/commerce/…/publish`             | 401                                    |
| `DELETE …/seller/listings/{id}`  | `…/commerce/…`                     | 401                                    |
| `POST /v1/seller/onboarding`     | `…/commerce/seller/onboarding`     | 404                                    |

-   **✅ A1** — all seven endpoints now route through a `/v1/integrations/blackout/commerce`
    base. The seller-write body is also reconciled to FBM's strict schema (derive
    the required `slug`; drop the artifact-only fields the route rejects — artifact
    bytes ship via the signed-bundle publish path, not this metadata call). The
    category enum matches across repos (verified), so no enum drift.
-   **✅ A2** — new `test/freeblackmarket-provider-paths.test.ts` pins every request
    to the §5 contract so this can't silently drift again; two existing tests that
    asserted the _old_ buggy paths were corrected.

_Verification:_ `pnpm --filter @blackout/api test` — provider-paths (8),
marketplace-routes, creator-routes all green. The end-to-end fix restores the
runbook's first "verify" step (`GET /v1/marketplace/listings` returns seeded FBM
rows), which returned empty before.

## 4. Billing / subscriptions (Blackout) — FIXED + notes

-   **✅ A3 — Billing Portal `cus_…` sync.** Checkout passes `client_reference_id`
    (the Blackout user id), so the real Stripe `cus_…` was never captured — no
    Stripe webhook existed (only Lago). Added `POST /v1/subscriptions/webhooks/stripe`
    (signature-verified, idempotent) that syncs the real `cus_…` onto the
    subscription record on `checkout.session.completed`, letting the Billing Portal
    leave the mock path. New `test/subscriptions-stripe-webhook.integration.test.ts` (4).
-   **✅ Tier mapping (FBM).** `mapSubscriptionTier` (FBM
    `modules/marketplace-webhooks/models/blackout-events.ts`) only recognized the
    §3 wire vocabulary (`signal` / `signal_plus` / `community`), but the
    first-party catalog labels tiers with Blackout's consumer names
    (`signal` / `coalition` / `sovereign`), so Coalition and Sovereign
    subscriptions silently collapsed to Signal at the emit point. Now translates
    both vocabularies (unit-tested). Independent of the native **Canopy** platform
    subscription (`services/subscriptions.ts`, `STRIPE_PRICE_CANOPY_*`) — the two
    tier systems remain distinct by design.

## 5. Blackout buyer/seller surfaces — status

| Workflow                                             | Status              | Note                                                                                                                                                                                        |
| ---------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browse / search / listing detail                     | ✅ works            | provider + 60s cache; **fixed** for real FBM in §3                                                                                                                                          |
| Checkout (redirect + embedded)                       | ✅ works            | **fixed** for real FBM in §3                                                                                                                                                                |
| Webhook → entitlement grant → fulfillment            | ✅ works            | signed webhook, dead-drop delivery, license keys                                                                                                                                            |
| Library / entitlements                               | ✅ works            |                                                                                                                                                                                             |
| Producer profile, reviews, versions, message-vendor  | ✅ works            |                                                                                                                                                                                             |
| Seller create/publish/onboard                        | ✅ works (fixed)    | §3 A1                                                                                                                                                                                       |
| In-app artifact upload                               | 📋 known limitation | composer posts metadata only; artifact bytes are FBM-side (signed-bundle). The create contract is metadata-only by design, so this is consistent, not a broken call.                        |
| `marketTab` vs `monetizationMarketplace` flags       | 📋 intentional      | `MarketShell.tsx:53` documents the empty-state; beta-unlock forces it on. Optional follow-up (already noted in-code): gate the bottom-tab to hide the empty entry when commerce is unwired. |
| Placeholder providers (blamazon/mayhem/antin-amazon) | 📋 fail-closed      | empty catalog, throw on checkout, reject webhooks; hard-fail if enabled in prod                                                                                                             |
| E2E buyer-journey (browse→checkout→entitlement)      | 🔧 gap              | no Playwright spec in `blackout/playwright/e2e/`; the FBM stub already supports the full local flow. Add a spec against `FREEBLACKMARKET_STUB=1`.                                           |

## 6. FBM → Blackout settlement emitters (§1–§3) — designed

`free-black-market/backend/src/lib/blackout-stub-emitters.ts`. Wired today:
order-placed / refund-cancel / updated subscribers. Split the stubs:

-   **🔧 Wire (a real trigger exists):** `referral.attributed`,
    `ambassador.commission_paid`, `quest.reward_settled` — the attribution/settlement
    events that close Blackout's creator-driven-sales KPI. Hook the existing
    attribution + hawala settlement points to `MarketplaceWebhooksService.emitBlackout`
    (reuse the signed-webhook delivery path + `drain-webhook-deliveries` job — no new rail).
-   **📋 Document (no underlying flow):** `purchase.failed`, `purchase.chargebacked`
    (no payment-failed/chargeback ingestion), `ledger.usdc_converted` (no USDC
    conversion). Leave stubbed with an honest note.

## 7. FBM general listing-type offerings — status & fix designs

Reuse targets are named so each fix mirrors an existing, proven pattern.

| Offering                 | Backend    | Buyer path        | Status & fix (reuse target)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ---------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| physical_product         | ✅         | ✅                | works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| digital                  | ✅         | 📋 marketing/mock | backend complete; add storefront path (mirror `/store/carts/[id]/complete-digital`)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| subscription (recurring) | ✅         | 🔧                | renewal→order→payment→entitlements built but dark behind `FBM_SUBSCRIPTION_RENEWAL_LIVE`; safe to flip (dark-by-default, compensations + dunning). Verify saved `payment_method_id`/template cart, then enable.                                                                                                                                                                                                                                                                                                |
| rental                   | ✅         | 📋                | backend complete; storefront path missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| bookable (booking)       | ✅         | 📋                | backend complete; storefront path missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| order-cycle (CSA)        | ✅         | 📋                | backend complete; storefront path missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| event / ticket           | ✅         | 🔧 **none**       | backend complete, **zero** buyer path. Add browse (`/store/vendors/:handle?include=events`) → availability/seats routes → add-to-cart **with seat metadata** (extend `cart.ts:addToCart`) → `POST /store/carts/:id/complete-tickets`.                                                                                                                                                                                                                                                                          |
| campaign (crowdfund)     | 🔧 partial | none              | **Real defect:** `collective-campaign/service.ts:341` `markCampaignFailed` flips backing status with **no money movement**, and `addBacking` never escrows funds. Implement escrow-in on backing + all-or-nothing release/refund, mirroring `hawala-ledger` `openSubcontractEscrow`/`releaseSubcontractEscrow`/`refundSubcontractEscrow` and the `subcontracts/[id]/resolve` route. Every leg via `createTransfer` with deterministic idempotency keys. **Compliance-sensitive** — mirror existing rails only. |
| wholesale                | 🔧 partial | app-only          | tier `discount_percent` stored but **never applied at pricing** (`vendor-rules/service.ts`). Add MOQ + tiered brackets by cloning the sliding-scale repricing route `carts/[id]/tier/route.ts` (`updateLineItems({is_custom_price:true})` + base-price metadata stash), sourced from `getCustomerTier`.                                                                                                                                                                                                        |
| consignment              | 🔧 stub    | 1 marketing ref   | catalog label only; no `consignor`/`represented_party` anywhere. Implement the atomic multi-party split at order-complete, mirroring `hawala-ledger` `processOrderPayment`'s multi-leg fan-out (each party's `SELLER_EARNINGS` + `PLATFORM_FEE`, distinct `${orderId}-<party>` keys).                                                                                                                                                                                                                          |
| unique_inventory         | ✅ partial | —                 | **Create-time guard done:** `assertUniqueInventoryConstraints` rejects >1 stock for a one-of-a-kind type, wired into `enforceListingTypeAllowed`, unit-tested. Remaining: decrement-to-zero + no-relist status flip on `order.placed` (pattern: `sync-lot-inventory.ts:109`).                                                                                                                                                                                                                                  |
| restaurant               | 🔧 partial | food-\*           | CRUD shell; ordering split across `food-distribution` + a separate `restaurant-marketplace/` sub-app — consolidate/clarify.                                                                                                                                                                                                                                                                                                                                                                                    |
| POS                      | 🔧 partial | vendor-panel      | `workflows/pos/create-pos-order.ts` creates orders directly and **does not reserve/decrement inventory**. Add a decrement step (resolve variant→inventory-item, `updateInventoryLevels`) mirroring `sync-lot-inventory.ts:87-116`, with a re-increment compensation.                                                                                                                                                                                                                                           |
| supplier-forwarding      | ✅         | n/a               | complete-ish; no tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Storefront per-listing-type rendering (🔧):** `storefront/src/lib/listing/presentation.ts`
`selectPresentation()` only picks retail-vs-marketplace chrome; it does **not**
branch on `listing_type`. Plumb `product.listing_type.catalog_id` into the
`products.ts` fetch (precedent: `vendors/[handle]/route.ts:227`) and branch in
`ProductDetailsPage.tsx` / `ProductDetails.tsx`.

**Test gaps (🔧):** no unit tests for `digital`, `ticket`, `booking`, `restaurant`,
`wholesale`, `supplier-forwarding`; no integration/e2e for any offering checkout.

## 8. Already-fixed money bugs (verify, don't rebuild)

Per FBM `PRE_LAUNCH_AUDIT.md` / `ECONOMIC_REVIEW.md` / `AUDIT_DEBT.md` and Blackout
`docs/audits/pre-launch-readiness-audit-2026-07.md`: atomic-CAS silently disabled
(`container_` vs `__container__`), negative-payout drain, bounty idempotency
(`Date.now()`), escrow-never-refunded, write-behind durability, leader election
for outbound webhooks. All marked fixed; the residual is **verify under real
concurrency / after flag flips**, via the CI money-path soak.

## 9. Out of code scope (⚖️) — the real launch blockers

-   **Legal/compliance:** ToS / Privacy / Refund pages (none linked at
    registration/checkout), seller KYC / W-9 / 1099, prohibited-items policy +
    DMCA/abuse intake (currently `logger.info` dead-ends), money-transmitter /
    securities posture (ACH withdraw gated off by `ACH_PAYOUTS_ENABLED=false`).
-   **Deferred roadmap:** Featured Placement (no code), multi-seller profiles,
    Commerce Hub / Launch Center / Opportunity Engine, plant-network grower-node
    payout attribution.

## 10. Recommended sequence

1. ✅ §5 provider contract fix (done) — unblocks the entire real-money path.
2. ✅ Billing Portal `cus_…` sync (done).
3. Add the E2E buyer-journey spec against the stub (cheap, high signal).
4. FBM emitters: wire the attribution/settlement three; document the other three.
5. FBM offerings by risk: POS inventory + unique_inventory (contained) →
   per-listing-type rendering + ticket storefront (buyer surfaces) → campaign
   escrow + wholesale pricing + consignment split (money-movement,
   compliance-sensitive, need money-path soak).
6. Backfill offering tests alongside each fix.
7. Legal/compliance track (non-code) — the actual GA gate.

_All code changes in this session are committed on
`claude/blackout-marketplace-audit-y51303` in both repos; each fix ships with
tests. This document is the standing map for the remaining 🔧 items._

## 11. Follow-ups landed (2026-07-30 addendum)

Six of the §5–§7 🔧 items above have since landed on the same branch (each with
its own commit + unit tests; 268 targeted backend tests green, backend
`tsc --noEmit` clean):

-   **✅ POS inventory** — POS orders now decrement stock via a compensated
    workflow step (`workflows/pos/adjust-pos-inventory.ts`); unmanaged/missing
    inventory is skipped, never failing the counter sale.
-   **✅ `unique_inventory` complete** — beyond the create-time guard, a new
    `order.placed` subscriber retires a sold one-of-a-kind listing (stock zeroed,
    product → draft, `metadata.unique_inventory_sold`), idempotent on duplicate
    events.
-   **✅ Settlement emitters** — `quest.reward_settled` wired at the demand-bounty
    milestone payout (fire-and-forget, PII-safe via `blackout-identity`);
    `referral.attributed` + `ledger.usdc_converted` verified already wired.
    `purchase.failed` / `purchase.chargebacked` / `ambassador.commission_paid`
    remain documented blockers — FBM has no payment-failed, chargeback, or
    ambassador flow to hook.
-   **✅ Campaign escrow (dark)** — all-or-nothing settlement behind
    `FBM_CAMPAIGN_ESCROW_LIVE`: backings escrow backer-wallet funds before the
    row persists (402 + no row on ledger failure), `mark-failed` refunds every
    escrowed backing idempotently, and a new admin `resolve-escrow` route
    releases seller + optional platform-fee legs that sum exactly. Flag off =
    byte-identical behavior.
-   **✅ Wholesale v1** — `POST /store/carts/:id/wholesale` applies the buyer's
    tier `discount_percent` with the shared base-price stash (no compounding)
    and enforces MOQ before any write; quantity brackets can layer later.
-   **✅ Per-listing-type rendering** — detail pages fetch `catalog_id` via a new
    `GET /store/products/:id/listing-type` and render type-appropriate chrome,
    with an extension slot reserved for the event/ticket panel.
-   **✅ E2E buyer-journey spec** — `playwright/e2e/marketplace-buyer-journey.spec.ts`
    (blackout), live-stack-gated like launch-smoke, covering browse → stub
    checkout → entitlement → Library.

**Still open:** consignment split (dark-flagged primitive), the ticket/event
buyer path (per-listing-type event slot is ready for it), and the ticket-step
unit-test backfill.
