# FreeBlackMarket Build Prompt

Use this prompt to drive implementation work for the **freeblackmarket.com** platform as part of Blackout deployment readiness.

## Prompt

You are implementing production-ready capabilities for the **freeblackmarket** repository.

### Context
- Product: `freeblackmarket.com`
- Role in ecosystem: source-of-truth for product catalog, checkout/session creation, payment lifecycle events, and webhook delivery to Blackout systems.
- Integration consumers:
  - `blackout` (client UX and entitlement display)
  - `blackout server` (API adapter, fulfillment logic, audit and observability)

### Objective
Build and harden freeblackmarket payment and product APIs so Blackout can reliably sell products, receive entitlement updates, and operate safely in production.

### Required Outcomes
1. Product catalog APIs are stable, versioned, and documented.
2. Checkout/session APIs are idempotent and secure.
3. Webhook delivery is signed, retryable, replay-safe, and observable.
4. Payment lifecycle states (success/failure/refund/chargeback) are emitted consistently.
5. Operational controls exist for canary rollout, rollback, and alerting.

### Scope of Work

#### A) Product Catalog and Plans
- Implement versioned endpoints for product listing and product detail retrieval.
- Include stable product IDs and plan/price metadata suitable for entitlement mapping.
- Add schema validation and compatibility tests for response contracts.
- Add pagination/filtering where needed.

#### B) Checkout and Sessions
- Implement secure checkout/session creation endpoint(s).
- Enforce request validation (product IDs, customer/account linkage, quantity/rules).
- Add idempotency keys to prevent duplicate checkout/session creation.
- Persist transaction intent records for audit/debug.

#### C) Payment Lifecycle Events
- Standardize internal event model for:
  - `payment.succeeded`
  - `payment.failed`
  - `payment.refunded`
  - `payment.chargebacked`
- Guarantee deterministic mapping from provider payloads to event model.
- Store event processing status and correlation IDs.

#### D) Webhooks to Blackout Server
- Sign outgoing webhooks with rotating secret(s).
- Include timestamp + signature headers and event IDs.
- Implement retry policy with exponential backoff and dead-letter handling.
- Prevent duplicate delivery side effects via event IDs and idempotency semantics.
- Provide webhook replay tool for support/ops.

#### E) Security and Compliance Baseline
- Remove insecure defaults and enforce required environment secrets at startup.
- Add credential rotation playbook and key rollover support.
- Redact sensitive data in logs.
- Add abuse controls (rate limits, anti-automation protections on checkout endpoints).

#### F) Observability and Operations
- Add structured logs for checkout/session and webhook paths.
- Expose metrics: checkout success rate, payment failure rate, webhook retry count, DLQ depth.
- Add alerts for degraded payment success rate and webhook delivery failures.
- Add deployment checklist and rollback runbook.

### Deliverables
- Implemented endpoints, services, and webhook workers.
- API contract docs (OpenAPI or equivalent) and sample payloads.
- Automated tests (unit + integration + contract tests).
- Runbooks:
  - Incident response for payment outage.
  - Webhook replay and dead-letter drain procedures.
  - Secret rotation procedure.

### Acceptance Criteria
- End-to-end staging purchase flow succeeds from checkout creation through webhook delivery and entitlement fulfillment confirmation.
- Replay of a webhook event does not double-fulfill.
- Invalid signatures are rejected and logged with security telemetry.
- Required secrets missing at startup cause process boot failure.
- Dashboards and alerts are active for key payment and webhook SLOs.

### Non-Goals
- Building Blackout client UI behavior (belongs to `blackout` repo).
- Building Blackout entitlement processing adapters (belongs to `blackout server` repo).

### Implementation Constraints
- Prefer incremental PRs:
  1. Product APIs
  2. Checkout/session + idempotency
  3. Webhook signing/retry
  4. Observability + runbooks
- Each PR must include tests and migration notes.
- Do not ship features without alert coverage and rollback notes.

### Final Output Format
At completion, provide:
1. Change summary by subsystem.
2. API contract changes.
3. Test evidence with command outputs.
4. Known risks and follow-up tasks.
