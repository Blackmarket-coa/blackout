# Competitor Depth Analysis — Repo Verification (July 2026)

**Status:** Completed audit. This document checks the July 2026 "Blackout vs. Discord & TikTok:
Corrected, Depth-Focused Competitive Gap Analysis" against the actual code in this repository,
claim by claim. The analysis was written from founder screenshots plus publicly visible docs;
this repo is the ground truth it could not see.

**Verdict vocabulary**

| Verdict | Meaning |
| --- | --- |
| SHIPPED-WITH-DATA | UI exists and is wired to a real backend (Matrix events or `/v1/*` API), with real data flow |
| SHELL-ONLY | UI element renders but has no real logic/data behind it |
| ABSENT | Neither UI nor backend exists in code |
| DOC-ONLY | Exists only in planning/design documents, not in `apps/` or `packages/` source |

## TL;DR

The analysis is **directionally right**: the surfaces are real and shipped, the depth gaps are
real, and analytics is confirmed as the single biggest gap. But it contains **three factual
errors** that change its recommendations:

1. **The commerce backend is not MedusaJS/MercurJS.** There are zero code references to either.
   Commerce runs through a bespoke **FreeBlackMarket (FBM)** provider adapter with real HTTP
   calls and HMAC-verified webhooks; FBM is merchant-of-record and the only live provider.
2. **There is no "hawala ledger" in code** — it is a docs-only concept. Real money flows through
   FBM with a concrete 3% platform fee and a `pending → captured → refunded` tip lifecycle.
3. **Home feed ranking already exists and is not reverse-chronological.** Per-source scoring,
   a hot sort (`0.7·score + 0.3·recency`), and an interest-affinity boost are shipped. The
   analysis's "add light feed ranking" recommendation is roughly 70% done; only diversity caps
   are missing.

Two of its open questions resolve in Blackout's favor (Kits are a real, shipped provisioning
system; the Rewards credit ledger is real), and two against ("signals nearby" has no proximity
logic at all; ambient audio is a disabled no-op).

## Claim-by-claim verification

### A. Creator Hub shell

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Creator Hub dashboard exists | **SHIPPED-WITH-DATA** | `apps/blackout-client/src/app/features/streaming/` (manifest names it "Creator Hub", "the creator operating system"); mounted at `/streaming`, `/creator-hub` redirects there (`features/streaming/routes.ts`, `pages/paths.ts`) |
| Six tabs (Overview, Live, Replays, Clips, Kits, Listings) | **CONFIRMED — understated** | There are **12 tabs**: the six claimed plus Rewards, Splits, Broadcast, Connections, Bridges & Webhooks, Health (`app/state/streaming.ts` `STREAMING_TAB_LABELS`). Listings is gated behind the `creatorsListings` flag |
| Five Overview cards (Streaming, Short-form, Program, Storefront, Monetization) | **CONFIRMED — understated** | All five exist verbatim, plus `Community / Coalitions` and `Real-world / Events` (7 total). Cards are live-wired: `CreatorHubOverview.tsx` fetches `listStreams`, `fetchMyReferrals`, `fetchMyAmbassador`, `creatorSubsApi.listMySubscribers`, `fetchMyContent` and renders real counts |
| Bottom nav: Home, Creator Hub, Coalition, Coliseum, Community Market, Profile | **CONFIRMED** | `pages/shell/PrimaryNavBar.tsx`, `BottomTabBar.tsx`; "Community Market" label in `features/market/panels.ts` |

### B. Live / Replays

