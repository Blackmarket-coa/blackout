# Blackout Server Build Plan

## Purpose
This plan translates the privacy and resilience patterns from the source document into an implementation roadmap for the Blackout Server (Synapse-based), prioritizing secure communication, federation safety, and realistic operational delivery.

## Scope and Guardrails
- **In scope:** Matrix/Synapse server-side capabilities, policy controls, metadata reduction, deployment hardening, observability, and phased rollout.
- **Out of scope for this server repo:** Blackbox hardware/mesh firmware, marketplace or logistics business logic, and any feature that requires client-side UX before server APIs exist.
- **Security guardrail:** Implement privacy-preserving defaults and abuse prevention controls together (rate limits, auditing, moderation hooks).

## Strategy Summary
1. Start with controls already native to Matrix/Synapse (Spaces, room policy, retention, federation ACLs).
2. Add optional privacy enhancements as feature flags (ephemeral workflows, delayed delivery queues, anonymous broadcast patterns).
3. Introduce high-risk capabilities only behind staged experiments and threat-model review.
4. Measure everything with SLOs and red-team style validation before broad rollout.

## Capability Mapping (Document → Blackout Server)

### 1) Cell-structured governance (Highest priority)
**Concept from source:** compartmentalized "cell" structure.

**Server implementation:**
- Define Space hierarchy templates per coalition/chapter.
- Enforce least-privilege room visibility and membership sync rules.
- Add federation boundaries for sensitive spaces (allowlist/denylist per trust tier).
- Codify admin workflows for chapter bootstrap, key rotation, and emergency quarantine.

**Deliverables:**
- Space/room policy spec.
- Admin playbooks for chapter lifecycle.
- Automated policy validation script in CI.

### 2) Dead-drop style asynchronous secure exchange
**Concept from source:** dead-drop messaging pattern.

**Server implementation:**
- Create "dead-drop room profile" as policy bundle:
  - invite-only + unlisted defaults,
  - strict retention TTL,
  - no history visibility for new members,
  - optional single-use access tokens.
- Add automated expiration/purge jobs and tombstone behavior.
- Expose server-side room presets that clients can call without custom logic.

**Deliverables:**
- Room preset definitions + retention jobs.
- Abuse controls (join rate limits, invite quotas, anomaly alerts).

### 3) Privacy-preserving broadcast channels
**Concept from source:** broad announcements with reduced observer insight.

**Server implementation:**
- Define "announcement-only" rooms with restricted senders.
- Use hierarchical Spaces to fan out broadcast rooms by constituency.
- Minimize read-receipt exposure where possible via policy defaults.
- Add optional delayed fanout window for timing-correlation resistance.

**Deliverables:**
- Announcement room baseline config.
- Federation-safe fanout procedures and rollback plan.

### 4) Timing metadata resistance (Medium priority, experimental)
**Concept from source:** reduce timing-analysis leakage.

**Server implementation:**
- Add optional outbound event batching/jitter queues for selected room classes.
- Introduce configurable delay envelopes (e.g., 5–30s randomized windows).
- Track latency/UX impact with opt-in cohorts first.

**Deliverables:**
- Feature-flagged batching service.
- Telemetry dashboard for delay vs. delivery reliability.

### 5) Steganography-related support (Low priority, client-led)
**Concept from source:** steganographic payloads in media.

**Server stance:**
- Do **not** implement custom covert payload tooling at server layer.
- Ensure media handling remains standards-compliant, encrypted, and integrity-checked.
- Provide extension points for future client-side metadata envelopes if governance approves.

**Deliverables:**
- Security note documenting why this remains client-side.
- Media pipeline integrity checklist.

### 6) Mesh/off-grid readiness (Dependency track)
**Concept from source:** mesh-capable communications.

**Server implementation track:**
- Optimize for intermittent uplinks: robust retry queues, compact sync windows, and conflict-safe federation backoff.
- Add deployment profile for edge homeservers (low CPU/memory presets).
- Document relay/bridge interfaces for Blackbox or other transport layers.

**Deliverables:**
- "Edge profile" deployment config.
- Federation behavior tuning guide for unstable links.

## Delivery Phases

### Phase 0 (Weeks 0–2): Foundation
- Finalize threat model and abuse model.
- Define policy schemas for cell spaces, dead-drop rooms, broadcast rooms.
- Add feature flags and config toggles for all non-default behavior.

