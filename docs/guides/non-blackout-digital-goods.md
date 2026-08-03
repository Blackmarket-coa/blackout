# Non-blackout digital goods

A **non-blackout digital good** is a plain file you sell — an ebook, PDF, zip,
audio file — that does **not** unlock any feature inside Blackout. The buyer pays
and receives a download. Contrast this with a
[blackout product](creating-blackout-products.md), which grants an in-app
entitlement.

There are two ways such goods exist in the system.

## 1. The in-app path: a "Digital download"

From the guided sell flow ([`selling-on-the-black-market.md`](selling-on-the-black-market.md)),
choose **Digital download**. Under the hood this creates a `vault_item` listing
whose payload is your file:

```json
{ "files": [{ "name": "guide.pdf", "mime": "application/pdf", "base64": "<bytes>" }] }
```

On purchase, the file is delivered through an **encrypted Matrix dead-drop**: the
buyer is invited to a temporary, end-to-end-encrypted room that is torn down
after a TTL. The server never sees the plaintext — sealing is client-side. This
is the same delivery path proven by the `stub-digital-ebook` demo listing
(`packages/api/src/integrations/marketplace/freeblackmarketStub.ts`) and
implemented in `packages/api/src/services/fbmMatrixBridge/deadDropDelivery.ts`.

This is the recommended way for a Blackout seller to list a plain digital good
without leaving the app.

## 2. Free Black Market's `digital` listing type

The commerce backend, **Free Black Market (FBM)**, has its own broad catalog of
listing types for the wider cooperative marketplace — `physical_product`,
`event`, `digital`, `recurring`, `wholesale`, `consignment`, `unique_inventory`,
`bookable`, and `campaign` (see [`../../MARKETPLACE_AUDIT.md`](../../MARKETPLACE_AUDIT.md) §7).

A true **`digital`** listing there is a first-class digital product on FBM's
side, managed through the FBM seller dashboard (a separate repository — not part
of the Blackout app). Per the marketplace audit, its backend is complete; its
dedicated storefront path is still being built out. Blackout browses and
purchases from FBM's catalog through the provider integration described in
[`marketplace-architecture.md`](marketplace-architecture.md), but it does not
author FBM `digital` listings from inside the Blackout client — use the in-app
**Digital download** above for that.

## Which should I use?

| Want to…                                                                                                  | Use                                      |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Sell a file from inside Blackout, delivered privately to the buyer                                        | The in-app **Digital download** template |
| Run a full FBM storefront with the broader catalog (physical goods, events, subscriptions, and `digital`) | FBM's seller dashboard (out of repo)     |

## How this differs from a blackout product

-   A blackout product grants an **entitlement** and can carry `feature_keys` that
    unlock gated features. A digital good grants only the **download**.
-   A blackout product's value is realized _inside_ the app; a digital good's value
    is the file itself.
