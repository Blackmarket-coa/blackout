# Launch Readiness & Financial Assessment

> **Date:** 2026-06-03 · **Branch of record:** `claude/launch-readiness-financial-ofb2f`
> **Question answered:** *"The repo is structured through Phase 2 — are we ready to launch, how do we get
> users, and what does success look like financially?"*

This document is the decision-grade answer. It maps the Must-Work launch checklist to the **actual code state**,
grades the five revenue streams, defines the single KPI, and lists the sequenced punch-list. It complements — and
does not duplicate — the operational readiness record in
[`rollout-readiness-status.md`](../rollout-readiness-status.md), the launch-gap register in
[`audits/production_readiness_2026_05.md`](../audits/production_readiness_2026_05.md), and the product
direction-of-record in [`ecosystem-build-spec.md`](../ecosystem-build-spec.md).

---

## 1. Verdict

| Question | Answer |
|---|---|
| **Can we launch the platform?** | **Yes.** Communication / community / governance / streaming is production-grade. All 12 launch-blocking gaps (`BL-PR-01..12`) are Closed; CI is strong (33 workflows); rollout status is **Go** (2026-06-02). The one operational to-do is **cutting the first `v*` release image** (`release.yml`/`docker.yml` have 0 runs) and confirming prod secrets. |
| **Can we run the economic loop end-to-end?** | **Demo yes, durably no.** The Creator → Coalition → Producer → Sale → Reward loop works in a single process, but the **growth ledger is in-memory and lost on restart** and reward **settlement is a deferred stub**. |
| **Can we measure the one KPI — creator-driven sales?** | **Now yes (Blackout-side).** The §7 gap-close shipped on this branch: the growth ledger persists, reward settlement is wired, and `GET /v1/growth/creator-driven-sales` + Prometheus counters report it. The remaining dependency is FBM **emitting** the settlement events with attribution metadata. |
| **Opportunity Engine / Commerce Hub / Launch Center?** | **Correctly deferred** to Phase 2/3. Not launch blockers. |

**One sentence:** *the platform is ready to open; the financial model is not yet measurable — and making it
measurable (durable, settling, reported creator-driven-sales attribution) is the highest-leverage launch work.*

---

## 2. Why this split exists

Blackout is a hardened **Matrix/Element fork**. Two years of work made the *communication substrate*
production-grade. The *economic loop* — the thing the financial model monetises — is newer, deliberately shipped as
thin vertical slices (see `ecosystem-build-spec.md`), and its commerce truth (orders, payouts, GMV, opportunity
data) lives in the **separate `Blackmarket-coa/free-black-market` (FBM) repo**, surfaced into Blackout through
provider integrations and the entitlements-service contract. So "are we ready?" has to be answered per layer.

---

## 3. Must-Work checklist → code state

Legend: ✅ done · ◐ partial · ❌ missing/external · *(metric)* = the success metric you set.

### BLACKOUT

| Item | Status | Evidence / gap |
|---|---|---|
| **Auth** — register, login, password reset, single identity, profile | ✅ | `routes/auth.ts`, `services/auth.ts`: register/login/reset/refresh/logout/email-verify/WebAuthn/SSO + anon account-number. *(join < 2 min — credible.)* |
| **Home Feed** — coalition, creator, coliseum, bounties, FBM embeds | ✅ | `features/home/HomeFeed.tsx`, `hooks/useUnifiedFeed.ts`: unified aggregation + ranking. *(never feels empty — multi-source w/ graceful degradation.)* |
| **Coalition** — create, join, feed, needs board, storefront, members | ✅ | `features/coalition/`, `routes/coalition.ts`: + tasks/events/map/kits. *(functions without admin — yes.)* |
| **Creator Hub** — upload, campaigns, apply bounties, referrals, rewards | ✅ | `features/creators/`, `routes/creator.ts`, bounty panels in `features/streaming/sections/`. ◐ rewards ledger non-durable (§5/§7 fix). |
| **Coliseum** — short video, saves, shares, product + coalition embeds | ✅ | `features/coliseum/`, `routes/coliseum.ts`: + debates/live/topics. *(discover in < 30s — yes.)* |
| **Dens** — discussion, product + coalition discussions | ✅ | `features/forum/` (internally "forum"; product/coalition refs supported). |
| **Digital Marketplace** — plugins, themes, downloads, creator products | ✅ | `routes/marketplace.ts`, `integrations/marketplace/freeblackmarket.ts`: checkout→webhook→entitlement, 11 artifact kinds. **Gated on FBM env keys.** |
| **Bounty Board** — create, apply, complete, payout tracking | ✅ | Create/apply/complete (`routes/bounties.ts`); reward ledger now **durable + settled on tip capture** (§7, shipped). Money movement still FBM-side. |

