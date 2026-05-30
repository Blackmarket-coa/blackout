# FreeBlackMarket → Blackout Integration — Work Order

> Paste this into the `Blackmarket-coa/free-black-market` repo (issue, PR description, or
> coding-agent prompt). It specifies exactly what FBM must implement so the Blackout
> integration works end-to-end. Every shape below is derived from the live Blackout-side
> consumer code; field names and signing are normative.

## 0. Context

- **FBM is the substrate / source of truth** for catalog, checkout, payment lifecycle,
  the ledger, the entitlements service, and the event bus.
- **Blackout consumes FBM** two ways: (a) it **calls** FBM's commerce REST API and the
  entitlements service; (b) it **receives** FBM webhooks and translates them into Matrix
  room activity + entitlement grants.
- Blackout is already built and stub-tested against these contracts. Nothing below requires
  Blackout changes — it requires FBM to **emit the events** and **serve the endpoints**.
- Two FBM-hosted surfaces are in scope:
  1. **Commerce API + webhook emitter** (this is the `freeblackmarket` provider Blackout calls).
  2. **Entitlements service** (separate base URL; the four-question gating contract).

---

## 1. Webhook delivery contract (FBM → Blackout)

**Endpoint:** `POST {BLACKOUT_API_BASE}/v1/marketplace/webhooks/freeblackmarket`
(`BLACKOUT_API_BASE` e.g. `https://api.theblackout.app`)

**Headers (required):**
- `content-type: application/json`
- `x-fbm-event-id: <eventId>` — the event's unique id (used for replay dedupe).
- `x-fbm-signature: <hex>` — lowercase hex `HMAC-SHA256(rawRequestBody, FREEBLACKMARKET_WEBHOOK_SECRET)`.
  Sign the **exact bytes** of the JSON body you send. Blackout recomputes and compares in
  constant time; a mismatch is rejected `401`.

**Delivery semantics:**
- **Replay-safe / idempotent:** Blackout dedupes on `(provider, eventId)`. Re-delivering the
  same `eventId` is safe and returns `200` with `alreadyProcessed: true`. Use a **stable**
  `eventId` per logical event.
- **Retry:** exponential backoff on non-2xx / timeout. A `200` body `{ ok: true, ... }` is success.
- **Ordering:** not assumed. Each event is self-contained.
- **One event per request.**

**Signing reference (Node):**
```js
const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
// headers: { 'x-fbm-event-id': eventId, 'x-fbm-signature': sig }
```

**Common envelope (all events):**
| field | type | notes |
|---|---|---|
| `eventId` | string | unique, stable per logical event |
| `type` | string | one of the families below |
| `occurredAt` | string | ISO-8601 |
| `metadata` | object | optional; family-specific keys below |

`userId` always means the **Blackout user id** (the `sub` FBM stored when the user linked
their account). Do **not** send a raw email/PII. `providerId` is injected by Blackout — do not send it.

---

## 2. Entitlement lifecycle events (grant/refund + monetization)

These drive entitlement state and the digital dead-drop. `type` MUST be one of this **closed set**:

`purchase.succeeded` · `purchase.failed` · `purchase.refunded` · `purchase.chargebacked` ·
`creator.payout.completed` · `listing.signed_bundle.published` · `creator.account.suspended` ·
`referral.attributed` · `ambassador.commission_paid` · `quest.reward_settled`

**Purchase shape:**
```json
{
  "eventId": "evt_01H...",
  "type": "purchase.succeeded",
  "userId": "blackout-user-id",
  "providerListingId": "lst_01H...",
  "sku": "optional-or-null",
  "kind": "vault_item",
  "occurredAt": "2026-05-30T12:00:00.000Z",
  "metadata": { "fbmOrderId": "ord_01H...", "digitalDelivery": true }
}
```

- `kind` ∈ `emoji_pack, asset_bundle, software_license, plugin_flag, subscription_tier,
  post_unlock, event_ticket, role_grant, channel_access, profile_cosmetic, sound_pack,
  community_template, stream_asset, vault_item, privacy_tool`.
- **Digital dead-drop delivery** fires only when `metadata.digitalDelivery === true` **and**
  `kind ∈ {asset_bundle, vault_item, software_license}`.
- **Monetization routing** via `metadata`: `tipId` (tip — no entitlement), `creatorSubscriptionId`
  (+`fbmSubscriptionId`,`periodDays` — grants `subscription_tier`), `boostPledgeId` (no entitlement).
