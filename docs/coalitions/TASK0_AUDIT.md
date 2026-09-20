# Coalitions network — Task 0 audit

Audit of what already exists across Blackout, FreeBlackMarket (FBM), Blackstar and
Black Mask before building the Coalitions network that replaces Blackout's friends
list. Sixteen audit dimensions were read file-by-file (thirteen by independent
readers, three directly); every claim below carries a file path. Where a later
task depends on a decision made here, the decision is recorded in §15.

## 1. Executive summary

-   **The friends list is client-only.** It lives in Matrix account data
    (`co.bmc.friends`) plus a custom `co.bmc.friend_request` event in the 1:1 DM room.
    No server table stores a friend edge; the server's only relationship primitive
    is the Circle follow graph (`circle_edges`, no approval handshake). A one-shot
    hydrator already migrates friends into Circle follows, but every Friends UI
    surface is still live.
-   **The existing "Coalition" hub is not an entity.** There is no `coalitions` table;
    the ~20 `coalition_*` tables are keyed by `canopy_id` (a Matrix Space id) and
    `den_id` (a room id). The word is already overloaded at least seven ways
    (canopy subscription tier, den type, plugin scope, bounty scope, FBM
    entitlement `CoalitionMembership`, glossary, docs). The glossary definition,
    "a team or org structure spanning members across canopies", describes the
    NEW feature, not the hub.
-   **Matrix Spaces fit, as a mirror.** A Canopy already _is_ a Space; the API bot
    can create Spaces, write state, set power levels and force-join users. But no
    API route authorises anything from Matrix power levels today, the appservice
    that would observe membership is not deployed, and tests run with no Matrix.
    So Coalitions are Postgres-authoritative with a best-effort Space mirror.
-   **Boost means three things** (recurring Community Boost pledges = money; the
    FBM-driven `co.bmc.boost` hype-train state event; Circle "relay" copy), none of
    which is a per-member cap or a coalition pool. Surge is a per-project 36h
    record opened by an opt-in hourly scheduler; feed lift is a read-time momentum
    term.
-   **Money never touches a processor in Blackout.** Every monetary row is a
    pending tip with a 3% split; capture happens only when FBM's `purchase.succeeded`
    webhook echoes `metadata.tipId`. Tips, gifts, aid pools and project support
    never open the FBM checkout session — the money leg is missing today (a
    pre-existing blocker). Moov and Helcim do not exist in any repo; FBM's rails
    are Stripe (cards, ACH) and Stellar (USDC + Merkle anchoring).
-   **3% is a default, not an invariant, in FBM.** Vendor plans lower it to
    2.5/2/1.5%; Blackout hard-codes 300 bps for display. Coalition flows must pin
    the flat rate explicitly (done in Task 2).
    _Superseded._ The finding is right, but pinning was the wrong response to it:
    it made Blackout display 3% while FBM charged a plan-holder less. 300 bps is
    now the standard rate and the ceiling, quoted per listing from FBM and
    refused if it comes back higher. See ECOSYSTEM_WIRING.md, "The money
    invariant".
-   **KARMA has one award API** (`recordXpEvent`) and one canonical log
    (`karma_event`). No inbound path lets Blackout award XP; the tier ladder is
    Seedling/Sprout/Root/Canopy/Ancestor — the six-rung
    Seedling/Cultivator/Griot/Steward/Elder/Ancestor ladder named in the brief does
    not exist and FBM's own audit rejects it. `steward` already exists as a
    coalition governance _role_ key with Synapse PL 50.
-   **Group scaffolds exist but are unconnected**: vendor-quest `quest_collective`
    (only Q11/Q12 are collective), the dead `collective-quest` boss module,
    `collective-campaign` (single vendor), and `cooperative`, which FBM already
    labels "coalition".
-   **Blackstar's reverse auction, batch aggregation and micro-depots are prose
    only.** Bids are one flat amount per node, awarded manually by the listing
    creator; FBM-originated listings are owned by a service account, and nothing
    maps a node to a coalition or a person.
