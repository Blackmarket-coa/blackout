# No-SPOF topology re-review — 2026-05-17

Refresh of [`2026-02-20-no-spof-topology-review.md`](./2026-02-20-no-spof-topology-review.md).
Static review of current deployment manifests against
[`docs/operations/SPOF_MAP.md`](../SPOF_MAP.md).

- Branch: `claude/production-readiness-check-9rxU3`
- HEAD: `b7d3571`

## Method

The 2026-02-20 review pointed at `deploy/kubernetes/phase{4,6}/*.yaml`
files that have since been replaced by the Helm chart at
`deploy/helm/blackout/`. This re-review walks the SPOF_MAP rows and
confirms each row's "current mitigation" still matches an artifact
in the repo at HEAD.

## SPOF_MAP row-by-row attestation

| # | SPOF | Mitigation evidence at HEAD `b7d3571` |
| --- | --- | --- |
| 1 | Primary HP ProLiant DL360 Gen9 server | `infra/single-server-baseline/RUNBOOK.md` present; `docs/operations/runbooks/postgres_restore_drill.md` present; secondary-server pattern documented but not provisioned (Foundation tier). |
| 2 | Cloudflare Tunnel (sole ingress) | `deploy/docker/production/docker-compose.prod-tunnel.yml` + `CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md` present; fallback nginx documented, not enabled. |
| 3 | Shared Postgres (FBM + Synapse + API) | `deploy/docker/production/docker-compose.yml:89` runs `postgres:16-alpine` single instance. Nightly dump cadence + restore drill workflow (`dr-backup-verification.yml`) in place. |
| 4 | Synapse homeserver | `infra/single-server-baseline/RUNBOOK.md` + `docs/operations/runbooks/SYNAPSE_WORKER_ENABLEMENT.md` present (Density-tier mitigation). |
| 5 | Synapse media store | Retention policy referenced in `infra/single-server-baseline/RUNBOOK.md`. |
| 6 | coturn | `docs/operations/runbooks/townhall-livekit-coturn-provisioning.md` + `turn-launch-reliability.md` + alert in `docs/operations/alerts/townhall-sfu-alert-rules.yaml`. |
| 7 | Secrets manager (SOPS + age) | `docs/operations/secrets_rotation_break_glass.md` + `docs/operations/evidence/2026-05-10-secrets-manager-inventory.md` present. Helm chart wires `externalSecrets.enabled` for cloud-side rotation via `deploy/helm/blackout/templates/external-secrets.yaml`. |
| 8 | Maintainer (sole operator) | `docs/operations/CO_MAINTAINER_ONBOARDING.md` + `BUS_FACTOR_DRILL_CADENCE.md` present. |
| 9 | GitHub org owner account | `docs/operations/secrets_rotation_break_glass.md` covers identity hardening. |
| 10 | Cloudflare account / DNS zone | Same as row 2 — runbook present. |
| 11 | Domain registrar | Inline note in SPOF_MAP only. |
| 12 | MinIO / object storage | `docs/operations/runbooks/postgres_restore_drill.md` covers Backblaze offsite copy. |
| 13 | Stellar / USDC settlement rail | Documented behaviour in SPOF_MAP. |
| 14 | Cloudflared agent process | Compose `cloudflared` service has `restart: unless-stopped`; tunnel-disconnect alert pending Differentiation tier. |

## App / cache / ingress tier (the original 2026-02-20 review focus)

**App tier — k8s via Helm chart.**
- `deploy/helm/blackout/values.yaml:15` — `api.replicaCount: 3`.
- `deploy/helm/blackout/values.yaml:24-28` — HPA `min=3 max=12 cpu=65%`.
- `deploy/helm/blackout/values.yaml:29-30` — PDB `minAvailable: 2`.
- `deploy/helm/blackout/templates/api.yaml:33-39` —
  `topologySpreadConstraints` across `topology.kubernetes.io/zone`
  with `maxSkew: 1, whenUnsatisfiable: DoNotSchedule`.
- `deploy/helm/blackout/templates/api.yaml:94-101` — readiness + liveness probes wired to `/health`.
- **No-SPOF baseline confirmed for k8s.**

**App tier — compose.**
- `deploy/docker/production/docker-compose.yml:16-54` — primary `app`
  service. Canary overlay
  `deploy/docker/production/docker-compose.canary.yml` brings up
  `app_canary` for weighted promote.
- Single-node by design (Foundation tier per SPOF_MAP row #1); not
  the multi-replica HA path that k8s provides.

**Cache tier (Redis).**
- `deploy/helm/blackout/templates/redis.yaml` present and templated.
- `packages/api/src/middleware/rate-limit.ts:46-78` — Redis-backed
  sliding-window store when `REDIS_URL` is set; in-memory fallback
  prints a single-process-only warning. Multi-replica rate-limit
  correctness depends on `REDIS_URL` being wired in production
  (it is, via `values.yaml:64-66` + `external-secrets.yaml`).

**Ingress tier — k8s.**
- Argo Rollouts canary template at
  `deploy/helm/blackout/templates/rollout.yaml` with metric-driven
  analysis (10% → 30% → 60% → 100% with 5-min pauses,
  successRate ≥99%, p95 ≤0.5s — `values.yaml:80-91`).
- Cloudflare Tunnel remains the single ingress per SPOF row #2;
  fallback nginx documented, not enabled.

**Ingress tier — compose.**
- `deploy/docker/production/docker-compose.yml:130` — Caddy 2.9-alpine.
- Cloudflared agent in `docker-compose.prod-tunnel.yml`.

**Database tier (Postgres).**
- k8s chart does **not** template Postgres — operators bring their own
  (managed RDS / Cloud SQL / patroni). This is intentional and
  matches SPOF_MAP row #3's Foundation-tier posture.
- Compose runs single `postgres:16-alpine` with named volume.

## Delta vs 2026-02-20

| Original cite | Status at HEAD |
| --- | --- |
| `deploy/kubernetes/phase4/element-ha.yaml` | Retired. Replaced by `deploy/helm/blackout/templates/api.yaml` + `values.yaml`. |
| `deploy/kubernetes/phase6/ingress-waf-rate-limit.yaml` | Retired. Edge rate-limit moved into the API layer (Redis-backed). WAF remains operator responsibility. |
| `deploy/kubernetes/phase6/redis-ha.yaml` | Retired. Replaced by `deploy/helm/blackout/templates/redis.yaml`. |
| `deploy/kubernetes/phase6/postgres-dr-baseline.yaml` | Retired. Operator-provided per Foundation-tier posture. DR-restore covered by `.github/workflows/dr-backup-verification.yml`. |

## Verdict

**PASS** — every SPOF_MAP row's "current mitigation" cell still points
at an artifact that exists in the repo at HEAD `b7d3571`. The app
tier's no-SPOF baseline (3 replicas + topology spread + PDB + HPA)
is preserved in the Helm chart. Cache tier multi-replica rate-limit
correctness is wired. Single-Postgres / single-Cloudflare-Tunnel /
single-coturn SPOFs remain Foundation-tier-accepted per SPOF_MAP
and the SPOF map's "history is more useful than a clean table"
policy.
