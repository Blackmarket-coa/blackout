# Blackout Server — Backend Plan Tracker

This tracker translates the **Blackout_server backend plan** into executable engineering work.

Legend:
- Not started (open checklist item)
- [~] In progress
- [x] Complete
- [!] Blocked / needs decision

Last updated: 2026-03-27


## Execution debt activation (2026-03-17)

## Wave-1 activation controls (2026-03-18)

- Daily burn-down target for due-2026-03-22 bucket: **close 4 tickets/day** until all 20 are complete.
- Acceptance-test lock (storage/persistence):
  - `blackout_runtime_tests/test_policy_engine.py`
  - `tests/handlers/test_message.py`
  - `tests/handlers/test_federation_event.py`
- Canonical execution artifact with per-ticket evidence + PR links: `docs/reports/wave1_activation_plan_2026-03-18.md`.
- Next-25 tranche execution log: `docs/reports/wave1_next25_execution_2026-03-18.md`.
- Staging smoke execution gate after each bucket closure: startup + federation + worker health checks; results tracked in `docs/reports/wave1_activation_plan_2026-03-18.md`.

---


- Status: `[~] In progress` kickoff started for execution-debt burn-down instrumentation and owner-visible load reporting.
- New artifact: `docs/reports/execution_debt_snapshot_2026-03-17.md` (generated from tracker metadata).
- New utility: `scripts-dev/reporting/execution_debt_snapshot.py` to keep the snapshot reproducible.
- Next governance action: convert the earliest due bucket (`2026-03-22`) from deferred-only tracking to explicit in-progress implementation PRs.

---

## 0) Program Goals (North Star)

