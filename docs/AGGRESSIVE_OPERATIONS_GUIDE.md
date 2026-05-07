# Black Market Coalition — Aggressive Operations Guide

> **Companion docs:** [`ROADMAP.md`](../ROADMAP.md) · [`FEATURE_BUILD_PLAN.md`](../FEATURE_BUILD_PLAN.md) · [`docs/VENDOR_PORTAL_PROJECT_TRACKER.md`](VENDOR_PORTAL_PROJECT_TRACKER.md) · [`docs/VENDOR_FEATURE_MATRIX.md`](VENDOR_FEATURE_MATRIX.md) · [`docs/COLLECTIVE_BUYS_MICRO_INVESTMENT_SPEC.md`](COLLECTIVE_BUYS_MICRO_INVESTMENT_SPEC.md) · [`docs/VENDOR_HYPE_OPERATIONS_PREDICTION_WHITEPAPER.md`](VENDOR_HYPE_OPERATIONS_PREDICTION_WHITEPAPER.md) · [`docs/PROJECT_OPERATING_SYSTEM.md`](PROJECT_OPERATING_SYSTEM.md)
>
> This file is the canonical 24-month execution calendar for the Black Market Coalition. The user-supplied calendar is preserved verbatim. FBM-specific expansions are appended in clearly labeled subsections so original priorities, KPIs, and Blackout/Blackstar/marketing/daily-ops content remain unchanged.

---

# Black Market Coalition

Aggressive Operations Guide

24-Month Execution Calendar

Goal: Top-End Growth Scenario

This plan is optimized for:

maximum revenue velocity,

recursive growth,

creator acquisition,

infrastructure leverage,

and ecosystem lock-in.

The strategy:

front-load the highest-margin, fastest-scaling revenue systems first,

then recursively reinvest into:

* infrastructure,
* retention,
* logistics,
* and ecosystem defensibility.

⸻

CORE EXECUTION PHILOSOPHY

Phase 1

Monetize Attention

Focus:

* creators
* digital products
* subscriptions
* plugins
* communities
* services

Goal:

rapid recurring revenue.

⸻

Phase 2

Lock In Communities

Focus:

* identity economy
* plugin economy
* paid communities
* creator coalitions

Goal:

retention + recurring cash flow.

⸻

Phase 3

Increase Transaction Density

Focus:

* ghost kitchens
* CSA systems
* vending
* local delivery
* service ecosystems

Goal:

recurring local commerce.

⸻

Phase 4

Internalize Infrastructure

Focus:

* compute
* storage
* fulfillment
* logistics
* nodes

Goal:

operational leverage + defensibility.

⸻

PRIMARY SUCCESS METRICS

Metric	Year 1 Goal
Creators onboarded	25,000+
Paid communities	5,000+
Vendors	5,000+
Plugin creators	2,000+
Monthly GMV	$10M+
Monthly recurring revenue	$2M+
Cross-platform bridge communities	10,000+
Service providers	10,000+

⸻

MONTH-BY-MONTH OPERATIONS CALENDAR

MONTH 1

FOUNDATION + RAPID MONETIZATION

PRIORITIES

Highest ROI First

⸻

FBM

COMPLETE THESE FIRST

Task	Priority	Target Completion
Creator affiliate system	CRITICAL	100%
Digital products	CRITICAL	100%
Creator storefronts	CRITICAL	100%
Referral tracking	CRITICAL	80%
Community storefront hooks	HIGH	60%
Subscription infrastructure	HIGH	70%

#### FBM — Existing Module Leverage (Month 1)

Most of the Month-1 priorities map to modules that already ship in `backend/src/modules/`. Activate and instrument; do not rebuild:

| Calendar item | Existing FBM module(s) | Notes |
|---|---|---|
| Creator affiliate system | `creator-attribution`, `creator-program`, `creator-rewards` + routes under `backend/src/api/vendor/affiliate-links/*` | Affiliate-link generation, attribution, reward distribution all wired |
| Digital products | `digital-product`, `digital-product-fulfillment` | License delivery + entitlement (`entitlement`) live |
| Creator storefronts | `marketplace-listing`, `seller-extension`, `content-platform` | Storefront polish tracked in `STOREFRONT_AUDIT.md` |
| Referral tracking | `creator-attribution` events + `marketplace-webhooks` | Hook into Hawala for payouts (`hawala-ledger`) |
| Community storefront hooks | `cooperative`, `buyer-network`, `marketplace-listing` | Co-op-owned listings already supported |
| Subscription infrastructure | `subscription` | Recurring billing, plan tiers, dunning |

#### FBM — Additional Workstreams (Month 1)

| Task | Priority | Target Completion | Source |
|---|---|---|---|
| Vendor Activation Sprint A — TTFLL ≤ 5 min wizard | CRITICAL | 100% | `FEATURE_BUILD_PLAN.md` §"Activation Sprint A" (lines 36–80) |
| Storefront product display polish | HIGH | 80% | `STOREFRONT_AUDIT.md`, `docs/STOREFRONT_PRODUCTS_DISPLAY_REVIEW.md` |
| Tenancy / multi-tenant scaffolding | HIGH | 70% | `backend/src/modules/tenancy` |
| Vendor identity & trust pass | HIGH | 80% | `vendor-verification`, `marketplace-signing`, `vendor-rules` |
| Hawala ledger payout activation | CRITICAL | 90% | `hawala-ledger`, `payout-breakdown` |

⸻

Blackout

Task	Priority	Target Completion
Paid communities	CRITICAL	90%
Theme system	CRITICAL	100%
Emoji marketplace	HIGH	80%
Plugin architecture MVP	CRITICAL	70%
Discord/Twitch/YouTube bridges	CRITICAL	100%
Mobile optimization	HIGH	60%

⸻

Blackstar

Task	Priority	Target Completion
Node abstraction	MEDIUM	30%
Fulfillment hooks	MEDIUM	40%
Delivery architecture	LOW	20%

⸻

MARKETING

DAILY

6–10 Hours Minimum

Content Output

* creator recruitment videos
* “make money with your community”
* “monetize your audience”
* plugin creator recruitment
* creator coalition messaging

⸻

WEEKLY TARGETS

Target	Goal
Creator outreach DMs	1,000+
Community partnerships	50
Short-form videos	50
Affiliate onboarding calls	25
Creator walkthrough demos	20

⸻

QUICK INCOME GENERATORS

PRIORITY ORDER

1.

Digital products

2.

Creator subscriptions

3.

Paid communities

4.

Plugin marketplace

5.

Services marketplace

6.

Themes/emojis

⸻

MONTH 1 TARGETS

KPI	Goal
Revenue	$5k–$15k
Creators	100–300
Paid communities	25
Vendors	50
Plugins/themes listed	50

⸻

MONTH 2–3

VIRAL ACQUISITION PHASE

FBM PRIORITIES

Task	Completion Goal
Group commerce	80%
Services marketplace	100%
Community subscriptions	100%
Revenue split systems	90%
Analytics dashboard	70%

#### FBM — Existing Module Leverage (Month 2–3)

| Calendar item | Existing FBM module(s) |
|---|---|
| Group commerce | `collective-campaign`, `demand-pool`, `bargaining`, `cooperative`, `buyer-network` |
| Services marketplace | `service-program`, `ticket-booking`, `rental` |
| Community subscriptions | `subscription` + `cooperative` + `governance` |
| Revenue splits | `payout-breakdown`, `hawala-ledger` |
| Analytics seed | `impact-metrics` (extend, do not rebuild) |

#### FBM — Additional Workstreams (Month 2–3)

