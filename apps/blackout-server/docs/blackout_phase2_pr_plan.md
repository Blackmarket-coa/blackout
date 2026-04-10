# Blackout Phase 2 — Concrete PR Implementation Plan

This plan translates Phase 2 ("Persistence & Runtime hardening") into a sequence of implementable pull requests with explicit file targets, migrations/tests, and rollout order.

## Goals

1. Ensure blackout mode is not only policy-gated at handler level, but enforced in storage/runtime behaviors.
2. Reduce storage and indexing overhead for signaling-only deployments.
3. Make retention and observability production-ready.
4. Provide predictable rollout and rollback for operators.

---

## PR-1: Retention Guarantees + Validation

### Scope
Guarantee that `m.blackout.signal` events are expired and purged in the configured window (24–72h), with regression tests proving purge behavior.

### Expected code changes

- `synapse/handlers/message.py`
  - Keep TTL stamping logic for `m.blackout.signal` and ensure it is idempotent.
- `synapse/storage/databases/main/events.py`
  - Ensure signal events with `self_destruct_after` are inserted into `event_expiry` consistently.
- `synapse/storage/databases/main/censor_events.py`
  - Verify purge path deletes expiry metadata and event bodies as expected.
- `synapse/storage/databases/main/events_worker.py`
  - Validate next-expiry lookup behavior for blackout workloads.

### Tests

- `tests/handlers/test_message.py`
  - Assert signal events always include `self_destruct_after` when blackout mode enabled.
- `tests/storage/test_purge.py`
  - Add blackout-specific retention tests:
    - signal event expires and is removed.
    - non-signal timeline event remains rejected before persistence.
- `tests/storage/test_events.py`
  - Verify expiry rows are written for accepted signal events.

### Migrations

- **No schema migration expected** (uses existing `event_expiry` table).

### Rollout

1. Deploy code with blackout disabled (no behavior change).
2. Enable blackout in staging with short TTL (`24h`) and verify purge jobs.
3. Promote to production.

---

## PR-2: Runtime Data Minimization (Search/Push/Indexing)

### Scope
Prevent heavyweight downstream processing for blackout signal traffic where safe, and add guard rails so disabled components stay disabled under workers/replication.

### Expected code changes

- `synapse/config/server.py`
  - Keep forced `enable_media_repo = False` and `enable_search = False` under blackout.
  - Add explicit warning logs when blackout overrides user-provided values.
- `synapse/storage/databases/main/search.py`
  - Add explicit early-return/no-op for indexing writes when blackout enabled (defensive, even though search disabled).
- `synapse/push/*` (exact files depending on call graph)
  - Skip push action generation for `m.blackout.signal` under blackout if product behavior permits.
  - If skipping is not safe globally, gate with dedicated blackout config flag and default conservative behavior.
- `synapse/handlers/message.py`
  - Keep strict timeline allowlist (`m.blackout.signal`, `org.matrix.dummy_event`).

### Tests

- `tests/storage/test_room_search.py`
  - Assert blackout mode does not insert searchable rows for signal events.
- `tests/storage/test_event_push_actions.py`
  - Assert configured blackout behavior for push actions.
- `tests/handlers/test_message.py`
  - Extend event-block tests for additional timeline event types (`m.reaction`, `m.sticker`, etc.).

### Migrations

- **No schema migration expected** unless introducing a dedicated blackout metrics/materialized table.

### Rollout

1. Deploy behind config-gated behavior.
2. Confirm search tables and push tables growth rate drops in staging.
3. Enable globally for blackout nodes.

---

## PR-3: Federation Contract + Error Semantics

### Scope
Make federated blackout behavior explicit and test-covered.

### Expected code changes

- `synapse/handlers/federation_event.py`
  - Keep signal-only timeline policy for inbound PDUs.
  - Normalize error code/message for unsupported timeline events.
  - Ensure logging includes room ID, event type, and origin server for operator diagnostics.
- `synapse/federation/*` (as needed)
  - Ensure rejection behavior doesn’t create retry storms from transient error classification.

### Tests

- `tests/handlers/test_federation_event.py`
  - Accept `m.blackout.signal` with valid content.
  - Reject invalid signal payload keys.
  - Reject non-state non-signal event types with expected code.
- `tests/test_federation.py`
  - Verify cross-server behavior remains stable under blackout enforcement.

### Migrations

- **No schema migration expected**.

### Rollout

1. Stage with one blackout server federating with a standard server.
2. Validate rejection semantics and log volume.
3. Roll to production federation edges.

