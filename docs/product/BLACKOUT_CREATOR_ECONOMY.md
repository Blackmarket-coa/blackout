# Blackout creator economy: products, participation, and connected delivery

**Updated:** November 20, 2026

**Status:** Product requirements plus source-level wiring review. Code changes described below are proposed in the app-plan pull request; production checkout, fulfillment, and payouts have not been verified.

**Companions:** [App plan](BLACKOUT_APP_PLAN.md) · [Product authoring](../guides/creating-blackout-products.md) · [Marketplace architecture](../guides/marketplace-architecture.md) · [Agency and creator growth](BLACKOUT_AGENCY_COMMUNITY_CHARACTER_AND_CREATOR_GROWTH.md)

## 1. Product decisions

- AI personas are removed from the sellable product catalogue, seller templates, marketplace filters, demo offers, and new-sale routes. Do not reintroduce them as prompt packs, bots impersonating community members, or a recurring enhancement tier.
- Keep human participation and authorship central. Automation recipes and explicitly invoked workspace tools remain distinct from AI personas.
- Preserve historical records, purchases, and protocol decoding. Retirement is not permission to delete buyer records, rewrite migrations, or revoke unrelated entitlements. Known legacy persona listings cannot be republished or purchased through the updated Blackout catalogue/checkout routes. Upstream FBM catalogue retirement must also be verified, especially for old rows missing artifact-kind metadata.
- Native enhancements use one-time purchases. Hosted storage is a proposed recurring exception; other metered services require explicit terms. Existing creator-membership billing is a separate policy decision, not approval to restore recurring platform tiers.
- FBM owns checkout, payment processing, settlement, refunds, and trade records. Preserve processing-fees-first and flat 3% coalition commission policy; do not stack another Blackout commission on the same sale or change fees based on rank.
- Contribution rank, factual credibility, voting power, and contest outcomes cannot be purchased. Core encryption, account recovery, participation, reporting, and basic accessibility remain usable.

## 2. Revenue catalogue after persona removal

| Revenue family | Products or transactions | Evidence / delivery boundary |
| --- | --- | --- |
| Digital marketplace | Asset bundles, profile cosmetics, sound packs, stream assets, themes, declarative plugins, code plugins, community templates, automation recipes, privacy tools, vault items; ordinary digital downloads | Eleven sellable feature-artifact types plus the download preset. Creation/entitlement foundations exist; the production file handoff remains a blocker below. |
| Creator support | Tips and visual monetary gifts | Code exists; verify real capture and recipient settlement. |
| Paid creator access | Individual content unlocks, event tickets, defined community/cohort access | Access foundations exist; content linkage, delivery, and payment lifecycle need end-to-end verification. Recurring memberships remain an explicit policy choice. |
| Paid creative work | Commissions, bounties, workshops, custom deliverables | Bounty/reward code exists; broader commissioned-work and booking journeys are proposed. |
| Creator commerce | Products linked from content, attributable affiliate sales, collaborative releases, content licensing | Attribution and split-record foundations exist. Rights, agreements, actual order attribution, and settlement require validation. |
| Sponsorship and advertising | Disclosed sponsored content, shows, events, quests, learning activities, Discover placements, marketplace placements | Campaign/boost/ad-revenue accounting foundations exist; do not equate allocation records with a complete ad-sales/delivery system. |
| Community economics | Ticketed events, merchandise through FBM, project fundraising, community-funded storage/capacity, funded game objectives | Fundraising/boost/event primitives exist; specific commercial formats and fulfillment need implementation checks. |
| First-party enhancements | Character cosmetics, profile designer, video/publishing/broadcast tools, analytics, organizer/governance/host tools, strategy bench, quest builders, connectors, steganography utilities, advanced privacy workflows, vault organization | Candidate one-time products; do not sell an unlock until the stated capability works. Earned native-feature access is a separate acquisition path. |
| Storage and metered resources | Personal/community encrypted storage, creator archives, backups, replay retention; explicitly priced compute/delivery usage | Define capacity, duration, export, and renewal or prepaid limits. A software license does not include unlimited hosted resources. |
| Services, licenses, hardware | Migration, setup, custom integrations/plugins, branding, training, event production, deployment licenses, maintenance projects, nodes/hardware | Proposed service offerings; quote defined deliverables and responsibilities. |
| Voluntary support | Platform donations, eligible grants, institutional sponsorship | Funding routes, not permission to treat every community donation as platform revenue. |

