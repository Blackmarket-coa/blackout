# FBM Migration to Primary Server Runbook

Foundation milestone deliverable per
[`AGGRESSIVE_OPERATIONS_GUIDE.md` §2.4 and §7.2](../AGGRESSIVE_OPERATIONS_GUIDE.md).
Covers the migration of FreeBlackMarket from Railway hosting to the primary
HP ProLiant DL360 Gen9 server, where it co-locates with Synapse, Postgres,
ClickHouse, the absorbed PostGIS workload, and the existing Blackout stack.

This runbook lives in the Blackout repository because the consolidated
operations documentation is centralised here, but the migrated artifact (the
FBM Medusa backend, MercurJS extensions, vendor panel, public storefront,
and event bus) lives in the `free-black-market` repository. Where
FBM-internal detail is required during execution, follow the placeholders
marked `<!-- FBM-side detail -->` and consult the FBM repo's deployment
documentation.

The Cloudflare Tunnel migration is a separate runbook
([`../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`](../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md));
this runbook assumes Tunnel is already in place on the primary host or will
be configured in step 4 below.

---

## 0) Target architecture

Per [`AGGRESSIVE_OPERATIONS_GUIDE.md` §2.4](../AGGRESSIVE_OPERATIONS_GUIDE.md):

- FBM and Blackout co-locate on the primary HP DL360 (384 GB RAM, 40 CPU
  threads).
- FBM's Postgres workload shares the host with Synapse's Postgres workload;
  schemas are separate, but the Postgres process(es) are co-located.
- The secondary server is reserved for offsite Postgres replication of both
  databases and is *not* a target for this migration.
- Cloudflare Tunnel remains the primary ingress; FBM hostnames are added to
  the existing tunnel configuration.

---

## 1) Preflight inventory

Complete the inventory before scheduling any cutover.

### 1.1 Current Railway state

- [ ] FBM service inventory on Railway: list every running service
      (Medusa backend, vendor panel, storefront, any worker processes).
- [ ] Railway environment-variables export for each service.
- [ ] Railway-managed Postgres connection details and current size on disk.
- [ ] Railway-managed object storage details (if any) and current size.
- [ ] Outbound integrations using Railway public URLs: webhooks, OAuth
      callbacks, partner allowlists.
- [ ] Currently active deployments and any pending migrations.
      <!-- FBM-side detail: confirm via `medusa migrations status` or the
      FBM repo's documented procedure -->

### 1.2 Target host readiness (primary DL360)

- [ ] Capacity headroom check: free RAM, free disk, free CPU threads at
      current Blackout load. Document numbers; if any is below 30% headroom,
      escalate before scheduling.
- [ ] Postgres: decide whether FBM uses the existing Postgres process with
      a separate database, or a separate Postgres instance on a different
      port. Recommendation: separate database in the existing instance,
      backed by separate roles. Document the decision.
