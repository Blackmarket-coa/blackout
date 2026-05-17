# Stale evidence triage — 2026-05-17

The 2026-02-20 evidence cluster carried 10 attestations. Four were
re-runnable from the Claude Code sandbox and were refreshed today
(see sibling files dated 2026-05-17). The remaining six (plus the
day-61-90 aggregate) are documented here with the **blocker that
prevents a sandbox refresh** and the **owner that can refresh
them**, so the staleness is explicit rather than silent.

- Branch: `claude/production-readiness-check-9rxU3`
- HEAD: `b7d3571`
- Refreshed today (links): [postgres-drill](./2026-05-17-postgres-drill-validation.md),
  [townhall load gate](./2026-05-17-townhall-100-user-load-gate.md),
  [rollout runbook](./2026-05-17-blackout-rollout-runbook-checklist.md),
  [no-SPOF topology](./2026-05-17-no-spof-topology-review.md).

## Deferred refreshes

| 2026-02-20 file | Blocker | Owner who can refresh |
| --- | --- | --- |
| `2026-02-20-chaos-restart-verification.md` | Requires a live staging k8s cluster + `kubectl` + the ability to `kill -9` a real worker pod. The referenced script `scripts/operations/chaos_restart_verification.sh` does not exist in this repo (likely fork-era retirement). | Platform / operator with staging cluster access. Procedure to recreate the script: pick a worker pod, `kubectl delete pod <name> --grace-period=0 --force`, watch the Deployment recover, attach `kubectl get events` + pre/post `kubectl get pods` output. |
| `2026-02-20-federation-backlog-recovery-drill.md` | Requires real federation peers, a Prometheus dashboard with `synapse_federation_send_pending`, and the ability to inject an egress network block on the staging cluster. | Federation operator. Procedure documented in [`docs/operations/runbooks/federation-backlog.md`](../runbooks/federation-backlog.md) if present, else owner should write it. |
| `2026-02-20-operator-onboarding-signoff.md` | Human attestation — operator walked through onboarding pack + supervised drill participation. Sandbox cannot reproduce. | New operator + sponsor maintainer. Refresh whenever a new operator is onboarded; cadence in [`docs/operations/CO_MAINTAINER_ONBOARDING.md`](../CO_MAINTAINER_ONBOARDING.md). |
| `2026-02-20-rollback-verification.md` | Requires a staging cluster, the ability to run a rollback against a real prior revision, and the referenced `scripts/operations/rollback_verification.sh` (not present in repo). | Platform operator. The Helm chart at `deploy/helm/blackout/templates/rollout.yaml` (Argo Rollouts) supports `kubectl argo rollouts undo`; that is the modern rollback path. |
| `2026-02-20-second-region-failover-validation.md` | Requires two live k8s clusters (`primary-eu`, `secondary-us`), ArgoCD, real DNS cutover, and live ingress traffic. | Multi-region platform operator. Genuinely cluster-only. |
| `2026-02-20-scaleout-automation-validation.md` | Requires KEDA on a live cluster + a load-generation tool (k6) + Prometheus scraping. The Helm chart wires HPA (`templates/api.yaml:118-138`) but KEDA is operator opt-in. | Platform operator running KEDA. The nightly k6 schedule at `.github/workflows/load.yml` exercises the load side against the API in isolation; operator-side validation that scale-out actually triggers on that load remains a cluster-only attestation. |
| `2026-02-20-day61-90-baseline.md` | Aggregate attestation that bundles chaos / failover / scaleout / DR + operator onboarding into one milestone sign-off. **Supersedable** once any 2 of the above 6 deferred items refresh; until then this aggregate remains pinned to 2026-02-20. | Operator who refreshes the underlying items. |

## What's not stale

For completeness — and so this triage note can stand alone as the
"is operational evidence current?" answer:

- `2026-03-15-*.md` files (security audit, baseline gate replay, build artifact validation) — fresh.
- `2026-03-16-*.md` files (smoke remediation, townhall load-gates plan, sprint closures, tracker-normalization) — fresh.
- `2026-05-10-secrets-manager-inventory.md`, `2026-05-12-baseline-replay.md`, `2026-05-12-production-readiness-closeout.md` — fresh.
- `2026-05-17-*.md` files (this triage + the 4 refreshed today) — current.

The genuinely-stale tail is the 7 items above, all of which are
cluster-only or human-attestation-only. None is a launch blocker
per [`docs/audits/production_readiness_check_2026-05-17.md`](../../audits/production_readiness_check_2026-05-17.md);
they're operational hygiene items.

## Recommendation

The next operator with staging-cluster access should batch-refresh
chaos-restart + rollback in a single session (both run against the
same cluster with `kubectl`), and any federation-peer-equipped
operator should batch federation-backlog + (eventually) second-region
failover. KEDA scale-out attestation is naturally bundled with
those. After two of the six refresh, the day-61-90 aggregate can be
re-issued at the then-current date.