| Task | Completion Goal | Source |
|---|---|---|
| Vendor Activation Sprint B (CSV import, listing templates, Launch Assist Mode) | 90% | `FEATURE_BUILD_PLAN.md` §"Activation Sprint B" (lines 82–106) |
| Order cycle aggregation productionization | 80% | `order-cycle` |
| Wishlist + content-platform creator pages | 70% | `wishlist`, `content-platform` |
| Donation rails wired to creator coalitions | 60% | `donation` |
| Volunteer coordination for coalition launches | 50% | `volunteer` |
| Spec out POS, weight pricing, channel sync data contracts | Designs frozen | `FEATURE_BUILD_PLAN.md` Phase 0 (lines 183–205) |

⸻

Blackout PRIORITIES

Task	Completion Goal
Plugin marketplace	90%
Community discovery	70%
Creator dashboards	80%
Monetized identities	100%
AI plugin APIs	60%

⸻

MARKETING STRATEGY

PRIORITY:

Coalition creator recruitment

Push:

* “earn together”
* “community monetization”
* “own your audience”
* “cross-platform monetization”
* “plugin economy”

⸻

LAUNCHES

Launch #1

Creator Monetization Launch

Focus:

* affiliates
* storefronts
* subscriptions

⸻

Launch #2

Plugin Economy Launch

Focus:

* themes
* plugins
* emoji packs
* AI plugins

⸻

PARTNERSHIPS

PRIORITY PARTNERS

Category	Goal
Mid-size creators	Highest priority
Discord communities	High
Twitch streamers	High
Open-source devs	Critical
Existing marketplaces	Critical
Ghost kitchens	Medium
CSA farms	Medium

⸻

MONTH 3 TARGETS

KPI	Goal
Revenue	$40k–$100k/month
Creators	2,500+
Paid communities	250+
Vendors	500+
Plugin creators	100+

⸻

MONTH 4–6

ECOSYSTEM COMPOUNDING PHASE

PRIORITIES

FBM

Task	Completion Goal
Omnichannel commerce	80%
POS systems	60%
CSA systems	70%
Crop planning	60%
Ghost kitchen integrations	50%

#### FBM — Existing Module Leverage (Month 4–6)

| Calendar item | Existing FBM module(s) |
|---|---|
| Omnichannel commerce | `woocommerce-import`, `odoo`, `printful-fulfillment`, `marketplace-listing`, `marketplace-webhooks` |
| CSA systems | `agriculture`, `garden`, `season`, `producer`, `harvest`, `harvest-batches`, `food-distribution`, `order-cycle` |
| Crop planning (light today, expand here) | `agriculture`, `garden`, `season` |
| Ghost kitchen integrations | `kitchen`, `restaurant`, `food-distribution`, `order-subcontract`, `supplier-forwarding` |
| Vendor demand prediction (rare differentiator) | `vendor-hype-operations-prediction` |

#### FBM — Additional Workstreams (Month 4–6)

| Task | Completion Goal | Source |
|---|---|---|
| POS module MVP | 60% | `FEATURE_BUILD_PLAN.md` §1 "POS for in-person market/pickup sales" (lines 210–232) |
| Sell-by-weight pricing | 70% | `FEATURE_BUILD_PLAN.md` §2 (lines 234–252) |
| Channel-sync module (real-time inventory/order sync) | 60% | `FEATURE_BUILD_PLAN.md` §3 (lines 254–274) |
| `fulfillment-ops` pick-and-pack | 50% | `FEATURE_BUILD_PLAN.md` §4 (lines 280–296) |
| Vendor Hype Operations Prediction Phase A/B launch | 70% | `docs/VENDOR_HYPE_OPERATIONS_PREDICTION_GROWTH_LAUNCH_PLAN_PHASE_A_B.md` |
| Vendor Activation Sprint C (48-hr follow-up, dashboard coaching, incentives) | 100% | `FEATURE_BUILD_PLAN.md` §"Activation Sprint C" (lines 107–124) |
| CSA share-box scheduler on top of `order-cycle` | 70% | extends `order-cycle` + `food-distribution` |
| Crop planning v2 (rotation, yield forecast) | 60% | extends `agriculture` + `garden` + `season` |

⸻

Blackout

Task	Completion Goal
Community prestige systems	80%
Recommendation engine	60%
Advanced plugin APIs	80%
Service coordination tools	70%

⸻

Blackstar

Task	Completion Goal
Fulfillment nodes	60%
Pickup systems	60%
Vending architecture	40%

⸻

NEW REVENUE PUSHES

Launch #3

Service Marketplace Launch

Focus:

* creators
* freelancers
* agencies
* moderators
* developers

⸻

Launch #4

Community Commerce Launch

Focus:

* shared storefronts
* coalition communities
* creator collectives

⸻

MONTH 6 TARGETS

KPI	Goal
Revenue	$350k–$750k/month
Creators	10,000+
Paid communities	1,500+
Vendors	2,000+
Plugin creators	500+

⸻

MONTH 7–12

INFRASTRUCTURE + RETENTION PHASE

PRIORITIES

FBM

Task	Completion Goal
B2B systems	70%
White-label APIs	60%
Creator coalition tooling	80%
Advanced analytics	90%

#### FBM — Existing Module Leverage (Month 7–12)

| Calendar item | Existing FBM module(s) |
|---|---|
| Creator coalition tooling | `cooperative`, `governance`, `volunteer` |
| B2B foundation seed | `buyer-network`, `marketplace-listing`, `demand-pool`, `bargaining` |
| Advanced analytics seed | `impact-metrics` + cross-cutting event taxonomy |

#### FBM — Additional Workstreams (Month 7–12)

| Task | Completion Goal | Source |
|---|---|---|
| Invoicing module | 80% | `FEATURE_BUILD_PLAN.md` §5 "Invoicing" (lines 298–315) |
| Merchant support module + SLA tooling | 80% | `FEATURE_BUILD_PLAN.md` §6 (lines 317–332) |
| Risk / fraud monitoring | 70% | `FEATURE_BUILD_PLAN.md` §7 (lines 334–350) |
| Managed onboarding success program | 70% | `FEATURE_BUILD_PLAN.md` §8 (lines 356–371) |
| Marketing guidance hub | 60% | `FEATURE_BUILD_PLAN.md` §9 (lines 373–387) |
| Advanced analytics warehouse / cohort + revenue dashboards | 90% | `FEATURE_BUILD_PLAN.md` Cross-Cutting "Data & Analytics" (lines 463–466) |
| White-label API surface — design spec + alpha | 60% | greenfield; align with `tenancy` and `ROADMAP.md` |
| B2B portal extension on top of `buyer-network` | 70% | extends existing `buyer-network` + `bargaining` |
| Vendor pilot scaling per `VENDOR_PILOT_SUPPORT_RUNBOOK.md` | 80% | `docs/VENDOR_PILOT_SUPPORT_RUNBOOK.md` |
| Multi-tenant federation hardening | 70% | `tenancy` |

⸻

Blackout

Task	Completion Goal
Full plugin ecosystem	100%
Federation optimization	80%
Community AI plugin systems	80%
Mobile-first polish	90%

⸻

Blackstar

Task	Completion Goal
Vending systems	70%
Logistics coordination	70%
Node operator dashboards	80%
Ghost kitchen infrastructure	60%

⸻

INFRASTRUCTURE REINVESTMENT

BEGIN BUYING:

* servers
* storage
* GPU systems
* edge hardware
* vending infrastructure

⸻

GHOST KITCHEN OPERATIONS

PHASE 1

Partner kitchens only.

Target:

* underutilized restaurants
* churches
* local kitchens
* food trucks

⸻

PHASE 2

Creator food brands.

⸻

PHASE 3

Coalition-owned kitchens.

⸻

MONTH 12 TARGETS

KPI	Goal
Revenue	$5M–$7M/month
Creators	50,000+
Vendors	10,000+
Paid communities	5,000+
Plugin creators	2,000+
Ghost kitchen partners	50+

⸻

YEAR 2

INFRASTRUCTURE DOMINANCE PHASE

PRIORITIES

FBM

* API infrastructure
* white-label ecosystems
* B2B scaling
* advanced creator tooling

