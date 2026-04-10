# Upstream Blackout feature adoption build plan (server tracker)

_Date: 2026-03-02_

This plan translates feature families present in `https://github.com/Blackmarket-coa/blackout` (`develop`) into a server-side execution tracker for this repository.

## 1) Objective

Track, prioritize, and implement feature compatibility so `Blackout_server` can support the complete upstream Blackout feature set with explicit scope labels, ownership, and evidence paths.

## 2) Upstream feature inventory (normalized)

Feature families were normalized from upstream docs/source folders (for example `src/steganography/*`, `src/services/governance/*`, `src/services/townhall/*`, `src/services/deliberation/*`, `src/p2p/*`, and `docs/operations/*`).

| ID | Feature family (upstream) | Representative upstream paths | Server-impact summary | Scope | Status |
|---|---|---|---|---|---|
| U1 | Steganography core pipeline | `src/steganography/*` | Add server-side validation/storage policy hooks for hidden payload metadata and policy enforcement. | required-now | complete (Wave 1) |
| U2 | Stego entitlements | `src/steganography/entitlements/*` | Add capability/entitlement checks for stego-enabled event flows. | required-now | complete (Wave 1) |
| U3 | Paid rooms / boosts integration | `src/steganography/paidrooms/*`, `src/steganography/boosts/*` | Add server APIs/state for paid-room flags and boost-related governance signals. | required-later | complete (Wave 2) |
| U4 | Ephemeral stego policies | `src/steganography/ephemeral/*` | Align retention/expiry behavior with stego payload lifecycle controls. | required-now | complete (Wave 1) |
| U5 | Stego plugin surface | `src/steganography/plugins/*` | Define allowlisted plugin metadata schema + signing/verification policy for interoperability. | required-later | partial (Wave 3 kickoff) |
| U6 | Governance services | `src/services/governance/*`, `src/modules/governance/*` | Add governance event schemas, moderation/voting state, and audit trails in server domain. | required-now | complete (Wave 1) |
| U7 | Deliberation + task workflows | `src/services/deliberation/*`, `src/modules/education/*` | Add deliberation/task event types and state transitions (proposal -> vote -> execution). | required-later | complete (Wave 2) |
| U8 | Delegation + attestations | `src/services/delegation/*`, `src/services/attestations/*` | Add server attestation verification and delegation authorization paths. | required-now | complete (Wave 1) |
| U9 | Townhall/community modules | `src/services/townhall/*`, `src/modules/townhall/*` | Add server primitives for townhall sessions, agendas, and summary artifacts. | required-later | complete (Wave 2) |
| U10 | P2P/self-healing transport hooks | `src/p2p/*`, `docs/distributed_self_healing_blueprint.md` | Add compatibility layer for peer-sync metadata and bootstrap/recovery envelopes. | required-now | complete (Wave 1) |
| U11 | Ops evidence + SLO artifacts | `docs/operations/*`, `scripts/operations/validate_tracker_evidence.sh` | Mirror upstream evidence requirements in this repo’s runbooks, drill artifacts, and CI checks. | required-now | complete (Wave 1) |
| U12 | Module/runtime extensibility | `module_system/*`, `src/modules/*` | Define server extension contract and capability negotiation for upstream modules. | required-later | partial (Wave 3 kickoff) |

## 3) Execution waves

### Wave 1 (required-now parity foundations)

Targets: U1, U2, U4, U6, U8, U10, U11.

Status update (2026-03-27): **completed**. Wave 1 now includes schema docs under `docs/policy_schemas/`, API/validation test coverage in `blackout_runtime_tests/`, and evidence validation command + CI wiring for U11.

Exit criteria:

1. Every target has schema docs, owner, due date, and evidence path in `docs/project_completion_tracker.md`.
2. Server-side API/validation tests exist for each implemented feature family.
3. Compatibility matrix is published for `Blackout_server` vs upstream feature family support.

### Wave 2 (required-later high-value integration)

Targets: U3, U7, U9.

Status update (2026-03-27): **completed**.