### FREEBLACKMARKET

| Item | Status | Evidence / gap |
|---|---|---|
| **Marketplace** — listings, orders, vendor dashboard, categories, checkout | ◐ | Listings/checkout/buyer-order bridge live; **orders/GMV are FBM-side**; vendor dashboard lacks orders (§7 fix). |
| **Commerce Hub** — external store links, producer profiles, directory | ❌ | Not built. Phase 2 (producer profile is largely FBM-side). |
| **Vendor Dashboard** — products, orders, bounties, referrals, partnerships | ◐ | Products ✅; **orders + earnings now surfaced** via `GET /v1/creator/orders` (§7, shipped); creator-partnership UI still pending. |
| **Bounty integration (producer)** — creator/marketing/photography needed | ✅ | Applications + accept/claim; `recommendBounties` auto-match in `@blackout/core`. |
| **Referral System** — creator, vendor, coalition referrals; earnings | ✅ | Ledger now **durable** + **`coalition` source kind added**; earnings visible via the creator-driven-sales KPI (§7, shipped). |
| **Launch Center** — launch product / business / sponsorship | ❌ | Phase 2 orchestration over bounty+coalition+creator+product (per spec). |
| **Opportunity Engine** *(Phase 2)* — price/demand/opportunity scoring | ❌ | FBM-side; not started. You classified it Phase 2 — consistent. |

**Reading:** every BLACKOUT-side "must work" item is **functional**; the gaps are concentrated in the
**economic-loop durability** (bounty/referral/reward persistence + settlement + reporting) and in **FBM-side
surfaces** (orders, producer profiles, opportunity data) that are out of this repo's scope.

---

## 4. Production-readiness (platform layer) — Go

From `audits/production_readiness_2026_05.md` and `rollout-readiness-status.md` (2026-06-02):

- All 12 `BL-PR` gaps **Closed**: CORS allowlist, Redis-backed rate limit, full auth lifecycle, `/metrics` +
  tracing + error reporting, reversible migrations + DR restore drill, e2e + coverage gates, k6 load tests,
  Helm/canary deploy, External Secrets + JWT rotation runbook.
- Gate replay green: `pnpm lint` 19/19, `pnpm build` 16/16, `pnpm test` 20/20, `pnpm web:test` 1422 passed,
  `pnpm audit --prod` clean, `ci:parity && smoke:aligned` PASS.
- **Open operational caveat:** no production image has ever been published — `release.yml` / `docker.yml` /
  `deploy-compose-prod.yml` have **0 runs**. First launch requires cutting a `v*` tag and confirming the prod
  environment/secrets.

---

## 5. The single KPI — creator-driven sales

> *"How many sales happened because a creator, coalition, bounty, or referral generated them?"*

**Definition (made precise):** a captured marketplace sale **or** reward-bearing tip whose attribution context
resolves to a creator / coalition / bounty / referral edge. Measured as **count + GMV cents + platform-fee cents**,
grouped by attribution kind and beneficiary, over a window.

**Why it isn't measurable today:**
- ✅ *Money* persists: `tips` (with a 3% fee split via `computePlatformCommission`) and
  `marketplace_entitlements` / `marketplace_webhook_events` are durable in `db/store.ts`.
- ❌ *Attribution* does not: the referral/ambassador/quest/bounty-reward ledger lives in
  `services/growth.ts` as in-process `Map`s that **bypass `store.ts` and reset on restart**. The
  `markSettled` / `settle` hooks that would tie a captured tip to its attributing edge are **wired to nothing**
  (`"PR 5b"` deferral).

**Consequence (before this branch):** you could demo the loop, but not produce a trustworthy month-over-month
creator-driven-sales number — which is precisely the metric you said determines whether the ecosystem is working.

**Shipped on this branch:** the ledger persists → settles on tip capture → is reported by
`GET /v1/growth/creator-driven-sales` (count + GMV + fee + net, by attribution kind) plus the
`creator_driven_sales_total` / `creator_driven_gmv_cents_total` Prometheus counters (see §7). The number is now
durable and queryable; what remains is FBM emitting the settlement events.

---

## 6. Revenue-stream readiness

| Stream | Can it transact at launch? | Notes |
|---|---|---|
| **1 — Black-Market digital products** (highest margin) | ✅ once FBM keys set | `marketplace` checkout→webhook→entitlement is real + tested. |
| **2 — Marketplace 3% fee** | ✅ | `computePlatformCommission` + `tips.ts` already split 3%. **GMV reporting is FBM-side.** |
| **3 — Creator marketplace 3%** | ✅ | Same rails (creator listings + entitlements). |
| **4 — Sponsorship marketplace (bounties)** | ◐ | Matching works; **payout settlement deferred** (§7). |
| **5 — Featured placement** | ❌ | Not built. Low priority per plan — fine to defer. |

