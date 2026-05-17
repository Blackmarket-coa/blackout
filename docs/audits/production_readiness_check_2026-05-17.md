# Production readiness check — 2026-05-17

- Branch: `claude/production-readiness-check-9rxU3`
- HEAD: `f8304f7ce817bf4592b5bebb71fe896fd5f0ecc9`
- Evidence: [`docs/operations/evidence/2026-05-17-production-readiness-replay.md`](../operations/evidence/2026-05-17-production-readiness-replay.md)
- Regenerated signoff: [`apps/blackout-client/docs/release/staging-signoff.report.json`](../../apps/blackout-client/docs/release/staging-signoff.report.json)

## Verdict

**GO at the code / infra / observability layer. Held only on human
staging-signoff attestation.**

Every claim in the 2026-05-13 replay of
[`production_readiness_2026_05.md`](./production_readiness_2026_05.md)
was spot-checked at HEAD `f8304f7` and verified in code. All 12 BL-PR
launch gaps remain Closed. Baseline (install / lint / build / test /
audit / 7 readiness guards) is green. The only thing keeping the
release-gate red is the three `manualVerification.*` flags in
`staging-signoff.report.json`, which require human attestation on
real Tauri (desktop) + Capacitor (iOS+Android) + entitlement-transition
runs — not something a CI sandbox can provide.

## Per-surface RAG

| Surface | RAG | Notes |
| --- | --- | --- |
| Docker Compose (`deploy/docker/production`) | 🟢 | CORS allowlist + Redis rate-limit + bearer-gated `/metrics` + canary overlay + post-deploy verify all wired. |
| Railway (`railway.json`) | 🟢 | Single-instance, /health checked, restart policy set; app-layer hardening covers prior gaps. |
| Cloudflare Tunnel (`docker-compose.prod-tunnel.yml`) | 🟢 | Inherits compose closeouts. |
| Kubernetes (`deploy/helm/blackout/`) | 🟡 | Helm chart (api / external-secrets / rollout / redis) ships; cluster-side OTel collector and ExternalSecrets stores are operator-side wiring. |
| Debian single-node (`deploy/debian/`) | 🟡 | Single-node by design. |

## What stands between us and a green release gate

1. **Human attestation on staging signoff.** Follow
   [`docs/operations/runbooks/staging-signoff.md`](../operations/runbooks/staging-signoff.md):
   - Run desktop layout-integrity check on a real Tauri build.
   - Run mobile layout-integrity check on real Capacitor iOS + Android
     builds.
   - Run entitlement-transition flows end-to-end.
   - Flip `manualVerification.desktopLayoutIntegrity`,
     `mobileLayoutIntegrity`, and `entitlementTransitions` to `true`
     in `apps/blackout-client/docs/release/staging-signoff.report.json`.
   - Re-run `node tools/ci/check-blackout-client-release-gate.mjs`.
2. **Cluster-side observability wiring** (only if launching on k8s, not
   Compose/Railway/Tunnel): import the alert rules from
   `docs/operations/alerts/`, the dashboards from
   `docs/operations/dashboards/`, wire `INTERNAL_METRICS_TOKEN` into
   the Prometheus scrape job, point the OTel collector at the API, and
   provision Sentry DSN per
   [`docs/operations/observability-setup.md`](../operations/observability-setup.md).
   Compose / Railway / Tunnel launches are unaffected.

## Verified at HEAD (sampled — full list in
[`production_readiness_2026_05.md`](./production_readiness_2026_05.md) §3)

- CORS: `packages/api/src/index.ts:81-95` — `isOriginAllowed()` wired;
  prod refuses wildcard. `check-cors-allowlist` clean (179 files).
- Rate limit: `packages/api/src/middleware/rate-limit.ts:46-78` — Redis
  sliding-window when `REDIS_URL` set.
- Auth lifecycle: `packages/api/src/routes/auth.ts` — refresh, logout,
  sessions/revoke, password change/reset, email verify, account
  delete/export.
- `/metrics`: `packages/api/src/index.ts:177-196` — bearer-gated; 503
  in production if `INTERNAL_METRICS_TOKEN` unset.
- Tracing + Sentry init: `packages/api/src/index.ts:205-206`.
- JWT entropy + rollover: `packages/api/src/services/auth.ts:34-60`.
- Mailer + failover: `packages/api/src/integrations/smtp.ts` +
  `failoverMailer.ts`; circuit-breaker resend→smtp;
  `MailFailoverActive` Prometheus alert.
- Security headers: `packages/api/src/middleware/security-headers.ts`
  — strict CSP, HSTS preload, COOP/CORP.
- Migrations: 19 total, latest `019_obs_ws_passwords`; 007–019 have
  `.up.sql` + `.down.sql` pairs; `verify-migrations-ephemeral`
  reversible=13, tables=33.
- CI: `ci.yml` has `e2e-smoke` + `unit-tests` (coverage gate),
  `load.yml` is real k6 nightly w/ pg+redis services,
  `dr-backup-verification.yml` actually restores + asserts,
  `deploy-compose-prod.yml` has canary / promote / full-rollout with
  `POST_DEPLOY_BEARER` + `post-deploy-verify.mjs` in all three.

## Deferred / non-blocking (do not interpret as "broken")

From [`KNOWN_LIMITATIONS.md`](../../KNOWN_LIMITATIONS.md) and
[`docs/architecture/deferred-bodies-schedule-2026-05-01.md`](../architecture/deferred-bodies-schedule-2026-05-01.md):

- Livestream den-chat overlay — deep-link interim shipped; full overlay
  is Workstream D.
- Playbook Q1 size icons — component supports them, awaiting design SVGs.
- Marketplace stubs (Blamazon / MayhemMarketplaze / AntinAmazon) —
  registered providers but disabled by default via `*_ENABLED=false`.
  Real adapter is FBM (works when its env keys are set). **Do not flip
  the stubs on in production until real adapters exist.**
- Notification tap → room/thread routing — no harnessed test coverage
  on Capacitor / Tauri yet.
- Workstream B (`@blackout/ui` v1), C (~60%), D (P2 parity), E (P3
  parity), F (P4 polish) — all post-beta scope.
- Phase 0 archive push (`archive/element-web-fork` branch +
  `v0-element-fork` tag) — preservation-only; not a launch blocker
  per the supersession note in [`PHASE0_STATUS.md`](../../PHASE0_STATUS.md).

## Residual risk (carry forward from `production_readiness_2026_05.md` §7)

- A1: plaintext to SFU operator until SFrame E2EE deploys.
- R1: metadata leakage at homeserver until sealed-sender lands upstream.
- A8/A11: supply chain mitigated by lockfile + SBOM + Sigstore + RFC
  6962 KT, not eliminated.
- A9: PQ on Megolm deferred to upstream; deaddrop is already hybrid.
