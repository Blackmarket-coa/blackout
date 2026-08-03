<!--
  Status: the marketplace surface described here is merged but "built but dark" —
  config-gated behind FREEBLACKMARKET_ENABLED / FREEBLACKMARKET_API_KEY, with an
  in-memory stub (FREEBLACKMARKET_STUB=1) for local/dev. See the caveat below and
  docs/operations/MONETIZATION_GO_LIVE.md before treating anything here as live.
-->

# User guides

End-user how-to guides. Unlike the rest of `docs/` (which is engineering,
operations, and planning material), these are written for the person using
Blackout — start here if you want to _do_ something rather than change the code.

> **The marketplace is a config-gated beta.** The selling flow below is fully
> functional against the local stub (`FREEBLACKMARKET_STUB=1`) and merged into
> the app, but real payments/catalog require enabling the Free Black Market
> integration and turning off beta-unlock. See
> [`docs/operations/MONETIZATION_GO_LIVE.md`](../operations/MONETIZATION_GO_LIVE.md)
> and the "built but dark" framing in [`../../MARKETPLACE_AUDIT.md`](../../MARKETPLACE_AUDIT.md).

## Guides

| Guide                                                              | For                      | What it covers                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`selling-on-the-black-market.md`](selling-on-the-black-market.md) | Sellers                  | The full path to post a digital product: onboarding, the guided sell flow, publishing, and fulfilment.                                      |
| [`creating-blackout-products.md`](creating-blackout-products.md)   | Sellers (semi-technical) | Per-artifact-kind reference — what each blackout product type is and the exact payload it needs. The "help creating products for blackout." |
| [`non-blackout-digital-goods.md`](non-blackout-digital-goods.md)   | Sellers                  | Plain digital goods (ebooks, PDFs, zips) — the in-app digital-download path and the Free Black Market `digital` listing type.               |
| [`marketplace-architecture.md`](marketplace-architecture.md)       | Developers               | The cross-repo model, the metadata-only create boundary, digital delivery, and local verification.                                          |

## Blackout vs non-blackout products (the short version)

-   A **blackout product** unlocks something _inside_ Blackout when purchased — a
    theme, plugin, cosmetic, sound pack, community template, stream asset, AI
    persona, automation, or privacy tool. It carries `feature_keys` bridging to
    `features.*` entitlements.
-   A **non-blackout digital good** is a plain file (an ebook, PDF, or zip) sold
    on the same marketplace that does _not_ unlock in-app features.

Both are posted through the same guided flow at `/creator/sell`.