-   **connect.js is a dependency-free IIFE** with SRI pinning, per-seller
    publishable keys, origin allow-lists and plan-scaled rate limits. Its "modal"
    checkout iframes the storefront cart; the only embed-safe checkout is FBM's
    hosted Blackout checkout page with a postMessage protocol.

## 2. Friends list today

Data model and primitives (`apps/blackout-client/src/app/features/friends/`):

| Piece           | Where                                                                                                      | Notes                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Own view        | `friendsModel.ts:9-19` account data `co.bmc.friends` `{friends[], outgoing[]}`                             | written via `mx.setAccountData` (`useFriends.ts:17-31`)                                                                   |
| Handshake       | `friendActions.ts:47-59,66-89` custom event `co.bmc.friend_request {action}` in the DM room                | request = DM invite; every DM invite reads as a request (`useFriendInbox.ts:56-66`)                                       |
| DM creation     | `friendActions.ts:33-45` `ensureDmRoom`                                                                    | duplicated by `profile/useProfileActions.ts:17-39`; imported by `navigation/QuickSwitcher.tsx:5`                          |
| Server traces   | `member_profiles.is_friend` (client-supplied bool, `modules/profile.ts:64-72`), `profile.topFriends` JSONB | `viewerIsFriend` wall gate is sourced from the owner's stored bool (`profile/routes.ts:66-80`) — semantically wrong today |
| Successor graph | `circle_edges` (`085_circle_and_relays.up.sql:18-30`), `/v1/circle` + `/v1/follows` alias                  | one-way follows, "mutual" derived on read; migration `CircleMigrationHydrator.tsx` → `friendsToCircle.ts`                 |

Surfaces that render Friends: `ProfilePage.tsx:171-174` (Top friends grid),
`state/canopy.ts:8-35` + `CanopyHubView.tsx:8,13,56,67,97` (hub tab and badge),
`CanopyMemberPanel.tsx:9,198,250-264` (Friends dialog), `ConnectedProfileModal.tsx:25-43`

-   `ProfileModal.tsx:210-225` ("Add Friend"), wall/DM privacy literals `'friends'`
    (persisted in profile JSONB and localStorage — keep the literal, relabel).

Replacement list: the four surfaces above, `TopFriendsGrid.tsx`, `FriendsPanel/Dialog/Tab`,
`canopyTabGuides.tsx`, tests under `tests/unit/features/{friends,canopy,profile}`; keep
`friendsModel.ts` exports alive for the Circle hydrator; relocate `ensureDmRoom`.

## 3. Existing "Coalition" hub and the naming collision

-   No `coalitions` table and no `coalition_id` on any hub table except the free-form
    `coalition_kit_manifest_applications.coalition_id` (`031_coalition_kit_manifests.up.sql`).
-   Identity keys: `canopy_id` for needs/projects/resources/feed, `den_id` for
    tasks/events/aid posts/rings (`core/coalition/projects.ts:36-40`,
    `054_coalition_needs.up.sql`, `033_coalition_tasks.up.sql`). Rings, events, pins and
    surges are server-global (`coalitionStore.ts:91-154`, `routes/coalition.ts:863-865`).
-   Enablement is a per-den `co.bmc.coalition` state event (`core/coalition/events.ts`).
-   Boost: `community_boost_pledges` (199–100 000 cents, one active per community and
    pledger, level 0–3 from counts 2/7/14 — `communityBoosts.ts:12-20,95-145`);
    `co.bmc.boost` hype-train state event written by FBM (`fbmMatrixBridge/boost.ts`);
    Circle relay product copy (`relayStore.ts:1-12`). None touches a hub table.
-   Surge: `coalition_surges` (`071_coalition_surge_notifications.up.sql:12-30`),
    `detectSurge` in `core/coalition/support.ts:97-142` (≥3 supports in 24h and
    factor ≥0.66, 36h window), scheduler off unless `BLACKOUT_COALITION_SURGE_ENABLED=1`
    (`coalitionSurgeScheduler.ts:11-40`). Feed lift is momentum weight 0.2
    (`core/coalition/feed.ts:107-113,170-176`).