The first three (your highest-margin and most-scalable streams) are launch-capable today, contingent only on FBM
credentials. Stream 4 needs the settlement work below to actually pay out and report.

---

## 7. The gap-close (shipped on this branch)

Four sequenced, independently-shippable changes turned "demo loop" into "measurable loop." All landed with tests
and a green API integration suite (1099/1099):

1. **Persist the growth ledger** *(done)* — referrals/ambassadors/quests/completions/migration-credits/
   bounty-rewards moved from in-memory `Map`s into `db/store.ts` (mirroring `services/tips.ts`), durable in both
   file and Postgres mode, with migrations `049–053`. Public service API unchanged. A PGlite restart test proves
   hydration. *Closes the "lost on restart" defect.*
2. **Wire settlement** *(done)* — `marketplaceWebhook.ts` now settles the bounty-reward ledger on tip capture
   (alongside the already-wired referral/ambassador/quest paths) via a new `bounty.reward_settled` event; added
   the missing **`coalition`** referral source kind. *Closes the deferred `"PR 5b"` stub for bounties.*
3. **Creator-Driven-Sales KPI surface** *(done)* — `services/creatorDrivenSales.ts` aggregation +
   `GET /v1/growth/creator-driven-sales` (self-scope, `?since`) + `creator_driven_sales_total` /
   `creator_driven_gmv_cents_total` Prometheus counters. *Makes the single KPI a first-class, queryable number.*
4. **Vendor order/earnings visibility** *(done)* — `GET /v1/creator/orders` read-surfaces the order data Blackout
   already receives via the FBM Matrix bridge (`fbmBuyerOrderRooms` / `fbmVendorRooms`) + a captured-tips earnings
   rollup. *Read-only; order management stays in FBM.*

**Still required for the loop to fully close (FBM-side, documented in §9):** FBM must emit the settlement events
(`referral.attributed`, `bounty.reward_settled`, …) with attribution metadata, and own the real payout. The
Creator-Hub KPI panel + an ops dashboard JSON are the natural client-side follow-ups.

---

## 8. Marketing-plan alignment (how we get users)

The plan's engine — **Founding 100 → density → creator/vendor/bounty campaigns** — is supported by the platform
as-is:

- **Founding 100 / invite-gated density:** `REQUIRE_INVITE_TOKEN` already gates registration; the homeserver
  mint-invite tooling exists (`infra/single-server-baseline/synapse/`). Founder-badge / reward-multiplier maps to
  the existing `ambassadorService` tiers + `commissionBps` primitive (`services/growth.ts`).
- **Creator / Vendor / Bounty campaigns:** Creator Hub, marketplace, and the bounty board are all live surfaces to
  run them against.
- **The one real dependency:** the marketing thesis is *"people trust results more than features"* — i.e. the
  campaigns are powered by **provable** creator earnings and creator-driven sales. So the KPI work in §7 is also
  the **marketing-proof** work: without it, the success stories can't be substantiated with numbers.

---

## 9. FBM seam (documented, not built here)

The integration boundary is the **entitlements-service contract** + the **FBM event bus** (operations-guide §2.5).
Blackout **consumes** FBM truth; FBM **owns** orders / ledger / payouts / settlement / opportunity data.

**Blackout already consumes:** marketplace catalog + checkout sessions, `purchase.*` webhooks → entitlements,
order/inventory/dispute events → Matrix bridge rooms, creator payout onboarding hooks.

**FBM must provide for the loop to fully settle/report:** confirmed reward payout (tip / FBM credit) back-references
so §7.2 settlement can flip ledger rows; producer-profile + store-directory data (Commerce Hub); price/demand
signals (Opportunity Engine); GMV rollups for marketplace-fee revenue reporting.

**Out of scope entirely (Phase 3+, already deferred by you):** product tokens, coalition credit backing,
investments, Blackstar vending, asset sharing, logistics automation, advanced governance.

---

## 10. Launch punch-list (sequenced)

1. **Platform launch enablement:** cut the first `v*` release image; set prod secrets
   (`FREEBLACKMARKET_API_KEY`/`_WEBHOOK_SECRET`, `BLACKOUT_DB_MODE=postgres` + `DATABASE_URL`, `REDIS_URL`, JWT,
   `MATRIX_BOT_TOKEN`); populate the staging-signoff record; run the pre-launch + smoke checklists.
2. **Measurable loop (this branch):** §7.1 → §7.2 → §7.3 → §7.4.
3. **FBM cross-repo seam:** §9 — sequence the FBM team against the documented contract.

When 1 + 2 are done, you can both **open the doors** and **prove the economy is working** — which is the only
signal (per your own framing) that justifies building Phase 3+.
