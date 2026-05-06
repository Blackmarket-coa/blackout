# Production Readiness Audit — May 2026

- Branch: `claude/production-readiness-check-NLV6H`
- Base commit: `1ff3f28` (Merge PR #620 — `feat(shell): retire LegacyClientLayout`)
- Scope: full repository at `/home/user/blackout` — `packages/api` (Hono server), `apps/blackout-client`, `apps/blackout-server` (legacy), `blackout-desktop` (Tauri), `blackout-mobile` (Capacitor), `mobile/`, deployment surfaces under `deploy/`
- Methodology: code review of API server, configuration, CI workflows, deployment manifests; verification of CI guards under `tools/ci/`; cross-reference against `THREAT_MODEL.md` and `SECURITY.md`

---

## 1. Executive summary

| Surface | RAG | Notes |
| --- | --- | --- |
| Docker Compose (`deploy/docker/production`) | 🟡 Amber | Most mature. Fails for >1 replica today (in-process rate limit). Open CORS. No `/metrics` scrape target wired. |
| Kubernetes phase 4–6 (`deploy/kubernetes`) | 🟠 Amber/Red | Manifests exist as a roadmap; OTel collector is a stub; no Helm; no External Secrets; no working canary. |
| Railway (`railway.json`) | 🟢 Green for single-instance | Works as-is for solo deploys; same CORS/observability gaps apply. |
| Cloudflare Tunnel (`docker-compose.prod-tunnel.yml`) | 🟡 Amber | Documented runbook; same rate-limit/CORS issues. |
| Debian (`deploy/debian/`) | 🟡 Amber | Single-node baseline; observability gaps dominate. |

The CI guard surface is unusually strong (33 workflows, 40+ `tools/ci/check-*.mjs` guards, OSV/Semgrep/Gitleaks/Trivy in `security.yml`, image-policy enforcement, release-gate, deployment-readiness). The runtime hardening lags the CI surface: open CORS, in-memory rate limiter, no metrics endpoint, missing auth lifecycle endpoints.

**Recommendation:** Hold the GO decision in `tools/ci/check-blackout-client-release-gate.mjs` until **Phase 1** (edge hardening) and **Phase 4** (observability) close. Phases 2, 3, 5, 6 are required for sustained operation but do not block first launch behind a Cloudflare Tunnel with a single replica.

---

## 2. Strengths inventory

| Area | Evidence |
| --- | --- |
| CI/CD breadth | 33 workflows in `.github/workflows/`; `ci.yml` has 18 jobs (lint, typecheck, unit, feature registry, deployment readiness, image policy, bundle-size 24 MB, frontend consolidation gates) |
| Security scanning | `.github/workflows/security.yml` runs `pnpm audit`, OSV Scanner v2.3.3, Semgrep (`p/security-audit`, `p/secrets`), Gitleaks, Trivy (CRITICAL/HIGH) |
| Image policy | `deploy/docker/production/scripts/check-no-latest-images.sh` blocks `:latest` |
| JWT hardening | `packages/api/src/services/auth.ts:33-99` — 32 char minimum, mixed-class entropy check, weak-pattern blocklist, rollover keys supported |
| Auth secret guard | `tools/ci/check-auth-secrets.mjs` blocks default secrets, weak fallbacks, insecure cookie flags |
| WebAuthn | `packages/api/src/services/webauthn.ts` via `@simplewebauthn/server` 13.3.0 |
| PQ-hybrid crypto | `packages/blackout-protocol/src/deaddrop/crypto/` — X25519 + ML-KEM-768 via `@noble/post-quantum` |
| Redacting structured logger | `packages/api/src/telemetry/logger.ts:20-37` — secret redaction + production PII pseudonymisation |
| Security headers | `packages/api/src/middleware/security-headers.ts` — strict CSP `default-src 'none'`, HSTS preload, COOP/CORP, frame-ancestors deny |
| Input validation | Zod schemas at every API boundary via `packages/api/src/middleware/validate.ts:13-37` |
| Release gate | `tools/ci/check-blackout-client-release-gate.mjs` requires staging signoff with Sev1/Sev2=0, GO decision, manual desktop/mobile flags |
| Deployment readiness gate | `tools/ci/check-deployment-readiness.mjs` enforces `.env.example`, Dockerfiles, scripts, `.gitignore` baselines |
| Compose service topology | Postgres 16 + Redis + worker + Caddy + Cloudflared with Docker secrets and named volumes |
| Migration ephemeral test | `tools/ci/verify-migrations-ephemeral.mjs` runs SQL against PGlite |

---

## 3. Gap register

| ID | Severity | Surface(s) | Title | Evidence | Phase |
| --- | --- | --- | --- | --- | --- |
| BL-PR-01 | Critical | All | CORS open to any origin | `packages/api/src/index.ts:52` — `app.use('*', cors())` | 1 |
| BL-PR-02 | Critical | Compose+k8s+Railway (any >1 replica) | Rate limit uses in-process `Map`; not shared across replicas; bypassed by trusting `x-forwarded-for` | `packages/api/src/middleware/rate-limit.ts:9,23` | 1 |
| BL-PR-03 | Critical | All | No password reset, password change, refresh-token rotation, logout, or session revocation | `packages/api/src/routes/auth.ts` (only `/register`, `/login`, `/webauthn`) | 2 |
| BL-PR-04 | High | All | No `/metrics`, no tracing, no error tracking despite Prometheus/Grafana under `deploy/docker/production/monitoring/` and OTel stub `deploy/kubernetes/phase4/opentelemetry.yaml` | grep across `packages/api`, `apps/blackout-client` | 4 |
| BL-PR-05 | High | All | Migrations are forward-only SQL; no `.down.sql`; the `migrate` package script is a `console.log` no-op | `packages/api/src/db/migrations/00{1..6}_*.sql`; `packages/api/package.json` "migrate" | 3 |
| BL-PR-06 | High | All | No verifiable PITR restore runbook; `.github/workflows/dr-backup-verification.yml` does not actually restore | `dr-backup-verification.yml`; `docs/operations/evidence/2026-02-20-…recovery-drill.md` | 3 |
| BL-PR-07 | High | All | Playwright configured but not wired into `.github/workflows/ci.yml`; no Vitest coverage thresholds; 6 quarantined client tests | `playwright.config.ts`, `apps/blackout-client/vitest.config.ts:22-44` | 5 |
| BL-PR-08 | Medium | All | No load tests (k6/Artillery/autocannon); no documented latency/throughput SLOs | none found | 5 |
| BL-PR-09 | Medium | k8s, Compose | k8s is YAML only; no Helm/Terraform; production deploy is a manual `workflow_dispatch` with no canary or blue/green | `.github/workflows/deploy-compose-prod.yml`; `deploy/kubernetes/phase{4,5,6}/*.yaml` | 6 |
| BL-PR-10 | Medium | All | No external-secrets integration; JWT rotation supported in code (`JWT_SECRET_ROLLOVER`) but no operational runbook | `packages/api/src/services/auth.ts:46` | 6 |
| BL-PR-11 | Medium | All | `apps/blackout-server/.env.example` ships `JWT_SECRET=change-me` — would be rejected at startup but is a confusing default | `apps/blackout-server/.env.example` | 1 |
| BL-PR-12 | Low | All | `packages/api/.env.example` ships both `JWT_SECRET_PRIMARY` and legacy `JWT_SECRET` — duplication invites drift | `packages/api/.env.example` | 1 |

---

## 4. Per-surface deep dive

### 4.1 Docker Compose — `deploy/docker/production/`

- Health: `wget http://127.0.0.1:3000/healthz` is invoked from `deploy-compose-prod.yml` after `up -d` but the API exposes `/health`, not `/healthz` (`packages/api/src/index.ts:97`). Verify the Caddy front-end rewrites or fix the workflow.
- Postgres + Redis + worker + Caddy + Cloudflared services with named volumes and Docker secrets — solid.
- Image policy enforced via `scripts/check-no-latest-images.sh`.
- Gaps: BL-PR-01, 02, 04 apply directly.

### 4.2 Kubernetes — `deploy/kubernetes/phase{4,5,6}/`

- Phase 4: HA placeholders, OTel collector stub, circuit-breaker manifest. None wired to real exporters.
- Phase 5: NetworkPolicy + PSP + workload identity skeletons.
- Phase 6: Federation alerts, WAF, autoscaling, multi-region. Aspirational.
- Gaps: BL-PR-04, 06, 09, 10. **Add Redis StatefulSet (Phase 1) before claiming HA.**

### 4.3 Railway — `railway.json`

- Nixpacks builder, `/health` health-check, restart policy. Single-instance is fine; CORS/observability gaps apply.

### 4.4 Cloudflare Tunnel — `deploy/docker/production/docker-compose.prod-tunnel.yml`

- Documented in `CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`. Inherits all Compose gaps.

### 4.5 Debian — `deploy/debian/`

- Single-node baseline install path. Useful for self-host operators but not multi-replica.

---

## 5. Remediation roadmap (summary)

Phases are dependency-ordered; each phase ships as an independent commit series and is independently revertable. See `/root/.claude/plans/do-a-production-readiness-swift-church.md` for the full plan. Concise summary:

| Phase | Intent | Closes | Commits |
| --- | --- | --- | --- |
| 1 | Edge hardening & multi-replica correctness (CORS allowlist, Redis rate limit) | BL-PR-01, 02, 11, 12 | 4 |
| 2 | Auth lifecycle (reset/change/refresh/logout/revoke) | BL-PR-03 | 3 |
| 3 | Migrations + restore drill | BL-PR-05, 06 | 3 |
| 4 | Observability (metrics, tracing, error tracking) | BL-PR-04 | 4 |
| 5 | Test pyramid + load (e2e in CI, coverage gates, k6) | BL-PR-07, 08 | 3 |
| 6 | Deploy safety (Helm, External Secrets, canary) | BL-PR-09, 10 | 4 |

---

## 6. Verification matrix

| Gap | Verification artefact |
| --- | --- |
| BL-PR-01 | `tools/ci/check-cors-allowlist.mjs` (new); `packages/api/src/__tests__/cors.test.ts` |
| BL-PR-02 | `packages/api/src/middleware/__tests__/rate-limit.redis.test.ts`; manual two-replica counter check |
| BL-PR-03 | `packages/api/src/routes/__tests__/auth.password-reset.test.ts`, `auth.refresh-rotation.test.ts`, `auth.logout-revocation.test.ts` |
| BL-PR-04 | `packages/api/src/telemetry/__tests__/metrics.test.ts`; OTel collector log inspection in compose; Sentry test event |
| BL-PR-05 | `tools/ci/check-db-migrations.mjs` extension; `tools/ci/verify-migrations-ephemeral.mjs` round-trip |
| BL-PR-06 | `.github/workflows/dr-backup-verification.yml` — actual restore + row-count assertion |
| BL-PR-07 | New `e2e` job in `.github/workflows/ci.yml`; coverage threshold in `apps/blackout-client/vitest.config.ts` |
| BL-PR-08 | `.github/workflows/load.yml` nightly k6 with `http_req_duration p(95)<300`, error rate <1% |
| BL-PR-09 | `helm template deploy/helm/blackout` clean render; canary stage in `deploy-compose-prod.yml` |
| BL-PR-10 | `deploy/kubernetes/phase4/external-secrets.yaml`; `docs/operations/runbooks/jwt_rotation.md` |

---

## 7. Residual risk register (carry forward)

These risks are accepted or deferred per `THREAT_MODEL.md` and remain after the remediation phases:

- **A1 (active network attacker on SFU media):** plaintext to SFU operator; SFrame E2EE deployment deferred.
- **R1 (metadata leakage at homeserver):** sealed-sender awaiting upstream Matrix support.
- **A8/A11 (supply chain):** mitigated by lockfile pinning + SBOM + Sigstore + RFC 6962 key transparency, but not eliminated.
- **A9 (post-quantum on Megolm):** deaddrop is hybrid; group-message PQ deferred to upstream.

---

## 8. Appendix — files inspected

Server: `packages/api/src/index.ts`, `packages/api/src/middleware/{rate-limit,security-headers,validate,auth,require-user}.ts`, `packages/api/src/services/auth.ts`, `packages/api/src/telemetry/logger.ts`, `packages/api/src/config/security.ts`, `packages/api/src/routes/*.ts`, `packages/api/src/db/migrations/*.sql`, `packages/api/.env.example`, `packages/api/package.json`.

Client: `apps/blackout-client/vitest.config.ts`, `apps/blackout-client/src/app/core/features/featureFlags.ts`.

Workflows: `.github/workflows/{ci,security,docker,deploy-web,deploy-compose-prod,dr-backup-verification,sonarqube,release}.yml`.

Deploy: `deploy/docker/production/{docker-compose.yml,docker-compose.prod-tunnel.yml,Caddyfile}`, `deploy/kubernetes/phase{4,5,6}/`, `railway.json`.

Guards: `tools/ci/{check-deployment-readiness,check-blackout-client-release-gate,check-auth-secrets,check-db-migrations,verify-migrations-ephemeral}.mjs`.

Top-level docs: `THREAT_MODEL.md`, `SECURITY.md`, `README.md`, `MIGRATION_INVENTORY.md`, `BLACKOUT_BUILD_PLAN.md`.