-   Milestones: JSONB on `coalition_projects`, stamped on tip capture, broadcast as
    `coalition_notifications` rows + best-effort Matrix post (`coalitionProjectSupport.ts:92-134`).
-   Tipping: pending `tips` row with feeBps 300 (`core/marketplace/fees.ts:17-23`),
    captured only via FBM webhook (`marketplaceWebhook.ts:180-203`); project support =
    tip to `project.leadId` with `contextKind 'coalition_project'` (`routes/coalition.ts:817-858`).
-   FBM's entitlements contract already defines `CoalitionMembership`/`GovernanceRole`
    keyed by `coalitionId` (`integrations/fbm/entitlementsContract.ts:83-118`); FBM's
    resolver returns `[]` (`entitlement/service.ts:863-872`).

**Decision (a-variant, recorded in §15):** the hub becomes a capability _inside_ a
Coalition rather than the other way round. A Coalition owns a Matrix Space; the hub
already keys its data by Space id (`canopy_id`), so a coalition's needs, projects and
feed attach without a schema retrofit. Code namespaces stay: hub = `/v1/coalition`,
`co.bmc.coalition`, `features/coalition`; network = `/v1/coalitions`,
`co.bmc.coalition.space`, `features/coalitions`. UI copy for the hub is relabelled
"Commons"; the glossary entry for "coalition" now describes the network.

## 4. Matrix Spaces fit

Primitives that exist (`packages/api/src/integrations/matrix-client.ts`):
`createRoom` with `creationContent {type:'m.space'}`, `powerLevelOverride`, `initialState`
and a REQUIRED `encrypted` flag (243-338); `inviteToRoom` (483), `kickFromRoom` (518),
`adminJoinUserToRoom` via `/_synapse/admin/v1/join` (569), `getStateEvent`/`sendStateEvent`
(928, 996). Server-side Space provisioning already happens in
`fbmMatrixBridge/vendorRooms.ts:75-125` and `scripts/provisionContributorRooms.ts:250-315`;
power levels are read-merge-written in `fbmAclSync/index.ts:114-143`.

Constraints found:

-   No route authorises from power levels; ring routes use `ring_memberships`
    (`core/coalition/coalitionRing.ts:83-90`, `routes/coalition.ts:1345-1461`).
-   The bot can only read/write state in rooms it has joined; user-created Spaces
    require an invite + force-join (`routes/matrix.ts:7-22`, `invitations.ts:103-128`).
-   The appservice registration is not in the deployed Synapse template
    (`deploy/docker/blackout-backend/synapse/homeserver.yaml.template:34-42`), so the API
    never sees `m.room.member` changes.
-   No knock-request UI exists in the client; the existing approval pattern is
    Postgres request rows admitted via force-join (`ring_invitations`, `invitations.ts:230-290`).
-   Ids: JWT `sub` is a Blackout UUID, Matrix ids are `@username:domain`
    (`services/userIdentity.ts`).

**Architecture chosen (implemented in Task 1):** hybrid. `coalitions` and
`coalition_memberships` rows are authoritative; the API bot creates the Space
(plaintext, `type: m.space`, founder PL 100), stamps `co.bmc.coalition.space`,
maps `open`→`public` and `approval`→`invite` join rules, and mirrors roles as
power levels (founder 100, steward 50, griot 25, member 0) — all best-effort in
`services/coalitionSpaces.ts`. Join requests are a Postgres queue; approval
triggers invite-or-force-join.

## 5. KARMA / XP

-   Award API: `ProgressionModuleService.recordXpEvent({customer_id, role: Stance,
amount, reason, source_module?, source_id?, metadata?})` (`progression/service.ts:102-150`);
    Stances are producer|consumer|investor|coalition|creator (`stance.ts:423-434`).
