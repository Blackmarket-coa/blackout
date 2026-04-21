# Blackout Single-Server Production Launch Plan

## Scope & guardrails

- **Topology (single server, production hardened):**
  - `chat.theblackout.app` → Cinny-based web app (`apps/blackout-client`)
  - `matrix.theblackout.app` → Synapse client/federation endpoint
  - `api.theblackout.app` → Blackout service layer (product logic only)
  - `turn.theblackout.app` → coturn for VoIP/media relay
- **Matrix-first contract:** keep Matrix protocol, client-server APIs, and federation behaviors as the source of truth for realtime messaging.
- **Hard boundary:** Stoat is **UX inspiration only**; no Stoat backend/protocol/runtime imports into Matrix client path.
- **Customization strategy:** move existing frontend customizations into explicit plugin/feature modules with typed boundaries and CI gating.
- **Ops policy:** no hardcoded shell hacks; every operational action must be encoded in versioned IaC/scripts/docs.

---

## 1) Week-by-week execution plan (infra, backend, frontend, ops)

## Week 1 — Foundation, architecture freeze, and deployment skeleton

### Infra
- Reserve DNS records and TLS strategy for all four subdomains.
- Define reverse-proxy routing map (Nginx/Caddy) for path/host separation.
- Create production `docker-compose.prod.yml` with distinct services for Synapse, PostgreSQL, Redis (optional), Blackout API, coturn, reverse proxy.
- Add persistent volume map and backup mount points.

### Backend
- Define API boundary document: Blackout service layer consumes Matrix events and exposes product-specific APIs without replacing Matrix messaging APIs.
- Add environment schema validation for API service (`SERVER_NAME=theblackout.app`, Synapse base URL, signing secrets).
- Add idempotent startup/migration pipeline.

### Frontend
- Create customization inventory from `apps/blackout-client`: theme overrides, behavior hooks, custom room affordances.
- Introduce `features/` + `plugins/` boundary map (manifest-based load order).
- Add “no cross-import” lint rule to block customizations leaking into core client runtime.

### Ops
- Establish launch runbook v1 and incident severity model.
- Define SLOs and baseline observability metrics (API latency, Synapse request rates, federation queue, TURN allocation errors).
- Add CI launch gate for boundary checks and environment completeness.

**Exit criteria:** Architecture Decision Record (ADR) signed; production skeleton composes locally and in staging.

## Week 2 — Synapse and federation readiness

### Infra
- Deploy Synapse + PostgreSQL with production config (workers optional for single node but config-ready).
- Configure `.well-known` and delegated server discovery behavior for `theblackout.app` and `matrix.theblackout.app`.
- Configure firewall ports and reverse proxy websockets/timeouts.

### Backend
- Implement service-layer ingestion flow from Synapse events/webhooks (or polling fallback) with retry and dead-letter handling.
- Add audit/event log model for product logic outcomes.

### Frontend
- Wire client homeserver defaults to `https://matrix.theblackout.app` with environment-driven override.
- Validate login/session, room timeline, send/edit/redact, media upload/download against Synapse staging.

### Ops
- Run federation smoke checks to/from reference public homeservers.
- Add backup automation for Synapse DB/media and API DB (if separate).
- Add restore drill script and document RTO/RPO.

**Exit criteria:** Federation passes smoke checks, Synapse backup/restore drill succeeds.

## Week 3 — Blackout service layer hardening + UX modularization

### Infra
- Introduce secret management flow (dotenv templating + runtime secret injection).
- Add per-service health checks and readiness probes.

### Backend
- Complete product-logic endpoints under `api.theblackout.app` (non-Matrix domain logic only).
- Add auth/session trust model (Matrix token verification or bridge token exchange).
- Add rate limits, structured errors, and tracing correlation IDs.
- Implement canary-safe migration strategy (expand/migrate/contract).

### Frontend
- Move all custom behavior into plugin modules:
  - `plugins/theme-*`
  - `plugins/composer-*`
  - `plugins/navigation-*`
  - `features/*` for larger UX surfaces
- Add feature-flag controls and runtime kill switches.
- Apply Stoat-inspired interaction patterns as UI components only (navigation ergonomics, composer actions, information density), preserving Matrix event semantics.

### Ops
- Build dashboards + alerts for Synapse, API, reverse proxy, coturn.
- Add synthetic probes for:
  - user login
  - room send/receive
  - API business action
  - TURN allocation test

**Exit criteria:** Frontend customizations fully modularized and kill-switchable; service layer passes resiliency tests.

## Week 4 — TURN/media, security, and pre-launch rehearsals

### Infra
- Deploy coturn at `turn.theblackout.app` with TLS certs and static-auth-secret.
- Configure Synapse TURN integration and client ICE server distribution.
- Validate media relay/timeout behavior under NAT scenarios.