| Claim / question | Verdict | Evidence |
| --- | --- | --- |
| Streaming backend real (Owncast) | **SHIPPED-WITH-DATA** (control plane) | `packages/api/src/modules/streaming.ts` (`/v1/streaming`): stream CRUD, categories, visibility gating, moderation, revenue/goal endpoints. The Owncast adapter itself is a ~19-line config/key shim (`packages/api/src/integrations/owncast.ts`); viewer embeds `<origin>/embed/video` |
| Replays auto-recorded? | **No — pointer-only** | `/streams/:id/vods` returns persisted sessions carrying a **client-supplied** `replayPointer`. No in-repo recording/transcoding pipeline exists. The analysis's Owncast-VOD-weakness intuition was correct |
| Live analytics (concurrents, watch time) | **ABSENT** | No viewer-count or watch-time telemetry anywhere in the streaming backend; `/revenue` and `/goal` aggregate money only |
| Multi-platform ingress/simulcast | **SHIPPED-WITH-DATA** | Real ffmpeg RTMP fan-out supervisor auto-started on go-live (`packages/api/src/services/rtmpFanoutWorker.ts`, 455 lines, with integration test); Twitch/YouTube/Kick chat bridges (`integrations/twitch/`, `youtube/`, `kick/`), Twitch EventSub manager, OBS-WebSocket compat server (`integrations/obs-ws-compat/`), Stream Deck module (`packages/companion-blackout/`), Twitch IRC shim, StreamElements-overlay compat, Streamlabs donation sync. This is a genuine strength, as the analysis said |
| Caveats | — | TikTok/Kick OAuth return 501 ("Coming soon"); `docs/audits/streaming_readiness_2026_05.md` records that several integration UIs were orphaned/decorative until the May 2026 fix |

### C. Clips

| Claim / question | Verdict | Evidence |
| --- | --- | --- |
| Clips surface exists | **SHIPPED (list/view)** | `features/streaming/sections/ClipsDirectory.tsx` + vertical reel `ClipViewer.tsx` |
| Editing (trim / auto-caption / vertical crop)? | **ABSENT** | `POST /v1/streaming/clips` accepts a clip by `mediaPointer` — clips are metadata records referencing external media. No trim, caption, or crop code; no capture-from-stream or clip-composer UI. The analysis's "highest-leverage depth question" resolves to *upload-by-pointer only* |

### D. Kits

| Claim / question | Verdict | Evidence |
| --- | --- | --- |
| What is a Kit? | **RESOLVED — SHIPPED-WITH-DATA** | A `CreatorKit` is an "installable preset that orients a new creator around a workflow" (`features/streaming/kits/kitCatalog.ts`). Its `KitApplySpec` carries `profile`, `dens[]`, `tiers[]`, `aidPools[]`; `applyKit.ts` one-click provisions them against real mutation clients (`createRoom`, `creatorSubsApi.createTier`, `aidPoolsApi.create`, profile merge) with confirm dialog and per-step results |
| Shareable/sellable? | **Partially** | Four built-in kits (Educator, Streamer, Organizer, Musician) plus **owned community template kits** merged from `ownedTemplateKitsAtom`. The "shareable preset" hypothesis is confirmed; a sales channel for kits is not evidenced |

### E. Rewards

| Claim / question | Verdict | Evidence |
| --- | --- | --- |
| Real credits ledger? | **SHIPPED-WITH-DATA** | `sections/RewardsSection.tsx`: ambassador tier with `commissionBps`, referral tracking (pending/attributed), active quests with working Claim (`completeQuest`), migration credits with real cent balances (`valueCents`) and Redeem |
| Creator-authored quests? | **ABSENT** | Quests come from `fetchActiveQuests` (platform-defined); no creator-authoring UI. The analysis's "more empowering than Discord" framing is aspirational until this exists |

### F. Listings / Storefront

| Claim / question | Verdict | Evidence |
| --- | --- | --- |
| Commerce backend MedusaJS v2 + MercurJS? | **WRONG — no such integration** | Zero code hits for `medusa`/`mercur`. The backend is Blackout's own **FreeBlackMarket** provider (`packages/api/src/integrations/marketplace/freeblackmarket.ts`): live catalog/checkout/seller-listing/onboarding calls, HMAC-SHA256 webhook verification with `timingSafeEqual`, embedded checkout, idempotency keys. FBM is merchant-of-record. Blamazon / MayhemMarketplaze / AntinAmazon are intentional throw-on-use shells (`KNOWN_LIMITATIONS.md`) |
| Listings CRUD real? | **SHIPPED-WITH-DATA** | `features/creators/CreatorListings.tsx` against `/v1/creator/*`: draft → publish → archive, payout-provider onboarding, entitlement kinds; FBM seller-dashboard listings sync in |
| Storefront analytics (views→sales)? | **ABSENT** | No view/impression/conversion metrics in `features/creators` |