-   Canonical log: `karma_event` with partial-unique `(source_module, source_id)`
    and a closed `KARMA_SOURCE_MODULES` registry (`hawala-ledger/karma.ts:33-43`);
    `xp_event` itself has NO unique index (`Migration20260601CreateProgression.ts:343-345`),
    so an external retry would double-award unless pre-checked.
-   Ladder: `GROWER_TIERS` Seedling 0 / Sprout 50 / Root 200 / Canopy 500 / Ancestor 1500
    (`grower-karma.ts:211-227`), mirrored in `packages/bmc-portal-kit/src/tiers.ts` with a
    parity test. Cultivator/Griot/Steward/Elder are not tiers anywhere
    (`docs/TRUST_LANDSCAPE_AUDIT.md:177-183`).
-   Money coupling: KARMA affects only the grower payout split, and even that is
    read from a per-node constant in `grower-payout.ts:184`; platform commission
    comes from vendor plans, never KARMA (`shared/platform-fee.ts`); the
    XP→commission privilege was deliberately deleted (`thresholds.ts:47-63`).
-   Legal text, verbatim: "The brief requires that KARMA/XP and capital stay
    structurally separate, citing the legal exposure of gamification tied to
    monetary value." (`docs/TRANSMUTATION_STRATEGY.md:349-351`) and "Reputation and
    capital are required to stay structurally separate…" (`thresholds.ts:47-63`).
-   No inbound path: every `/v1/integrations/blackout/entitlements/*` operation is a
    read (`docs/contracts/entitlements.yaml:52-223`).

Coalition awards (Task 4) are flat, never scaled by money, never unlock commission
or offering access, so they do not trigger the legal-review requirement.

## 6. Quest engine and group scaffolds (FBM)

-   Vendor Quest Engine: 15 definitions (not 13) in four categories; only Q11
    `coop-formation` and Q12 `land-pooling` are `type: "collective"`
    (`vendor-quest/definitions/index.ts:26-46`). Collective evaluation aggregates
    consenting members' substrates (`service.ts:273-308`), gated by
    `quest_member_consent`; routes `/vendor/quests/collective*` are complete; join
    admits any seller who knows the id (`collective/[id]/join/route.ts:14-23`).
-   `collective-quest` (boss/thermometer) has no writer and `verified:false` on its
    only contribute route — dead scaffolding (`store/collective-quest/quests/[id]/contribute/route.ts:33-41`).
-   `collective-campaign` is single-vendor all-or-nothing crowdfunding behind
    `FBM_CAMPAIGN_ESCROW_LIVE`; MICRO_INVESTOR is securities-gated.
-   `cooperative` / `cooperative_member` (roles ADMIN|COORDINATOR|PRODUCER|MEMBER) is
    what FBM already calls the coalition (`demand-post.ts:87-90`, `launch-product/steps/attach-coalition-listing.ts`),
    but `producer_id` receives a store customer actor id on the join route and a
    producer id on the launch path (`store/cooperatives/[handle]/join/route.ts:16-36` vs
    `v1/seller/launches/route.ts:185-210`).
-   1099-B: appears only in `docs/COMMERCE_ROADMAP.md:48,411-414` as an unrecorded gate;
    the barter module carries no tax flag. Goods drives are flagged for the same
    review in §15.

## 7. Order cycles and collective storefront (FBM)

Open-Food-Network clone: `order_cycle.coordinator_seller_id` NOT NULL,
`order_cycle_seller` (coordinator|producer|hub), `order_cycle_exchange`,
`order_cycle_product`, `order_cycle_sale` ledger (`modules/order-cycle/models/*`).
Nothing writes `order_cycle_seller` today although authorisation and the store
`seller_id` filter read it (`service.ts:519-545`, `vendor/order-cycles/_access.ts:40-87`).
No store endpoint lists products for a set of sellers; `/store/vendors/:handle`
uses a `{'seller.id': id}` graph filter (`store/vendors/[handle]/route.ts:206-228`).
Minimal extension: nullable `coalition_id` on `order_cycle`, a route that
materialises seller participation for members, a coalition filter on
`/store/order-cycles`, and a members' catalogue endpoint.

