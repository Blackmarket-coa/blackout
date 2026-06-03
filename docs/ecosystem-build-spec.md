# Ecosystem Build Spec — Reconciliation & Direction of Record

> **Status:** Active direction of record for the Blackout↔FBM ecosystem build, focused on **Phase 1/2** and
> proving one growth loop: **Creator → Coalition → Producer → Sale → Reward**.
>
> **Relationship to `docs/AGGRESSIVE_OPERATIONS_GUIDE.md`:** This document is an **override** for
> product/feature prioritization. The operations guide's two-layer architecture (FBM = cooperative economic
> substrate; Blackout = communication/governance/spatial interface) and its **entitlements-service contract**
> as the substrate↔interface boundary are **retained** as the integration contract. What this document changes
> is the *sequencing of user-facing features*: the seven killer systems below are the Phase 1/2 spine, and the
> **Digital Marketplace is front-loaded** (treated as a first-class Phase-1 revenue stream) rather than deferred
> to the operations guide's "infrastructure" milestone. Where the two conflict on feature priority, this
> document wins; where they touch architecture (identity, ledger, entitlements, two-repo split), the operations
> guide wins.

## Why this exists

The ecosystem vision had been described as a large multi-platform build. In practice almost all of Phase 1 is
**already scaffolded** in the Blackout repo, and the commerce substrate already exists (largely in the separate
`Blackmarket-coa/free-black-market` repo, surfaced in Blackout through provider integrations). The risk is
**building parallel/duplicate systems** instead of reusing what's here. So Phase 1 is mostly **reorganization
and wiring**, not feature invention. This document is the section-6 "AI repo audit" the spec asked for: it maps
each killer system to existing code and the minimal path to the loop.

## Scope boundary (important)

- **This repo (`Blackmarket-coa/blackout`)** is the only repo in scope for changes made under this spec's
  sessions. Anything **FBM-side is documented, not built here** — FBM is a separate repo.
- The integration seam is the **entitlements service contract** and the **FBM event bus** (see operations guide
  §2.5). Blackout consumes FBM truth; FBM owns ledger/orders/payouts/settlement.

---

## The seven killer systems → existing code → action

