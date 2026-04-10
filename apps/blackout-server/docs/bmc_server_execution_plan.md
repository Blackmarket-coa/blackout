# Blackout Server BMC Execution Plan

Date: 2026-03-11
Owner: Blackout server team

## Why this plan exists

`Blackout_server` is intentionally a Synapse fork and should continue to be maintained as a fork so upstream security fixes can be merged regularly while BMC-specific behavior remains in `blackout_runtime/` and companion services.

## Prioritized execution backlog

### 1) Stabilize `blackout_runtime` server semantics (P0)

1. **Room template enforcement**
   - Implement `on_create_room` handling for `m.blackout.channel.type`.
   - Enforce canonical templates for voice/forum/governance/dispute rooms (join rules, power levels, allowed state events).
2. **Custom event validation**
   - Validate schemas for:
     - `m.blackout.governance.proposal`
     - `m.blackout.governance.vote`
     - `m.blackout.reputation.update`
     - `m.blackout.channel.type`
   - Reject malformed events through module callback policy checks.
3. **Extended presence model**
   - Add `/_synapse/client/blackout/presence` endpoint for BMC-specific user states (`delivering`, `available_for_claims`, `off_duty`, `in_governance_session`).

Exit criteria:
- Runtime tests cover each room type template and each custom event schema branch.
- Clients cannot bypass server-side constraints for channel semantics or governance payloads.

### 2) Establish upstream sync discipline (P0)

1. Configure and maintain `upstream` remote to `https://github.com/element-hq/synapse.git`.
2. Merge on a fixed cadence (monthly) and on every Synapse security advisory.
3. Keep customization boundary strict:
   - Prefer `blackout_runtime/` and appservice integrations.
   - Record unavoidable core patches in `PATCHES.md` for rebase/merge replay.

Exit criteria:
- Documented merge runbook exists and is executed on schedule.
- `blackout_runtime_tests/` pass after each upstream merge.

### 3) Build logistics/governance integration bridge (P1)

1. **Appservice/webhook bridge**
   - Introduce a sidecar service registered as a Synapse application service.
   - Sync events bidirectionally with Hono and downstream systems.
2. **Auto-room provisioning APIs**
   - `POST /_synapse/client/blackout/rooms/dispute`
   - `POST /_synapse/client/blackout/rooms/depot`
   - `POST /_synapse/client/blackout/rooms/zone`
3. **Governance extraction API**
   - `GET /_synapse/client/blackout/governance/decisions?room_id=<id>&since=<token>`
4. **Reputation aggregation API**
   - `GET /_synapse/client/blackout/reputation/{node_id}`
   - Cached aggregation over governance/reputation events.
5. **Abuse controls**
   - Enforce one-vote-per-user-per-proposal and per-event rate limits for governance event families.

Exit criteria:
- External systems can consume governance outcomes without a Matrix client.
- Dispute/depot/zone rooms are reproducibly provisioned from backend events.

### 4) Hardening for blackbox hardware targets (P2)

1. Add `homeserver.blackbox.yaml` low-resource preset.
2. Add LAN-first federation helpers (mDNS/Avahi discovery module).
3. Add explicit offline-mode behavior and user-visible sync/backlog status.
4. Add OTA admin endpoint for controlled update triggers.
5. Add disk-usage guardrails (media lifecycle, vacuum cadence, log rotation hooks).

Exit criteria:
- Single-board deployments remain stable under constrained CPU/RAM/storage.
- LAN deployments continue functioning during upstream internet outages.

### 5) Cloud (Railway) deployment hardening (P2)

1. Split Synapse worker roles into distinct Railway services.
2. Use MinIO via Synapse S3 media storage configuration.
3. Add PostgreSQL pooling recommendation (`PgBouncer`) to deploy docs.
4. Publish health/metrics wiring guidance for Prometheus scraping.

Exit criteria:
- Horizontal worker scaling and media persistence are documented and validated.
- Operational telemetry is available for alerting and incident triage.

## Tracking model

- Use `INCOMPLETE_WORK.md` and `NOTIMPLEMENTED_AUDIT.md` for debt inventory snapshots.
- Track this plan in milestone order (`P0` → `P1` → `P2`) with explicit owners and target dates.
- Require green runtime and integration checks prior to promoting deployment status.

## Synapse module enablement snippet

Use the `modules` section in your homeserver config to enable Blackout runtime behavior consistently across environments:

```yaml
modules:
  - module: blackout_runtime.module.BlackoutRuntimeModule
    config: {}
```

This mounts:
- `/_synapse/client/blackout/presence`
- `/_synapse/client/blackout/governance/decisions`
- `/_synapse/client/blackout/reputation/{node_id}`

and registers the room-creation/event-policy callbacks used for Blackout channel semantics and governance payload enforcement.


## Implementation artifacts (current)

- Low-resource appliance preset template: `docs/homeserver.blackbox.yaml`.
- Railway hardening runbook: `docs/railway_deployment_hardening.md`.
- Fork/merge discipline log: `PATCHES.md`.
