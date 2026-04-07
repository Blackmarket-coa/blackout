# Blackout Deployment Readiness Plan

## Goal
Move Blackout from mixed staging readiness to production readiness for core client UX, API integrations, and operations.

## Scope
This plan covers:
- `apps/blackout-client` user-facing readiness gaps.
- `packages/api` production blockers (payments/products integration with freeblackmarket.com, email verification, auth hardening).
- Release/ops controls for reliable rollout.

## Exit Criteria (Definition of Ready)
- Payments and product synchronization via `freeblackmarket.com` are fully implemented and validated in production-like environments.
- Email verification sends via a real provider with retry/observability.
- API startup fails fast when critical secrets are missing (no insecure defaults).
- Placeholder settings areas are replaced with production behavior or explicitly hidden behind feature flags.
- End-to-end smoke tests pass for auth, onboarding, quick actions, governance, and key integrations.
- Deployment runbook, rollback procedure, and dashboards are documented and exercised.

## Workstreams

### 1) Payments Integration (Critical Blocker)
**Objective:** Integrate Blackout payments/products with `freeblackmarket.com` using a production-grade flow.

**Tasks**
1. Implement checkout/session server endpoints in `packages/api` with strict request validation.
2. Add idempotency handling for session creation and order state transitions.
3. Implement product catalog synchronization from `freeblackmarket.com` and map products/plans to Blackout entitlements.
4. Implement webhook handler(s) for success/failure/refund/chargeback events.
5. Persist payment transaction and product fulfillment state with audit metadata.
6. Add integration tests for happy path + webhook replay + invalid signature cases.
7. Configure environment-specific endpoints/credentials through deployment config.

**Acceptance**
- Checkout completes end-to-end in staging against `freeblackmarket.com`.
- Product data sync is consistent and entitlement mapping is correct.
- Webhook replay does not double-fulfill.
- Transaction status is queryable for support and audit.

**Repository task split**
- **blackout**: Wire checkout/product UI entry points, entitlement UX states, and error messaging.
- **free black market**: Own product catalog, checkout/session APIs, webhook emission, and transaction source-of-truth.
- **blackout server**: Own API adapter, signature validation, idempotency, fulfillment mapping, and audit persistence.

### 2) Email Verification Integration (Critical Blocker)
**Objective:** Replace queued/mock verification with live transactional email.

**Tasks**
1. Implement provider-backed send in `packages/api/src/integrations/resend.ts` (or configured provider adapter).
2. Add template rendering and localization fallback strategy.
3. Add retry/backoff + dead-letter behavior for transient failures.
4. Store verification token lifecycle (issued, sent, used, expired, revoked).
5. Add abuse protection (rate limit + resend cooldown + IP/user throttles).
6. Add integration + contract tests for token validation and expiry behavior.

**Acceptance**
- Verification email delivery observable in staging.
- Token validation works across success, expiry, and replay attempts.
- Failure alerts are emitted for sustained send errors.

**Repository task split**
- **blackout**: Implement verification UI states (pending/sent/verified/error), resend cooldown UX, and support messaging.
- **free black market**: Not owner for verification flow; only expose account-link metadata if product identity linkage is required.
- **blackout server**: Own provider integration, token lifecycle, throttling, retries, and verification APIs.

### 3) Auth & Secret Hardening (Critical Blocker)
**Objective:** Eliminate insecure defaults and enforce secure runtime posture.

**Tasks**
1. Remove fallback JWT secret defaults; require non-empty strong secret.
2. Add startup preflight checks for required secrets and env shape.
3. Add secret rotation playbook and dual-key rollover support where applicable.
4. Add secure cookie/token configuration validation per environment.
5. Add automated checks in CI to prevent committing insecure defaults.

**Acceptance**
- Service refuses to boot with missing/weak secrets.
- Rotation can be executed without user-visible auth outage.

**Repository task split**
- **blackout**: Enforce secure session handling expectations on the client (cookie/token expiry UX and forced re-auth flow).
- **free black market**: Maintain secret hygiene and key rotation for marketplace-side credentials used in integrations.
- **blackout server**: Enforce startup secret checks, key rotation support, and secure token/cookie policy validation.

### 4) Settings UX Completion (High Priority)
**Objective:** Replace placeholder sections with functional flows or hide unfinished sections.

**Tasks**
1. Inventory every placeholder-driven settings section.
2. Implement minimum production behavior per section:
   - About: version/build channel + support/contact links.
   - Developer: gated diagnostics and exportable debug bundle.
   - Any remaining placeholders: concrete controls or feature-flag hide.