| System | Already in Blackout | Action |
|---|---|---|
| **Bounty Board** | *none* — only `packages/api/src/services/growth.ts` (referrals/ambassador) and `services/taskStore.ts` + `@blackout/core` `CoalitionTask` | **Build new** (done: first slice — see below). FBM producer/vendor bounties join later via a provider source. |
| **Creator Rewards** | `features/creators/`, `features/streaming/`; `services/creatorFees.ts`, `creatorListings.ts`, `creatorSubscriptions.ts`; `channelPoints.ts`, `growth.ts`; FBM `creator-program`/`creator-rewards`/`creator-attribution` | **Reuse + wire.** Bounty rewards now record into the growth ledger on completion and surface in a Creator Hub earnings panel (see "Fifth slice"). FBM-metric dashboard still to wire via entitlements. |
| **Producer-Creator Matching** | `growth.ts` (referral/ambassador graph), creator services, marketplace providers | **Built** — applications inside the bounty system (apply → accept → claim/decline), a homepage detail panel for poster/applicant flows, and `recommendBounties` auto-matching in Creator Hub. See "Second"/"Third slice" below. Richer match signals next. |
| **Coalition Storefronts** | `features/coalition/`, `routes/coalition.ts`, `packages/core/src/coalition`, marketplace providers | **Reuse.** Gap = display-only FBM product embeds (product + checkout stay in FBM; Coalition only displays/contextualizes). |
| **Digital Marketplace** | `features/marketplace/` + `features/monetization/`, signed-plugin protocol (`packages/plugins-sdk`, `packages/blackout-protocol/src/plugins`), `services/marketplaceEntitlements.ts` | **Reuse — front-loaded** per this override. Near-100%-retained digital goods (themes/plugins/templates/courses) as bounty rewards + revenue. |
| **Opportunity Engine** | *none* in Blackout (price/demand data is FBM-side) | **Defer / embed.** Phase 2/3: embed FBM opportunity cards into the home feed; price tracker / opportunity score / production calculator are FBM work. |
| **Launch Center** | *none* (it's a composition of Bounty + Coalition + Creator + Product) | **Defer to Phase 2.** Document as an orchestration over the above; "Launch a Product" fans out to a product draft (FBM) + a creator bounty (Blackout) + coalition promotion. |

---

## Shared data models — what exists vs. new

Checked against `packages/core/src/*` and `packages/api/src/db/types.ts`:

- **User / roles** — *exists.* `UserRecord` (`packages/api/src/db/types.ts`), reputation tiers
  (`member|vendor|coordinator|arbiter`), Matrix-native roles (`co.bmc.roles`), burner identities. Roles are
  **modes**, not separate accounts — already the model. Unified MXID identity is the operations-guide contract.
- **Producer / Creator** — *partial.* Creator surfaces exist (`features/creators`, creator services). A
  first-class **Producer profile** (business name, capabilities, external stores, coalitions, creator partners)
  is largely FBM-side; Blackout shows a read view.
- **Coalition** — *exists.* `packages/core/src/coalition`, `features/coalition`, `routes/coalition.ts`.
- **Product** — *exists* via marketplace providers + `packages/core/src/marketplace`.
- **Bounty** — **new.** Added in this slice: `packages/core/src/bounty/bounty.ts`.
- **Opportunity / Product Token / Referral Tree** — Opportunity & Tokens are later phases; Referral graph
  exists in `growth.ts` (monetary-payout trees are a Phase-2 extension).

---

## Phase 1 / Phase 2 as reuse-and-wire

**Phase 1 (foundation + acquisition):** shared identity link (operations-guide MXID contract), product embeds
(reuse marketplace providers), external store links, producer/creator profiles (reuse profile infra), **basic
Bounty Board** (new — first slice landed), basic referral tracking (`growth.ts`), digital marketplace (reuse
monetization), marketplace cleanup.

**Phase 2 (growth engine):** producer-creator bounties + matching, Creator Hub campaign panel, FBM vendor
growth panel, **Blackout homepage bounty feed** (this slice is the seed), FBM opportunity feed, referral-tree
payouts, creator rewards dashboard, Black-Market product rewards.

**Loop (end state of Phase 2):** rising prices → FBM opportunity → "Launch a Product" → product draft + creator
bounty (visible on Blackout home Bounty Board) → creator makes content (Coliseum/Coalition/Dens) → coalition
demand → producer sells via FBM → product tokens represent credits → referral tree pays the creator/ambassador.

**Phase-1 success metrics (from spec):** 100 creators, 50 vendors, 10 active coalitions, 500 users, 50 bounties,
first digital-product sales, first creator-generated sales.

---

## First slice landed: Bounty Board on the home feed

The single genuine gap behind the loop's "most important feature" was that **no bounty system existed in code**.
A thin, dark-by-default vertical slice now adds one (Blackout-side only):

- **Model** — `packages/core/src/bounty/bounty.ts` (`Bounty`, `BOUNTY_CATEGORIES`/`_REWARD_TYPES`/`_STATUSES`),
  mirroring the `CoalitionTask` convention.
- **Backend** — `packages/api/src/services/bountyStore.ts` + `routes/bounties.ts` (`GET /v1/bounties`,
  `POST /v1/bounties`, `POST /v1/bounties/:id/claim`, `PATCH /v1/bounties/:id`), in-memory store on
  `packages/api/src/db/store.ts`.
- **Client** — `features/bounty/bountyClient.ts`, `features/home/hooks/useBountyBoard.ts` (isolated fetch,
  graceful degradation), `features/home/BountyBoard.tsx` rail rendered in `HomeFeed.tsx` above Live-now.
- **Flag** — `homeBountyBoard` (default off; `BLACKOUT_HOME_BOUNTY_BOARD=true` to enable).
- **Categories shown on Blackout home:** creator / coalition / developer / tester / content. FBM-home will show
  producer / vendor / product / sponsorship from the **same engine** — different presentation, one model.

**Deliberately not in this slice:** FBM bounty source, reward settlement/payout, edit/delete, DB persistence
(in-memory like coalition tasks), producer/vendor presentation. Those are the next increments toward the loop.

## Second slice landed: Producer-Creator matching (applications)

Matching lives inside the bounty system, as the spec specifies. A creator **applies** to an open bounty; the
poster **accepts** one applicant, which claims the bounty for them and auto-declines the rest.

- **Model** — `BountyApplication` (`pending|accepted|declined|withdrawn`) in `packages/core/src/bounty/bounty.ts`.
- **Backend** — store methods (`createBountyApplication` with open-only + duplicate guards,
  `acceptBountyApplication` = accept-one + decline-others + claim-bounty) on `db/store.ts`; service helpers in
  `services/bountyStore.ts`; routes `POST /v1/bounties/:id/applications` (apply),
  `GET /v1/bounties/:id/applications` (poster-only), `POST /v1/bounties/:id/applications/:applicantId/accept`
  (poster-only). Writes are auth-gated; list/accept are restricted to the poster (403 otherwise).
- **Client** — `applyToBounty` / `fetchBountyApplications` / `acceptBountyApplication` in `bountyClient.ts`; an
  **Apply** action on each `BountyBoard` card (idle → applying → applied), behind the same `homeBountyBoard` flag.

**Deliberately not in this slice:** auto-matching/recommendation, a producer-side applicant-review UI (backend
+ client exist; surface is next), application withdrawal UI, and persistence — all next increments.

## Third slice landed: bounty detail panel (homepage) + auto-matching (Creator Hub)

Surfaces the matching backend on both sides of the loop:

- **Homepage bounty detail panel** — clicking **Details** on a `BountyBoard` card opens an overlay
  (`features/home/BountyDetailPanel.tsx`). It needs no client-side identity plumbing: it tries the poster-only
  applicants fetch — success → **poster view** (applicant list with Accept; accepting claims the bounty and
  declines the rest, reflected locally), 401/403 → **applicant view** (Apply). Cards keep their quick Apply.
- **Auto-matching in Creator Hub** — a new `recommendBounties` engine in `@blackout/core` (pure/deterministic:
  excludes the viewer's own posts and already-applied bounties, ranks creator-relevant categories first, ties by
  recency) behind `GET /v1/bounties/recommended` (auth). A `CreatorHubBounties` growth panel
  (`features/streaming/sections/`) renders the matches with Apply, mounted in the Creator Hub **overview** tab
  behind the `homeBountyBoard` flag.

**Deliberately not in this slice:** richer match signals (niches/audience/past campaigns — the contract already
accommodates them), application withdrawal, FBM bounty source, and persistence.

## Fourth slice landed: post-a-bounty composer (Creator Hub)

Closes the supply side so the whole loop is UI-driven (post → home board → apply/auto-match → accept → claim).

- **Composer** — `features/streaming/sections/CreatorHubPostBounty.tsx`: category + reward-type selects, title,
  reward summary, description, and optional requirements/deliverables (one per line), submitting via the existing
  `createBounty` client. Mounted in the Creator Hub **overview** tab above the matched-bounties panel, behind the
  `homeBountyBoard` flag.
- A posted bounty then appears on the home `BountyBoard` and in other creators' `recommendBounties` matches —
  no API calls needed to seed the loop.

**Deliberately not in this slice:** a home-feed post entry point (the board stays hide-when-empty; posting lives
in Creator Hub for now), edit/delete, FBM source, and persistence.

## Fifth slice landed: bounty rewards → growth ledger + earnings panel

Wires the "Reward" edge of the loop into the existing growth-engine ledger, recording economic truth.

- **Ledger** — `bountyRewardService` in `packages/api/src/services/growth.ts` (same in-memory, append-only
  pattern as referrals/quests): a `BountyRewardRecord` keyed by bounty id (idempotent — completing twice never
  double-credits), with `record` / `listForBeneficiary` / `summaryForBeneficiary` and a deferred `settle` hook
  mirroring `referralService.settle`.
- **Completion wiring** — `PATCH /v1/bounties/:id` is now **poster-only** (403 otherwise); transitioning a
  claimed bounty to `completed` records the reward for `claimedBy` (rewardType/summary/cents from the bounty).
  The poster triggers this from the home detail panel's **Mark completed** action.
- **Earnings surface** — `GET /v1/bounties/rewards/me` (auth) returns the creator's reward records + a summary
  (count / earned / settled cents). A `CreatorHubBountyRewards` panel renders it in the Creator Hub **rewards**
  tab (behind `homeBountyBoard`).

**Deliberately not in this slice:** actual payout settlement (the `settle` hook is the integration seam for an
FBM tip / Coalition-credit transfer — deferred exactly like the referral/quest settlement), and persistence.