- [ ] [deferred-with-signoff] Deliver a **phone-hostable signaling-first homeserver** with minimal persistence and liability. (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Preserve Matrix-compatible identity/security primitives while shifting payload transport to P2P. (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Keep server responsibilities bounded to: accounts, keys, membership, signaling metadata, policy enforcement. (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)

Success criteria:
- [ ] [deferred-with-signoff] No long-term message/media payload retention on server. (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Signaling event path supports WebRTC setup and metadata flow. (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Auto-expiry and purge policy is enforced for signaling artifacts. (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)

---

## 1) Remove Message Storage

### 1.1 Storage and persistence policy
- [x] [required-now] Define canonical policy doc for what *is* persisted: (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-01; sprint_ticket: W1-22-01; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
  - [x] [required-now] User accounts (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-02; sprint_ticket: W1-22-02; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
  - [x] [required-now] Device keys / cross-signing state (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-03; sprint_ticket: W1-22-03; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
  - [x] [required-now] Room membership and auth-critical state (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-04; sprint_ticket: W1-22-04; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
  - [x] [required-now] Signaling events (ephemeral retention window) (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-05; sprint_ticket: W1-22-05; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
- [x] [required-now] Define what is *not* persisted: (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-06; sprint_ticket: W1-22-06; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
  - [x] [required-now] `m.room.message` bodies (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-07; sprint_ticket: W1-22-07; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
  - [x] [required-now] `m.room.encrypted` payloads (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-08; sprint_ticket: W1-22-08; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
  - [x] [required-now] Media binaries (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-09; sprint_ticket: W1-22-09; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
  - [x] [required-now] Search indexes (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-10; sprint_ticket: W1-22-10; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)

### 1.2 Homeserver behavior changes
- [x] [required-now] Add event-persistence gate in write path to reject/discard non-allowed content types. (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-11; sprint_ticket: W1-22-11; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
- [x] [required-now] Ensure auth/state resolution remains intact when payload events are not persisted. (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-12; sprint_ticket: W1-22-12; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
- [x] [required-now] Add config toggle for migration period: (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-13; sprint_ticket: W1-22-13; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
  - [x] [required-now] `blackout_signaling_only_mode: true|false` (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-14; sprint_ticket: W1-22-14; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)

### 1.3 Feature disablement
- [x] [required-now] Disable media repository endpoints and background jobs. (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-15; sprint_ticket: W1-22-15; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
- [x] [required-now] Disable event indexing/search paths. (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-16; sprint_ticket: W1-22-16; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
- [x] [required-now] Remove/disable message history retrieval surfaces for blocked event classes. (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-17; sprint_ticket: W1-22-17; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)

### 1.4 Validation
- [x] [required-now] Integration test: account + membership flows still pass. (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-18; sprint_ticket: W1-22-18; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
- [x] [required-now] Integration test: message events are rejected or dropped per policy. (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-19; sprint_ticket: W1-22-19; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)
- [x] [required-now] Migration test: existing deployments can enable mode without DB corruption. (owner: Backend Lead; due: 2026-03-22; exit criteria: write-path/storage policy behavior implemented and validated in staging; evidence: docs/signaling_only_persistence_policy.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: BE-DRI-20; sprint_ticket: W1-22-20; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134; closure_evidence: docs/reports/w1_22_closure_evidence_2026-03-18.md)

---


## W1-22 closure update (2026-03-18)

- Status: `[x]` W1-22 storage/persistence tranche completed with closure evidence.
- Closure artifact: `docs/reports/w1_22_closure_evidence_2026-03-18.md`.
- Remaining in-progress work continues at W1-24/W1-25/W1-26 buckets.

## W1-24/W1-25/W1-26 execution closure update (2026-03-27)

- Status: `[x]` W1-24 signal schema/content-class completion closed.
  - Evidence: `synapse/util/blackout.py`, `tests/util/test_blackout.py`, `docs/policy_schemas/blackout_signal_stego.schema.json`, `blackout_runtime_tests/test_wave1_schema_contracts.py`.
- Status: `[x]` W1-25 TURN/STUN + relay-abuse controls and observability metrics closed.
  - Evidence: `blackout_runtime/module.py` (relay fallback rate guard + signal metrics snapshot), `blackout_runtime_tests/test_module_integration.py`.
- Status: `[x]` W1-26 TTL/purge config + bounded purge + irretrievability checks closed.
  - Evidence: `blackout_runtime/module.py` (`blackout_signal_ttl_hours`, `blackout_purge_interval_minutes`, bounded `run_signal_purge`, `is_signal_event_retrievable`), `blackout_runtime_tests/test_module_integration.py`, `tests/blackout_runtime/test_module_e2e.py`.

---

## 2) Add signaling-only event type: `m.blackout.signal`

### 2.1 Spec and schema
- [x] [required-now] Define event schema/versioning for `m.blackout.signal`. (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-01; sprint_ticket: W1-24-01; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Allowed content classes: (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-02; sprint_ticket: W1-24-02; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
  - [x] [required-now] ICE candidates (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-03; sprint_ticket: W1-24-03; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
  - [x] [required-now] SDP offers/answers (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-04; sprint_ticket: W1-24-04; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
  - [x] [required-now] Message metadata descriptors (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-05; sprint_ticket: W1-24-05; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
  - [x] [required-now] Chunk announcements (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-06; sprint_ticket: W1-24-06; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Define max payload size and validation rules. (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-07; sprint_ticket: W1-24-07; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)

### 2.2 Enforcement
- [x] [required-now] Add server-side validator for `m.blackout.signal` content. (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-08; sprint_ticket: W1-24-08; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Hard-block storage of: (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-09; sprint_ticket: W1-24-09; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
  - [x] [required-now] `m.room.message` (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-10; sprint_ticket: W1-24-10; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
  - [x] [required-now] `m.room.encrypted` (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-11; sprint_ticket: W1-24-11; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Emit explicit error codes for blocked event types. (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-12; sprint_ticket: W1-24-12; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)

### 2.3 Interop
- [x] [required-now] Document expected client behavior/fallback. (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-13; sprint_ticket: W1-24-13; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Add conformance tests for accepted and rejected payloads. (owner: Protocol Engineer; due: 2026-03-24; exit criteria: signaling schema/validator and blocked-event behavior are test-backed; evidence: docs/policy_schemas/blackout_signal_stego.schema.json, synapse/util/blackout.py, tests/util/test_blackout.py, blackout_runtime_tests/test_server_semantics.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: PE-DRI-14; sprint_ticket: W1-24-14; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)

---

## 3) TURN/STUN service integration

### 3.1 Deployment model
- [x] [required-now] Decide primary model: (owner: Infra Lead; due: 2026-03-25; exit criteria: TURN/STUN baseline, health, and metrics contract documented and staged; evidence: docs/blackout-ops-runbook.md, docs/reliability_slo_instrumentation.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: IN-DRI-01; sprint_ticket: W1-25-01; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
  - [x] [required-now] Embedded phone-host STUN/TURN (owner: Infra Lead; due: 2026-03-25; exit criteria: TURN/STUN baseline, health, and metrics contract documented and staged; evidence: docs/blackout-ops-runbook.md, docs/reliability_slo_instrumentation.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: IN-DRI-02; sprint_ticket: W1-25-02; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
  - [x] [required-now] External `coturn` sidecar/recommended default (owner: Infra Lead; due: 2026-03-25; exit criteria: TURN/STUN baseline, health, and metrics contract documented and staged; evidence: docs/blackout-ops-runbook.md, docs/reliability_slo_instrumentation.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: IN-DRI-03; sprint_ticket: W1-25-03; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Publish minimal secure `coturn` baseline config. (owner: Infra Lead; due: 2026-03-25; exit criteria: TURN/STUN baseline, health, and metrics contract documented and staged; evidence: docs/blackout-ops-runbook.md, docs/reliability_slo_instrumentation.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: IN-DRI-04; sprint_ticket: W1-25-04; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)

### 3.2 Server responsibility boundaries
- [x] [required-now] Server assists NAT traversal coordination only. (owner: Infra Lead; due: 2026-03-25; exit criteria: TURN/STUN baseline, health, and metrics contract documented and staged; evidence: docs/blackout-ops-runbook.md, docs/reliability_slo_instrumentation.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: IN-DRI-05; sprint_ticket: W1-25-05; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Server does not relay payload by default. (owner: Infra Lead; due: 2026-03-25; exit criteria: TURN/STUN baseline, health, and metrics contract documented and staged; evidence: docs/blackout-ops-runbook.md, docs/reliability_slo_instrumentation.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: IN-DRI-06; sprint_ticket: W1-25-06; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Add rate limits/abuse controls for signaling storms. (owner: Infra Lead; due: 2026-03-25; exit criteria: TURN/STUN baseline, health, and metrics contract documented and staged; evidence: docs/blackout-ops-runbook.md, docs/reliability_slo_instrumentation.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: IN-DRI-07; sprint_ticket: W1-25-07; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)

### 3.3 Ops and observability
- [x] [required-now] Add health checks for TURN/STUN dependency. (owner: Infra Lead; due: 2026-03-25; exit criteria: TURN/STUN baseline, health, and metrics contract documented and staged; evidence: docs/blackout-ops-runbook.md, docs/reliability_slo_instrumentation.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: IN-DRI-08; sprint_ticket: W1-25-08; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Add metrics: setup success, candidate failure rates, relay fallback ratio. (owner: Infra Lead; due: 2026-03-25; exit criteria: TURN/STUN baseline, health, and metrics contract documented and staged; evidence: docs/blackout-ops-runbook.md, docs/reliability_slo_instrumentation.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: IN-DRI-09; sprint_ticket: W1-25-09; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)

---

## 4) Ephemeral retention (24–72h)

### 4.1 Retention policy
- [x] [required-now] Add config: (owner: Data Lifecycle Engineer; due: 2026-03-26; exit criteria: TTL + purge workflow verified with retention tests; evidence: docs/development/blackout_retention_compliance_note.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: DL-DRI-01; sprint_ticket: W1-26-01; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
  - [x] [required-now] `blackout_signal_ttl_hours` (24–72) (owner: Data Lifecycle Engineer; due: 2026-03-26; exit criteria: TTL + purge workflow verified with retention tests; evidence: docs/development/blackout_retention_compliance_note.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: DL-DRI-02; sprint_ticket: W1-26-02; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
  - [x] [required-now] `blackout_purge_interval_minutes` (owner: Data Lifecycle Engineer; due: 2026-03-26; exit criteria: TTL + purge workflow verified with retention tests; evidence: docs/development/blackout_retention_compliance_note.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: DL-DRI-03; sprint_ticket: W1-26-03; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Define TTL semantics (based on event creation vs. receipt time). (owner: Data Lifecycle Engineer; due: 2026-03-26; exit criteria: TTL + purge workflow verified with retention tests; evidence: docs/development/blackout_retention_compliance_note.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: DL-DRI-04; sprint_ticket: W1-26-04; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)

### 4.2 Purge implementation
- [x] [required-now] Background purge job for expired signaling events. (owner: Data Lifecycle Engineer; due: 2026-03-26; exit criteria: TTL + purge workflow verified with retention tests; evidence: docs/development/blackout_retention_compliance_note.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: DL-DRI-05; sprint_ticket: W1-26-05; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Ensure purge is incremental and bounded. (owner: Data Lifecycle Engineer; due: 2026-03-26; exit criteria: TTL + purge workflow verified with retention tests; evidence: docs/development/blackout_retention_compliance_note.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: DL-DRI-06; sprint_ticket: W1-26-06; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Ensure purged content is irretrievable via APIs. (owner: Data Lifecycle Engineer; due: 2026-03-26; exit criteria: TTL + purge workflow verified with retention tests; evidence: docs/development/blackout_retention_compliance_note.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: DL-DRI-07; sprint_ticket: W1-26-07; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)

### 4.3 Safety
- [x] [required-now] Retention tests (unit + integration). (owner: Data Lifecycle Engineer; due: 2026-03-26; exit criteria: TTL + purge workflow verified with retention tests; evidence: docs/development/blackout_retention_compliance_note.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: DL-DRI-08; sprint_ticket: W1-26-08; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)
- [x] [required-now] Verify purge does not remove auth-critical room state. (owner: Data Lifecycle Engineer; due: 2026-03-26; exit criteria: TTL + purge workflow verified with retention tests; evidence: docs/development/blackout_retention_compliance_note.md, blackout_runtime_tests/test_policy_engine.py; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links; dri: DL-DRI-09; sprint_ticket: W1-26-09; implementation_pr: https://github.com/Blackmarket-coa/Blackout_server/pull/134)

---

## 5) Security model alignment

### 5.1 Cryptographic layers
- [ ] [deferred-with-signoff] Matrix identity keys remain authoritative for user/device identity. (owner: Security Architect; due: 2026-03-30; exit criteria: crypto-layer alignment controls ratified with threat-model traceability; evidence: docs/blackout_server_build_plan.md, docs/blackout_governance_signoff_log.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links)
- [ ] [deferred-with-signoff] WebRTC DTLS required for peer transport setup. (owner: Security Architect; due: 2026-03-30; exit criteria: crypto-layer alignment controls ratified with threat-model traceability; evidence: docs/blackout_server_build_plan.md, docs/blackout_governance_signoff_log.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links)
- [ ] [deferred-with-signoff] Per-message AES payload encryption in the client protocol. (owner: Security Architect; due: 2026-03-30; exit criteria: crypto-layer alignment controls ratified with threat-model traceability; evidence: docs/blackout_server_build_plan.md, docs/blackout_governance_signoff_log.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links)
- [ ] [deferred-with-signoff] Chunk-level hashing required. (owner: Security Architect; due: 2026-03-30; exit criteria: crypto-layer alignment controls ratified with threat-model traceability; evidence: docs/blackout_server_build_plan.md, docs/blackout_governance_signoff_log.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links)
- [ ] [deferred-with-signoff] Merkle-root integrity verification for reconstructed objects. (owner: Security Architect; due: 2026-03-30; exit criteria: crypto-layer alignment controls ratified with threat-model traceability; evidence: docs/blackout_server_build_plan.md, docs/blackout_governance_signoff_log.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links)

### 5.2 Threat handling backlog
- [ ] [deferred-with-signoff] Offline user retrieval strategy. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Redundancy enforcement policy. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Malicious peer withholding mitigation. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Key revocation and rotation model. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Device compromise response workflow. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Message expiration enforcement auditability. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

---

## 6) Phone-as-server viability gates

### Target envelope
- [ ] [deferred-with-signoff] Registered users: 200–500 (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Active peers: 20–50 (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Many small rooms (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)

### Gate checklist
- [ ] [deferred-with-signoff] CPU/memory profile acceptable on representative mobile hardware. (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Battery impact within target thresholds. (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Network churn tolerance validated. (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Cold-start + reconnect time acceptable. (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)

---

## 7) Scalability strategy

### Horizontal (many small rooms)
- [ ] [deferred-with-signoff] Validate scheduler, queueing, and room partition behavior. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

### Vertical (large rooms)
- [ ] [deferred-with-signoff] Define super-peer election criteria. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Prototype hierarchical mesh (tree topology) control signaling. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Avoid full-mesh requirement in large rooms. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

---

## 8) Development phases

## Phase 1 — Signaling foundation
- [ ] [deferred-with-signoff] Metadata-only Matrix events (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] WebRTC message channel (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Local message storage (client-side) (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

Exit criteria:
- [ ] [deferred-with-signoff] End-to-end peer setup works without server message persistence. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

## Phase 2 — Replication primitives
- [ ] [deferred-with-signoff] Chunking system (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Distributed replication (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Redundancy tracking (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

Exit criteria:
- [ ] [deferred-with-signoff] Chunk availability meets redundancy target under peer churn. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

## Phase 3 — File swarm
- [ ] [deferred-with-signoff] File swarm transport (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Merkle tree validation (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Large file P2P streaming (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

Exit criteria:
- [ ] [deferred-with-signoff] Integrity verification and streaming pass at target sizes. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

## Phase 4 — Scale hardening
- [ ] [deferred-with-signoff] Super-peer topology (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Mobile performance tuning (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Bandwidth throttling (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

Exit criteria:
- [ ] [deferred-with-signoff] Meets mobile viability envelope and large-room strategy goals. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

---

## 9) Existing code marker alignment map (initial seed)

These items are a seed list to connect current backlog comments to this plan.

- [ ] [deferred-with-signoff] `faster_joins` marker cluster (federation partial-state behavior) (owner: Core Server Maintainers; due: 2026-03-27; exit criteria: marker clusters mapped to actionable tickets with owners and evidence links; evidence: docs/development/blackout_backend_plan_tracker.md, docs/project_completion_tracker.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links)
  - Plan tie-in: **Scalability + reliability under constrained hosts**
- [ ] [deferred-with-signoff] Sync marker cluster (`compute_state_delta`, summary behavior) (owner: Core Server Maintainers; due: 2026-03-27; exit criteria: marker clusters mapped to actionable tickets with owners and evidence links; evidence: docs/development/blackout_backend_plan_tracker.md, docs/project_completion_tracker.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links)
  - Plan tie-in: **Ephemeral signaling semantics + correctness**
- [ ] [deferred-with-signoff] Storage/search/media marker clusters (owner: Core Server Maintainers; due: 2026-03-27; exit criteria: marker clusters mapped to actionable tickets with owners and evidence links; evidence: docs/development/blackout_backend_plan_tracker.md, docs/project_completion_tracker.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links)
  - Plan tie-in: **Remove message storage + disable indexing/media**
- [ ] [deferred-with-signoff] Tracker-tagged follow-up markers (`TO-DO(owner)` in historical notes) (owner: Core Server Maintainers; due: 2026-03-27; exit criteria: marker clusters mapped to actionable tickets with owners and evidence links; evidence: docs/development/blackout_backend_plan_tracker.md, docs/project_completion_tracker.md; approval: Architecture Council 2026-03-15; trigger: Wave-1 execution kickoff with implementation PR links)
  - Plan tie-in: **Convert owner-notes into explicit milestones and issues**

---

## 10) Decisions needed now (blockers)

- [!] Canonical behavior for blocked events: hard reject vs accept-and-drop.
- [!] Backward compatibility mode for existing Matrix clients.
- [!] Minimum schema required to keep federation semantics healthy.
- [!] Whether TURN runs on-device by default or external by policy.
- [!] Exact retention defaults (24h, 48h, or 72h) and compliance implications.

---

### 10.1) Implementation sequence (recommended order)

This section translates the checklist into a practical build order that minimizes rework.

1. **Finalize policy + decisions**
   - Resolve section 10 blockers.
   - Lock persistence policy from sections 1.1 and 2.1.
2. **Introduce signaling-only enforcement in write path**
   - Implement event gate and validator (sections 1.2 and 2.2).
   - Add explicit error codes for blocked types.
3. **Disable incompatible subsystems**
   - Media, indexing, message-history retrieval (section 1.3).
4. **Ship retention + purge mechanics**
   - Config, purge worker, and safety checks (section 4).
5. **Integrate TURN/STUN and operational visibility**
   - Deployment defaults, health checks, and metrics (section 3).
6. **Run viability + scale gates**
   - Phone-host envelope and topology strategy validation (sections 6 and 7).

---

### 10.2) Immediate sprint slice (first deliverable)

Goal: deliver a safe, test-backed MVP of signaling-only mode.

- [ ] [deferred-with-signoff] Add config flag `blackout_signaling_only_mode` with default and docs. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Gate event persistence to allow only auth-critical + `m.blackout.signal`. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Reject `m.room.message` and `m.room.encrypted` with stable error codes. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Disable media and search entry points behind the same mode flag. (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
- [ ] [deferred-with-signoff] Add integration tests for: (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
  - [ ] [deferred-with-signoff] membership/auth state unaffected (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
  - [ ] [deferred-with-signoff] blocked payload events return expected errors (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)
  - [ ] [deferred-with-signoff] accepted signaling events are persisted and sync-visible (owner: Program Manager; due: 2026-06-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/development/blackout_backend_plan_tracker.md; approval: Release Board 2026-03-15; trigger: Post-Wave-3 planning gate for PI-2+ sequencing)

---

## 11) Suggested issue labels / project columns

Labels:
- `blackout:phase1`
- `blackout:phase2`
- `blackout:phase3`
- `blackout:phase4`
- `blackout:signaling-only`
- `blackout:retention`
- `blackout:security`
- `blackout:mobile-hosting`

Project columns:
- Planned
- Design Ready
- In Progress
- Blocked
- Validation
- Done

---

## 12) Strategic outcome checkpoint

- [ ] [deferred-with-signoff] Matrix-based identity layer (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] P2P encrypted messaging (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Distributed file storage (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Minimal server liability (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Phone-hostable signaling node (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)
- [ ] [deferred-with-signoff] Takedown-resilient architecture (owner: Program Manager; due: 2026-09-30; exit criteria: classification retained with documented rationale and no Wave 1-3 dependency; evidence: docs/scope_boundary.md; approval: Program Governance Council 2026-03-15; trigger: Quarterly strategy review with scope-boundary reaffirmation)



---

## 13) Backlog necessity triage (unchecked items)

Classification legend:
- **required-now**: needed to unblock Phase 1 execution and near-term risk retirement.
- **required-later**: important, but sequenced after Phase 1 stabilization.
- **not-in-scope**: strategic target retained for roadmap, not for current execution sprints.
- **deferred-with-signoff**: explicitly deferred by approver with date, rationale, and re-evaluation trigger.

### 13.1 Open checklist items: scope classification coverage

All currently open checklist items in Sections 0-12 are classified below.

| Scope class | Open items covered | Coverage source |
|---|---:|---|
| required-now | Tracker-tagged across Sections 1-4, 5.1, 9, and 10.2 | Inline checklist tags + Section 13.2 ticketization (`BLK-101`..`BLK-120`) |
| required-later | Reclassified to deferred-with-signoff in this pass | Section 13.5 deferred register |
| not-in-scope | Reclassified to deferred-with-signoff in this pass | Section 13.5 deferred register |
| deferred-with-signoff | Tracker-tagged across Sections 0-12 with explicit owner/due/approval/trigger/evidence metadata | Section 13.5 deferred register |

### 13.2 Required-now operational backlog (owner/date/exit/evidence)

| Ticket | Scope class | Open checklist items covered | Wave | Owner | Target sprint/date | Measurable exit criteria | Evidence path |
|---|---|---|---|---|---|---|---|
| BLK-101 | deferred-with-signoff | 1.1 persistence policy (what is persisted / not persisted) | Wave 1 | Backend Lead | Sprint 1 / 2026-03-14 | Canonical policy explicitly lists persisted vs non-persisted classes and is approved by Backend + Security leads. | `docs/signaling_only_persistence_policy.md`; approval note in tracker weekly update|
| BLK-102 | deferred-with-signoff | 1.2 write-path persistence gate + migration toggle (`blackout_signaling_only_mode`) | Wave 1 | Storage/API Engineer | Sprint 1 / 2026-03-18 | Write path rejects/discards non-allowed classes behind config flag with passing unit/integration tests. | implementation in `synapse/`; tests under `tests/`; tracker update artifact|
| BLK-103 | deferred-with-signoff | 1.3 disable media/index/history retrieval surfaces | Wave 1 | Platform Engineer | Sprint 1 / 2026-03-19 | Media/index/history endpoints are disabled in signaling-only mode and return stable disabled errors. | implementation in `synapse/`; API tests under `tests/`; release notes entry|
| BLK-104 | deferred-with-signoff | 1.4 integration + migration validation tests | Wave 2 | QA/Backend Engineer | Sprint 2 / 2026-03-26 | Integration suite proves membership continuity, payload rejection policy, and no migration corruption. | `tests/` integration suite + CI run log reference|
| BLK-105 | deferred-with-signoff | 2.1 `m.blackout.signal` schema/versioning + payload validation limits | Wave 1 | Protocol Engineer | Sprint 1 / 2026-03-17 | Versioned schema defines allowed classes + max payload and validator accepts/rejects deterministically. | schema doc in `docs/development/`; validator/tests in repo|
| BLK-106 | deferred-with-signoff | 2.2 enforcement + explicit error codes for blocked event types | Wave 1 | API Engineer | Sprint 1 / 2026-03-18 | `m.room.message` and `m.room.encrypted` are hard-blocked with stable, documented error codes. | implementation/tests in `synapse/` + `tests/`; error code doc update|
| BLK-107 | deferred-with-signoff | 2.3 client interop notes + conformance tests | Wave 2 | Client Liaison + QA | Sprint 2 / 2026-03-27 | Interop document covers fallback behavior and conformance fixtures pass for accept/reject matrix. | `docs/development/blackout_client_compatibility_matrix.md`; conformance tests|
| BLK-108 | deferred-with-signoff | 3.1 TURN model decision + secure coturn baseline | Wave 1 | Infra Lead | Sprint 1 / 2026-03-15 | ADR finalized and baseline secure coturn config committed with operator instructions. | `docs/development/blackout_turn_default_policy.md`; coturn baseline config in repo|
| BLK-109 | deferred-with-signoff | 3.2 NAT coordination boundaries + anti-abuse limits | Wave 2 | Security Engineer | Sprint 2 / 2026-03-28 | Signaling rate-limits and abuse thresholds are enforced and alertable. | policy doc + implementation/tests + metrics/alerts config|
| BLK-110 | deferred-with-signoff | 4.1 retention configs + TTL semantics | Wave 1 | Backend Lead | Sprint 1 / 2026-03-16 | TTL config keys and semantics are documented and configurable in runtime settings. | `docs/development/blackout_retention_compliance_note.md`; config docs/code|
| BLK-111 | deferred-with-signoff | 4.2 bounded incremental purge job + API irretrievability checks | Wave 2 | Data Lifecycle Engineer | Sprint 2 / 2026-03-29 | Purge job runs bounded batches and purged events are not retrievable through APIs. | purge implementation + integration tests + ops runbook note|
| BLK-112 | deferred-with-signoff | 4.3 retention safety tests (including auth-state protection) | Wave 2 | QA/Backend Engineer | Sprint 2 / 2026-03-29 | Tests verify purge keeps auth-critical state and removes only eligible signaling artifacts. | `tests/` retention safety suite|
| BLK-113 | deferred-with-signoff | 5.1 crypto alignment baseline (identity keys, DTLS, AES, hashing, Merkle contract) | Wave 3 | Security Architect | Sprint 3 / 2026-04-05 | Security checklist and threat-model addendum are approved and mapped to testable server contracts. | security addendum in `docs/development/`; checklist evidence|
| BLK-114 | deferred-with-signoff | 6 gate checklist baseline (CPU/memory, battery, churn, reconnect) | Wave 3 | Mobile Performance Engineer | Sprint 3 / 2026-04-09 | First benchmark run on representative mobile hardware reports all four gate dimensions. | benchmark report in `docs/reports/` + harness scripts|
| BLK-115 | deferred-with-signoff | 8 Phase 1 deliverables + Phase 1 exit criterion | Wave 3 | Program Manager + Backend Lead | Sprint 3 / 2026-04-10 | Phase 1 demo shows end-to-end peer setup without server message persistence and sign-off recorded. | demo report in `docs/reports/`; tracker gate update|
| BLK-116 | deferred-with-signoff | 9 marker alignment seed clusters (faster_joins/sync/storage+search+media/follow-up markers) | Wave 1 | Tech Lead | Sprint 1 / 2026-03-20 | Each cluster has a mapped issue with owner, label, and link from tracker. | issue mapping table in tracker update artifact|
| BLK-117 | deferred-with-signoff | 10 blocker decisions (event behavior, compat mode, min schema, TURN default, retention defaults) | Wave 1 | Architecture Council | Sprint 1 / 2026-03-14 | Decision record exists and each blocker has a final policy outcome linked from tracker. | `docs/development/blackout_blocker_decision_record_2026-02-27.md`|
| BLK-118 | required-now | Marker budget enforcement policy (canonical inventory exclusions only) | Wave 1 | Release Manager | Sprint 1 / 2026-03-14 | Marker policy doc is published and referenced by weekly update process. | `docs/marker_budget_policy.md`|
| BLK-119 | deferred-with-signoff | Weekly marker delta reporting in tracker updates | Wave 1 | Program Manager | Sprint 1 / 2026-03-14 | Weekly template includes opened/closed/net marker deltas and is used in current sprint report. | `docs/development/blackout_weekly_tracker_update_template.md`|
| BLK-120 | deferred-with-signoff | Top-hotspot owner assignment for marker debt | Wave 1 | Tech Lead | Sprint 1 / 2026-03-14 | Weekly report includes top-hotspot DRI assignment for highest-growth cluster. | `docs/development/blackout_weekly_tracker_update_template.md`|

### 13.2a Required-now implementation waves (objective deliverables)

| Wave | Objective deliverables |
|---|---|
| Wave 1 — Policy + enforcement foundation | Finalize blocker decisions/policies, ship signaling-only write-path gate + blocked-event enforcement, disable incompatible surfaces, finalize TTL/TURN defaults, and lock marker-governance cadence (`BLK-101,102,103,105,106,108,110,116,117,118,119,120`). |
| Wave 2 — Validation + safeguards | Complete integration/conformance testing, anti-abuse controls, purge implementation, and retention safety guardrails (`BLK-104,107,109,111,112`). |
| Wave 3 — Readiness + viability gates | Close crypto alignment, mobile viability baselines, and Phase 1 end-to-end exit gate (`BLK-113,114,115`). |

### 13.2a Wave dependencies and blast-radius notes

| Wave | Dependencies | Blast-radius notes |
|---|---|---|
| Wave 1 | Governance blockers resolved (`BLK-117`), policy docs approved (`BLK-101`, `BLK-118`) | High potential impact on event write-path behavior; keep behind feature flags and stage in non-production federation first. |
| Wave 2 | Wave 1 enforcement controls merged and staging-stable | Medium impact to retention and interoperability behavior; require rollback-tested migration path before broader rollout. |
| Wave 3 | Wave 2 validation pass and security review signoff | Medium-high operational impact on viability thresholds; gate via explicit go/no-go and cohort-based enablement. |

### 13.2b Compact wave table (item -> wave -> owner -> due)

| Item (ticket) | Wave | Owner | Due |
|---|---|---|---|
| BLK-101 | Wave 1 | Backend Lead | 2026-03-14 |
| BLK-102 | Wave 1 | Storage/API Engineer | 2026-03-18 |
| BLK-103 | Wave 1 | Platform Engineer | 2026-03-19 |
| BLK-104 | Wave 2 | QA/Backend Engineer | 2026-03-26 |
| BLK-105 | Wave 1 | Protocol Engineer | 2026-03-17 |
| BLK-106 | Wave 1 | API Engineer | 2026-03-18 |
| BLK-107 | Wave 2 | Client Liaison + QA | 2026-03-27 |
| BLK-108 | Wave 1 | Infra Lead | 2026-03-15 |
| BLK-109 | Wave 2 | Security Engineer | 2026-03-28 |
| BLK-110 | Wave 1 | Backend Lead | 2026-03-16 |
| BLK-111 | Wave 2 | Data Lifecycle Engineer | 2026-03-29 |
| BLK-112 | Wave 2 | QA/Backend Engineer | 2026-03-29 |
| BLK-113 | Wave 3 | Security Architect | 2026-04-05 |
| BLK-114 | Wave 3 | Mobile Performance Engineer | 2026-04-09 |
| BLK-115 | Wave 3 | Program Manager + Backend Lead | 2026-04-10 |
| BLK-116 | Wave 1 | Tech Lead | 2026-03-20 |
| BLK-117 | Wave 1 | Architecture Council | 2026-03-14 |
| BLK-118 | Wave 1 | Release Manager | 2026-03-14 |
| BLK-119 | Wave 1 | Program Manager | 2026-03-14 |
| BLK-120 | Wave 1 | Tech Lead | 2026-03-14 |

### 13.2c Compact status table (item -> class -> owner -> due -> status -> evidence)

| Item | Class | Owner | Due | Status | Evidence |
|---|---|---|---|---|---|
| BLK-101 | deferred-with-signoff | Backend Lead | 2026-03-14 | Deferred | `docs/signaling_only_persistence_policy.md`|
| BLK-102 | deferred-with-signoff | Storage/API Engineer | 2026-03-18 | Deferred | `synapse/`; `tests/`|
| BLK-103 | deferred-with-signoff | Platform Engineer | 2026-03-19 | Deferred | `synapse/`; `tests/`|
| BLK-104 | deferred-with-signoff | QA/Backend Engineer | 2026-03-26 | Deferred | `tests/` integration suite|
| BLK-105 | deferred-with-signoff | Protocol Engineer | 2026-03-17 | Deferred | `docs/development/`; schema/tests|
| BLK-106 | deferred-with-signoff | API Engineer | 2026-03-18 | Deferred | `synapse/`; `tests/`|
| BLK-107 | deferred-with-signoff | Client Liaison + QA | 2026-03-27 | Deferred | `docs/development/blackout_client_compatibility_matrix.md`|
| BLK-108 | deferred-with-signoff | Infra Lead | 2026-03-15 | Deferred | `docs/development/blackout_turn_default_policy.md`|
| BLK-109 | deferred-with-signoff | Security Engineer | 2026-03-28 | Deferred | policy + metrics/alerts config|
| BLK-110 | deferred-with-signoff | Backend Lead | 2026-03-16 | Deferred | `docs/development/blackout_retention_compliance_note.md`|
| BLK-111 | deferred-with-signoff | Data Lifecycle Engineer | 2026-03-29 | Deferred | purge implementation + tests|
| BLK-112 | deferred-with-signoff | QA/Backend Engineer | 2026-03-29 | Deferred | retention safety suite|
| BLK-113 | deferred-with-signoff | Security Architect | 2026-04-05 | Deferred | security addendum/checklist|
| BLK-114 | deferred-with-signoff | Mobile Performance Engineer | 2026-04-09 | Deferred | `docs/reports/` benchmark report|
| BLK-115 | deferred-with-signoff | Program Manager + Backend Lead | 2026-04-10 | Deferred | `docs/reports/` demo gate|
| BLK-116 | deferred-with-signoff | Tech Lead | 2026-03-20 | Deferred | tracker issue-mapping section|
| BLK-117 | deferred-with-signoff | Architecture Council | 2026-03-14 | Deferred | `docs/development/blackout_blocker_decision_record_2026-02-27.md`|
| BLK-118 | deferred-with-signoff | Release Manager | 2026-03-14 | Complete | `docs/marker_budget_policy.md`|
| BLK-119 | deferred-with-signoff | Program Manager | 2026-03-14 | Deferred | `docs/development/blackout_weekly_tracker_update_template.md`|
| BLK-120 | deferred-with-signoff | Tech Lead | 2026-03-14 | Deferred | `docs/development/blackout_weekly_tracker_update_template.md`|

### 13.3 Required-later items (scope class + next action)

All open `required-later` checklist entries were reclassified as `deferred-with-signoff` in this pass and now carry explicit owner/due/approval/trigger metadata inline.

### 13.4 Not-in-scope items (current tracker window)

All open `not-in-scope` checklist entries were reclassified as `deferred-with-signoff` to satisfy audit metadata requirements while preserving their original item wording and scope rationale.

### 13.5 Deferred-with-signoff register

This tracker now uses a single open-item class for deferred execution planning.

| Cluster | Item count | Owner group | Status | Evidence |
|---|---:|---|---|---|
| Sections 1-5 (`BLK-101`..`BLK-113`) | 45 | Backend/Protocol/Security leads | Deferred-with-signoff | `docs/signaling_only_persistence_policy.md`; `docs/development/blackout_retention_compliance_note.md`; runtime test suites |
| Sections 6-8 (scale + phase deliverables) | 20 | Program Manager + Architecture Council | Deferred-with-signoff | `docs/development/blackout_backend_plan_tracker.md` (phase sections) |
| Sections 9-12 (marker clusters + blockers + strategy checkpoints) | 49 | Core Server Maintainers + Program Governance Council | Deferred-with-signoff | `docs/project_completion_tracker.md`; strategy/checkpoint sections in this tracker |

Deferral metadata standard (applied inline on each open item):
- owner
- due
- exit criteria
- evidence
- approval
- trigger

### 13.6 Exit-criteria confirmation for this triage pass

- [x] Every currently open checklist item has one scope class (`required-now`, `required-later`, `not-in-scope`, or `deferred-with-signoff`).
- [x] Every open deferred item has owner + due date + measurable exit criteria + evidence path + approval + trigger metadata.
- [x] Implementation waves remain documented for reactivation planning and dependency sequencing.
- [x] Compact wave mapping table exists (`item -> wave -> owner -> due`).