- **Growth attribution** (`referral.attributed` etc.) carries `metadata.{grossCents, currency,
  fbmOrderId, referralId | ambassadorId+periodKey | questCompletionId+questId}`.

---

## 3. Bridge event families (FBM → Matrix rooms) — **required for first cutover**

Same endpoint + signing as §1. These are NOT in the lifecycle enum; Blackout routes them
to the Matrix bridge. Send `vendorMxid` whenever known (e.g. `@vendor:theblackout.app`) so
Blackout can invite/address the vendor; omit if unknown.

**Orders (post to the vendor's orders room + buyer's order room):**
```json
{ "eventId":"...", "type":"order.created", "occurredAt":"...",
  "vendorId":"vendor-1", "userId":"buyer-blackout-id", "orderId":"ord_1",
  "items":[{"sku":"s1","title":"Cat Sticker Pack","qty":2,"priceCents":199}],
  "totalCents":398, "currency":"USD", "vendorMxid":"@vendor:theblackout.app" }
```
```json
{ "eventId":"...", "type":"order.updated", "occurredAt":"...",
  "vendorId":"vendor-1", "userId":"buyer-blackout-id", "orderId":"ord_1",
  "status":"dispatched", "note":"optional" }
```
`status` ∈ `confirmed | preparing | dispatched | delivered`.
```json
{ "eventId":"...", "type":"order.cancelled", "occurredAt":"...",
  "vendorId":"vendor-1", "userId":"buyer-blackout-id", "orderId":"ord_1", "reason":"optional" }
```

**Inventory (vendor inventory room):**
```json
{ "eventId":"...", "type":"inventory.low", "occurredAt":"...",
  "vendorId":"vendor-1", "sku":"s1", "title":"Cat Sticker Pack", "remaining":3, "threshold":5 }
```

**Ledger (private vendor ledger room).** `type` ∈
`ledger.payment_received | ledger.escrow_released | ledger.refund | ledger.usdc_converted`:
```json
{ "eventId":"...", "type":"ledger.escrow_released", "occurredAt":"...",
  "vendorId":"vendor-1", "orderId":"ord_1", "amountMinorUnits":4200,
  "currency":"USD", "ledgerTxId":"tx_01H..." }
```

**Subscriptions (tier-gated rooms).** `tier` ∈ `signal | signal_plus | community`:
```json
{ "eventId":"...", "type":"subscription.activated", "occurredAt":"...",
  "userId":"buyer-blackout-id", "tier":"signal", "subscriptionId":"sub_1", "expiresAt":"optional-ISO" }
```
```json
{ "eventId":"...", "type":"subscription.lapsed", "occurredAt":"...",
  "userId":"buyer-blackout-id", "tier":"signal", "subscriptionId":"sub_1" }
```

**Disputes (three-party encrypted room).**
```json
{ "eventId":"...", "type":"dispute.opened", "occurredAt":"...",
  "disputeId":"disp_1", "vendorId":"vendor-1", "userId":"buyer-blackout-id",
  "orderId":"ord_1", "reason":"optional", "vendorMxid":"@vendor:theblackout.app" }
```
```json
{ "eventId":"...", "type":"dispute.resolved", "occurredAt":"...",
  "disputeId":"disp_1", "outcome":"refunded" }
```

---

## 4. Entitlements service (FBM-hosted, separate base URL)

Read-only HTTP service answering four questions about `(mxid, resource)`. Blackout will call
these to gate Matrix room access, sync power levels, and render Coalition Credits.

- **Auth:** `Authorization: Bearer <service-token>` (FBM issues a Blackout deployment token).
- **`{mxid}` is URL-encoded**, e.g. `%40alice%3Atheblackout.app`.
- Canonical schema: `docs/contracts/fbm-entitlements.openapi.yaml` (mirrored in this repo);
  FBM must publish the authoritative `entitlements.yaml`.