## 8. Blackstar

Implemented: shipment board with guarded lifecycle (`ShipmentBoardListing.php:119-156`),
first-claim and bid policies with a poster-only `/award` (`ShipmentBoardListingController.php:167-226`),
sequenced legs (`ShipmentLegProgressionService.php`), node tenancy + attestation,
constraint-only eligibility (`ShipmentEligibilityService.php:12-133`), two-way
timestamped-HMAC bridge with receipts and dead-letters. Doc-only: reverse auction
(`network-advantage-engine.md:102-110`), batch aggregation (§2), micro-depots (§5).
Gaps for coalition drives: no audience/membership predicate, no node↔coalition
mapping, FBM hard-codes `claim_policy 'first_claim'`
(`blackstar-fulfillment-provider/service.ts:99-107`), awarding authority is the
FBM service account, session-only auth guard, manual retries.

## 9. connect.js

Source `storefront/public/connect.js` (v2.0.0, frozen copy under `v2.0.0/`, SRI hash in
`backend/src/shared/website-config.ts:81-98`, drift test `connect-sri.unit.spec.ts`).
Keys: `pk_live_` hashed SHA-256 in `vendor_embed_key`, plan-gated, origin checked
against `seller_metadata.connect_domains` (`api/middlewares/embed-key.ts:51-141`);
rate limits per key (plan-scaled) and per IP under `/store/embed/**`. "Two modes"
= SDK `redirect|modal` plus product-level Connect/Launch. Vendorless precedent:
`demand-pools` kind (`connect.js:1084-1093`). Embed-safe checkout exists only at
`/v1/integrations/blackout/commerce/checkout/sessions/:token/page?embed=1` with
`postMessage {source:'fbm-checkout'}` (`page/route.ts:666-681,790-805`). Tiers
"Seed/Root/Canopy" do not exist; plans are free/starter/pro/scale.

## 10. Payments path for a coalition drive

Route → service → FBM → ledger, as it must run:

1. Blackout `createTip({contextKind:'coalition_drive'})` computes gross/fee/net with
   `computePlatformCommission` at 300 bps (`core/marketplace/fees.ts:84-105`).
   _Superseded:_ the rate is now quoted from FBM per listing and passed as that
   function's third argument, with 300 bps as the default and the ceiling.
2. Blackout opens `provider.createCheckoutSession({listingId, idempotencyKey:'tip:<id>',
metadata:{tipId}})` — the leg creator subs already use (`routes/creatorSubs.ts:137-181`)
   and tips never did.
3. FBM hosted checkout → `order.placed` → `emit-blackout-order-placed` echoes
   `metadata.tipId` on `purchase.succeeded`; `hawala-order-payment` posts
   PURCHASE/COMMISSION/TRANSFER legs via `createTransfer` (Posture A guard).
4. Blackout `dispatchMonetizationEvent` → `captureTip` → campaign `raisedCents`.

Known caveats: FBM checkout needs a PUBLISHED fixed-price listing (no amount
field), and card-paid orders may not fund the hawala USER_WALLET, so the COMMISSION
leg can be skipped silently (`hawala-order-payment.ts:363-366`). Both are pre-existing.

## 11. External connections and cross-posting

| Platform                                | Exists                                           | Auth                                     | Storage                                          | Inbound                        |
| --------------------------------------- | ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------ | ------------------------------ |
| Twitch / YouTube chat                   | say via user OAuth                               | per-user PKCE (`_oauth/providerFlow.ts`) | `linked_accounts` AES-256-GCM via `secretBox.ts` | EventSub HMAC, WS, polls       |
| Discord                                 | outbound webhooks (URL+HMAC); mautrix appservice | shared bot in deploy env                 | webhook secret via secretBox                     | compat webhooks (token in URL) |
| X, Bluesky, Mastodon, Instagram, TikTok | **none**                                         | —                                        | —                                                | —                              |