### Backend
- Security hardening pass: input validation, authz checks, secrets rotation procedure, dependency scan fixes.
- Add abuse controls for high-risk API routes.

### Frontend
- Validate call setup UX and media fallback states.
- Add regression suite for plugin load failures and fallback to core Matrix experience.

### Ops
- Conduct game days:
  - Synapse restart + catch-up
  - API restart during active session
  - TURN outage simulation
  - Disk pressure and backup recovery
- Finalize launch checklist and go/no-go template.

**Exit criteria:** Security checklist complete; call/media workflows stable; game day objectives passed.

## Week 5 — Launch and hypercare

### Infra
- Cut production DNS/TLS live.
- Enable scheduled backups and verify first successful run.

### Backend
- Enable production feature flags in phased rollout (internal → beta cohort → general).
- Monitor API error budget and rollback thresholds.

### Frontend
- Roll out plugin bundles incrementally; monitor client error telemetry and performance.

### Ops
- 72-hour hypercare rotation with on-call ownership.
- Daily launch review: incidents, user friction, federation stats, action items.

**Exit criteria:** Launch stable for 72h with no Sev-1 and acceptable SLO burn.

---

## 2) Detailed task list with file paths

> Paths below are the intended implementation targets in this repo.

### Infrastructure & deployment
- Create production composition and env template:
  - `infra/production/docker-compose.prod.yml`
  - `infra/production/.env.example`
- Add reverse proxy config templates:
  - `infra/production/nginx/nginx.conf`
  - `infra/production/nginx/sites-enabled/blackout.conf`
- Add Synapse prod config overlays:
  - `infra/synapse/homeserver.prod.yaml`
  - `infra/synapse/log.config`
- Add coturn config:
  - `infra/coturn/turnserver.conf`
- Add backup + restore scripts:
  - `infra/scripts/backup-all.sh`
  - `infra/scripts/restore-synapse.sh`
  - `infra/scripts/restore-api.sh`
- Add launch runbooks:
  - `infra/runbooks/launch-checklist.md`
  - `infra/runbooks/incident-response.md`

### Backend (Blackout service layer)
- Define runtime config schema + validation:
  - `blackout/packages/service/src/config/schema.ts`
- Add Matrix integration module (events/auth verification only):
  - `blackout/packages/service/src/integrations/matrix/client.ts`
  - `blackout/packages/service/src/integrations/matrix/verify.ts`
- Add product API routes and domain logic:
  - `blackout/packages/service/src/routes/v1/*.ts`
  - `blackout/packages/service/src/domain/**/*.ts`
- Add migrations and migration runner:
  - `blackout/packages/service/src/db/migrations/*`
  - `blackout/packages/service/src/db/migrate.ts`
- Add resilience and security middleware:
  - `blackout/packages/service/src/middleware/rate-limit.ts`
  - `blackout/packages/service/src/middleware/request-id.ts`
  - `blackout/packages/service/src/middleware/error-shaping.ts`

### Frontend (Cinny-based client)
- Define plugin contract + registry:
  - `blackout/apps/blackout-client/src/plugins/types.ts`
  - `blackout/apps/blackout-client/src/plugins/registry.ts`
  - `blackout/apps/blackout-client/src/plugins/manifest.ts`
- Migrate existing customizations into plugin boundaries:
  - `blackout/apps/blackout-client/src/plugins/theme/*`
  - `blackout/apps/blackout-client/src/plugins/composer/*`
  - `blackout/apps/blackout-client/src/plugins/navigation/*`
- Keep Matrix core untouched behind adapter boundary:
  - `blackout/apps/blackout-client/src/matrix-adapters/*`
- Add feature flags and kill switches:
  - `blackout/apps/blackout-client/src/features/flags.ts`
  - `blackout/apps/blackout-client/src/features/kill-switch.ts`
- Add boundary guard tests:
  - `tools/ci/check-matrix-boundary.mjs`
  - `tools/ci/check-plugin-boundaries.mjs`

### Operations / quality
- Add smoke harness scripts:
  - `tools/ops/smoke-login.mjs`
  - `tools/ops/smoke-room-send.mjs`
  - `tools/ops/smoke-api-flow.mjs`
  - `tools/ops/smoke-turn-allocation.mjs`
- Add release orchestration doc:
  - `infra/runbooks/release-orchestration.md`
- Add launch CI workflow:
  - `.github/workflows/launch-readiness.yml`

---

## 3) Acceptance criteria per task

### Infra acceptance criteria
- All four hostnames resolve and return valid TLS chains.
- Reverse proxy correctly routes by hostname with websocket support for Matrix sync.
- `docker compose -f infra/production/docker-compose.prod.yml config` passes and services become healthy.
- Backups are produced on schedule and restore drill proves data recovery inside target RTO/RPO.

