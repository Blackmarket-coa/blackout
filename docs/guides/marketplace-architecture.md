# Marketplace architecture (developer reference)

How the "post a digital product" path works under the hood — the cross-repo
model, the create boundary, digital delivery, and how to verify it locally. For
the user-facing walkthrough, see
[`selling-on-the-black-market.md`](selling-on-the-black-market.md).

## Cross-repo model

The marketplace spans two repositories:

-   **`blackout`** (this repo) — the React client (`apps/blackout-client`) and the
    Hono API (`packages/api`). It surfaces the marketplace and persists listing
    **metadata + status** only.
-   **`free-black-market` / FBM** — the commerce backend that owns the priced
    catalog, checkout, payouts, and Stripe rails. Not in this tree.

Blackout talks to FBM through a **provider abstraction**
(`packages/api/src/integrations/marketplace/`), selected at runtime:

-   `freeblackmarket.ts` — the real provider. Commerce is served under
    `/v1/integrations/blackout/commerce/**` on FBM's side.
-   `freeblackmarketStub.ts` — an in-memory stub with ~18 seeded listings,
    enabled with `FREEBLACKMARKET_STUB=1`. Use it for local/dev and tests.
-   `blamazon.ts` / `mayhemMarketplaze.ts` / `antinAmazon.ts` — fail-closed
    placeholders; the API refuses to boot if they're enabled in production.

See [`../../MARKETPLACE_AUDIT.md`](../../MARKETPLACE_AUDIT.md) for the full
cross-repo audit.

## API surface

Seller/creator routes are mounted at `/v1/creator`
(`packages/api/src/routes/creator.ts`, mounted in `packages/api/src/index.ts`):

| Method & path                           | Purpose                                   |
| --------------------------------------- | ----------------------------------------- |
| `GET /v1/creator/providers`             | Providers that support creator publishing |
| `POST /v1/creator/listings`             | Create a draft listing                    |
| `POST /v1/creator/listings/:id/publish` | Publish (→ `pending_review`)              |
| `GET /v1/creator/listings/mine`         | The caller's listings                     |
| `DELETE /v1/creator/listings/:id`       | Archive                                   |
| `POST /v1/creator/payouts/onboarding`   | Start payout/KYC onboarding               |
| `GET /v1/creator/orders`                | Vendor order + earnings visibility        |

Buyer/catalog routes are mounted at `/v1/marketplace`
(`packages/api/src/routes/marketplace.ts`), including the fulfillment endpoints
below.

The client calls these through
`apps/blackout-client/src/app/features/creators/creatorClient.ts`.

## The create contract

A draft is validated in three layers:

1. Zod schema in `packages/api/src/routes/creator.ts` (closed enums for
   `artifactKind` / `category` / `entitlementKind`).
2. `parseCreatorListingDraft` in `packages/core/src/marketplace/creator.ts`,
   which enforces that `artifactPayload` **or** `artifactUploadId` is present and
   runs `validateArtifactPayload` (discriminant-only checks per kind).
3. A route rule that rejects `coalition_kit` (published via a different flow).

Persistence is **upstream-first**: the provider is called before any local row
is written, so a provider rejection (502) persists nothing.

### The metadata-only boundary

The real FBM provider's `createCreatorListing`
(`packages/api/src/integrations/marketplace/freeblackmarket.ts`) intentionally
**drops** `artifactKind` / `artifactPayload` / `artifactUploadId` and sends only
the catalog metadata (`slug`, `title`, `description`, `category`, `priceCents`,
`currency`, `entitlementKind`, `mediaUrls`, `tags`). The sellable **bytes** are
delivered separately via FBM's signed-bundle path (`issueSignedBundle`), not the
create call.

Consequences for the guided sell flow
(`apps/blackout-client/src/app/features/creators/sell/`):

-   **Preview media** (`mediaUrls`) _does_ reach FBM — the wizard uploads preview
    images to the Matrix media repo and sends the resulting `mxc://` URIs.
-   **Artifact payloads** authored in the wizard are fully exercised against the
    **stub** (which stores and bundles them), and are a draft/spec against real
    FBM. This is called out in the UI and in
    [`creating-blackout-products.md`](creating-blackout-products.md).

## Digital delivery

On a successful purchase (`packages/api/src/services/marketplaceWebhook.ts`):

-   **Dead-drop delivery** — `maybeDeliverDigitalDeadDrop`
    (`packages/api/src/services/fbmMatrixBridge/deadDropDelivery.ts`) provisions a
    temporary E2EE Matrix room, posts a `co.bmc.marketplace.deaddrop` pointer, and
    invites the buyer. Rooms are tombstoned after a TTL by a background sweeper.
-   **Signed fulfillment** — `GET /v1/marketplace/fulfillment/:entitlementId/asset`
    mints a short-lived HMAC-signed asset URL (and attaches a `licenseKey` for
    `software_license` entitlements); `…/bundle` returns a signed plugin bundle.
-   **License keys** — generated and tracked in
    `packages/api/src/services/marketplaceEntitlements.ts`.
-   **Entitlements → features** — a granted entitlement's `featureKeys` are unioned
    into the client's `grantedFeatureKeysAtom`, unlocking gated features.

## Feature flags

-   `creatorsListings` (env `BLACKOUT_CREATORS_LISTINGS`) — **default on**; gates
    the sell surfaces (`/creator/listings`, `/creator/sell`) and the Create-hub
    entry point.
-   `monetizationMarketplace` (env `BLACKOUT_MONETIZATION_MARKETPLACE`) — **default
    off**; the buyer-side marketplace surface.

See `apps/blackout-client/src/app/core/features/featureFlags.ts`.

## Known limitations

-   **In-app artifact upload is metadata-only** for real FBM (see the boundary
    above); artifact bytes ship via FBM's signed bundle. Tracked in
    [`../../MARKETPLACE_AUDIT.md`](../../MARKETPLACE_AUDIT.md).
-   Preview-media URLs are Matrix `mxc://` references; whether an external FBM
    catalog can render Blackout-hosted media is an FBM-side concern.

## Verify locally

Run the API with `FREEBLACKMARKET_STUB=1` (do **not** set this in production —
it serves demo data). Then:

1. `GET /v1/creator/providers` lists `freeblackmarket`.
2. Create a draft via `POST /v1/creator/listings` (or the `/creator/sell`
   wizard), publish it, and confirm it via `GET /v1/creator/listings/mine`.
3. `GET /v1/marketplace/listings` returns the seeded catalog.

For the real go-live configuration (FBM env, Stripe, catalog seed, beta-unlock),
see [`../operations/MONETIZATION_GO_LIVE.md`](../operations/MONETIZATION_GO_LIVE.md).
