# Support Playbooks by Tier

## Purpose
Define tier-specific support motions, SLAs, triage ownership, and resolution workflows for Starter, Governance, and Sovereignty offerings.

---

## 1) Starter (Managed) support playbook

### Common issue themes
- Invite failures / expired links
- Notification overload or missed alerts
- Room setup confusion
- Basic permission misunderstandings

### Triage model
- **L1:** Support Operations (primary)
- **L2:** Frontend/Client Support Engineering
- **L3:** Identity/Platform

### Initial response targets
- P1: 1 hour
- P2: 4 hours
- P3: 1 business day

### Standard handling flow
1. Confirm workspace tier and client surface (web/desktop/mobile).
2. Reproduce using guided checklist (invite, room creation, first thread/call).
3. Apply known fix/article if match exists.
4. If unresolved after 30 minutes, escalate to L2 with repro artifact bundle.
5. Close with user-facing summary and prevention guidance.

### Required artifacts per ticket
- Workspace ID (redacted format)
- User role
- Timestamp + timezone
- Screen recording or step log
- Relevant event IDs (`invite_failed`, `onboarding_step_skipped`, etc.)

### Success KPIs
- First-contact resolution rate > 70%
- Mean time to resolve (MTTR) < 8 hours for P2
- Ticket reopen rate < 10%

---

## 2) Governance support playbook

### Common issue themes
- Attestation step failures
- Decision workflow misconfiguration
- Role escalation policy conflicts
- Audit trail comprehension gaps

### Triage model
- **L1:** Support Operations (intake + severity)
- **L2:** Governance Specialist Support
- **L3:** Backend Governance + Security PM

### Initial response targets
- P1: 30 minutes
- P2: 2 hours
- P3: 8 business hours

### Standard handling flow
1. Validate policy/workflow version and current actor permissions.
2. Run governance diagnostics checklist (approval chain, quorum rules, signer state).
3. Provide corrective template if policy-pattern issue.
4. Escalate to L3 if cryptographic attestation or audit-integrity concern appears.
5. Confirm completed action path and produce post-incident governance note.

### Required artifacts per ticket
- Workflow ID + policy revision
- Failing action and expected outcome
- Attestation state (pending/failed/expired)
- Audit log reference IDs
- Redacted role map snapshot

### Success KPIs
- Governance task restoration < 4 hours (P2)
- Misconfiguration recurrence < 15%
- Governance-related churn ticket rate downward WoW

---

## 3) Sovereignty support playbook

### Common issue themes
- Federation trust/allowlist mismatches
- Self-host deployment drift
- Key custody/rotation operational failures
- Connectivity and interop policy conflicts

### Triage model
- **L1:** Technical Support Intake
- **L2:** Platform/SRE + Federation Specialists
- **L3:** Security Architecture + Incident Commander

### Initial response targets
- P1: 15 minutes
- P2: 1 hour
- P3: 4 business hours

### Standard handling flow
1. Determine deployment model (self-host vs hybrid) and control boundaries.
2. Execute sovereignty diagnostic tree (federation routes, key state, policy diffs).
3. Contain impact using policy freeze / route isolation if needed.
4. Coordinate with customer operator for fix execution and validation.
5. Publish incident summary with residual risk + follow-up tasks.

### Required artifacts per ticket
- Deployment topology snapshot
- Federation policy hash/version
- Key lifecycle state and recent rotation logs
- Service health snapshot (latency/error rates)
- Change window details + last known good config

### Success KPIs
- P1 containment < 30 minutes
- Federation restore SLA < 2 hours for critical peers
- Post-incident action closure within 7 days

---

## 4) Cross-tier support operating rules

1. **Always classify by tier first** (Starter/Governance/Sovereignty).
2. **Do not downgrade severity** for trust-integrity or RBAC leakage reports.
3. **Attach telemetry IDs** to every escalated ticket.
4. **Use structured handoff template** for L1→L2→L3 transitions.
5. **Close-the-loop discipline:** every resolved incident maps to docs/copy/product fix candidate.