#### Wave 2 kickoff backlog (implementation-ready)

| ID | Milestone | Owner | Due | Deliverable(s) | Evidence path |
|---|---|---|---|---|---|
| U3 | Paid rooms / boosts domain model + flags | Product Integrations Lead | 2026-04-10 | Room-state flags (`paid_room`, `boost_tier`) documented; config-gated validation hooks; abuse constraints for forged boost state. | `docs/upstream_blackout_feature_build_plan.md`; `docs/development/blackout_upstream_feature_matrix.md`; `docs/development/wave2_u3_u7_u9_kickoff_plan.md`; implementation + tests (to be added) |
| U7 | Deliberation workflow state machine | Workflow Services Lead | 2026-04-15 | Event lifecycle contract (`proposal -> vote -> execution`) with transition guard rules and rejection codes. | `docs/upstream_blackout_feature_build_plan.md`; `docs/development/blackout_upstream_feature_matrix.md`; `docs/development/wave2_u3_u7_u9_kickoff_plan.md`; workflow tests (to be added) |
| U9 | Townhall primitives + endpoint shape | Community Platform Lead | 2026-04-20 | Session/agenda/summary event schemas + minimal endpoints behind feature flag. | `docs/upstream_blackout_feature_build_plan.md`; `docs/development/blackout_upstream_feature_matrix.md`; `docs/development/wave2_u3_u7_u9_kickoff_plan.md`; endpoint specs/tests (to be added) |

#### Wave 2 rollout sequence

1. **Design freeze** (schema + API contracts + risk controls) by 2026-04-10.
2. **Prototype implementation** behind explicit feature flags by 2026-04-20.
3. **Staging hardening + abuse tests** by 2026-04-25.
4. **Release-candidate gate** with evidence updates by 2026-04-30.

#### Wave 2 risk controls

- Billing/boost integrity: signed/authorized boost-state transitions only; reject out-of-policy state promotions.
- Governance abuse resistance: enforce transition windows and one-vote semantics in deliberation flows.
- Moderation safety: townhall session controls must preserve moderator override and emergency lock semantics.

Exit criteria:

1. Domain models and endpoint contracts are documented.
2. Initial implementation shipped behind explicit config flags.
3. Risk log covers billing/governance abuse and moderation concerns.

### Wave 3 (extensibility + plugin parity)

Targets: U5, U12.

Kickoff update (2026-03-27): **in progress (planning active)**.

#### Wave 3 kickoff backlog (implementation-ready)

| ID | Milestone | Owner | Due | Deliverable(s) | Evidence path |
|---|---|---|---|---|---|
| U5 | Stego plugin contract + trust policy | Extension Platform Lead | 2026-04-20 | Plugin metadata schema, signature verification policy, allowlist/revocation model. | `docs/upstream_blackout_feature_build_plan.md`; `docs/development/blackout_upstream_feature_matrix.md`; `docs/development/wave3_u5_u12_kickoff_plan.md`; implementation + tests (to be added) |
| U12 | Runtime extension capability negotiation | Runtime Extensibility Lead | 2026-05-01 | Contract-version handshake, capability negotiation, config-gated extension activation policy. | `docs/upstream_blackout_feature_build_plan.md`; `docs/development/blackout_upstream_feature_matrix.md`; `docs/development/wave3_u5_u12_kickoff_plan.md`; compatibility tests (to be added) |

#### Wave 3 rollout sequence

1. Contract/spec freeze by 2026-04-20.
2. Prototype implementation behind config gates by 2026-05-01.
3. Compatibility/security hardening by 2026-05-10.
4. Release-candidate evidence gate by 2026-05-15.

#### Wave 3 risk controls

- Plugin trust boundary enforcement: strict signature checks and revocation.
- Capability sandboxing: deny undeclared/unauthorized extension capabilities.
- Version safety: hard-fail incompatible contract versions with explicit diagnostics.

Exit criteria:

1. Extension/plugin contract is documented and versioned.
2. Signature/trust model enforced in server runtime.
3. Conformance tests validate compatibility claims.

