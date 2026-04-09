# Core Commerce Platform Architecture

Status: Proposed  
Last updated: 2026-04-09

## 1) Scope

This document defines a core commerce platform that supports:
- **FBM bridge** (catalog, inventory, orders, fulfillment events)
- **Creator analytics**
- **AI listing assistant**
- **Per-creation micropayments**

It includes canonical data model guidance, event-bus architecture, fraud/risk controls, and payout workflows.

---

## 2) Architecture overview

```text
Creator UI / Seller Console / Buyer App
            |
            v
      API Gateway + AuthN/Z
            |
   +-----------------------------+
   | Core Commerce Services      |
   | - Catalog Service           |
   | - Inventory Service         |
   | - Order Service             |
   | - Fulfillment Service       |
   | - Micropayment Ledger       |
   | - Payout Service            |
   | - Risk & Fraud Service      |
   | - Analytics Aggregator      |
   | - AI Listing Assistant      |
   +-----------------------------+
            |
            v
        Event Bus (Kafka/NATS)
      /         |          \
     v          v           v
 Warehouse   Realtime    Compliance
 / Lakehouse Dashboards   & Audit
```

Design principles:
- Event-first architecture with idempotent consumers.
- Strict money movement ledger semantics.
- Privacy/security by default for creator and buyer data.
- Extensible marketplace integrations through connector pattern.

---

## 3) Domain modules

## 3.1 FBM bridge

The FBM bridge integrates merchant-managed operations with platform workflows.

### Responsibilities
- Catalog ingest/sync (SKUs, variants, pricing, media, attributes).
- Inventory sync (on-hand, reserved, safety stock, location-level quantities).
- Order intake (new/cancel/update).
- Fulfillment status events (picked, packed, shipped, delivered, returned).

### Connector model
- Adapter per channel/merchant system (ERP/WMS/OMS).
- Shared mapping layer for canonical domain fields.
- Retry + dead-letter handling for integration errors.
- Contract tests for each connector.

## 3.2 Creator analytics

Provides near-real-time and historical analytics for creators and operations.

### Metrics domains
- Revenue, gross/net margin, refund rate.
- Conversion funnel (impressions -> clicks -> add-to-cart -> order).
- Listing quality and discoverability scores.
- Cohort retention and repeat purchase behavior.

### Delivery surfaces
- Creator dashboard (daily/weekly/monthly).
- Alerting (inventory risk, conversion drops, chargeback spikes).
- Export API for finance/BI tools.

## 3.3 AI listing assistant

Assists creators when generating or improving listings.

### Capabilities (MVP)
- Title/description drafting from prompt and product facts.
- Attribute completion and normalization suggestions.
- SEO keyword suggestions and readability tuning.
- Policy compliance hints (restricted terms, missing disclosures).

### Guardrails
- Human-in-the-loop approval required before publish.
- PII/unsafe-content redaction on prompts and outputs.
- Model output provenance stored for audit.
- Region/language policy templates.

## 3.4 Per-creation micropayments

Supports small-value payouts tied to specific creation events.

### Creation event examples
- Purchase of digital asset.
- Tip or micro-support action.
- Unlock event (pay-per-content).
- Affiliate share allocation.

### Money movement principles
- Every event writes immutable ledger entries.
- Holds/reserves for fraud review where policy requires.
- Settlement batches with deterministic reconciliation.

---

## 4) Canonical data model

## 4.1 Core entities

- `Creator` (id, region, tax_profile_id, risk_tier, payout_account_id)
- `Storefront` (id, creator_id, status, default_currency)
- `CatalogItem` (id, storefront_id, title, description, category, moderation_status)
- `Sku` (id, catalog_item_id, variant_attrs, price, currency, barcode)
- `InventoryPosition` (sku_id, location_id, on_hand, reserved, available, updated_at)
- `Order` (id, buyer_id, storefront_id, status, totals, payment_status, risk_status)
- `OrderLine` (order_id, sku_id, qty, unit_price, tax, discount)
- `Fulfillment` (id, order_id, carrier, tracking_id, state, timestamps)
- `MicropaymentEvent` (id, creator_id, source_type, source_ref, gross_amount, currency, fee_amount)
- `LedgerEntry` (id, account_id, direction, amount, currency, event_id, created_at)
- `Payout` (id, creator_id, period_start, period_end, gross, fees, reserves, net, status)
- `FraudSignal` (id, subject_type, subject_id, signal_type, score, reason_code, created_at)

## 4.2 Relationship notes

- One `CatalogItem` has many `Sku`.
- One `Order` has many `OrderLine` and zero/one `Fulfillment` per shipment split.
- Each `MicropaymentEvent` maps to one or more `LedgerEntry` rows (double-entry accounting).
- `Payout` aggregates settled ledger entries minus holds/fees.

## 4.3 Storage strategy

- OLTP store for transactional entities (orders, inventory, ledger).
- Time-series/columnar warehouse for analytics and historical reporting.
- Immutable event store or compacted topic for replay/backfill.

