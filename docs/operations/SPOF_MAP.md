# Single Point of Failure Map

Inventory of single points of failure across the consolidated FBM + Blackout stack.
Mandated by [`AGGRESSIVE_OPERATIONS_GUIDE.md` §4.2](../AGGRESSIVE_OPERATIONS_GUIDE.md)
and required as a Foundation milestone deliverable per §7.2.

This map is updated whenever a new SPOF is introduced or an existing one is
mitigated. The owning runbook column points at the operational document that
covers the failure mode.

## Inventory

| # | SPOF | Blast radius | Current mitigation | Mitigation milestone | Owning runbook |
|---|------|--------------|--------------------|----------------------|----------------|
| 1 | Primary HP ProLiant DL360 Gen9 server | Whole stack: FBM, Synapse, Postgres, ClickHouse, PostGIS, coturn | Nightly encrypted Postgres dumps offsite (Backblaze B2); secondary server reserved for offsite Postgres replication | Foundation (offsite dumps); Differentiation (streaming replication); Infrastructure (multi-host) | [`infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md), [`runbooks/postgres_restore_drill.md`](runbooks/postgres_restore_drill.md) |
| 2 | Cloudflare Tunnel (sole ingress) | All public surfaces: web client, API, Matrix, FBM storefront | None enabled; fallback nginx ingress documented | Foundation (documented); Differentiation (enabled) | [`../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`](../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md) |
| 3 | Postgres instance hosting both FBM and Synapse | Commerce + communication simultaneously | Nightly dumps; autovacuum tuning; restore-drill cadence | Foundation (drill); Differentiation (streaming replication) | [`runbooks/postgres_restore_drill.md`](runbooks/postgres_restore_drill.md) |
| 4 | Synapse homeserver | All Blackout-side communication, federation, governance ACL sync, entitlements consumption | Capacity telemetry, media retention policy, and worker-mode config staged | Foundation (telemetry shipped); Density (enable workers or Dendrite/conduwuit if I/O is binding) | [`../../infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md), [`../runbooks/SYNAPSE_WORKER_ENABLEMENT.md`](../runbooks/SYNAPSE_WORKER_ENABLEMENT.md) |
| 5 | Synapse media store | Federation + room media availability; cheapest line item to misjudge per §4.1 | Retention policy + GC cadence (pending Foundation work) | Foundation | [`../../infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md) |
| 6 | coturn | Realtime audio/video for townhall, voice, simulcast | Health checks; capacity bands TBD on real telemetry | Foundation (telemetry); Density (capacity expansion) | [`runbooks/townhall-livekit-coturn-provisioning.md`](runbooks/townhall-livekit-coturn-provisioning.md), [`runbooks/turn-launch-reliability.md`](runbooks/turn-launch-reliability.md) |
| 7 | Secrets manager (SOPS + age — chosen 2026-05-10) | Every credentialed integration | Inventory shipped; manager chosen; key-generation ceremony pending; rotation policy active per [`secrets_rotation_break_glass.md`](secrets_rotation_break_glass.md) | Foundation | [`../runbooks/SECRETS_MANAGER_MIGRATION.md`](../runbooks/SECRETS_MANAGER_MIGRATION.md) §2.C, [`evidence/2026-05-10-secrets-manager-inventory.md`](evidence/2026-05-10-secrets-manager-inventory.md) |
| 8 | Maintainer (sole operator) | All execution authority and tribal knowledge | Runbook coverage; identity hardening; bus-factor drill | Foundation (drill, identity hardening); Differentiation (co-maintainer); Infrastructure (two-person on-call) | [`CO_MAINTAINER_ONBOARDING.md`](CO_MAINTAINER_ONBOARDING.md), [`BUS_FACTOR_DRILL_CADENCE.md`](BUS_FACTOR_DRILL_CADENCE.md) |
| 9 | GitHub organization owner account | Source control + CI for the entire ecosystem | Hardware key + 2FA on the owner account | Foundation | [`secrets_rotation_break_glass.md`](secrets_rotation_break_glass.md) |
| 10 | Cloudflare account / DNS zone | Ingress, DNS, certificates | 2FA enabled; fallback ingress documented for tunnel outage; not for account loss | Foundation (2FA); Differentiation (registrar lock + recovery contacts) | [`../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`](../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md) |
| 11 | Domain registrar | DNS + delegation | 2FA; registrar-lock | Foundation | (this map) |
| 12 | MinIO / object storage (backups + media) | Backup recoverability; media availability | Offsite copy to Backblaze B2; admin credentials in secrets manager | Foundation | [`runbooks/postgres_restore_drill.md`](runbooks/postgres_restore_drill.md) |
| 13 | Stellar / USDC settlement rail (external) | Coalition Credits external settlement only; ledger remains operable | Hawala ledger absorbs settlement delays; rail outage does not stop credit accrual | Foundation (documented behaviour) | (Coalition Credits ledger UX docs, pending) |
| 14 | Cloudflared agent process | Sole ingress path while Tunnel is the only ingress | Container restart policy; alerting on tunnel disconnect | Foundation (alerts); Differentiation (fallback nginx enabled) | [`../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`](../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md) |

## How to update this map

- When a new external dependency, shared substrate component, or solo human
  becomes load-bearing, add a row.
- When a mitigation lands (for example, streaming replication enabled, or
  the fallback nginx ingress enabled), update the "current mitigation" cell
  and demote the milestone column to the next-tier mitigation.
- When a SPOF is fully eliminated, leave the row in place but mark it
  *Resolved* with the date and the PR or runbook that resolved it. The
  history is more useful than a clean table.
- The owning-runbook column must point at a real file. If no runbook covers
  the SPOF, that gap is itself the next deliverable.

## Cross-references

- [`AGGRESSIVE_OPERATIONS_GUIDE.md` §4.2](../AGGRESSIVE_OPERATIONS_GUIDE.md) — SPOF inventory rationale
- [`AGGRESSIVE_OPERATIONS_GUIDE.md` §7.2](../AGGRESSIVE_OPERATIONS_GUIDE.md) — runbook list
- [`CO_MAINTAINER_ONBOARDING.md`](CO_MAINTAINER_ONBOARDING.md) — bounds the maintainer SPOF
- [`BUS_FACTOR_DRILL_CADENCE.md`](BUS_FACTOR_DRILL_CADENCE.md) — validates mitigations in practice