No moderation queue exists for inbound content; bridges write straight to Matrix
(`twitchChatBridge.ts:145-165`). The one review-queue shape is `community_assets`
(`086_community_assets.up.sql`, `routes/communityAssets.ts`). Rate limiting is
`createRateLimit` presets; no generic per-user cooldown helper. External-author
display convention is `m.blackout.origin` with body `[twitch] Name: …`
(`integrations/twitch/chatBridge.ts:88-154`); the client renders no badge.

## 12. Trust gating

The open trust-critical gate is BO-1 (key-backup DecryptionError, `KNOWN_ISSUES.md:32-69`),
named in `TRANSMUTATION_NOTES.md:174-187` as the gate for anything routing trust
through Blackout, with public no-confidentiality surfaces exempt. The 2026-07
pre-launch audit is NO-GO with counsel review, SOPS ceremony and an E2E+load run
still deferred. Feature-flag convention: API env accessors `=== '1' || 'true'`,
off by default, ack webhooks while dark (`fbmMatrixBridge/config.ts`); client
`FeatureFlags` + `BLACKOUT_<NAME>` overrides, never in `USER_TOGGLEABLE_FLAGS`.
Two-way external sync therefore ships dark behind
`BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED` with every inbound row quarantined.

**Superseded 2026-09-20.** Inbound sync is not sequenced behind BO-1 after
all: it moves public text between public platforms and makes no
confidentiality claim, which is exactly the exemption the paragraph above
names. Its actual preconditions, the moderation state machine, the platform
takedown route and the retention windows are in `ECOSYSTEM_WIRING.md`
§External sync sequencing; and since a coalition may choose the `open` reply
policy, "every inbound row quarantined" is no longer literally true.

## 13. Black Mask

`/home/user/blackmask` is the Bitwarden clients fork for the privacy product. Its only
references to Blackout/coalitions are prose in `README.md`, `CONSOLIDATION.md`,
`docs/black-mask/README.md` and `engineering-execution-plan.md`; no code, contract or
config depends on friends, coalitions, KARMA or connect.js. **No change required.**

## 14. Conventions cheat-sheet

Blackout API: Hono routers in `packages/api/src/routes/*.ts` mounted in `src/index.ts`
(`app.route(\`${root}/name\`, router)`); `requireUser(c)`returns a Response on failure;`readJsonBody(c, zodSchema)`; error shape `{code, message}`. Persistence is the
`InMemoryDb` Map store (`src/db/store.ts`) with Postgres write-through registered in
`src/db/pgDescriptors.ts` (`ALL_MAP_NAMES`, `OVERRIDES`, `MUTATOR_SPECS`); new tables need
`NNN_name.up.sql`+`.down.sql`, a record type in `src/db/types.ts`, Map + methods +
load/snapshot lines in `store.ts`, descriptor entries, and the pinned count in
`test/postgres-store.integration.test.ts`. Ids are TEXT, no cross-table FKs,
upsert-only rows. Tests: `pnpm --filter @blackout/api typecheck`,
`npx tsx --test --test-force-exit test/<file>.integration.test.ts`(memory store,`signJwt(sub, username, ttl)` for auth).

Blackout client: `features/<name>/{manifest.ts,routes.ts,nav.ts,panels.ts,index.ts}`,
registered in `core/features/coreModules.ts` with a `FeatureFlags` key and
`BLACKOUT_<NAME>` overrides in `featureFlags.ts`; API calls through
`createAuthorizedApiClient(readBlackoutApiToken())`; styling inline `CSSProperties`
with theme vars; vitest under `tests/unit/features/<feature>/`;
`pnpm --filter @blackout/client typecheck`.

FBM: Medusa v2 modules `backend/src/modules/<m>/{models,migrations,service.ts,index.ts}`,
file routes under `backend/src/api/**/route.ts`, hand-written MikroORM migrations,
unit tests `__tests__/*.unit.spec.ts` (`corepack pnpm typecheck`, `TEST_TYPE=unit … jest`).
Blackstar: Laravel 10 under `api/`, feature tests with in-memory SQLite (`php vendor/bin/phpunit`).