| Method & path | operationId | returns |
|---|---|---|
| `GET /entitlements/access/{mxid}?urn=&action=` | checkAccess | `{ allowed, source }` |
| `POST /entitlements/access-batch/{mxid}` body `{checks:[{urn,action}]}` | checkAccessBatch | `[{allowed,source}]` (same order) |
| `GET /entitlements/economic-standing/{mxid}` | getEconomicStanding | `EconomicStanding` |
| `GET /entitlements/governance-roles/{mxid}` | getGovernanceRoles | `{ roles: GovernanceRole[] }` |
| `GET /entitlements/coalitions/{mxid}` | getCoalitionMemberships | `{ memberships: CoalitionMembership[] }` |
| `GET /entitlements/summary/{mxid}` | getSummary | `EntitlementsSummary` (Q2+Q3+Q4) |

Key shapes (full definitions in the OpenAPI):
- `AccessAction` ∈ `read | write | administer`.
- `ResourceUrn` ∈ `urn:fbm:room:<id> | urn:fbm:listing:<id> | urn:fbm:proposal:<id> |
  urn:fbm:fulfillment-node:<id> | urn:fbm:ledger-tx:<id> | urn:fbm:platform:admin`.
- `GovernanceRole = { coalitionId, role, matrixAcls: [{ roomId, powerLevel(0–100) }], commercePermissions: string[] }`
  — **`matrixAcls` are applied verbatim** by Blackout's ACL sync worker; FBM owns the mapping.
- `EconomicStanding = { coalitionCreditsBalanceMinorUnits, pendingPayouts[], vendorSalesVolumeMinorUnits30d|null, creatorRewardEligibility[] }`.
- `EntitlementsSummary` adds `cacheTtlSeconds` (Blackout caps the summary at 30s).

**Recommended companion event:** emit `entitlements.changed` (via the §1 webhook channel) on
any access/role/membership change so Blackout can re-sync Matrix ACLs promptly instead of
waiting for the reconcile poll:
```json
{ "eventId":"...", "type":"entitlements.changed", "occurredAt":"...",
  "mxid":"@alice:theblackout.app", "reason":"role_granted" }
```

---

## 5. Commerce REST API (Blackout → FBM) — must exist & match

Blackout's provider calls these with `Authorization: Bearer ${FREEBLACKMARKET_API_KEY}`,
base `FREEBLACKMARKET_BASE_URL` (default `https://api.freeblackmarket.com`), `content-type: application/json`.

| Method & path | request | response |
|---|---|---|
| `GET /v1/catalog/listings?category&q&cursor&limit` | — | `{ listings: Listing[] }` |
| `GET /v1/catalog/listings/{id}` | — | `Listing` |
| `POST /v1/checkout/sessions[?embed=1]` (`idempotency-key` header) | `{ userId, listingId, sku?, returnUrl?, embed? }` | `{ url, id }` |
| `POST /v1/seller/listings` | draft input | `{ id, slug?, status? }` |
| `POST /v1/seller/listings/{id}/publish` | `{}` | `{ id, slug?, status? }` |
| `DELETE /v1/seller/listings/{id}` | — | `{ ok }` |
| `POST /v1/seller/onboarding` | `{ sellerUserId, returnUrl? }` | `{ url, expiresAt }` |

**`Listing` fields Blackout reads** (camelCase or snake_case accepted): `id`, `category`,
`title`, `description`, `priceCents`/`price_cents`, `currency`, `sellerId`/`seller_id`,
`sellerDisplayName`/`seller_display_name`, `mediaUrls`/`media_urls`, `entitlementKind`/`entitlement_kind`,
`tags`, `availableSkus`/`available_skus`. `category` must be one of Blackout's marketplace
categories (emoji-sticker, meme-asset, stego-software, plugin-curated, subscription,
profile-cosmetic, audio-pack, community-template, creator-asset, security-tool, ai-automation).
For the embedded-checkout flow, the `url` should host an FBM checkout page that posts back via the webhook in §2.

---

## 6. Phase 2 event families — **implemented in Blackout** (same envelope/signing as §3)

These three families are live on the Blackout side. Emitting them lights up the
corresponding rooms. `vendorMxid` is optional (sent when known).

