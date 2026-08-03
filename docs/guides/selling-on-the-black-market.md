# Selling on the black market

This guide walks you through posting a **digital product** for sale on the
Blackout black market — from opening the seller flow to publishing your listing
and getting paid. It covers both **blackout products** (that unlock features in
the app) and **non-blackout digital goods** (plain files).

New to the difference? See
[Blackout vs non-blackout products](#blackout-vs-non-blackout-products) below,
and the per-type reference in
[`creating-blackout-products.md`](creating-blackout-products.md).

> **Beta / config-gated.** The whole flow works locally against the stub
> (`FREEBLACKMARKET_STUB=1`), but real payments and a real catalog require
> enabling the Free Black Market integration — see [Before you start](#before-you-start)
> and [`../operations/MONETIZATION_GO_LIVE.md`](../operations/MONETIZATION_GO_LIVE.md).

---

## Before you start

1. **The selling surface must be enabled.** It rides the `creatorsListings`
   feature flag (env `BLACKOUT_CREATORS_LISTINGS`), which is **on by default**
   (`apps/blackout-client/src/app/core/features/featureFlags.ts`). If it's off,
   you won't see the entry points below.
2. **A marketplace provider must be connected.** In local/dev, run the API with
   `FREEBLACKMARKET_STUB=1` to exercise the entire flow against seeded demo data.
   For real listings, an operator connects Free Black Market (FBM) per
   [`../operations/MONETIZATION_GO_LIVE.md`](../operations/MONETIZATION_GO_LIVE.md).

## Blackout vs non-blackout products

|                     | Blackout product                                                                                                 | Non-blackout digital good                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| What it is          | A theme, plugin, cosmetic, sound pack, community template, stream asset, AI persona, automation, or privacy tool | A plain file — an ebook, PDF, zip, audio                                                                                                     |
| What the buyer gets | An **entitlement** that unlocks a feature/asset inside Blackout (via `feature_keys` → `features.*`)              | A **download**, delivered after purchase                                                                                                     |
| How you author it   | The per-type form in the guided flow (see [`creating-blackout-products.md`](creating-blackout-products.md))      | The **Digital download** template (a `vault_item` carrying your file) — see [`non-blackout-digital-goods.md`](non-blackout-digital-goods.md) |

Both are posted through the **same guided flow**.

## Step 1 — Open the guided sell flow

Any of these gets you there:

-   **Create hub** → the **"Sell a digital product"** card (`/create`).
-   Go straight to **`/creator/sell`**.
-   From **Creator listings** (`/creator/listings`), click **Guided sell flow**.

The flow is `SellProductWizard`
(`apps/blackout-client/src/app/features/creators/sell/SellProductWizard.tsx`).

## Step 2 — Choose what you're selling

Pick a template. They're grouped into:

-   **Digital goods** → _Digital download_ (sell a plain file).
-   **Blackout features** → one tile per product type (theme, plugin, cosmetic,
    sound pack, stream asset, privacy tool, and so on).

Your choice sets the product's category and what buying it unlocks — you don't
pick those separately.

## Step 3 — Fill in the details

Enter a **title**, **description**, **price** (in cents — e.g. `499` = $4.99),
and **currency**. Optionally add **tags** and choose the **marketplace** the
listing goes to. Title and description are required.

## Step 4 — Build the artifact

This is where the product itself is authored, and it changes per type:

-   **Digital download / asset bundle** → attach your file(s).
-   **Cosmetic / sound pack / stream asset / privacy tool / vault item** → a short
    form with the fields that type needs (each field has inline help).
-   **Theme / plugin / community template / automation** → a JSON editor,
    prefilled with a working example (these are large/structured by nature).

The exact shape for every type is documented in
[`creating-blackout-products.md`](creating-blackout-products.md).

> **What actually ships to buyers.** Against the local stub, the artifact you
> author here _is_ what gets delivered. Against real FBM, the create call is
> metadata-only — the sellable bytes are uploaded on the marketplace side and
> delivered through its signed-bundle path. See
> [`marketplace-architecture.md`](marketplace-architecture.md#the-metadata-only-boundary).

## Step 5 — Add preview media (optional)

Upload preview images buyers see on the listing. These go to Blackout's media
store; the **sellable file itself is not uploaded here** — it's delivered by the
marketplace after purchase.

## Step 6 — Review & create

Check the summary and click **Create listing**. Your listing is created as a
**draft** (status `draft`).

## Step 7 — Publish

Click **Publish**. The listing moves to `pending_review`, then to `published`
once the marketplace approves it. Full lifecycle:
`draft → pending_review → published` (or `rejected` / `archived`).

You can also manage existing listings — publish, archive — from **Creator
listings** (`/creator/listings`).

## Step 8 — Set up payouts

To actually be paid, click **Set up payouts** (also on the Payouts surface).
This opens the marketplace's onboarding, which handles KYC and payout
scheduling. Backed by `POST /v1/creator/payouts/onboarding`.

## What happens when someone buys

-   **Entitlements** are granted automatically on purchase; a blackout product's
    `feature_keys` light up the matching gated features in the buyer's app.
-   **Digital goods** are delivered through an encrypted Matrix **dead-drop** — a
    temporary, end-to-end-encrypted room the buyer is invited to, which is torn
    down after a TTL.
-   **Software licenses** additionally carry a license key.

The mechanics are covered in
[`marketplace-architecture.md`](marketplace-architecture.md#digital-delivery).

## Verify it locally

With the API running under `FREEBLACKMARKET_STUB=1`:

1. Open `/creator/sell`, choose **Digital download**, fill in details, attach a
   small file, and **Create listing**.
2. **Publish** it.
3. Confirm it appears under `/creator/listings` with its status.

## Related

-   [`creating-blackout-products.md`](creating-blackout-products.md) — per-type payload reference.
-   [`non-blackout-digital-goods.md`](non-blackout-digital-goods.md) — plain digital goods.
-   [`marketplace-architecture.md`](marketplace-architecture.md) — how it works under the hood.