#### FBM — Additional Workstreams (Year 2)

- Academy / training delivery (`academy` module — `FEATURE_BUILD_PLAN.md` §10, lines 389–403).
- Custom farm website services productization (`website-services` — §11, lines 405–420).
- Promotional tools suite — campaigns, bundles, referral codes, abandoned-cart nudges (§12, lines 422–436).
- E-books / webinars resource library (`resources` — §13, lines 438–452); pair with the existing **Jitsi** install in `infrastructure/jitsi/`.
- Vendor Hype Operations Prediction monetization tier rollout (`vendor-hype-operations-prediction`).
- Cooperative governance scaling + DAO-style proposal flows (`governance`).
- Impact metrics → external white-label partner reporting (`impact-metrics`).
- Multi-tenant federation + per-tenant theming on top of `tenancy`.
- Cross-coalition settlement clearing on top of `hawala-ledger`.

⸻

Blackout

* ecosystem federation
* advanced identity economy
* plugin ecosystem scaling
* creator operating system

⸻

Blackstar

* vending rollout
* fulfillment networks
* storage/compute ownership
* edge infrastructure

⸻

YEAR 2 TARGETS

KPI	Goal
Monthly revenue	$30M+
Ecosystem GMV	$500M+
Creators	250,000+
Vendors	50,000+
Plugin creators	10,000+
White-label partners	100+
Node operators	5,000+

⸻

DAILY OPERATIONS SYSTEM

EVERY DAY

SOFTWARE

* ship features
* AI-assisted code generation
* bug fixing
* analytics review

⸻

MARKETING

* creator recruitment
* short-form content
* community engagement
* partnerships

⸻

SALES

* creator outreach
* vendor onboarding
* service provider onboarding

⸻

COMMUNITY

* moderation
* coalition calls
* onboarding streams
* creator showcases

⸻

ANALYTICS

Track:

* creator retention
* conversion rates
* referral performance
* plugin sales
* community revenue
* campaign ROI

⸻

MASTER PROGRESS TRACKER TEMPLATE

FBM

System	Progress
Creator affiliates	0–100%
Digital products	0–100%
Plugin marketplace	0–100%
Revenue splits	0–100%
Services marketplace	0–100%
Crop planning	0–100%
CSA systems	0–100%
POS systems	0–100%
Ghost kitchen systems	0–100%
White-label APIs	0–100%

#### FBM — Extended Master Progress Tracker (additive rows)

Existing-module rows (already shipping, instrument and report on):

| System | Progress | Backing module(s) |
|---|---|---|
| Vendor verification & KYC | 0–100% | `vendor-verification` |
| Marketplace signing | 0–100% | `marketplace-signing` |
| Demand pools | 0–100% | `demand-pool` |
| Collective campaigns | 0–100% | `collective-campaign` |
| Bargaining | 0–100% | `bargaining` |
| Cooperative governance | 0–100% | `cooperative`, `governance` |
| Buyer network | 0–100% | `buyer-network` |
| Order cycles | 0–100% | `order-cycle` |
| Hawala ledger settlements | 0–100% | `hawala-ledger` |
| Payout breakdowns | 0–100% | `payout-breakdown` |
| Vendor Hype Operations Prediction | 0–100% | `vendor-hype-operations-prediction` |
| WooCommerce / Odoo / Printful integrations | 0–100% | `woocommerce-import`, `odoo`, `printful-fulfillment` |
| Tenancy / multi-tenant | 0–100% | `tenancy` |
| Volunteer coordination | 0–100% | `volunteer` |
| Impact metrics | 0–100% | `impact-metrics` |
| Content platform | 0–100% | `content-platform` |
| Ticket booking + rental | 0–100% | `ticket-booking`, `rental` |
| Producer / garden / season / harvest | 0–100% | `producer`, `garden`, `season`, `harvest`, `harvest-batches` |
| Wishlist + donation | 0–100% | `wishlist`, `donation` |
| Food distribution + order subcontracting | 0–100% | `food-distribution`, `order-subcontract`, `supplier-forwarding` |
| Subscription billing | 0–100% | `subscription` |
| Entitlements | 0–100% | `entitlement` |
| Creator program & rewards | 0–100% | `creator-program`, `creator-rewards`, `creator-attribution` |
| Marketplace webhooks | 0–100% | `marketplace-webhooks` |

Unbuilt-workstream rows (build & track):

| System | Progress | Status |
|---|---|---|
| POS module | 0–100% | unbuilt; see `FEATURE_BUILD_PLAN.md` §1 |
| Weight-based pricing | 0–100% | unbuilt; §2 |
| Channel sync (`channel-sync`) | 0–100% | unbuilt; §3 |
| Pick-and-pack (`fulfillment-ops`) | 0–100% | unbuilt; §4 |
| Invoicing | 0–100% | unbuilt; §5 |
| Merchant support | 0–100% | unbuilt; §6 |
| Risk / fraud monitoring | 0–100% | unbuilt; §7 |
| Managed onboarding success | 0–100% | unbuilt; §8 |
| Marketing guidance hub | 0–100% | unbuilt; §9 |
| Academy / workshops | 0–100% | unbuilt; §10 |
| Website services | 0–100% | unbuilt; §11 |
| Promotional tools suite | 0–100% | unbuilt; §12 |
| Resource library (e-books/webinars) | 0–100% | unbuilt; §13 |
| Vendor activation TTFLL wizard (Sprints A/B/C) | 0–100% | partially specced; see `FEATURE_BUILD_PLAN.md` Activation Sprints |
| Advanced analytics warehouse | 0–100% | unbuilt; Cross-Cutting §Data & Analytics |
| B2B portal | 0–100% | unbuilt; greenfield on top of `buyer-network` |
| White-label API surface | 0–100% | unbuilt; greenfield on top of `tenancy` |

⸻

Blackout

System	Progress
Paid communities	0–100%
Plugin architecture	0–100%
Theme marketplace	0–100%
Emoji marketplace	0–100%
AI plugin system	0–100%
Community discovery	0–100%
Creator dashboards	0–100%
Cross-platform bridges	0–100%
Prestige systems	0–100%
Federation scaling	0–100%

⸻

Blackstar

System	Progress
Fulfillment nodes	0–100%
Pickup systems	0–100%
Delivery coordination	0–100%
Vending systems	0–100%
Ghost kitchen integration	0–100%
Compute/storage ownership	0–100%
Edge infrastructure	0–100%

⸻

MOST IMPORTANT STRATEGIC RULE

Every feature must:

* increase monetization,
* increase retention,
* increase creator earnings,
* increase ecosystem lock-in,
* or increase infrastructure ownership.

If not:

deprioritize it aggressively.

---

## Appendix A — FBM Module Inventory & Mapping

This appendix is additive. It maps every calendar item that touches FBM to the concrete code path under `backend/src/modules/*` (and the spec doc, where one exists). Use it as the source of truth when a new contributor asks "where does X live?".

### Creator economy
| Calendar item | Module path | Spec / docs |
|---|---|---|
| Creator affiliate system | `backend/src/modules/creator-attribution` | — |
| Creator program | `backend/src/modules/creator-program` | — |
| Creator rewards | `backend/src/modules/creator-rewards` | — |
| Affiliate links API | `backend/src/api/vendor/affiliate-links/*` | — |

### Commerce primitives
| Calendar item | Module path | Spec / docs |
|---|---|---|
| Digital products | `backend/src/modules/digital-product`, `backend/src/modules/digital-product-fulfillment` | — |
| Subscription infrastructure | `backend/src/modules/subscription` | — |
| Marketplace listings | `backend/src/modules/marketplace-listing` | `docs/VENDOR_FEATURE_MATRIX.md` |
| Entitlements | `backend/src/modules/entitlement` | — |
| Wishlist | `backend/src/modules/wishlist` | — |