---

## PR-4: TURN/STUN Production Profile (Phone-hosted Path)

### Scope
Provide concrete deployment assets for TURN/STUN using coturn with shared secret.

### Expected code changes

- `docker/` (new files)
  - `docker/turn/turnserver.conf` (minimal hardened template).
  - `docker/compose.turn.yaml` (optional compose profile).
- `docker/conf/homeserver.yaml`
  - Keep/add guidance comments that Synapse coordinates credentials while TURN is fallback.
- `README.rst`
  - Link to TURN profile docs.
- `docs/turn-howto.md`
  - Add a blackout-specific section with capacity and mobile constraints.

### Tests/checks

- Config lint/static checks for docker templates.
- Smoke test docs instructions in local compose.

### Migrations

- **No DB migration**.

### Rollout

1. Stand up coturn in staging.
2. Validate ICE success rates with and without relay.
3. Enable in production with observability.

---

## PR-5: Observability + Runbooks

### Scope
Add metrics and operator guidance so blackout deployments can be managed safely.

### Expected code changes

- `synapse/metrics/*` and relevant handlers
  - Counters:
    - accepted blackout signal events
    - rejected blackout timeline events
    - rejected invalid blackout payloads
    - purged blackout events
- `docs/metrics-howto.md`
  - Dashboard and alerts for blackout mode.
- `docs/` (new)
  - `docs/blackout-ops-runbook.md`:
    - enable/disable procedure
    - safe rollback
    - incident checks (purge lag, federation rejects, TURN failures)

### Tests

- `tests/storage/test_event_metrics.py`
  - Validate metrics increments on accept/reject/purge paths.

### Migrations

- **No schema migration expected**.

### Rollout

1. Ship metrics first.
2. Validate dashboards in staging.
3. Enforce SLOs before broad rollout.

---

## Optional PR-6: Security hard-problems starter set

This PR starts the long-tail items listed in the architecture notes.

### Initial target

- Device compromise and key revocation response path.
- Redundancy/withholding detection hooks for chunk announcements.

### Candidate files

- `synapse/handlers/device.py`
- `synapse/storage/databases/main/end_to_end_keys.py`
- `tests/handlers/test_device.py`
- `tests/storage/databases/main/test_end_to_end_keys.py`

### Migrations

- **Possible migration** if storing additional revocation metadata.

---

## Recommended rollout order

1. **PR-1** retention guarantees.
2. **PR-3** federation contract hardening.
3. **PR-2** runtime data minimization.
4. **PR-5** observability/runbooks.
5. **PR-4** TURN/STUN production profile.
6. **PR-6 (optional)** security hard-problems starter.

This order minimizes operational risk: first guarantee correctness, then interoperability, then optimization.

---

## Acceptance criteria for Phase 2 completion

- Blackout mode rejects all non-state/non-signal timeline events consistently (local + federation).
- Signal events are auto-expired and purged within configured TTL bounds.
- Search/media heavy paths are definitively inactive for blackout workloads.
- Operators have dashboards + runbook for rollout and incident handling.
- TURN fallback deployment profile is documented and reproducible.


## Part 3–6 follow-on execution notes

- Enforce strict schema checks for `m.blackout.signal` in both local and federation ingress.
- Validate chunk hashes/merkle roots and require `message_metadata` core fields.
- Add metadata-only offline retrieval markers (`offline_retrieval`) for deferred payload fetch.
- Add redundancy metadata (`replication_factor`, `replica_hints`) within chunk announcements.
- Track counters for accepted events missing redundancy declarations to support withholding detection.
- Operate with fan-out and purge-lag SLOs documented in runbook + metrics docs.

### Explicit operating thresholds (mesh viability)

- **Room fan-out target**: `<= 50` concurrently active peers (full mesh viable).
- **Warning fan-out band**: `51-75` active peers (start staged temporary relay assignment).
- **Critical fan-out**: `> 75` active peers (hierarchical mesh/super-peer policy required).
- **Federation reject ratio**: warning at `>1% over 15m`, critical at `>5% over 15m`.
- **Signal purge lag**: warning at `>15m`, critical at `>60m`.

### Super-peer / hierarchical mesh policy requirements

- Document room policy for temporary relay selection using stable nodes (power/network uptime,
  low packet loss, predictable latency).
- Distribute topology placement hints via signaling payload metadata in
  `message_metadata.topology_hints`.
- Include relay rollback/demotion conditions after sustained healthy windows below warning
  thresholds.
