# Incident Runbooks: Managed vs Self-Host

## Purpose
Define incident response paths by deployment model to reduce ambiguity during outages, security events, and trust-integrity regressions.

---

## A) Managed deployment runbook

### Incident command model
- **Incident Commander (IC):** Blackout Ops On-call
- **Tech Leads:** Platform/SRE, Client, Security (as needed)
- **Comms owner:** Support/Ops Communications

### Severity definitions
- **SEV-1:** broad outage, data integrity/security risk, or RBAC leakage
- **SEV-2:** major degraded functionality without systemic compromise
- **SEV-3:** localized defects/workarounds available

### Response workflow
1. **Detect + declare** (monitor alert or support trigger).
2. **Open incident channel** and assign IC in <= 5 minutes.
3. **Stabilize** (rate-limit, flag disable, traffic shift, rollback).
4. **Diagnose root cause** with service and event traces.
5. **Mitigate + validate** using canary checks.
6. **Communicate status** every 30 minutes for SEV-1, 60 minutes for SEV-2.
7. **Recover + monitor** for at least one full error-budget window.
8. **Postmortem** within 48 hours (SEV-1/2).

### Fast rollback controls
- Disable `ff_onboarding_wizard_v2`
- Disable `ff_nav_simplification_v1`
- Disable `ff_lifecycle_disclosure_v1`
- Freeze migration waves (`ff_workspace_migration_wave_v1`)

### Managed-specific escalation
- SEV-1 auto-pages Security Lead + Platform Director.
- If RBAC/trust-integrity suspected, trigger security incident protocol immediately.

---

## B) Self-host / Hybrid runbook

### Command boundary model
- **Customer IC:** customer-appointed operator
- **Blackout IC-support:** advisory lead (not authoritative over customer infra)
- **Joint bridge:** required for SEV-1/2

### Severity guidance
- **SEV-1:** customer-defined critical impact + trust/security compromise risk
- **SEV-2:** major service degradation in customer environment
- **SEV-3:** non-critical defect or performance regression

### Response workflow
1. **Intake + boundary check** (what is customer-owned vs Blackout-managed).
2. **Joint incident bridge** established within SLA.
3. **Collect required artifacts** (topology, policy hashes, config diffs, logs).
4. **Containment recommendations** from Blackout (policy freeze, route isolation, key-rotation hold).
5. **Customer executes** infra-level changes; Blackout validates behavior.
6. **Joint comms cadence** agreed at incident start.
7. **Recovery validation** with agreed test matrix.
8. **Joint post-incident report** with owner-tagged action items.

### Self-host specific escalation
- Escalate to Security Architecture if key-custody or federation trust chain is implicated.
- Escalate to Federation Specialist if peer route policy failures persist > 60 minutes.

---

## C) Incident checklist (both models)

- [ ] Incident declared with severity and owner.
- [ ] Scope affected users/workspaces and tiers.
- [ ] Rollback option evaluated and logged.
- [ ] User/admin communications posted.
- [ ] Validation checks pass before closure.
- [ ] Follow-up actions assigned with due dates.

---

## D) Required post-incident artifacts

1. Timeline (UTC) with detection, mitigation, recovery markers.
2. Root-cause statement (technical + process factors).
3. Customer impact summary by tier and surface.
4. KPI impact snapshot (activation/support/reliability).
5. Preventive actions and test additions.