### Group commerce / coalition
| Calendar item | Module path | Spec / docs |
|---|---|---|
| Group commerce | `backend/src/modules/collective-campaign`, `demand-pool`, `bargaining`, `cooperative`, `buyer-network` | `docs/COLLECTIVE_BUYS_MICRO_INVESTMENT_SPEC.md` |
| Cooperative governance | `backend/src/modules/cooperative`, `backend/src/modules/governance` | — |
| Order cycles | `backend/src/modules/order-cycle` | — |
| Volunteer coordination | `backend/src/modules/volunteer` | — |

### Services / events / rentals
| Calendar item | Module path | Spec / docs |
|---|---|---|
| Services marketplace | `backend/src/modules/service-program` | — |
| Ticket booking | `backend/src/modules/ticket-booking` | — |
| Rentals | `backend/src/modules/rental` | — |

### Settlements / payouts
| Calendar item | Module path | Spec / docs |
|---|---|---|
| Revenue split rails | `backend/src/modules/payout-breakdown`, `hawala-ledger` | — |

### Identity / trust
| Calendar item | Module path | Spec / docs |
|---|---|---|
| Vendor verification & KYC | `backend/src/modules/vendor-verification` | — |
| Marketplace signing | `backend/src/modules/marketplace-signing` | — |
| Vendor rules | `backend/src/modules/vendor-rules` | — |
| Work verification | `backend/src/modules/work-verification` | — |

### Agriculture / CSA / food
| Calendar item | Module path | Spec / docs |
|---|---|---|
| Crop planning | `backend/src/modules/agriculture`, `garden`, `season` | — |
| Producers / harvests | `backend/src/modules/producer`, `harvest`, `harvest-batches` | — |
| CSA / food distribution | `backend/src/modules/food-distribution` | `backend/src/modules/food-distribution/README.md` |
| Ghost kitchens | `backend/src/modules/kitchen`, `restaurant`, `order-subcontract`, `supplier-forwarding` | — |

### Omnichannel / integrations
| Calendar item | Module path | Spec / docs |
|---|---|---|
| WooCommerce sync | `backend/src/modules/woocommerce-import` | — |
| Odoo ERP integration | `backend/src/modules/odoo` | — |
| Printful POD | `backend/src/modules/printful-fulfillment` | — |
| Webhooks | `backend/src/modules/marketplace-webhooks` | — |

### Fulfillment / delivery
| Calendar item | Module path | Spec / docs |
|---|---|---|
| Fulfillment hooks | `backend/src/modules/blackstar-fulfillment`, `blackstar-fulfillment-provider` | — |
| Local delivery | `backend/src/modules/local-delivery-fulfillment`, `delivery` | — |

### Forecast / impact
| Calendar item | Module path | Spec / docs |
|---|---|---|
| Vendor Hype Operations Prediction | `backend/src/modules/vendor-hype-operations-prediction` | `docs/VENDOR_HYPE_OPERATIONS_PREDICTION_WHITEPAPER.md` and the full `VENDOR_HYPE_OPERATIONS_PREDICTION_*` series |
| Impact metrics | `backend/src/modules/impact-metrics` | — |

### Platform
| Calendar item | Module path | Spec / docs |
|---|---|---|
| Tenancy / multi-tenant | `backend/src/modules/tenancy` | — |
| File / object storage | `backend/src/modules/minio-file` | — |
| Email / SMTP / Resend | `backend/src/modules/smtp`, `resend` | — |
| CMS blueprint | `backend/src/modules/cms-blueprint` | — |
| Content platform | `backend/src/modules/content-platform` | — |

---

## Appendix B — Open-Source Adoption Map for Unbuilt FBM Workstreams

For every unbuilt FBM workstream the calendar names, this table recommends a primary OSS project to fork, embed, or crib patterns from, plus viable alternates. License is listed; **AGPL/SSPL and similar strong-copyleft items are sidecar-only or pattern-only — never compiled into `backend/src/modules/*` source** without legal review.

### Selection principles
1. **Permissive (MIT/Apache/BSD) > weak-copyleft (LGPL/MPL) > strong copyleft (GPL/AGPL).** Strong-copyleft items are deployed as sidecar microservices behind an HTTP API or used purely as pattern reference.
2. Prefer projects with **active commits in the last 90 days** and **≥1k GitHub stars** unless the niche is small (e.g. CSA / agri tools).
3. Prefer projects whose **data model can be expressed as a Medusa module** so we end up with one event bus, one auth model, one ledger.
4. When two projects tie, choose the one already adjacent to FBM's stack (Postgres, Node/TS, Redis) to avoid a polyglot tax.

### Core unbuilt workstreams