### Phase 1 (Weeks 3–6): Core policy rollout
- Implement cell-governance room/space templates.
- Ship dead-drop room preset + retention enforcement.
- Ship announcement-channel baseline.
- Add operational runbooks and admin APIs/scripts.

### Phase 2 (Weeks 7–10): Privacy enhancement pilots
- Pilot timing-jitter queue in limited environments.
- Add federation hardening + edge profile tuning.
- Validate with load tests and failure-injection tests.

### Phase 3 (Weeks 11–14): Production hardening
- SLO validation (delivery latency, federation success, purge correctness).
- Security review and red-team scenarios.
- Gradual rollout with rollback gates and playbook drills.

## Technical Work Breakdown

### A. Configuration and policy
- New room/space presets:
  - `blackout_cell_space`
  - `blackout_dead_drop_room`
  - `blackout_announcement_room`
- Retention/expiry tasks for dead-drop rooms.
- Federation ACL templates by trust tier.

### B. Services and pipelines
- Optional event batching/jitter worker (feature-flagged).
- Expiration and purge worker improvements.
- Metrics for message delay, failure, retry, and purge compliance.

### C. Operations and reliability
- SLOs:
  - P95 delivery latency by room type,
  - federation transaction success rate,
  - dead-drop purge completion within SLA.
- Alerts for queue growth, federation stalls, and purge failures.
- Incident runbooks: compromise isolation, room quarantine, key rotation.

### D. Security and governance
- Threat-model checkpoints per phase.
- Abuse prevention: invite throttling, spam heuristics, federation anomaly detection.
- Audit logging for privileged policy changes.

## Success Criteria
- Cell-based room isolation deployed and validated across federation boundaries.
- Dead-drop rooms purge on schedule with auditable evidence.
- Broadcast channels operate with stable fanout and controlled metadata leakage.
- Experimental timing protections show measurable privacy gain with acceptable UX cost.
- Edge/unstable-link profile maintains acceptable sync/federation reliability.

## Risks and Mitigations
- **Risk:** Privacy features degrade UX latency.
  - **Mitigation:** Feature flags, cohort rollout, strict SLO gates.
- **Risk:** Misconfiguration causes overexposure between cells.
  - **Mitigation:** Policy-as-code checks + preflight validators.
- **Risk:** Federation incompatibility with nonstandard behavior.
  - **Mitigation:** Keep protocol-compliant defaults; isolate experiments.
- **Risk:** Abuse of ephemeral channels.
  - **Mitigation:** Rate limits, anomaly detection, moderation override controls.

## Immediate Next Actions (Execution-ready)
1. Approve this plan and freeze a Phase 0 scope baseline.
2. Create implementation tickets grouped by the six capability tracks.
3. Assign owners for policy, federation, operations, and security review.
4. Stand up a staging federation environment for Phase 1 validation.
5. Begin with cell-governance templates and dead-drop retention enforcement.

## Phase 0 Scope Baseline (Approved and Frozen)

**Status:** Approved for execution. Scope is frozen to prevent unreviewed expansion during Phase 0.

### Included in Phase 0
- Threat model + abuse model completion and sign-off.
- Policy schema definitions for:
  - `blackout_cell_space`
  - `blackout_dead_drop_room`
  - `blackout_announcement_room`
- Feature flags/config toggles for all non-default behaviors introduced by this plan.
- CI policy validation scaffold for room/space policy checks.

### Explicitly deferred beyond Phase 0
- Full rollout of timing-jitter batching to production.
- Any server-side steganography tooling.
- Mesh transport implementation work in hardware/transport repos.

### Change-control rule
Any change to frozen Phase 0 scope requires written approval from the Security Review owner and Technical Program owner.

## Implementation Ticket Backlog (Grouped by Capability Tracks)

### Track 1 — Cell-structured governance
- **BO-101:** Define Space hierarchy template spec per chapter/coalition.
- **BO-102:** Implement least-privilege membership and visibility policy checks.
- **BO-103:** Add federation ACL trust-tier templates + test fixtures.

### Track 2 — Dead-drop secure exchange
- **BO-201:** Add `blackout_dead_drop_room` preset and API wiring.
- **BO-202:** Implement dead-drop retention TTL and purge/tombstone scheduler.
- **BO-203:** Add invite/join quota guardrails and anomaly alert hooks.