3. Add telemetry for settings interaction and save failures.
4. Add visual and interaction tests for desktop and mobile surfaces.

**Acceptance**
- No user-visible dead-end settings pages in production preset.
- Settings updates persist and reload consistently.

**Repository task split**
- **blackout**: Primary owner for settings implementation, telemetry instrumentation, and desktop/mobile UI validation.
- **free black market**: Provide canonical support/contact destinations and product/account management deep links.
- **blackout server**: Provide settings-related APIs/config endpoints and persistence validation where server-backed.

### 5) Calls / Realtime Infrastructure Readiness (High Priority)
**Objective:** Validate call feature under production configuration.

**Tasks**
1. Confirm MatrixRTC/LiveKit configuration in all target environments.
2. Add health checks and synthetic call probes.
3. Validate fallback behavior when provider is degraded.
4. Add runbooks for incident handling and degraded mode messaging.

**Acceptance**
- Synthetic call check passes continuously in staging.
- User-facing error states are actionable and non-blocking.

**Repository task split**
- **blackout**: Call controls, degraded mode messaging, and client diagnostics surface.
- **free black market**: No direct call-stack ownership.
- **blackout server**: Realtime provider config, health checks, synthetic probes, and incident runbook automation.

### 6) Moderation, Governance, and Event Reliability (High Priority)
**Objective:** Ensure custom room-state/event-driven features are operationally safe.

**Tasks**
1. Define event schema/versioning for governance, vote, roles, and deaddrop events.
2. Add migration/compat strategy for event schema changes.
3. Add replay-safe handlers and idempotent processing.
4. Add admin diagnostics for event health and backlog.

**Acceptance**
- Event consumers tolerate duplicate/out-of-order delivery.
- Schema changes are backward compatible or safely migrated.

**Repository task split**
- **blackout**: Governance/moderation UI updates for schema versions and operational diagnostics.
- **free black market**: Consume governance/product entitlement signals only where cross-system behavior is required.
- **blackout server**: Event schema/versioning, replay safety, compatibility migrations, and admin health endpoints.

### 7) Release Engineering & Observability (High Priority)
**Objective:** Make deployment repeatable, observable, and reversible.

**Tasks**
1. Define staging -> canary -> production promotion gates.
2. Add SLOs/alerts for auth errors, email failures, payment failures, and call failures.
3. Add release checklist (migrations, smoke tests, rollback command set).
4. Add post-deploy verification script and on-call handoff template.

**Acceptance**
- Every release has a recorded checklist and post-deploy verification artifact.
- Rollback drill succeeds within target recovery time.

**Repository task split**
- **blackout**: Frontend canary checks, release notes, and client regression smoke suite.
- **free black market**: Marketplace deployment gates, payment/product KPI alerts, and rollback runbook.
- **blackout server**: API canary gates, auth/email/payment SLO alerts, and infra rollback automation.

## Milestone Timeline (Suggested)

### Milestone 1 (Week 1): Blockers Closed
- Payments/products integration with `freeblackmarket.com` implemented and webhook-verified.
- Email verification live and monitored.
- Secret hardening and startup validation enforced.

### Milestone 2 (Week 2): UX and Realtime Hardening
- Placeholder settings removed or fully implemented.
- Calls validated with synthetic probes and fallback paths.
- Governance/moderation event reliability controls in place.

### Milestone 3 (Week 3): Production Launch Readiness
- Canary release process active.
- Observability dashboards + alerts tuned.
- Rollback and incident runbooks exercised.

## RACI (Suggested)
- **Backend Lead:** Payments, email, auth hardening.
- **Frontend Lead:** Settings completion, call UX fallback, instrumentation.
- **Platform/SRE:** Secrets, rollout gates, observability, runbooks.
- **QA Lead:** End-to-end regression matrix and release sign-off.
- **Product/Program:** Scope control, readiness checkpoints, go/no-go decision.

## Delivery Artifacts
- Updated API integration modules and tests.
- Settings UX completion PR set.
- Environment validation scripts and CI checks.
- Release checklist, runbooks, and dashboard links.
- Final production readiness report with evidence per acceptance criterion.

## Cross-Repo Tracking Matrix

### blackout
- Settings UX completion and placeholder removal.
- Checkout and entitlement user journeys.
- Verification and auth state UX hardening.
- Client-side smoke tests for canary promotion.

### free black market
- Product catalog and checkout/session APIs.
- Webhook/event correctness and transaction lifecycle authority.
- Marketplace-side deployment/rollback guardrails.

### blackout server
- Integration adapters for freeblackmarket checkout/product sync.
- Verification provider integration and token lifecycle controls.
- Auth secret enforcement, observability, and release gates.