| Unbuilt workstream | Primary OSS recommendation | License | Alternates |
|---|---|---|---|
| **POS module** | **uniCenta oPOS** (`https://github.com/poin/unicenta-opos`) — mature web/desktop POS, hardware-friendly | GPL-3.0 | **Odoo POS** (already integrated via `odoo` module; LGPL/AGPL); **Open Source POS** (`https://github.com/opensourcepos/opensourcepos`, MIT); **Floreant POS** (restaurant-focused, `https://github.com/floreantpos/floreantpos`, MPL-2.0) |
| **Weight-based pricing** | **OCA `sale_order_variable_quantity`** (`https://github.com/OCA/sale-workflow`) — Odoo Community Association weighted-quantity patterns | AGPL-3.0 | PrestaShop "Variable Quantity" community modules (OSL-3.0); copy patterns into a Medusa price-calculation workflow |
| **Channel-sync (real-time inventory/order sync)** | **Debezium** (`https://github.com/debezium/debezium`) for Postgres CDC + Apache Kafka topics | Apache-2.0 | **Saleor** (`https://github.com/saleor/saleor`, BSD-3) — already-built multi-channel model to crib; **Vendure** (`https://github.com/vendure-ecommerce/vendure`, MIT); **n8n** (`https://github.com/n8n-io/n8n`, Sustainable Use) for connector glue |
| **Pick-and-pack (`fulfillment-ops`)** | **OpenBoxes** (`https://github.com/openboxes/openboxes`) — purpose-built WMS with pick lists, packing slips, substitutions | Eclipse-1.0 | **ERPNext Stock** (`https://github.com/frappe/erpnext`, GPL-3.0); **Tryton stock_inventory** (GPL-3.0) |
| **Invoicing** | **Invoice Ninja** (`https://github.com/invoiceninja/invoiceninja`) — modern PHP/Laravel invoicing, PDF + email + payment recon | Elastic-2.0 (review) | **Crater** (`https://github.com/crater-invoice/crater`, AGPL-3.0); **Akaunting** (`https://github.com/akaunting/akaunting`, GPL-3.0); **InvoicePlane** (MIT but stagnant) |
| **Merchant support / case management** | **Chatwoot** (`https://github.com/chatwoot/chatwoot`) — modern Rails, REST + webhooks, multichannel inbox | MIT | **FreeScout** (`https://github.com/freescout-helpdesk/freescout`, AGPL-3.0); **Zammad** (`https://github.com/zammad/zammad`, AGPL-3.0); **UVdesk** (`https://github.com/uvdesk/community-skeleton`, MIT) |
| **Risk / fraud monitoring** | **Drools rules engine** (`https://github.com/kiegroup/drools`) for the rules layer + **MaxMind GeoLite2** (`https://github.com/maxmind/GeoIP2-node`) for IP/geo signals | Apache-2.0 / proprietary-redistributable | **Apache Flink CEP** (Apache-2.0) for streaming velocity rules; **Stripe Radar** webhook events as upstream signal |
| **Managed onboarding success** | **Plane** (`https://github.com/makeplane/plane`) — modern issue/cycle/milestone tracker, embed via API | AGPL-3.0 (review) | **Focalboard** (`https://github.com/mattermost/focalboard`, MIT/Custom); **OpenProject** (`https://github.com/opf/openproject`, GPL-3.0); **Vikunja** (`https://github.com/go-vikunja/vikunja`, AGPL-3.0) |
| **Marketing guidance hub** | **Mautic** (`https://github.com/mautic/mautic`) — embeddable marketing automation, playbooks, campaigns | GPL-3.0 | **listmonk** (`https://github.com/knadh/listmonk`, AGPL-3.0) for newsletters; **PostHog** (`https://github.com/PostHog/posthog`, MIT) for funnel guidance |
| **Academy / training (`academy` module)** | **Moodle** (`https://github.com/moodle/moodle`) — most mature LMS; courses, certificates, SCORM | GPL-3.0 | **Open edX** (`https://github.com/openedx`, AGPL-3.0); **Forem** (`https://github.com/forem/forem`, AGPL-3.0); pair with **BigBlueButton** (`https://github.com/bigbluebutton/bigbluebutton`, LGPL-3.0) for live workshops, or reuse the existing **Jitsi** in `infrastructure/jitsi/` |
| **Website services productization** | **Plane** for project tracking + **Penpot** (`https://github.com/penpot/penpot`) for design handoff | AGPL-3.0 / MPL-2.0 | **OpenProject** (GPL-3.0); **Kanboard** (`https://github.com/kanboard/kanboard`, MIT) |
| **Promotional tools suite** | **Medusa core promotions module** (already a dependency) — extend, do not replace | MIT | **GrowthBook** (`https://github.com/growthbook/growthbook`, MIT) for A/B campaign measurement; **Saleor promotions** patterns (BSD-3) |
| **Resource library (e-books/webinars)** | **Strapi** (`https://github.com/strapi/strapi`) headless CMS for gated assets | MIT (community edition) | **Ghost** (`https://github.com/TryGhost/Ghost`, MIT) for content; **Outline** (`https://github.com/outline/outline`, BSL — review); existing **Jitsi** + **BigBlueButton** for webinars |
| **Vendor activation TTFLL wizard** | **react-step-wizard** (`https://github.com/jcmcneal/react-step-wizard`) + **React Hook Form** (`https://github.com/react-hook-form/react-hook-form`) | MIT / MIT | Reference **Saleor Dashboard** onboarding flows (BSD-3); **Vendure Admin UI** wizards (MIT) |
| **Advanced analytics warehouse** | **ClickHouse** (`https://github.com/ClickHouse/ClickHouse`) + **Cube** (`https://github.com/cube-js/cube`) semantic layer + **Metabase** (`https://github.com/metabase/metabase`) BI | Apache-2.0 / Apache-2.0 / AGPL-3.0 | **Apache Superset** (`https://github.com/apache/superset`, Apache-2.0); **PostHog** (MIT) for product analytics standalone; **DuckDB** (`https://github.com/duckdb/duckdb`, MIT) for embedded |
| **B2B portal** | **Vendure B2B starter** (`https://github.com/vendure-ecommerce/vendure`) — quote workflow, account hierarchies, MIT-clean to crib from | MIT | **Sylius B2B Suite** (`https://github.com/Sylius/Sylius`, MIT); **Spree** (`https://github.com/spree/spree`, BSD-3); **Saleor** B2B features (BSD-3); **Akeneo PIM** (`https://github.com/akeneo/pim-community-dev`, OSL-3.0) for catalog |
| **White-label API surface** | **Kong Gateway** (`https://github.com/Kong/kong`) — multi-tenant routing, key auth, rate limits, plugin model | Apache-2.0 | **KrakenD CE** (`https://github.com/krakend/krakend-ce`, Apache-2.0); **Tyk** (`https://github.com/TykTechnologies/tyk`, MPL-2.0); pair with the existing `tenancy` module for key/tenant binding |

### Bonus mappings — calendar items where OSS leverage helps fill gaps in already-built modules

| Calendar item | OSS to evaluate | License | Notes |
|---|---|---|---|
| **CSA systems** (`agriculture` + `food-distribution`) | **Open Food Network** (`https://github.com/openfoodfoundation/openfoodnetwork`) | AGPL-3.0 | Native CSA share boxes, drop-points, producer billing — closest to FBM's coalition model |
| **Crop planning** (deepen `agriculture` / `garden` / `season`) | **LiteFarm** (`https://github.com/LiteFarm/LiteFarm`) | GPL-3.0 | Cooperative farm planning + crop rotation; or **farmOS** (`https://github.com/farmOS/farmOS`, GPL-2.0); or **Tania** (`https://github.com/Tanibox/tania-core`, Apache-2.0, archived but referenceable) |
| **Ghost kitchen ops** (extend `kitchen` + `restaurant`) | **Floreant POS** (`https://github.com/floreantpos/floreantpos`) for kitchen-side ticketing | MPL-2.0 | Existing `kitchen` module covers orchestration; Floreant fills the FOH/BOH ticket gap |
| **Live workshops / community calls** | **Jitsi Meet** (already vendored under `infrastructure/jitsi/`) | Apache-2.0 | Already in-tree; default to Jitsi before reaching for BigBlueButton |
| **Webhook reliability / connector glue** | **n8n** (`https://github.com/n8n-io/n8n`) | Sustainable Use License | Useful for low-code creator → coalition integrations alongside Medusa events |

---

## Appendix C — Blackout Compat-Layer Inventory

This appendix is additive. It mirrors the FBM tracker pattern in
Appendix A but for the Blackout repo's Phase-1 / Phase-2 multi-platform
3rd-party software compatibility layer. Every entry below is shipped on
branch `claude/multi-platform-extensions-Euc73` and verified with
integration tests.

### C.0 — Provenance

- Repo: `blackmarket-coa/blackout`
- Branch: `claude/multi-platform-extensions-Euc73`
- Source at last update: commit `ef6ecce` (`feat(compat): every outbound event also pushes to OBS-WS surfaces`)
- Test counts at HEAD: 127 backend integration tests + 114 frontend
  tests across the compat surface, all green.
- Plan that drove this work: `docs/14-stream-revenue-implementation-plan.md` and the streamer-onboarding plan in `/root/.claude/plans/potential-user-had-this-glowing-toucan.md`.

### C.1 — Shipped commit log (chronological, grouped by epic)

#### Phase 0 — Linked accounts foundation

| Commit | Title |
|---|---|
| `55e66cf` | feat(compat): linked_accounts schema + Twitch OAuth link flow (Phase 0) |
| `baae392` | feat(compat): factor OAuth flow into providerFlow + add Discord and Patreon |
| `391b5c9` | feat(compat): YouTube OAuth + refresh-token rotation + provider registry |
| `85294ea` | feat(client): linked-accounts Settings section |

#### Phase 1 — Chat ingress + bridges

| Commit | Title |
|---|---|
| `26a8e0d` | feat(compat): Twitch IRC chat ingress (Phase 1 / Track A) |
| `2fafc61` | feat(compat): wire Twitch chat ingress into Matrix den rooms |
| `1901e79` | feat(client): Twitch chat bridges Settings section |
| `f366785` | feat(compat): YouTube Live chat ingress (Phase 1 / Track A) |
| `81bcd27` | feat(client): YouTube chat bridges Settings section |
| `5b2eb5d` | feat(compat): Kick chat ingress (Pusher v7 WS) — Phase 1 / Track A |
| `2030471` | feat(compat): Kick chat bridge service + routes (Phase 1 / Track A) |
| `471d3ba` | feat(client): Kick chat bridges Settings section |

#### Phase 1 — EventSub + alerts + Patreon + Streamlabs