---

## 5) Event bus design

## 5.1 Event taxonomy

Key events:
- Catalog: `catalog.item.created|updated|published`
- Inventory: `inventory.changed|threshold.breached`
- Orders: `order.created|paid|canceled|refunded`
- Fulfillment: `fulfillment.picked|shipped|delivered|returned`
- Payments: `micropayment.authorized|captured|reversed`
- Ledger/Payout: `ledger.entry.posted|payout.generated|payout.sent|payout.failed`
- Risk: `risk.signal.detected|risk.review.required|risk.action.applied`
- AI: `listing.ai.suggested|listing.ai.accepted|listing.ai.rejected`

## 5.2 Message contract

Each event envelope includes:
- `event_id` (globally unique)
- `event_type`
- `occurred_at` (UTC ISO timestamp)
- `producer`
- `tenant_id`
- `entity_id`
- `schema_version`
- `idempotency_key`
- `payload`

## 5.3 Reliability guarantees

- At-least-once delivery with idempotent consumers.
- Ordered partitions by business key (`order_id`, `sku_id`, `creator_id`).
- DLQ + replay tooling for failed consumers.
- Schema registry with compatibility checks.

---

## 6) Fraud and risk controls

## 6.1 Risk surfaces

- Account takeover and synthetic creator accounts.
- Card testing/microtransaction abuse.
- Refund/chargeback fraud.
- Inventory manipulation and fake fulfillment updates.
- AI-generated policy-violating listings.

## 6.2 Control layers

### Preventive
- Device fingerprint + velocity checks.
- KYC/KYB and payout beneficiary verification.
- Transaction limits by risk tier.
- Listing policy classifier prior to publish.

### Detective
- Real-time anomaly scoring on orders/micropayments.
- Graph signals for collusive behavior.
- Chargeback trend monitors per creator/category.

### Responsive
- Dynamic holds/reserves on suspect funds.
- Step-up verification for risky actions.
- Auto/manual review queues with reason codes.
- Account sanctions and controlled recovery workflow.

## 6.3 Fraud-specific micropayment rules

- Minimum and maximum amount thresholds by region.
- Burst-rate limiter per payer/payee pair.
- Delayed settlement window for high-risk first-time payers.
- Reversal handling posts compensating ledger entries (no hard deletes).

---

## 7) Payout workflows

## 7.1 Payout lifecycle

1. Ingest settled revenue and fees into creator ledger accounts.
2. Apply reserves/holds and adjustments.
3. Generate payout statement per cycle (daily/weekly/monthly policy).
4. Run compliance checks (sanctions, tax form validity, payout method health).
5. Submit payout to provider rails (ACH/SEPA/FPS/etc.).
6. Receive status callbacks and reconcile final outcome.

## 7.2 States

`draft -> calculated -> approved -> submitted -> in_transit -> paid`

Failure branches:
- `submitted -> failed` (rail/provider error)
- `approved -> on_hold` (risk/compliance trigger)

## 7.3 Reconciliation and audit

- Three-way reconciliation: internal ledger vs payment processor vs bank statement.
- Deterministic statement IDs and immutable payout snapshots.
- Audit exports for finance and compliance reviews.

## 7.4 Creator-facing payout UX

- Upcoming payout estimate with reserve explanation.
- Itemized deductions (fees, refunds, chargebacks, taxes).
- Status timeline and retry guidance for failed payouts.

---

## 8) Security, privacy, and compliance

- Least-privilege service-to-service auth (mTLS/JWT).
- Encryption in transit/at rest for all financial and personal data.
- Regional data processing boundaries and residency policy support.
- Consent/legal copy for analytics and AI-assist usage where required.
- Tamper-evident audit logging for money movement and policy actions.

---

## 9) MVP vs future scope

## 9.1 MVP

- Single-region core transactional services with backup.
- FBM bridge: one primary connector + manual fallback import.
- Creator analytics: daily aggregates + key real-time counters.
- AI listing assistant: draft + compliance hinting + human approval.
- Micropayments: basic capture/reversal with ledger + scheduled payouts.
- Fraud: rules + basic anomaly scoring + manual review queue.

## 9.2 Next

- Multi-region active/active for orders + payouts.
- Expanded connector marketplace.
- Advanced fraud graph models and adaptive risk orchestration.
- Creator benchmarking and cohort analytics.
- AI listing assistant with media enrichment and multilingual optimization.

## 9.3 Future

- Real-time programmable payouts.
- Cross-platform settlement unification.
- Privacy-preserving federated analytics.

---

## 10) Implementation phases

1. **Phase 1**: Canonical model + order/inventory + baseline event bus.
2. **Phase 2**: Ledger + micropayment engine + payout orchestration.
3. **Phase 3**: Analytics warehouse + creator dashboards.
4. **Phase 4**: AI listing assistant + policy and moderation integration.
5. **Phase 5**: Advanced risk controls + multi-region hardening.