### Track 3 — Privacy-preserving broadcasts
- **BO-301:** Add `blackout_announcement_room` preset baseline.
- **BO-302:** Implement broadcast fanout policy with constrained sender roles.
- **BO-303:** Add rollback-safe federation procedures for announcement channels.

### Track 4 — Timing metadata resistance (experimental)
- **BO-401:** Build feature-flagged batching/jitter worker skeleton.
- **BO-402:** Add delay envelope config and cohort gating.
- **BO-403:** Create telemetry panels for delay/reliability tradeoff tracking.

### Track 5 — Steganography stance and media safety
- **BO-501:** Publish security decision record: steganography remains client-side.
- **BO-502:** Add media pipeline integrity checklist and compliance checks.

### Track 6 — Mesh/off-grid readiness
- **BO-601:** Create edge homeserver deployment profile (resource-constrained).
- **BO-602:** Tune federation retry/backoff profile for intermittent links.
- **BO-603:** Document relay/bridge interface assumptions for Blackbox integration.

## Ownership and Accountability

| Area | Owner Role | Primary Responsibilities |
|---|---|---|
| Policy | **Policy Lead** | Room/space preset definitions, governance policy approval |
| Federation | **Federation Lead** | ACL templates, cross-server compatibility, fanout rollback safety |
| Operations | **SRE/Operations Lead** | Staging environment, SLOs, alerting, runbooks, rollout gates |
| Security Review | **Security Lead** | Threat model sign-off, abuse controls, security decision records |

**RACI notes**
- Policy changes affecting federation defaults require Federation Lead + Security Lead approval.
- Experimental timing defenses require explicit SRE sign-off before broader cohorts.

## Staging Federation Environment Plan (Phase 1 Validation)

### Topology
- 3 homeservers minimum:
  - `hs-alpha` (primary implementation candidate)
  - `hs-beta` (federation peer)
  - `hs-chaos` (fault-injection and compatibility validation)
- Shared observability stack for metrics/logs/tracing.

### Validation goals
- Verify cell-space isolation boundaries across federated joins.
- Verify dead-drop retention and purge SLA behavior end-to-end.
- Validate announcement fanout and rollback under federation disruptions.
- Collect baseline latency and transaction success metrics before Phase 2 pilots.

### Exit criteria for Phase 1 staging
- No high-severity policy leakage defects.
- Dead-drop purge success within agreed SLA in repeated runs.
- Federation transaction success rate meets baseline target under normal load.
- Runbooks exercised at least once (quarantine + rollback drill).

## Updated Next Steps
1. **Start BO-101 and BO-201 immediately** (cell templates + dead-drop preset/retention).
2. Stand up the 3-node staging federation topology and wire observability.
3. Complete and sign off Phase 0 deliverables under frozen scope.
4. Run Phase 1 validation scenarios and capture metrics against exit criteria.
5. Review outcomes in a go/no-go gate before enabling Phase 2 experiments.


## Finalized Threat Model (Phase 0)

### Protected assets
- Room membership graphs and chapter/cell relationship metadata.
- Message confidentiality and key material boundaries.
- Room policy integrity (presets, ACLs, retention rules).
- Federation trust posture and server-to-server transaction integrity.
- Administrative control plane actions (policy change, quarantine, key rotation).

### Primary adversaries
- **External network observer:** attempts traffic analysis and activity correlation.
- **Malicious federated server operator:** attempts policy bypass, metadata harvesting, or malformed event injection.
- **Compromised insider account:** attempts lateral movement across cells and privilege escalation.
- **Abusive automation/spam actor:** attempts room flooding, invite abuse, and denial-of-service patterns.

### Priority threat scenarios and controls
1. **Cross-cell data exposure via policy misconfiguration**
   - Controls: policy-as-code validation, trust-tier ACL templates, preflight checks, dual approval for sensitive policy changes.
2. **Timing correlation of sensitive room activity**
   - Controls: optional batching/jitter, delayed fanout windows, cohort-limited rollout, telemetry-based rollback gates.
3. **Retention bypass in dead-drop rooms**
   - Controls: scheduler-backed TTL enforcement, purge audits, SLA alarms on purge lag.
4. **Federation abuse through hostile peers**
   - Controls: allowlist/denylist tiers, anomaly detection on federation traffic, quarantine runbook.
5. **Admin-plane compromise or misuse**
   - Controls: auditable privileged actions, least-privilege roles, emergency key rotation procedure.