| Commit | Title |
|---|---|
| `e0e9d4b` | feat(compat): Twitch EventSub webhook receiver + auto-resume bridges at boot |
| `f9e487b` | feat(compat): EventSub subscription manager + Matrix alert forwarding |
| `271ea88` | feat(compat): Streamlabs-shaped widget alerts (SSE) — Phase 1 alert pipeline |
| `b4d876d` | feat(client): widget-token Settings panel with one-time secret reveal |
| `8906806` | feat(compat): chat-ingress idle-detection + force-reconnect on stale sockets |
| `87dad47` | feat(compat): synthetic test-alert endpoint + UI buttons |
| `56cf360` | feat(client): OAuth popup callback page replaces paste-back UX |
| `bdb2487` | feat(compat): Patreon webhook ingress → donation alerts on the same SSE feed |
| `c970486` | feat(compat): Streamlabs as a 5th OAuth provider + donation sync |
| `9bd8ca3` | feat(compat): persistent sync_cursor on linked_accounts; Streamlabs survives restart |
| `2f9dea5` | feat(client): "Sync donations" button on the linked Streamlabs row |
| `cf11b4e` | feat(compat): Streamlabs donation auto-poll scheduler |
| (multi-platform-extensions-2) | feat(compat): StreamElements-shape OverlayWS shim — SE overlays connect unmodified |

#### Phase 1 — Outbound chat back to source platforms

| Commit | Title |
|---|---|
| `9056c9a` | feat(compat): Twitch outbound mirror — send chat through the existing bridge WSS |
| `31c9117` | feat(compat): YouTube outbound mirror — write back into live chat via the same OAuth link |
| `62f3f8b` | feat(compat): outboundMessageRouter — single Matrix-room → platforms entry point |

#### Phase 1 — Simulcast destinations + RTMP fan-out worker

| Commit | Title |
|---|---|
| `1d85e14` | feat(compat): RTMP simulcast destinations — backend (migration + service + routes) |
| `30dd63e` | feat(client): simulcast destinations Settings UI |
| `ed02515` | feat(compat): RTMP fan-out worker — Phase 1 / Track A backbone |
| `f731cd5` | feat(client): RTMP fan-out runtime status in the simulcast destinations Settings UI |
| `8f25d1c` | feat(compat): live SSE pipe for RTMP fan-out supervisor status |

#### Phase 1 — Health + integrations observability

| Commit | Title |
|---|---|
| `0e96ccc` | feat(compat): integrations health snapshot + Settings observability panel |

#### Phase 2 — Discord-shape inbound + outbound webhooks

| Commit | Title |
|---|---|
| `99bb47b` | feat(compat): Discord-shape inbound webhooks (Phase 2 / Track B) |
| `ed659b9` | feat(client): Discord-shape inbound webhooks Settings section |
| `2e30fac` | feat(compat): outbound Discord-shape event webhooks (Phase 2 / Track B) |
| `6cc9d14` | feat(client): outbound Discord-shape event webhooks Settings section |
| `8afe6e6` | feat(compat): outbound webhook secrets at rest; wire tip.captured → tip.created dispatch |
| `8073cd6` | feat(compat): fan out 4 more event types through outbound webhook pipeline |
| `0370e28` | feat(compat): outbound webhooks fan out 5 more event types (subscribe/gift/cheer/raid/streamgoal) |
| `3080465` | feat(compat): wire YouTube SuperChats + Patreon pledges into the outbound webhook pipeline |

#### Phase 2 — Twitch IRC bot shim (Nightbot/StreamElements/Moobot)

| Commit | Title |
|---|---|
| `c774975` | feat(compat): Twitch IRC bot shim foundations (Phase 2 / Track B) |
| `8fbafba` | feat(compat): live Twitch IRC bot shim — Nightbot/StreamElements/Moobot connect unmodified |
| `a0274f2` | feat(compat): IRC bot shim now spans Twitch + YouTube + Kick on one connection |
| `5710c42` | feat(compat): IRC shim bot PRIVMSG → real Twitch IRC outbound (Twitch-shape channels only) |

#### Phase 2 — OBS-WebSocket v5 server (Stream Deck / Companion / Touch Portal)

| Commit | Title |
|---|---|
| `bd65c80` | feat(compat): live OBS-WebSocket v5 server shim — Stream Deck/Companion/Touch Portal connect unmodified |
| `ccf347e` | feat(compat): wire OBS-WS request matrix to creator stream lifecycle |
| `3318bb3` | feat(compat): OBS-WS push events — Stream Deck tiles flip live on stream-state changes |
| (multi-platform-extensions-2) | feat(compat): Stream Deck Companion module package — upstream-PR-ready for bitfocus/companion |
| (multi-platform-extensions-2) | feat(compat): OBS-WS SetInputMute / GetInputMute / ToggleInputMute → LiveKit admin mute (hardcoded Mic/Microphone/Desktop Audio) |

#### Phase 2 — Matrix appservice listener

| Commit | Title |
|---|---|
| `bbda88a` | feat(compat): wire Blackout-side messages route to the outbound chat router |
| `8c0a5a4` | feat(compat): Matrix appservice transactions endpoint — fans federation/bridge messages outbound |
| (multi-platform-extensions-2) | feat(compat): Synapse appservice registration YAML stub for ops drop-in |

#### Phase 2 — Connected-session observability + cross-cutting event push

| Commit | Title |
|---|---|
| `bac8318` | feat(compat): observability — show connected IRC bots in Settings |
| `fd42b70` | feat(compat): observability — show connected OBS-WS surfaces in Settings |
| `ef6ecce` | feat(compat): every outbound event also pushes to OBS-WS surfaces |

### C.2 — Source-path cross-reference

#### C.2.1 Calendar items already shipped

