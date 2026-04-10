# Blackout Server — One-Shot Prompt (Complete Phases 0–3)

Use the following prompt as a single instruction block to drive execution of the full Blackout Server plan end-to-end.

---

You are the implementation lead for the Synapse-based Blackout Server. Execute the full delivery plan across **Phase 0, Phase 1, Phase 2, and Phase 3** with production-grade rigor.

## Mission
Deliver privacy-resilient server capabilities for:
1. cell-structured governance,
2. dead-drop secure exchange,
3. privacy-preserving broadcasts,
4. timing metadata resistance (experimental),
5. steganography-safe server stance,
6. mesh/off-grid readiness support.

Use existing plan artifacts in this repository as the source of truth, including:
- `docs/blackout_server_build_plan.md`
- `docs/policy_schemas/*.schema.json`
- `.ci/blackout_policy_examples/*.example.json`
- `scripts-dev/validate_blackout_policy_schemas.py`

## Non-negotiable constraints
- Keep Matrix/Synapse protocol compliance by default.
- Ship all high-risk privacy behavior behind feature flags, disabled by default.
- Pair privacy features with abuse controls and observability.
- No server-side steganography tooling implementation.
- Any experiment must include rollback criteria and runbook references.

## Definition of done by phase

### Phase 0 — Foundation (must be closed first)
- Finalize and ratify threat model + abuse model with owner sign-off records.
- Ensure machine-readable policy schemas exist and pass CI validation.
- Ensure config toggles/feature flags are documented and wired for non-default behavior.
- Enforce CI checks that fail on schema/policy drift.

**Phase 0 exit gates:**
- policy schemas validated in CI,
- signed governance approvals recorded,
- rollback and incident runbooks available.

### Phase 1 — Core policy rollout
Implement and test:
- `blackout_cell_space` template plumbing,
- `blackout_dead_drop_room` preset wiring + retention enforcement,
- `blackout_announcement_room` baseline,
- federation trust-tier ACL templates,
- announcement fanout role gating + rollback-safe procedures.

**Required tests:**
- unit tests for schema/preset defaults,
- integration tests for membership visibility boundaries,
- retention/purge correctness tests,
- sender-role enforcement tests,
- federation compatibility checks in staging.

### Phase 2 — Privacy enhancement pilots
Implement as experimental, feature-flagged pilots:
- timing-jitter/batching worker,
- delayed broadcast fanout windows,
- edge federation profile tuning for unstable links.

**Pilot requirements:**
- opt-in cohorts only,
- telemetry dashboards for latency/reliability tradeoffs,
- automated rollback triggers when SLOs breach thresholds.

### Phase 3 — Production hardening
- Run SLO validation and failure-injection drills.
- Execute security review and red-team scenarios.
- Complete staged rollout with explicit go/no-go gates.
- Produce final operational handoff: runbooks, on-call playbooks, and post-deployment audit.

**Phase 3 completion criteria:**
- P95 delivery latency and federation success meet targets,
- dead-drop purge SLA is consistently met,
- incident drills pass,
- governance/security sign-off completed.

## Required outputs
Produce all of the following:
1. **Implementation PRs** grouped by phase and capability track.
2. **Ticket board update** mapping BO-101..BO-603 to status, owner, ETA, dependencies.
3. **Testing evidence** (commands, output summaries, failures, mitigations).
4. **Risk register update** with current severity and owner.
5. **Phase gate report** at the end of each phase:
   - what shipped,
   - what failed,
   - what was deferred,
   - go/no-go decision with rationale.

## Execution order
1. Close all Phase 0 gates.
2. Execute Phase 1 in sprint order (A→D).
3. Start Phase 2 pilots only after Phase 1 exit criteria are met.
4. Enter Phase 3 only after pilot SLO stability is demonstrated.

## Guarded rollout defaults
- Keep all new features disabled in production unless a phase gate explicitly enables them.
- Enable features first in staging federation (3-node minimum).
- Require Security + Operations approval for expanding blast radius.

## Reporting format (for every major update)
- **Status:** Green / Yellow / Red
- **Completed this cycle:** bullet list
- **Evidence:** exact commands and results
- **Risks/blocks:** bullet list with owner and mitigation
- **Next 48h plan:** bullet list with measurable outcomes

Now execute this plan to completion with strict phase-gate discipline and explicit evidence at each step.

---

Tip: Keep this prompt unchanged when possible so progress is comparable across runs.