### Risk acceptance for Phase 0
- Timing-jitter defenses remain experimental and disabled by default.
- Steganography tooling remains out of server scope; media integrity and standards compliance remain in scope.

## Finalized Abuse Model (Phase 0)

### Abuse cases
- **Invite spam / room stuffing:** rapid creation and invitation bursts in dead-drop and broadcast contexts.
- **Broadcast hijack attempts:** unauthorized sender attempts in announcement rooms.
- **Dead-drop persistence abuse:** attempts to preserve messages past TTL via re-posting or room setting drift.
- **Federation probing:** repeated malformed/hostile transactions to discover policy edges.

### Abuse controls baseline
- Invite and join rate limits per user/IP/server.
- Room-creation quotas and burst caps by trust tier.
- Sender-role enforcement for announcement rooms.
- Automated detection signals:
  - invite velocity anomalies,
  - purge lag anomalies,
  - federation error-rate spikes,
  - privilege-change anomaly alerts.
- Moderator override controls with auditable reason codes.

### Abuse response SLAs
- High-severity abuse triage: <= 15 minutes.
- Temporary containment (quarantine/rate-limit escalation): <= 30 minutes.
- Post-incident policy review and rule adjustment: <= 2 business days.

## Policy Schemas (Phase 0 Definitions)

### `blackout_cell_space`
- **Purpose:** compartmentalized governance space for chapter/cell operations.
- **Required fields:**
  - `space_id` (string)
  - `chapter_id` (string)
  - `visibility` (`private` only)
  - `membership_rule` (`invite_only`)
  - `allowed_parent_spaces` (array<string>)
  - `federation_trust_tier` (`local`, `partner`, `restricted`)
- **Validation rules:**
  - parent-child links must stay within approved chapter boundary.
  - cross-cell joins require explicit allow policy entry.
  - moderation roles must be assigned before activation.

### `blackout_dead_drop_room`
- **Purpose:** asynchronous, unlisted, high-retention-discipline exchange room.
- **Required fields:**
  - `room_id` (string)
  - `visibility` (`private`/`unlisted`)
  - `membership_rule` (`invite_only`)
  - `history_visibility` (`joined`)
  - `retention_ttl_hours` (integer, min 1, max 168)
  - `purge_mode` (`hard_delete` | `tombstone`)
- **Optional fields:**
  - `single_use_access_token` (boolean)
  - `max_members` (integer)
- **Validation rules:**
  - TTL is mandatory and cannot be unset after room creation.
  - retention job heartbeat must exist before room activation.
  - invite quota defaults apply unless explicitly tightened.

### `blackout_announcement_room`
- **Purpose:** one-to-many broadcast channel with constrained senders.
- **Required fields:**
  - `room_id` (string)
  - `visibility` (`private` or scoped `public`)
  - `sender_roles` (array: `announcer`, `moderator`)
  - `default_member_power` (integer; send denied by default)
  - `read_receipt_policy` (`minimized` | `standard`)
  - `fanout_mode` (`immediate` | `delayed_window`)
- **Validation rules:**
  - non-sender members must be unable to post.
  - delayed fanout requires explicit window bounds.
  - rollback procedure reference must be attached for federated channels.

## Feature Flags and Config Toggles (Non-default Behavior)

### Feature flags
- `features.cell_governance_templates` (default: `false`)
- `features.dead_drop_room_preset` (default: `false`)
- `features.announcement_room_preset` (default: `false`)
- `features.timing_jitter_worker` (default: `false`, experimental)
- `features.delayed_broadcast_fanout` (default: `false`)
- `features.edge_federation_profile` (default: `false`)

### Config toggles
- `blackout.policy.enforce_trust_tier_acls` (`true|false`)
- `blackout.dead_drop.default_ttl_hours` (int)
- `blackout.dead_drop.max_ttl_hours` (int)
- `blackout.dead_drop.purge_interval_minutes` (int)
- `blackout.dead_drop.require_scheduler_heartbeat` (`true|false`)
- `blackout.broadcast.default_read_receipt_policy` (`minimized|standard`)
- `blackout.broadcast.delayed_fanout_min_seconds` (int)
- `blackout.broadcast.delayed_fanout_max_seconds` (int)
- `blackout.timing_jitter.min_seconds` (int)
- `blackout.timing_jitter.max_seconds` (int)
- `blackout.abuse.invite_rate_limit_per_minute` (int)
- `blackout.abuse.join_rate_limit_per_minute` (int)
- `blackout.abuse.room_creation_burst_limit` (int)