| Calendar item | Backing file path(s) |
|---|---|
| Discord/Twitch/YouTube bridges (Month 1, calendar line 186) | `packages/api/src/integrations/{twitch,youtube,kick}/*` + `packages/api/src/services/{twitchChatBridge,youtubeChatBridge,kickChatBridge}.ts` + `packages/api/src/routes/{twitchChatBridges,youtubeChatBridges,kickChatBridges}.ts` |
| Cross-platform bridges (master tracker line 783) | Same as above + the IRC bot shim's multi-platform `JOIN #login`/`#yt:<id>`/`#kick:<id>` resolver in `packages/api/src/integrations/twitch-compat/ircServer.ts` |
| Twitch chat ingress (IRC) | `packages/api/src/integrations/twitch/{chatIngress,chatBridge,ircParser}.ts` |
| YouTube Live chat ingress | `packages/api/src/integrations/youtube/{api,chatBridge}.ts` + `packages/api/src/services/youtubeChatBridge.ts` |
| Kick chat ingress (Pusher v7) | `packages/api/src/integrations/kick/{chatIngress,chatBridge,pusherProtocol}.ts` |
| Twitch EventSub receiver | `packages/api/src/integrations/twitch/eventSub.ts` + `packages/api/src/routes/twitchEventSub.ts` + `packages/api/src/services/twitchEventSubManager.ts` |
| Patreon webhook receiver | `packages/api/src/routes/patreonWebhook.ts` + `packages/api/src/integrations/patreon/webhookEvents.ts` |
| Streamlabs donation sync | `packages/api/src/services/streamlabsDonationSync.ts` + `packages/api/src/services/streamlabsDonationScheduler.ts` |
| Widget alerts SSE pipe (Streamlabs/StreamElements-shaped) | `packages/api/src/routes/widgetAlerts.ts` + `packages/api/src/services/widgetBus.ts` + `packages/api/src/services/widgetAlertTokens.ts` |
| StreamElements OverlayWS compat (faithful socket.io shim) | `packages/api/src/integrations/se-overlay-compat/server.ts` + `packages/api/src/integrations/widgets/seOverlayShape.ts` |
| Linked accounts (5 OAuth providers: Twitch, YouTube, Discord, Patreon, Streamlabs) | `packages/api/src/services/linkedAccounts.ts` + `packages/api/src/services/oauthProviders.ts` + `packages/api/src/integrations/_oauth/*` |
| Outbound chat router (Twitch IRC + YouTube liveChat) | `packages/api/src/services/outboundMessageRouter.ts` |
| Simulcast destinations CRUD (AES-GCM at rest) | `packages/api/src/services/simulcastDestinations.ts` + `packages/api/src/db/migrations/014_*.sql` |
| RTMP fan-out worker (ffmpeg supervisor + auto-restart) | `packages/api/src/services/rtmpFanoutWorker.ts` + `packages/api/src/routes/rtmpFanout.ts` |
| RTMP fan-out SSE status pipe | `packages/api/src/routes/rtmpFanout.ts` (`/stream` route) + `subscribeStatusForUser` in the worker |
| Twitch IRC bot shim — protocol layer | `packages/api/src/integrations/twitch-compat/ircServerProtocol.ts` |
| Twitch IRC bot shim — WS server | `packages/api/src/integrations/twitch-compat/ircServer.ts` |
| Twitch IRC bot tokens (sha256-hashed bearer secrets) | `packages/api/src/services/twitchIrcBotTokens.ts` + `packages/api/src/routes/twitchIrcBotTokens.ts` + `packages/api/src/db/migrations/018_*.sql` |
| Bot PRIVMSG → real Twitch IRC outbound | `packages/api/src/integrations/twitch-compat/ircServer.ts` `privmsg` case |
| OBS-WebSocket v5 server — protocol layer | `packages/api/src/integrations/obs-ws-compat/protocol.ts` |
| OBS-WebSocket v5 server — WS server + Hello/Identify auth | `packages/api/src/integrations/obs-ws-compat/server.ts` |
| OBS-WS request matrix (GetVersion / Stats / StreamStatus / StartStream / StopStream / ToggleStream / GetSceneList / SetCurrentProgramScene / BroadcastCustomEvent) | `dispatchRequest` in `packages/api/src/integrations/obs-ws-compat/protocol.ts` + `defaultStreamCommands` in the server |
| OBS-WS SetInputMute / GetInputMute / ToggleInputMute → LiveKit admin mute (hardcoded Mic / Microphone / Desktop Audio) | `dispatchRequest` cases in `obs-ws-compat/protocol.ts` + `services/livekitAdmin.ts` + `services/voiceRooms.ts` |
| OBS-WS push events (StreamStateChanged + `blackout.*`) | `notifyStreamStarted/Ended/notifyBlackoutEvent` in `packages/api/src/integrations/obs-ws-compat/server.ts` |
| Stream Deck Companion module package (upstream-PR-ready) | `packages/companion-blackout/*` (target: bitfocus/companion) |
| OBS-WS passwords (AES-GCM at rest, per-row URL slug, multi-device) | `packages/api/src/services/obsWsPasswords.ts` + `packages/api/src/routes/obsWsPasswords.ts` + `packages/api/src/db/migrations/019_*.sql` |
| Discord-shape inbound webhooks | `packages/api/src/services/discordCompatWebhooks.ts` + `packages/api/src/routes/discordCompatWebhooks.ts` + `packages/api/src/db/migrations/016_*.sql` |
| Discord-shape outbound webhooks (10 event types, HMAC-SHA256, AES-GCM-encrypted signing secret) | `packages/api/src/services/outboundEventWebhooks.ts` + `packages/api/src/routes/outboundEventWebhooks.ts` + `packages/api/src/db/migrations/017_*.sql` |
| Outbound event sources wired (tip / follow / livestream / chat / sub / cheer / raid / streamgoal / SuperChat / Patreon-pledge) | `packages/api/src/services/{tips,outboundEventWebhooks,streamGoals,youtubeChatBridge,kickChatBridge,twitchChatBridge}.ts` + `packages/api/src/routes/{twitchEventSub,patreonWebhook}.ts` + `packages/api/src/modules/streaming.ts` |
| Matrix appservice transactions endpoint (`PUT /_matrix/app/v1/transactions/:txnId`) | `packages/api/src/routes/matrixAppservice.ts` |
| Synapse appservice registration YAML stub | `deploy/matrix-appservice/registration.yaml` + `deploy/matrix-appservice/README.md` |
| In-process chat message hub (pub/sub) | `packages/api/src/services/chatMessageHub.ts` |
| IRC + OBS-WS connected-session observability | `listSessionsForUser` in `packages/api/src/integrations/{twitch-compat/ircServer,obs-ws-compat/server}.ts` + corresponding `/sessions` GET routes |
| Settings UIs (10 panels) | `apps/blackout-client/src/app/features/settings/{simulcast-destinations,kick-chat-bridges,twitch-chat-bridges,youtube-chat-bridges,obs-ws-passwords,twitch-irc-bot-tokens,discord-compat-webhooks,outbound-event-webhooks,widget-alerts,linked-accounts}/*` |
| Integrations health snapshot | `packages/api/src/services/integrationsHealth.ts` + `packages/api/src/routes/integrationsHealth.ts` |

#### C.2.2 Calendar items in flight or roadblocked

| Calendar item | Status | Reason / next step |
|---|---|---|
| TikTok Live chat ingress | Roadblocked | Webcast WS uses protobuf-encoded frames; requires a 3rd-party decoder (`zerodytrash/TikTok-Live-Connector` or equivalent). Not realistic without an `npm install` step in the dev sandbox. |
| Discord bot gateway shim (Spacebar fork) | Roadblocked | Requires forking `spacebarchat/spacebarchat` and swapping its persistence to a Matrix adapter. Multi-week-engineer batch. |
| Twitch Extensions iframe shim | Roadblocked | Needs proprietary `twitch-ext.min.js` + EBS JWT signing infra + extension-bundle install lifecycle. Requires legal review per AOG's risks section. |
| Discord Activities Embedded App SDK | Roadblocked | Closed Discord SDK; no public path. |
| Hono >= 4.13.0 bump (clear `osv-scanner.toml` allowlist for GHSA-69xw-7hcm-h432 + GHSA-9vqf-7f2p-gf9v) | Blocked on registry | The internal npm mirror used by the dev sandbox currently exposes Hono up to `4.12.18` only (`latest` dist-tag = `4.12.18`). The 4.13.x fixes are upstream on github.com/honojs/hono but have not landed in the mirror. Re-attempt this bump once the mirror catches up; until then the allowlist stays in place. |

> **FBM doc sync** — replacing `docs/AGGRESSIVE_OPERATIONS_GUIDE.md` on
> `blackmarket-coa/free-black-market` (`claude/expand-fbm-strategy-7Hpco`)
> with this file is tracked separately. It requires a PR on the FBM repo,
> which is outside the `multi-platform-extensions-2` branch's scope (the
> session executing this work has GitHub MCP access only to
> `blackmarket-coa/blackout`). Ops applies via:
> `cd <fbm-checkout> && git fetch && git switch claude/expand-fbm-strategy-7Hpco`
> then copy this file from blackout `develop` and commit.

### C.3 — Test inventory

Backend integration test files covering the compat surface (all green at `ef6ecce`):

| File | Tests |
|---|---|
| `packages/api/test/matrix-appservice.integration.test.ts` | 7 |
| `packages/api/test/matrix-appservice-registration.integration.test.ts` | 7 |
| `packages/api/test/se-overlay-shim-server.integration.test.ts` | 7 |
| `packages/api/test/companion-module-manifest.integration.test.ts` | 7 |
| `packages/api/test/obs-ws-input-mute.integration.test.ts` | 8 |
| `packages/api/test/outbound-message-router.integration.test.ts` | 8 |
| `packages/api/test/rtmp-fanout-worker.integration.test.ts` | 11 |
| `packages/api/test/youtube-chat-bridge.integration.test.ts` | 23 |
| `packages/api/test/patreon-webhook.integration.test.ts` | 14 |
| `packages/api/test/obs-ws-shim-server.integration.test.ts` | 18 |
| `packages/api/test/twitch-irc-shim-server.integration.test.ts` | 12 |
| `packages/api/test/twitch-irc-bot-tokens.integration.test.ts` | 9 |
| `packages/api/test/outbound-event-webhooks.integration.test.ts` | 14 |
| `packages/api/test/discord-compat-webhooks.integration.test.ts` | 5 |
| `packages/api/test/kick-chat-bridge.integration.test.ts` | 6 |