- [ ] Disk layout: FBM media/object storage destination. Recommendation:
      MinIO already running on the host (see
      [`infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md)),
      with a new bucket for FBM.
- [ ] Docker Engine and Compose plugin healthy; existing Blackout stack
      not in a degraded state.
- [ ] Backups validated: a current Blackout Postgres dump can be restored
      to a sandbox; confirms backup tooling works before relying on it for
      this migration.

### 1.3 Secrets staged

- [ ] Per [`SECRETS_MANAGER_MIGRATION.md`](SECRETS_MANAGER_MIGRATION.md),
      decide whether to migrate FBM secrets through the consolidated manager
      as part of this migration or after. Recommendation: migrate during
      this window; both runbooks are Foundation deliverables and FBM has
      the most secrets to consolidate.
- [ ] Secrets staged in the manager:
      - FBM Postgres connection string (target).
      - Stripe keys (publishable + secret).
      - OAuth client secrets used by FBM directly (if any beyond the
        compat-layer ones already in Blackout).
      - MinIO admin and FBM-scoped access keys.
      - Any external API keys FBM consumes.
        <!-- FBM-side detail: enumerate from FBM repo's medusa-config.js -->

### 1.4 DNS preparation

- [ ] Identify FBM hostnames currently pointing at Railway (admin, storefront,
      API, webhooks). <!-- FBM-side detail -->
- [ ] Lower TTL on each hostname to 60 seconds at least 24 hours before
      cutover.
- [ ] Export current DNS records (backup JSON/CSV).
- [ ] Plan the cutover: which records change, in what order, with what
      validation between each.

### 1.5 Notification

- [ ] Notify any active vendors and coalition partners of the maintenance
      window. Use milestone-anchored language per
      [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §6.4](../AGGRESSIVE_OPERATIONS_GUIDE.md).
- [ ] Co-maintainer (if onboarded per
      [`../operations/CO_MAINTAINER_ONBOARDING.md`](../operations/CO_MAINTAINER_ONBOARDING.md))
      is on-call during the cutover window.

---

## 2) Stand up FBM on the primary host (parallel deploy)

Stand up the new FBM deployment alongside the running Railway deployment.
Do not touch DNS yet; this step is dark.

### 2.1 Postgres

- [ ] Create the FBM database and role(s) in the existing Postgres instance
      (or stand up the separate instance, per the decision in §1.2).
- [ ] Apply the connection-pool size; FBM and Synapse share the same
      Postgres process if the recommendation in §1.2 is taken, so size the
      pool with both consumers in mind. Document the chosen pool sizes.
- [ ] Configure backups to include the new FBM database in the nightly dump
      and offsite replication targets.

### 2.2 Object storage

- [ ] Create the FBM bucket on MinIO (or the chosen object backend).
- [ ] Issue scoped access keys; store in the secrets manager.
- [ ] Configure CORS and signing-key policies to match what the FBM
      storefront and admin require. <!-- FBM-side detail -->

### 2.3 FBM services

- [ ] Deploy the FBM Medusa backend, MercurJS extensions, vendor panel, and
      storefront via the FBM repo's documented Docker / Compose path.
- [ ] Configure each service to read secrets from the consolidated manager.
- [ ] Health-check each service from inside the host network. Do not expose
      to the public yet.

### 2.4 Tunnel routes

- [ ] Add tunnel ingress rules for the FBM hostnames in the cloudflared
      configuration on the primary host (target: parallel hostnames like
      `fbm-staging-cutover.example` so they can be hit by the maintainer
      without changing public DNS yet).
- [ ] Validate end-to-end via the parallel hostname.

---

## 3) Data migration

This is the riskiest step. Plan to do it during a low-traffic window. If
data has been changing during §2, this step is the one that captures the
latest state.

### 3.1 Postgres dump from Railway

- [ ] Put the Railway FBM backend in maintenance mode if FBM has one, or
      otherwise pause writes (e.g., read-only mode on the storefront).
- [ ] Take a `pg_dump` of the Railway-managed FBM Postgres. Use
      `--format=custom` for parallel restore.
- [ ] Capture the dump checksum.
- [ ] Transfer the dump to the primary host over an authenticated channel.

### 3.2 Object storage migration

- [ ] Use `rclone` or equivalent to copy the Railway-side object storage to
      the new MinIO bucket. Capture the byte count and object count for
      validation.

### 3.3 Restore

- [ ] Drop or truncate the empty FBM database created in §2.1 (ensure
      it really is empty; restoring on top of a populated DB is undefined
      behaviour).
- [ ] `pg_restore --jobs=N` from the dump.
- [ ] Apply any pending Medusa migrations against the restored DB.
      <!-- FBM-side detail: confirm via the FBM repo's migration command -->
- [ ] Run a row-count check on the largest tables (orders, products,
      customers, listings) and compare against the Railway side captured in
      §3.1. Counts must match; if they do not, abort and investigate before
      proceeding.

---

## 4) Cutover

- [ ] Confirm the parallel deployment on the primary host is healthy on
      every public hostname via the parallel test names from §2.4.
- [ ] Update DNS to point the production FBM hostnames at the primary host
      (Cloudflare Tunnel CNAMEs).
- [ ] Watch DNS propagation. With TTL at 60 seconds, expect resolution to
      converge within a few minutes for most regions.
- [ ] Confirm OAuth callbacks, webhooks, and partner integrations resolve
      to the new host. Anything that hard-codes a Railway hostname is the
      tail risk; surface them by triaging error logs immediately
      post-cutover.
- [ ] Lift the maintenance / read-only mode on FBM.
- [ ] Once traffic is steady-state on the new host for at least one hour,
      remove tunnel ingress rules for the parallel test hostnames.

---

## 5) Validation

- [ ] FBM admin UI is reachable, authenticatable, and shows the correct
      pre-migration state (sample: most-recent order timestamp matches the
      pre-cutover capture).
- [ ] Storefront is reachable; a logged-in test user can view their orders.
- [ ] A synthetic transaction (sandbox payment, no real funds) completes
      end-to-end through Stripe → Medusa → ledger → Coalition Credits
      (the latter two via the entitlements service per §2.5 of the guide).
- [ ] OAuth-based vendor login works.
- [ ] Webhook receivers (e.g., Patreon webhooks routed through the
      compat-layer) post successfully and are recorded.
- [ ] Backups have run on the new database and a sample restore to a
      sandbox succeeds (this can be deferred to the next nightly cycle if
      the cutover happened mid-day).
- [ ] [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md) row 1 and row
      3 are updated to reflect the consolidated FBM + Synapse Postgres on
      the primary host.
- [ ] §9.1 of [`../AGGRESSIVE_OPERATIONS_GUIDE.md`](../AGGRESSIVE_OPERATIONS_GUIDE.md)
      tracker row "Railway → primary-server migration (FBM)" is updated to
      complete.

---

## 6) Rollback

The migration is reversible up until §4 (DNS cutover). After cutover, any
data written to the new host has to be migrated back; rollback is *more
expensive* than rollback-before-cutover.

### 6.1 Pre-cutover rollback

- [ ] Tear down the parallel FBM deployment on the primary host.
- [ ] Drop the FBM database created in §2.1.
- [ ] Drop the FBM bucket on MinIO.
- [ ] Remove the parallel tunnel ingress rules.
- [ ] Railway deployment is unchanged; nothing further is needed.

### 6.2 Post-cutover rollback

This should be needed only if §5 validation reveals a critical regression
that cannot be fixed in place.

- [ ] Put the primary-host FBM in maintenance / read-only mode.
- [ ] Take a `pg_dump` of the primary-host FBM database (capturing any
      writes since cutover).
- [ ] Identify the writes since cutover and apply them to the Railway side
      manually (or document them as lost if the volume is small enough that
      manual reconciliation is correct).
- [ ] Sync any new objects from MinIO back to Railway-side storage.
- [ ] Revert DNS to point at Railway.
- [ ] Wait for TTL to expire; confirm Railway is receiving traffic.
- [ ] Lift maintenance mode on Railway.
- [ ] File an incident writeup under
      [`../operations/evidence/`](../operations/evidence/) capturing what
      went wrong so the next attempt can avoid the same trap.

---

## Cross-references

- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §2.4](../AGGRESSIVE_OPERATIONS_GUIDE.md) — unified deployment topology
- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §7.2](../AGGRESSIVE_OPERATIONS_GUIDE.md) — runbook list
- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §9.1](../AGGRESSIVE_OPERATIONS_GUIDE.md) — tracker row
- [`SECRETS_MANAGER_MIGRATION.md`](SECRETS_MANAGER_MIGRATION.md) — companion migration; do together
- [`../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`](../../deploy/docker/production/CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md) — tunnel reference
- [`../../infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md) — primary host baseline
- [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md) — SPOFs that change as a result of co-location
- [`../operations/runbooks/postgres_restore_drill.md`](../operations/runbooks/postgres_restore_drill.md) — backup validation