### Rollout defaults
- All non-default feature flags remain disabled in production until Phase 1 exit criteria are met.
- Staging enables `cell_governance_templates`, `dead_drop_room_preset`, and `announcement_room_preset` first; other flags require Security + Operations approval.

## Phase 0 Completion Assessment (Current)

**Assessment date:** 2026-03-14

**Is Phase 0 complete?** **Yes for engineering scope (human governance sign-off pending).**

Phase 0 design artifacts are documented in this plan and the core engineering execution artifacts are now delivered in-repo. Formal governance sign-off remains the final non-code closure gate.

### Gate-by-gate status
- **Threat model + abuse model sign-off:** 🟡 Finalized in docs; owner sign-off pending in governance workflow.
- **Policy schema definitions:** ✅ Documented in this plan.
- **Feature flags/config toggles:** ✅ Documented in this plan.
- **CI policy validation scaffold:** ✅ Implemented via `scripts-dev/validate_blackout_policy_schemas.py` and CI job `check-blackout-policy-schemas`.

### Phase 0 closure artifacts delivered
1. Machine-readable JSON schemas delivered for the three presets under `docs/policy_schemas/`.
2. CI validation scaffold delivered via `scripts-dev/validate_blackout_policy_schemas.py` and workflow integration.
3. Remaining non-code gate: formal sign-off from Policy, Federation, Operations, and Security owners.

### Phase 0 sign-off record (governance gate)
- Policy owner sign-off: Pending
- Federation owner sign-off: Pending
- Operations owner sign-off: Pending
- Security owner sign-off: Pending
- Sign-off evidence pack:
  - `docs/policy/blackout_cell_space_template.md`
  - `docs/ops/staging_federation_topology.md`
  - `docs/reports/phase1_validation_report.md`
  - `docs/reports/phase2_go_no_go_decision.md`


## Phase 1 Execution Kickoff Plan (Prepared)

Phase 1 will begin immediately after Phase 0 completion gates above are met. Work can be pre-staged now.

### Sprint A (Week 1): BO-101 + BO-201
- Implement `blackout_cell_space` template plumbing (BO-101).
- Implement `blackout_dead_drop_room` preset wiring (BO-201).
- Add unit tests for template defaults and policy constraint enforcement.

### Sprint B (Week 2): BO-202 + BO-301
- Implement retention TTL + purge/tombstone scheduling for dead-drop rooms (BO-202).
- Implement announcement room preset baseline (BO-301).
- Add tests for purge timing, history visibility, and sender restrictions.

### Sprint C (Week 3): BO-103 + BO-302
- Implement federation ACL trust-tier templates (BO-103).
- Implement announcement fanout policy and role gating (BO-302).
- Add federation compatibility tests in staging topology.

### Sprint D (Week 4): BO-303 + operational hardening
- Add rollback-safe federation procedures for announcement channels (BO-303).
- Run quarantine and rollback drills in staging.
- Publish Phase 1 completion report against exit criteria.

### BO-303 execution update (2026-03-16)
- Rollback-safe announcement federation runbook published: `docs/ops/announcement_fanout_rollback.md`.
- Quarantine + rollback drill executed with sign-off: `docs/reports/staging_drill_report_2026-03-16.md`.
- Phase 1 completion report published against exit criteria: `docs/reports/phase1_completion_report_2026-03-16.md`.

### Phase 1 entry criteria (must all be true)
- Phase 0 completion gates are closed.
- 3-node staging federation environment is online and observable.
- On-call runbooks are available to operators before feature enablement.

### Updated action now
- Begin Sprint A backlog now (BO-101 and BO-201) while governance owners finalize formal sign-off.

### Risk-order execution update (2026-03-16)
- BO-203 executed: dead-drop invite/join quota guardrails + anomaly hooks added in runtime module and tests.
- BO-4xx advanced: feature-flag-friendly jitter batching worker skeleton added (`blackout_runtime/jitter_worker.py`).
- BO-5xx executed: steganography decision record + media integrity checklist published.
- BO-6xx advanced: edge homeserver profile, edge federation tuning guide, and relay/bridge assumptions published.
- Consolidated report: `docs/reports/bo_backlog_risk_order_execution_2026-03-16.md`.
