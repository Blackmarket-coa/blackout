# FBM Gift Vouchers — Blackout consumer note

Status: **proposal, blocked on FBM.** Nothing here is built. The producer-side
plan is `free-black-market/docs/GIFT_VOUCHER_PLAN.md`, which is itself blocked
on two operator decisions (a values conflict with FBM's `LISTING_TYPES.md`,
and a gift-certificate legal review). This file records what Blackout would
consume if that plan ships, and why this repo wants it.

Siblings: `docs/contracts/fbm-billing-consumer.md` (the money rail),
`docs/contracts/fbm-entitlements-consumer.md` (the read side).

## Why this repo cares

`fbm-billing-consumer.md` currently says, under "Lifecycle guarantees":

> **Gifts / pay-it-forward**: local-only `comped` overrides, deliberately NOT
> a payment flow (a stored gift-credit rail would violate FBM's Posture-A
> no-balance-holding stance). FBM is never the sole truth for comped access.

That is a correct decision given what exists, and it is also a workaround. A
gift today is an access override with no purchase behind it: no money moved,
no attribution, no refund path, and Blackout carries access truth that FBM
cannot see.

A voucher is the thing `comped` was standing in for — a **paid** gift that
holds no balance. Because value settles once at checkout and what survives is
a right to one specific good rather than an amount, it does not create the
stored-value surface that made a gift-credit rail unacceptable.

If FBM ships it, gifting a creator subscription becomes an ordinary
attributable purchase, and `comped` narrows back to what it should mean:
admin comps and genuine fee waivers.

## What Blackout would consume

Nothing new architecturally. The delegation pattern in
`fbm-billing-consumer.md` already covers it — local pending record → FBM
checkout session with a metadata correlation echo → FBM webhook returns the
echo → local record resolves. A gifted subscription is that same flow with a
recipient who is not the payer.

Two additions would be needed on the return leg, both resolving in the one
dispatcher (`services/marketplaceWebhook.ts#dispatchMonetizationEvent`):

| Event | Meaning | Local effect |
| --- | --- | --- |
| `voucher.issued` | a voucher backed by a Blackout-listed offering was purchased | record the pending gift; no access yet |
| `voucher.redeemed` | the holder redeemed it | resolve to the normal entitlement path, exactly as `purchase.succeeded` does |

Access must attach on **redemption**, not issuance. The buyer of a gift is
not its beneficiary, and the recipient may not have a Blackout account yet at
purchase time.

## Constraints this repo must not violate

- **Blackout has no ledger.** `packages/api/src/services/dataExport/ledgerExport.ts:15`
  states plainly that the hawala ledger is a docs-only concept here, and that
  `GIFT` in this repo is a paid tip SKU (`services/gifts.ts`), not a ledger
  unit. Do not let voucher work grow a local balance — `services/gifts.ts:37`
  already records the standard: "single-shot path (no prepaid balance) so we
  never hold customer funds."
- **FBM is the money truth; Blackout is the access-policy truth.** That split
  is unchanged. Redemption state belongs to FBM.
- **No local gift-credit rail**, per the billing contract. A voucher is a
  right to one named thing, never a stored amount — if a design starts
  needing a remaining balance, it has left this contract.
- Naming collision to avoid: this repo's existing `GIFT` (tip SKUs,
  `GIFT_CATALOG` in `packages/core/src/monetization/gifts.ts`) is unrelated.
  A voucher surface must not reuse that vocabulary.

## Sequencing

This is downstream of FBM phases P1–P3 and should not start before them.
Blackout's own prerequisite is small: a `voucher.*` case in the webhook
dispatcher and a redemption-time entitlement resolve. The client surface
(gift a tier, claim a gift) is the larger piece and is worth designing only
once FBM's P2 title-transfer semantics are settled.
