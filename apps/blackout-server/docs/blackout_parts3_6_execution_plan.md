# Blackout Parts 3–6 Execution Plan

This document covers concrete implementation steps after Phase 2 to execute:

- Part 3: Security model
- Part 4: Phone-as-server viability
- Part 5: Scalability characteristics
- Part 6: Hard problems

## Part 3 — Security model implementation

### Tracker status

- [x] **3.3 Key revocation and compromised-device response**
  - Revocation markers/timestamps stored.
  - Revoked sender keys rejected at local + federation blackout ingress.
  - Revocation metadata propagated through device-list/sync-visible flows.
- [x] **3.1 Envelope and signaling schema hardening**
- [x] **3.2 Integrity hooks (chunk + merkle)**

## 3.1 Envelope and signaling schema hardening

Target files:

- `synapse/handlers/message.py`
- `synapse/handlers/federation_event.py`
- `synapse/events/validator.py`

Work:

- Add stricter schema checks for `m.blackout.signal` payload sections:
  - `ice_candidates`: list of candidate objects
  - `sdp_offer` / `sdp_answer`: SDP envelope fields
  - `message_metadata`: immutable metadata (message id, sender key id)
  - `chunk_announcements`: chunk ids + hashes + optional merkle root
- Require hash fields to be fixed-length hex/base64 values and reject malformed payloads.

## 3.2 Integrity hooks (chunk + merkle)

Target files:

- `synapse/handlers/message.py`
- `synapse/storage/databases/main/events.py`
- `tests/handlers/test_message.py`

Work:

- Store integrity metadata as part of accepted `m.blackout.signal` events.
- Validate merkle root format for chunk announcements.
- Add tests for invalid hash/merkle payload rejection.

## 3.3 Key revocation and compromised-device response

Target files:

- `synapse/handlers/device.py`
- `synapse/storage/databases/main/end_to_end_keys.py`
- `tests/handlers/test_device.py`
- `tests/storage/databases/main/test_end_to_end_keys.py`

Work:

- Introduce revocation markers and a revocation timestamp per device key.
- Reject new signal metadata from revoked device keys.
- Propagate revocation state through federation and sync.

Potential migration:

- Add revocation fields/table for device keys.

---

## Part 4 — Phone-as-server viability

Target files:

- `docker/conf/homeserver.yaml`
- `docs/blackout-ops-runbook.md`
- `docs/turn-howto.md`

Work:

- Publish low-resource profile defaults for phone hosting:
  - blackout enabled
  - search/media disabled
  - conservative worker/background settings
- Provide capacity baseline guidance (200–500 registered, 20–50 active peers).
- Document reliability caveats (battery/network churn, WAL growth, backup cadence).

---

## Part 5 — Scalability characteristics

Target files:

- `docs/blackout_phase2_pr_plan.md`
- `docs/metrics-howto.md`
- `docs/blackout-ops-runbook.md`

Work:

- Add explicit operating thresholds:
  - room fan-out limits for mesh viability
  - warning thresholds for federation rejects and purge lag
- Add super-peer/hierarchical mesh guidance:
  - room policy docs for selecting temporary relays
  - topology hints distributed via `message_metadata` in signaling payloads.

---

## Part 6 — Hard-problem execution backlog

## 6.1 Offline user message retrieval

Work:

- Implement metadata-only offline queue markers in `m.blackout.signal`.
- Keep payload out of homeserver DB; clients fetch encrypted chunks from peers/object stores.

## 6.2 Redundancy enforcement + withholding detection

Work:

- Track replication factor declared in chunk announcements.
- Add mismatch alerts if announced redundancy is not observed.

## 6.3 Key revocation / device compromise (security-critical)

Work:

- [x] Priority item completed: fast revocation propagation + denylist checks at message/signal ingress.

## 6.4 Message expiration enforcement

Work:

- Add a conformance test suite proving signal event TTL purge behavior across worker and restart scenarios.
- Add metric + alert for purge backlog age.

---

## Delivery order after current Phase 2 runtime changes

1. Key revocation + compromised-device handling (Part 3 / Part 6 critical path)
2. Integrity schema + merkle validation
3. Offline retrieval + redundancy metadata
4. Scalability policy docs and operational SLOs
5. Full conformance tests for expiration enforcement

## Immediate execution checklist (current focus)

### A) Integrity schema + merkle validation

- Implement strict `message_metadata` + SDP envelope validators in both local-send and federation ingress paths.
- Enforce chunk hash format and optional merkle root format with a single reusable validator utility.
- Persist accepted integrity metadata fields on signal events for downstream inspection.
- Add negative tests for malformed hash, malformed merkle root, and missing required metadata fields.

### B) Offline retrieval + redundancy metadata

- Add metadata-only offline retrieval markers to `m.blackout.signal` while keeping payload references external.
- Introduce redundancy declaration fields (replication factor + replica hints) inside chunk announcements.
- Add ingestion-time checks that redundancy metadata is structurally valid and bounded.
- Emit basic metrics/counters for missing/invalid redundancy metadata to support later withholding detection.

### C) Scalability policy docs and SLOs

- Document recommended room fan-out ranges for mesh viability under low-resource nodes.
- Define warning/critical SLO thresholds for federation reject rate and signal TTL purge lag.
- Add operator runbook guidance for temporary relay/super-peer selection and rollback criteria.
- Cross-link metrics names, dashboards, and alert suggestions in runbook + metrics docs.

### D) Expiration enforcement conformance testing

- Add integration tests proving TTL purge behavior for signal events across restart and worker topologies.
- Assert no data resurrection after restart and replication catch-up.
- Add coverage for backlog growth alarms and stale-purge detection metrics emission.
- Include a short failure triage guide in test docstrings/comments for operators and maintainers.

## Next steps after the four focus items land

1. Close the loop on Part 6.2 by adding active withholding detection alerts that compare announced vs observed replicas.
2. Run a small-scale chaos pass (node churn + intermittent federation) to validate phone-profile assumptions under stress.
3. Publish an operational readiness review with pass/fail gates before default-enabling additional blackout capabilities.