Frontend test files (vitest, all green):

- `apps/blackout-client/tests/unit/features/settings/{simulcast-destinations,kick-chat-bridges,obs-ws-passwords,twitch-irc-bot-tokens,discord-compat-webhooks,outbound-event-webhooks}/*.test.ts` — 12 files, ~50 cases on the compat-related panels.

Full compat regression command:

```sh
cd packages/api && pnpm exec tsx --test \
  test/matrix-appservice.integration.test.ts \
  test/outbound-message-router.integration.test.ts \
  test/rtmp-fanout-worker.integration.test.ts \
  test/youtube-chat-bridge.integration.test.ts \
  test/patreon-webhook.integration.test.ts \
  test/obs-ws-shim-server.integration.test.ts \
  test/twitch-irc-shim-server.integration.test.ts \
  test/twitch-irc-bot-tokens.integration.test.ts \
  test/outbound-event-webhooks.integration.test.ts \
  test/discord-compat-webhooks.integration.test.ts \
  test/kick-chat-bridge.integration.test.ts
```

---

## Master Progress Tracker — Blackout Extended Rows (additive)

> The original 10-row Blackout block in the
> [Master Progress Tracker Template](#MASTER-PROGRESS-TRACKER-TEMPLATE)
> earlier in this document is preserved verbatim. The rows below ARE
> ADDITIVE — they extend the tracker with shipped multi-platform
> compat-layer surfaces, mirroring the FBM-side
> "Extended Master Progress Tracker (additive rows)" pattern in
> Appendix-flavoured tables.

### Already-shipping rows (instrument and report on)

| System | Progress | Backing module(s) |
|---|---|---|
| Twitch chat ingress (IRC) | 0–100% | `packages/api/src/integrations/twitch/chatIngress.ts` |
| YouTube Live chat ingress | 0–100% | `packages/api/src/integrations/youtube/{api,chatBridge}.ts` |
| Kick chat ingress (Pusher v7) | 0–100% | `packages/api/src/integrations/kick/{chatIngress,pusherProtocol}.ts` |
| Twitch EventSub receiver | 0–100% | `packages/api/src/integrations/twitch/eventSub.ts` + `routes/twitchEventSub.ts` |
| Patreon webhook receiver | 0–100% | `routes/patreonWebhook.ts` + `integrations/patreon/webhookEvents.ts` |
| Streamlabs donation sync | 0–100% | `services/streamlabsDonationSync.ts` + `services/streamlabsDonationScheduler.ts` |
| Widget alerts SSE pipe (Streamlabs-shaped) | 0–100% | `routes/widgetAlerts.ts` + `services/widgetBus.ts` |
| StreamElements OverlayWS compat (faithful socket.io shim) | 0–100% | `integrations/se-overlay-compat/server.ts` + `integrations/widgets/seOverlayShape.ts` |
| Linked accounts (5 OAuth providers) | 0–100% | `services/linkedAccounts.ts` + `services/oauthProviders.ts` |
| Outbound chat router (Twitch IRC + YouTube liveChat) | 0–100% | `services/outboundMessageRouter.ts` |
| Simulcast destinations CRUD (AES-GCM at rest) | 0–100% | `services/simulcastDestinations.ts` + migration `014` |
| RTMP fan-out worker (ffmpeg supervisor + auto-restart) | 0–100% | `services/rtmpFanoutWorker.ts` + `routes/rtmpFanout.ts` |
| RTMP fan-out SSE status pipe | 0–100% | `routes/rtmpFanout.ts` `/stream` + worker `subscribeStatusForUser` |
| Twitch IRC bot shim — protocol layer | 0–100% | `integrations/twitch-compat/ircServerProtocol.ts` |
| Twitch IRC bot shim — WS server (multi-platform JOIN) | 0–100% | `integrations/twitch-compat/ircServer.ts` |
| Twitch IRC bot tokens (sha256-hashed bearer secrets) | 0–100% | `services/twitchIrcBotTokens.ts` + `routes/twitchIrcBotTokens.ts` + migration `018` |
| Bot PRIVMSG → real Twitch IRC outbound | 0–100% | `integrations/twitch-compat/ircServer.ts` `privmsg` case |
| OBS-WebSocket v5 server — protocol layer | 0–100% | `integrations/obs-ws-compat/protocol.ts` |
| OBS-WebSocket v5 server — WS server + auth | 0–100% | `integrations/obs-ws-compat/server.ts` |
| OBS-WS request matrix (Get/Set Stream + Scenes + Stats + BroadcastCustomEvent) | 0–100% | `dispatchRequest` in `obs-ws-compat/protocol.ts` + `defaultStreamCommands` in server |
| OBS-WS SetInputMute / GetInputMute / ToggleInputMute → LiveKit admin mute (hardcoded Mic/Microphone/Desktop Audio) | 0–100% | `dispatchRequest` cases in `obs-ws-compat/protocol.ts` + `services/livekitAdmin.ts` + `services/voiceRooms.ts` |
| OBS-WS push events (StreamStateChanged + `blackout.*`) | 0–100% | `notifyStreamStarted/Ended/notifyBlackoutEvent` in `obs-ws-compat/server.ts` |
| Stream Deck Companion module package (upstream-PR-ready) | 0–100% | `packages/companion-blackout/*` |
| OBS-WS passwords (AES-GCM at rest, multi-device) | 0–100% | `services/obsWsPasswords.ts` + `routes/obsWsPasswords.ts` + migration `019` |
| Discord-shape inbound webhooks | 0–100% | `services/discordCompatWebhooks.ts` + `routes/discordCompatWebhooks.ts` + migration `016` |
| Discord-shape outbound webhooks (10 event types, HMAC, AES-GCM) | 0–100% | `services/outboundEventWebhooks.ts` + `routes/outboundEventWebhooks.ts` + migration `017` |
| Outbound event sources wired (10 types: tip/follow/livestream/chat/sub/cheer/raid/streamgoal/SuperChat/patreon-pledge) | 0–100% | `services/{tips,streamGoals,outboundEventWebhooks}.ts` + chat bridges + `routes/{twitchEventSub,patreonWebhook}.ts` + `modules/streaming.ts` |
| Matrix appservice transactions endpoint | 0–100% | `routes/matrixAppservice.ts` |
| Synapse appservice registration YAML stub | 0–100% | `deploy/matrix-appservice/registration.yaml` |
| Chat message hub (in-process pub/sub) | 0–100% | `services/chatMessageHub.ts` |
| IRC + OBS-WS connected-session observability | 0–100% | `integrations/{twitch-compat/ircServer,obs-ws-compat/server}.ts` `listSessionsForUser` |
| Settings UIs (10 panels) | 0–100% | `apps/blackout-client/src/app/features/settings/{simulcast-destinations,kick-chat-bridges,twitch-chat-bridges,youtube-chat-bridges,obs-ws-passwords,twitch-irc-bot-tokens,discord-compat-webhooks,outbound-event-webhooks,widget-alerts,linked-accounts}/*` |
| Integrations health snapshot | 0–100% | `services/integrationsHealth.ts` + `routes/integrationsHealth.ts` |

### Roadblocked / not yet shipped rows (build & track)

| System | Progress | Status |
|---|---|---|
| TikTok Live chat ingress | 0% | Roadblocked: protobuf-encoded WS; needs a 3rd-party decoder (`zerodytrash/TikTok-Live-Connector` or equivalent) |
| Discord bot gateway shim (Spacebar fork) | 0% | Roadblocked: requires forking `spacebarchat/spacebarchat` |
| Twitch Extensions iframe shim | 0% | Roadblocked: proprietary `twitch-ext.min.js` + EBS JWT infra + legal review |
| Discord Activities Embedded App SDK | 0% | Roadblocked: closed Discord SDK |

---