First-party product sales, the agreed platform share of transaction fees, sponsorship, storage, and services can be platform revenue. Seller receipts, creator tips, sponsor-funded prizes, fundraising balances, and split payouts remain distinct from platform revenue. Referral rewards, earned points, and revenue splits are incentives/accounting mechanisms; they do not create revenue on their own.

## 3. Participation surfaces and prompts

The [Coalition game plan](BLACKOUT_COALITION_GAME_PLAN.md) extends this loop to original companion assets, cosmetics, reusable quest/learning packs, and commissioned community content. It defines contextual maker prompts and the required pack-manifest, licensing, review, delivery, entitlement, and installation contracts. Those game-specific editors and commercial integrations are planned; generic asset/download templates do not establish readiness. AI personas remain excluded.

The marketplace needs a creation loop as well as a buying loop. People should discover something manageable they can make, start with a relevant template, retain their work, and see what happened after publication.

Keep prompts contextual, short, optional, and tied to a working action. Show one relevant prompt or compact choice set rather than adding another navigation tab. No earnings guarantees, fabricated demand, forced onboarding purchases, or rewards for repetitive empty uploads.

| Surface / trigger | Suggested prompt | Destination and required context | Delivery state |
| --- | --- | --- | --- |
| Create launcher | Make something others can use | Validated download/asset template or guide composer | Shared prompt is wired to existing routes in this change. |
| Creator Hub / Studio | Package a useful file, design an asset pack, or share something you know | Same editors; existing dashboard remains the work entry | Shared prompt is wired in this change. |
| Marketplace browsing / empty search | Make something others can use | Same product wizard; do not imply an empty search is verified buyer demand | Shared prompt is wired in this change. |
| Own completed guide or article | Create a paid edition or companion resource | Owner-authorized source content → separate product draft; confirm content, rights, audience, and price | Required follow-up. Never automatically put a previously public article behind a paywall. |
| Own finished video or event | Package a recording, transcript, or resource pack | Confirm speaker/media rights and file availability; preserve original access rules | Required follow-up. |
| Own finished community workflow | Share a reusable template | Export only selected configuration, strip secrets/member data, preview before listing | Required follow-up. |
| Coalition need or explicit request | Help make the requested resource | Request/bounty ID, scope, acceptance criteria, budget, and supported deliverable | Required follow-up; use an actual request, not inferred urgency. |
| Coliseum conclusion | Turn your contribution into a guide, source collection, or asset | Contributor-owned material, source citations, media permissions, relevant topic context | Required follow-up; a crowd win is not proof of factual accuracy. |
| Published product | Manage your products; View product when published | Canonical local management route and provider/listing buyer address | Wizard success links are wired in this change. |
| Genuine sale or accepted contribution | See the result; choose a next project | Actual order/acceptance evidence and correct creator-owned metrics | Required follow-up; payment confirmation and payout must be distinguished. |

Direct product links preselect only supported template IDs; unknown or retired IDs return to the chooser. Guide links force the publishing overview even if another Creator Hub tab was saved. Feature flags hide prompts whose destination is disabled. The free-guide action is labeled separately from selling a product. No private text or files are carried in URL parameters.

Prompts are UI actions, not injected feed items: preserve chronological Circle/Reach ordering and human relay selection. Sponsored discovery remains disclosed and separate. Creators may share a published product through existing eligible public surfaces; a private den file never becomes public merely because someone sees a selling prompt.

## 4. The creation journey

1. Choose a small deliverable: download, asset pack, article, guide, video, template, or supported tool.
2. Start from a usable form/template, with a real draft and resumable progress as the target behavior.
3. Attach the actual deliverable, preview it, and confirm authorship/license and intended audience.
4. Select free publication, a paid product, or both as separate editions. Show price and fee terms before submission.
5. Connect the seller account and verify readiness for real sales. A payout-onboarding link alone is not proof of approval.
6. Save/submit for review and distinguish draft, pending review, published, rejected, and archived states.
7. Publish to supported audience surfaces with an owner-authorized product reference. A distribution row is not proof that a post was delivered.
8. Buyer previews, checks out, receives the correct entitlement/file/license, and can find it again in the purchase library.
9. Seller sees the order and actual settlement state. An eligible confirmed contribution can advance scoped reputation and rewards once.
10. Refunds, revoked access, disputed tasks, and failed delivery update the appropriate records without corrupting earned recognition or unrelated ownership.