### G. Earnings

| Claim / question | Verdict | Evidence |
| --- | --- | --- |
| Balance, pending vs paid, per-source breakdown? | **SHIPPED-WITH-DATA** | `features/monetization/components/CreatorEarningsDashboard.tsx`: tips gross/fee/net with captured-vs-pending, active subscribers + MRR, ad revenue paid vs pending payout, platform-fee-paid stat |
| Defined rev-share? | **Yes in code, not surfaced in UI** | `packages/core/src/marketplace/fees.ts`: FBM **300 bps (3%)**, weekly payout cadence; `computePlatformCommission()` is the single split for tips/subs/gifts/tickets/boosts/paywalls. TipButton confirmation copy cites the 3% fee. But no payout threshold/cadence/rev-share summary is shown to creators — the analysis's transparency recommendation stands |
| Hawala ledger? | **DOC-ONLY** | `hawala` appears only in design/ops docs, never in source. Tips are real USD cents with a `pending → captured → refunded` lifecycle driven by FBM webhooks (`packages/api/src/services/tips.ts`), idempotent by `fbmOrderId` |
| Subscriptions | **SHIPPED-WITH-DATA** | `services/creatorSubscriptions.ts`: tier CRUD ($1.99–$1,000), FBM entitlement registration, webhook-driven lifecycle, and `hasActiveCreatorSubscription()` gating `member_only` stream access in `modules/streaming.ts` |

### H. Home feed

| Claim / question | Verdict | Evidence |
| --- | --- | --- |
| Aggregated feed real? | **SHIPPED-WITH-DATA** | `features/home/HomeFeed.tsx` + `hooks/useUnifiedFeed.ts`: aggregates dens (Matrix rooms), statuses/wall posts (profile API), governance proposals (Matrix state events), streams, coalition, coliseum, marketplace (`/v1/*` JWT-authed API) via `Promise.allSettled` with per-source degradation. Greeting, time-of-day chip, composer, quick actions all confirmed verbatim |
| Ranking beyond chronological? | **SHIPPED — analysis wrong to assume absent** | `unifiedFeedModel.ts`: per-source scores (live streams 0.9+, coliseum = debate heat, dens = 0.6·recency + unread boost…), sorts `new` / `hot` (`0.7·score + 0.3·recency`) / `top`, plus `INTEREST_BOOST = 0.15` affinity from onboarding interest tags. Default following view sorts by pure score. **No diversity caps** — the one missing piece of the analysis's Stage-3 ranking rec |
| Discovery of non-followed content? | **SHIPPED** | Discover section / For-You segment surfaces non-followed streams, coalition, coliseum, marketplace ranked by score |
| "Signals nearby" proximity | **SHELL-ONLY** | The chip is `followingItems.length + discoverItems.length` — a count of loaded feed items. No geolocation code exists anywhere in the home feature; sidebar distances ("0.6 km") are labeled mock data (`context/contextMocks.ts`) |
| Ambient audio | **SHELL-ONLY** | `useAmbientSound.ts`: `AMBIENT_SOUND_URL = null`, button rendered disabled with "Ambient soundscape coming soon" |
| Swipe view | **SHIPPED-WITH-DATA** | `MobileSwipeFeed.tsx` at `/feed/`: scroll-snap vertical reel over the same unified feed, keyboard nav, a11y `role="feed"` |
| Feed search | **SHIPPED (shallow)** | Client-side case-insensitive substring filter over the ≤50 already-loaded items (`filterFeedByQuery`) — no search API |
| Per-post views/impressions | **ABSENT** | No view counts or impression events anywhere; only coarse UI telemetry (`homeFeedTelemetry.ts`: segment switches, sort changes, streaks) |