## 4) AI prompt pack (copy/paste)

### Prompt 1 — Build upstream feature parity matrix

```text
You are working in /workspace/Blackout_server.

Goal: create a server compatibility matrix for upstream Blackout features.

Inputs:
- docs/upstream_blackout_feature_build_plan.md
- docs/project_completion_tracker.md
- docs/development/blackout_backend_plan_tracker.md

Tasks:
1) For each feature ID U1-U12, map current server support state: unsupported / partial / complete.
2) For unsupported/partial, add:
   - owner role
   - target date
   - measurable exit criteria
   - evidence path
3) Write matrix to docs/development/blackout_upstream_feature_matrix.md.
4) Cross-link matrix from docs/project_completion_tracker.md section 8.

Validation:
- `rg -n "U1|U12|unsupported|partial|complete" docs/development/blackout_upstream_feature_matrix.md`
- `rg -n "blackout_upstream_feature_matrix" docs/project_completion_tracker.md`

Commit message prefix: "tracker: add upstream feature parity matrix"
```

### Prompt 2 — Implement Wave 1 schema + validation scaffolding

```text
You are working in /workspace/Blackout_server.

Goal: deliver Wave 1 foundations (U1,U2,U4,U6,U8,U10,U11) with test scaffolding.

Tasks:
1) Add/extend server event schema docs for Wave 1 feature families.
2) Add validation stubs or concrete validators in the relevant server modules.
3) Add tests proving acceptance/rejection behavior for malformed and valid payloads.
4) Update docs/project_completion_tracker.md statuses for Wave 1 items.

Validation:
- `pytest -q tests -k "blackout or governance or delegation or attestation or p2p"`
- `rg -n "Wave 1|U1|U2|U4|U6|U8|U10|U11" docs/project_completion_tracker.md docs/upstream_blackout_feature_build_plan.md`

Commit message prefix: "blackout: implement wave1 upstream feature foundations"
```

### Prompt 3 — Add ops evidence parity checks

```text
You are working in /workspace/Blackout_server.

Goal: align operations evidence with upstream-style tracker validation.

Tasks:
1) Create scripts-dev/blackout/validate_tracker_evidence.sh for required evidence artifacts.
2) Ensure docs/reliability_reports and drill docs referenced in tracker are validated by script.
3) Add CI wiring or local check documentation for running this validator.
4) Update docs/project_completion_tracker.md and docs/repo_remaining_work_ai_prompts.md with command usage.

Validation:
- `bash scripts-dev/blackout/validate_tracker_evidence.sh`
- `rg -n "validate_tracker_evidence" docs/project_completion_tracker.md docs/repo_remaining_work_ai_prompts.md`

Commit message prefix: "ops: add upstream-style tracker evidence validator"
```

### Prompt 4 — Execute Wave 2 and Wave 3 planning with risk controls

```text
You are working in /workspace/Blackout_server.

Goal: operationalize required-later waves (U3,U5,U7,U9,U12) into actionable backlog.

Tasks:
1) Add a dated backlog table with owner/due/exit/evidence for each target feature.
2) Add explicit risk controls (abuse prevention, billing/boost integrity, plugin trust boundaries).
3) Add rollout sequencing: design -> prototype -> gated release -> GA.
4) Link all artifacts from docs/project_completion_tracker.md section 8.

Validation:
- `rg -n "U3|U5|U7|U9|U12|risk|owner|due|exit criteria|evidence" docs/upstream_blackout_feature_build_plan.md docs/project_completion_tracker.md`

Commit message prefix: "tracker: operationalize wave2-wave3 upstream features"
```

## 5) Command bundle

```bash
# Verify tracker references this plan
rg -n "upstream_blackout_feature_build_plan|U1|U12" docs/project_completion_tracker.md docs/repo_remaining_work_ai_prompts.md

# List open checklist items in tracker
rg -n "^- \[ \]" docs/project_completion_tracker.md

# Re-check marker budget after tracker edits
python scripts-dev/check_marker_budget.py
```