## 15. Decision log

Resolved by the audit (implemented unless noted):

1. Naming: hub keeps code ids and is relabelled "Commons"; the network is `coalitions`
   (plural) everywhere. Reversible copy-only change on the hub.
2. Architecture: Postgres-authoritative membership/roles with a bot-provisioned
   Matrix Space mirror (§4).
3. Roles: `founder` / `steward` / `griot` / `member`, PL 100/50/25/0; `steward` matches
   FBM's existing governance key; `griot` is new and is added to FBM's role table.
4. Join gate: `min_tier_to_join` uses FBM's five-rung ladder keys; unknown tier
   resolves to `seedling` (fails closed for any gate above seedling).
5. Campaign approval default: campaigns from members without `campaigns.launch`
   always wait for a steward; stewards' own campaigns go live unless they opt in.
6. Coalition Boost draws from a **separate pool**: one boost per member per
   campaign per UTC day, with a per-coalition daily allowance
   (`COALITION_BOOST_DAILY_ALLOWANCE`, default 3). It never reads Community Boost
   pledges or Circle relays, so nothing is double-counted. Amplification reuses the
   Surge acceleration formula.
7. Drives settle through tips → FBM checkout → webhook at a pinned 300 bps; goods
   drives reuse the same Campaign row (`type: goods_drive`) with an FBM order cycle.
8. Two-way sync ships dark behind a kill switch with a quarantine queue; external
   authors are display text only.
9. Black Mask: untouched.

Needs a human call (flagged, proceeding under the stated assumption):

-   **Hub relabel word** — "Commons" was chosen; "Mutual Aid" is the alternative.
-   **Tier ladder** — the brief's six-rung ladder does not exist; the audit reuses
    FBM's five rungs rather than creating a fourth ladder.
-   **Adinkra iconography** — `LeadershipGlyph.tsx:19-22` records that the design brief
    rejects Adinkra as decoration; no Adinkra assets were added.
-   **Brand tokens** — the shipped accent is neonLeaf `#D7FF3F`; `#1ABC9C` survives only
    as a CSS fallback. New UI uses theme vars with that fallback, not new tokens.
-   **1099-B** — goods drives that touch barter/exchange must join the same unrecorded
    legal gate (`COMMERCE_ROADMAP.md:411-414`); this audit does not clear it.
-   **Card-funded ledger legs** — verify that Stripe-card orders post the COMMISSION
    leg before relying on FBM settlement figures for coalition impact stats.

## 16. Build map

-   Blackout API: `packages/core/src/coalition/coalitionNetwork.ts`; migration
    `091_coalitions_network`; `services/coalitionNetworkStore.ts`, `coalitionSpaces.ts`,
    `coalitionTierGate.ts`, `coalitionDrives.ts` (Task 2), `coalitionSync.ts` (Task 3),
    `coalitionKarmaBridge.ts` (Task 4); `routes/coalitions.ts`; tests
    `test/coalitions-*.integration.test.ts`.
-   Blackout client: `features/coalitions/*`, `profile/ProfileCoalitions.tsx`, canopy hub
    tab swap, member-panel and profile-modal actions, `featureFlags.ts`, `coreModules.ts`,
    hub relabel in `features/coalition/{nav,panels}.ts` and `blackoutTerminology.ts`.
-   FBM: `modules/cooperative` (`blackout_coalition_id`), coalition products endpoint,
    `order_cycle.coalition_id` + attach route, collective quest definition, reputation
    events route + `CoalitionKarmaService`, `griot` governance role, embed key owner type
    and `drive` SDK kind (connect.js 2.1.0).
-   Blackstar: `coalition_ref`/`drive_ref` on listings, `node_coalition_memberships`,
    eligibility predicate, bid ordering, award authority, batch claim route.