**Order Cycles (§1.2) → public per-vendor announcement room.** `type` ∈
`cycle.open | cycle.close | sold_out`:
```json
{ "eventId":"...", "type":"cycle.open", "occurredAt":"...",
  "vendorId":"vendor-1", "cycleId":"cyc_1", "name":"Spring Harvest",
  "items":[{"sku":"kale","title":"Kale"}], "closingAt":"2026-06-01T00:00:00Z",
  "listingDeepLink":"https://freeblackmarket.com/c/cyc_1" }
```
```json
{ "eventId":"...", "type":"cycle.close", "occurredAt":"...",
  "vendorId":"vendor-1", "cycleId":"cyc_1", "name":"Spring Harvest",
  "ordersPlaced":42, "nextCycleAt":"2026-06-08T00:00:00Z" }
```
```json
{ "eventId":"...", "type":"sold_out", "occurredAt":"...",
  "vendorId":"vendor-1", "cycleId":"cyc_1", "name":"Spring Harvest", "soldOutSku":"kale" }
```

**Customer messages (§1.1) → private vendor "customer messages" room.** Buyer is
shown by pseudonymous alias only:
```json
{ "eventId":"...", "type":"message.sent", "occurredAt":"...",
  "vendorId":"vendor-1", "userId":"buyer-blackout-id", "body":"is this gluten free?", "threadId":"optional" }
```

**Vendor trust badge (§2.2) → `co.bmc.vendor.trust` room state event (state key = vendorId)
on the vendor's space + orders room.** `tier` ∈ `unverified | verified | trusted | flagged`:
```json
{ "eventId":"...", "type":"vendor.trust_changed", "occurredAt":"...",
  "vendorId":"vendor-1", "verified":true, "tier":"trusted",
  "completionRate":0.98, "disputeRate":0.01, "coopStatus":"member",
  "vendorMxid":"@vendor:theblackout.app" }
```

## 6b. Later event families (plan now; not yet implemented)

- **Logistics / Blackstar (§7):** `blackstar.driver_assigned | pickup_confirmed | delivered | failed`
  `{ vendorId, userId, orderId, driver?, etaPickup?, etaDelivery?, trackingUrl?, proof? }`.
- **Flash sale (§6):** `flash_sale.start` `{ vendorId, items, discount, durationSeconds, listingDeepLink, location? }`.
- **Governance round-trip (§3.2):** FBM may POST a proposal to be created in a governance room,
  and will receive a Blackout outbound webhook `governance.proposal.resolved`
  `{ proposalId, result, tally }` to apply a price / close a cycle / adjust stock.

---

## 7. Secrets & config to coordinate

| Secret / var | Owner | Used for |
|---|---|---|
| `FREEBLACKMARKET_WEBHOOK_SECRET` | shared | HMAC signing of §1–§3/§6 webhooks |
| `FREEBLACKMARKET_API_KEY` | FBM issues | Blackout → FBM commerce API bearer (§5) |
| `FREEBLACKMARKET_BASE_URL` | FBM | commerce API base |
| Entitlements **service token** | FBM issues | Blackout → entitlements service bearer (§4) |
| Entitlements **base URL** | FBM | §4 service location |

---

## 8. Acceptance criteria

1. A staging purchase emits a signed `purchase.succeeded` to the §1 endpoint; Blackout returns
   `{ ok: true }` and grants the entitlement. Re-delivering the same `eventId` returns
   `alreadyProcessed: true` and does **not** double-grant.
2. An invalid `x-fbm-signature` is rejected `401`.
3. `order.created` / `order.updated` / `ledger.*` / `inventory.low` are emitted with the §3
   shapes for a real order and appear in the vendor rooms.
4. `dispute.opened` / `dispute.resolved` and `subscription.activated` / `subscription.lapsed`
   are emitted with the §3 shapes.
5. All six entitlements endpoints (§4) return the OpenAPI shapes for a known MXID and `401`
   without a valid service token; `getGovernanceRoles` returns real `matrixAcls`.
6. The §5 commerce endpoints return the documented shapes (Blackout's contract tests pass).
7. Missing `FREEBLACKMARKET_WEBHOOK_SECRET` / `FREEBLACKMARKET_API_KEY` fail FBM boot in production.

---

## 9. Notes for the FBM implementer

- Keep `eventId` stable across retries — it is the idempotency key on both sides.
- `userId` is the Blackout user id captured at account-link time; maintain that mapping.
- Sign the raw body bytes you transmit (not a re-serialized copy) so the HMAC matches.
- The Blackout-side consumer contract details (timeouts, retry, cache-control) for §4 live in
  `docs/contracts/fbm-entitlements-consumer.md`; the wire schema in
  `docs/contracts/fbm-entitlements.openapi.yaml`. Publish the canonical `entitlements.yaml`
  in the FBM repo and reconcile.