### Backend acceptance criteria
- API starts only with valid config schema and fails fast on missing secrets.
- Matrix token verification enforced on protected routes.
- Product endpoints meet latency and error budget targets under load test baseline.
- Migrations are repeatable/idempotent across staging refresh cycles.

### Frontend acceptance criteria
- All custom UX behavior loads via plugin registry (no direct core patching).
- Disabling a plugin falls back to baseline Matrix-compatible behavior without crash.
- CI boundary checks fail if Stoat/backend/runtime imports enter client Matrix path.
- Login, room messaging, media, and settings remain functional with feature flags on/off.

### Ops acceptance criteria
- Dashboards expose key golden signals for Synapse/API/TURN.
- Alert routing reaches on-call with validated escalation paths.
- Smoke suite passes pre-deploy and post-deploy.
- Runbooks are sufficient for a new operator to execute launch and incident mitigation.

---

## 4) Rollback plan per risky change

### Risky change A: Synapse production cutover
- **Trigger:** elevated 5xx, federation failures, login failures > threshold.
- **Rollback:**
  1. Repoint reverse proxy upstream to previous Synapse container tag.
  2. Restore previous Synapse config snapshot.
  3. If DB migration involved, restore latest known-good DB snapshot and media index.
- **Verification:** federation ping + login + message send smoke tests.

### Risky change B: Blackout API schema/migration deploy
- **Trigger:** migration failure, data integrity alerts, elevated API error rate.
- **Rollback:**
  1. Stop new API pods/containers.
  2. Roll back to prior image tag.
  3. Execute down-migration only if pre-validated; else restore DB snapshot.
- **Verification:** API health, critical endpoint smoke, audit log continuity.

### Risky change C: Frontend plugin modularization release
- **Trigger:** client boot failures, high JS error rate, critical UX regression.
- **Rollback:**
  1. Disable offending plugin via server-provided flags/kill switch.
  2. Re-deploy prior static bundle if issue persists.
- **Verification:** client loads baseline, login + timeline + send flows succeed.

### Risky change D: coturn enablement
- **Trigger:** call setup failures or ICE timeout spikes.
- **Rollback:**
  1. Switch clients to fallback TURN/STUN config.
  2. Revert Synapse TURN credential distribution config.
- **Verification:** call setup success rate returns to baseline.

### Risky change E: DNS/TLS final cutover
- **Trigger:** cert mismatch, propagation errors, endpoint unreachability.
- **Rollback:**
  1. Revert DNS to prior targets (low TTL required before launch).
  2. Restore previous certificate binding.
- **Verification:** HTTPS checks and application-level probes pass from multiple regions.

---

## 5) Smoke/regression test matrix

| Area | Test | Command / Method | Stage | Pass criteria |
|---|---|---|---|---|
| DNS/TLS | Endpoint reachability | `curl -I https://chat.theblackout.app` (and matrix/api/turn probes) | Pre + Post deploy | 2xx/3xx + valid cert |
| Matrix auth | User login | scripted login via test account | Staging + Prod | token issued, session persisted |
| Timeline | Send/receive message | room send + sync receive within SLA | Staging + Prod | message echoed and visible |
| Federation | Remote room exchange | invite/send with external homeserver | Staging + Prod | cross-server event delivery success |
| Media | Upload/download | file upload then fetch MXC URI | Staging + Prod | media accessible and integrity verified |
| API | Core product action | `node tools/ops/smoke-api-flow.mjs` | Staging + Prod | 2xx and expected side effects |
| Plugin boundary | Isolation gate | `node tools/ci/check-plugin-boundaries.mjs` | CI | no forbidden imports |
| Matrix boundary | Protocol integrity gate | `node tools/ci/check-matrix-boundary.mjs` | CI | no backend/runtime contamination |
| Feature flags | Kill switch test | toggle plugin off in runtime config | Staging | client remains usable |
| TURN | Relay allocation | coturn allocation probe + call setup | Staging + Prod | allocation success + call established |
| Resilience | Synapse/API restart | rolling restart under active sessions | Staging | sessions recover without data loss |
| Backup/restore | Recovery drill | restore latest snapshots to isolated env | Weekly | RTO/RPO target met |
| Security | Authz & rate-limit | scripted abuse tests | Staging | denied/limited as designed |
| Observability | Alert pipeline | synthetic failure + alert receipt | Staging + Prod | on-call notified within target |

---

## Sequencing notes for delivery orchestration

- Start with **boundary enforcement + infra skeleton** before feature migration.
- Do **federation and backups** before production traffic.
- Gate frontend rollout through **feature flags + kill switches**.
- Treat launch as progressive enablement, not a single flip.
