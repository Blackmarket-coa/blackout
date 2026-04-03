# Known-Issues Matrix and Escalation Paths

## Purpose
Centralize recurring issues, impact patterns, ownership, and escalation pathways for faster triage and lower operational risk.

---

## Known-issues matrix

| Issue ID | Tier(s) | Symptom | Likely root cause | Immediate workaround | Primary owner | Escalation path | Target fix window |
|---|---|---|---|---|---|---|---|
| KI-01 | Starter | Invite link fails intermittently | Link token expiry skew / client clock drift | Regenerate link + force time sync prompt | Identity team | L1 Support → L2 Client Support → L3 Identity | 3 business days |
| KI-02 | Starter/Governance | First room creation stalls | Template API timeout / retry gaps | Retry with fallback template | Frontend Platform | L1 → L2 Frontend → L3 Platform | 2 business days |
| KI-03 | Starter | Notification overload complaints | Default notification profile too noisy | Apply “Focused defaults” preset | Product UX | L1 → L2 Product Ops | 5 business days |
| KI-04 | Governance | Attestation step timeout | Signer service latency or stale workflow state | Re-open workflow and re-issue attestation | Governance Backend | L1 → L2 Governance Support → L3 Backend | 1 business day |
| KI-05 | Governance | Decision workflow blocked by role mismatch | Policy mapping drift after role edits | Run policy-role sync script | Governance PM + Backend | L2 Governance → L3 Backend/Security | 2 business days |
| KI-06 | Governance/Sovereignty | Audit log confusion | UI terminology mismatch with admin mental model | Show glossary overlay + guided view | Admin UX | L1 → L2 Admin UX → L3 Governance PM | 7 business days |
| KI-07 | Sovereignty | Federation peer connection denied unexpectedly | Allowlist/policy hash mismatch | Temporarily isolate route and re-validate policy hash | Federation Team | L1 Tech Intake → L2 Federation → L3 Security Arch | 1 business day |
| KI-08 | Sovereignty | Key rotation operation fails | Misordered key lifecycle operation | Pause rotation and revert to last known good keyset | Security Architecture | L2 Platform/SRE → L3 Security Arch IC | 4 hours |
| KI-09 | All | Advanced settings “missing” for admin | Role caching lag or stale entitlement state | Force entitlement refresh and re-login | RBAC Platform | L1 → L2 RBAC → L3 Platform | 1 business day |
| KI-10 | All | Onboarding analytics gaps | Event dispatch dropped on client retries | Enable local buffer replay and backfill | Data/Telemetry | L2 Ops/Data → L3 Platform | 2 business days |

---

## Escalation path definitions

### Path A — Standard product issue
- L1 Support Intake
- L2 Functional specialist (Client/Product Ops)
- L3 Platform/Backend owner

### Path B — Governance/trust integrity issue
- L1 Support Intake (tag `trust-critical`)
- L2 Governance specialist
- L3 Security PM + Governance Backend
- Escalate to Incident Commander if user-impacting and unresolved > 30 minutes

### Path C — Sovereignty/federation/security issue
- L1 Technical Intake (tag `sovereignty-critical`)
- L2 Federation/SRE
- L3 Security Architecture / Incident Commander
- Immediate SEV-1 protocol if key custody or RBAC leakage risk is present

---

## Escalation SLAs

- **P1 / SEV-1:** acknowledge <= 15 minutes, escalate to L3 <= 30 minutes
- **P2 / SEV-2:** acknowledge <= 1 hour, escalate to L3 <= 4 hours
- **P3 / SEV-3:** acknowledge <= 1 business day, escalate as needed

---

## Mandatory escalation payload

1. Issue ID and severity
2. Tier + deployment model
3. Repro steps and timestamps (UTC)
4. Logs/events/trace IDs
5. Current workaround status
6. Business impact statement