### I. Analytics (cross-cutting)

**The analysis's #1 finding is confirmed everywhere.** There is no creator-facing audience
analytics anywhere in the codebase: no per-post/per-clip views, no watch time, no concurrent
viewers, no follower-growth surface (a `follows.ts` service exists but no metrics on top of it),
no storefront conversion. What exists is ops-grade: a custom Prometheus exposition backend
(`packages/api/src/telemetry/metrics.ts`) with monetization counters (`tip_created_total`,
`creator_sub_*_total`), a domain-event bus with Discord-shape outbound webhooks, and
growth/attribution in `services/growth.ts`. The event plumbing to build creator analytics on is
partially in place; the aggregation and display layers are not. The richer "Analytics
Aggregator" lives only in `docs/architecture/CORE_COMMERCE_PLATFORM_ARCHITECTURE.md` (status:
Proposed).

## Corrected read on the analysis's recommendations

**Stage 2 (do first) — largely stands, with edits:**

1. *Minimal analytics layer* — *confirmed as the top gap.* The claim "you already emit the
   events; you need to aggregate and display them" is **half-true**: monetization events are
   emitted, but feed/stream *view* events are not emitted at all. Scope must include client-side
   impression/view event emission, not just aggregation.
2. *Make Earnings trustworthy* — **half-done.** Per-source breakdown, pending-vs-captured, and
   MRR already ship in `CreatorEarningsDashboard.tsx`; the 3% fee and weekly cadence exist as
   code constants (`fees.ts`). Remaining work is mostly *surfacing* — publish threshold/cadence/
   rev-share in the dashboard — plus whatever payout-history data FBM exposes. Smaller than the
   analysis assumed.
3. *Confirm what a Kit is* — **done; skip to "lean into it."** Kits are shipped one-click
   provisioning bundles plus owned community templates. The open product question is
   sellability, not definition.

**Stage 3 — reordered by what already exists:**

4. *Basic Clips editing* — confirmed absent; stands as written (trim + caption + vertical crop
   would beat Discord Clips).
5. *Light feed ranking* — **mostly done.** Scoring, hot/new/top sorts, and interest-affinity
   boost ship today. Remaining: a per-source diversity cap in `mergeAndRank`
   (`unifiedFeedModel.ts`) — days, not weeks.
6. *"Signals nearby" as discovery* — **bigger than the analysis assumed.** There is no
   proximity seed to grow: no geolocation code exists, the chip is an item count, and distances
   are mocks. Non-proximity discovery, however, already works (Discover/For-You). Treat this as
   a from-scratch, opt-in geo feature tied to Coalition use cases.

**Stage 4 (defer/avoid)** — unchanged, and the codebase agrees: nothing resembling an
interest-graph recommender or a media-processing pipeline exists, so the "avoid" guidance costs
nothing today.

**Additional finding the analysis missed:** the Creator Hub's back half — Splits, Broadcast,
Connections, Bridges & Webhooks, Health tabs — plus the Twitch/YouTube/Kick/OBS/Stream Deck
compat layer is substantially deeper than anything Discord or TikTok offer a multi-platform
streamer. This is a positioning asset the screenshots (and therefore the analysis) undersold.

## Sources

Verified by three parallel codebase sweeps plus direct file reads on 2026-07-10, at commit
`1b54749` on `develop`. Key files cited inline. Planning-doc context: `KNOWN_LIMITATIONS.md`,
`DISCORD_PARITY_BUILD_PLAN.md` (status banner 2026-05-27),
`docs/audits/streaming_readiness_2026_05.md`,
`docs/architecture/CORE_COMMERCE_PLATFORM_ARCHITECTURE.md` (Proposed),
`docs/14-stream-revenue-implementation-plan.md` (plan).