Reward verified useful output and accepted work rather than listing count, time spent editing, or clicks. Recognize writing, design, captioning, translation, testing, curation, and coordination with attributable collaboration records and agreed splits. Audience size is not a prerequisite for creating or selling.

## 5. Wiring review and release blockers

| Handoff | Source evidence | What must be true before claiming it works |
| --- | --- | --- |
| Prompt → editor | `CreatorParticipationPrompt.tsx`, creator/streaming route adapters, `SellProductWizard.tsx`, `CreatorHubContent.tsx` | Enabled links open the intended template/composer, including unknown/retired ID fallback. |
| Product kind → form → API | `creatorArtifactMap.ts`, `sell/artifactFormRegistry.ts`, `packages/api/src/routes/creator.ts` | All eleven active kinds have matching form/category/entitlement mappings; persona create and republish are rejected. |
| Authoring → durable draft | Existing wizard local state and content/listing APIs | **Gap:** product wizard progress is currently component state, not durable autosave. Add owner-scoped draft persistence and safe resume before advertising it. |
| Product payload → production FBM | `freeblackmarket.ts#createCreatorListing`, [marketplace architecture](../guides/marketplace-architecture.md) | **Blocker:** real FBM creation currently sends metadata only. It drops artifact payload/upload fields; stub delivery does not prove that authored production bytes are uploaded or linked to a signed bundle. |
| Review/publish → discoverability | Creator listing lifecycle, provider publish, marketplace catalogue | Verify review state, visibility, artifact metadata, and actual catalogue retrieval. Retire existing upstream persona rows, including any without an identifying artifact kind. |
| Content → product offer | Creator content/distribution model and marketplace listing model | **Gap:** no general durable content-to-offer association was established in this review. Define canonical IDs, ownership, audience checks, and failure behavior; do not use a text-only link as proof of an integrated paid-content flow. |
| Checkout → entitlement | FBM checkout/provider/webhook and entitlement services | Real payment and verified webhook grant once; duplicate, failed, canceled, and replayed events behave correctly. Retired persona listings cannot start Blackout checkout. |
| Entitlement → deliverable | Signed fulfillment/bundle and optional dead-drop delivery | Buyer gets the exact published version; library reopening, signatures, licenses, access checks, and refunds work with real FBM bytes. |
| Sale → creator earnings | FBM seller orders/payouts, bridge records, attribution and split surfaces | Local order/tip views are not a complete product-revenue ledger. Verify seller identity, order amounts, processing fees, coalition fee, splits, pending versus paid states, and reconciliation. |
| Contribution → rank/reward | Reputation/growth/entitlement foundations | Define eligible completion evidence, idempotency, corrections, privacy, and real reward grants. Publishing an empty paid listing is not a contribution. |

Do not claim the entire loop is wired until the production payload and content/offer gaps are closed and demonstrated. Forwarding new fields to FBM without changing its strict contract is not a fix. Coordinate the FBM upload/version/signed-bundle contract, expose explicit readiness/errors, and keep unready purchase paths hidden or unavailable under existing release policy.

## 6. Acceptance evidence

- Catalogue/forms/docs exclude AI personas; authenticated API creation, legacy republishing, public detail, and checkout cannot sell an identified persona. Historical entitlement decoding continues to work.
- With listing flags off, sell prompts are absent; with publishing flags off, the guide prompt is absent. With all destinations off, no empty prompt renders.
- Product and guide prompt clicks open their real editor with the intended selection. An unknown/retired template never selects a prototype property or unsupported kind.
- A first-time maker creates, resumes, previews, and publishes one real product; a different account buys and receives its exact file/license through real FBM, then reopens it from the library.
- Confirm a second creator cannot edit, publish, attach, or receive earnings from the first creator's product. Private content is never exposed by distribution or export.
- Real duplicate webhook/refund/failure tests preserve correct ownership, balances, payout state, and contribution/reward idempotency.
- Validate the path on iOS/Android, including storage permissions, interrupted upload, login return, and keyboard/screen-reader use.

Measure prompt-to-draft starts, drafts resumed, valid completed products, review acceptance, actual delivery, repeat purchasers, creator net earnings, useful contributions, and abandoned steps. Completion and economic benefit matter more than prompt impressions or raw upload volume.
