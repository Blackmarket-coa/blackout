# Go/No-Go KPI Gates and Evidence Pack

## Purpose
Define production rollout gates for onboarding simplification and tiered packaging with explicit KPI thresholds and mandatory evidence artifacts.

---

## 1) KPI dashboard (required)

| KPI ID | KPI | Baseline | Target | Alert threshold | Decision action if red | Owner discipline | Est. effort | Validation test plan |
|---|---|---:|---:|---:|---|---|---|---|
| KPI-01 | Time-to-first-room (median, minutes) | 6.8 | 3.5 | >5.0 | **Hold** rollout; run onboarding step-time drilldown and patch room-create friction before expanding cohort. | product + frontend | S | Weekly funnel replay; synthetic room-create latency checks |
| KPI-02 | Invite completion rate (%) | 42% | 65% | <50% | **Hold** rollout; revise invite copy/order and enable assisted invite prompts. | product + frontend | S/M | Invite flow A/B analysis; invite error-rate regression suite |
| KPI-03 | Day-1 activation (% workspaces with room+invite+first thread/call) | 38% | 58% | <45% | **Rollback** `ff_onboarding_wizard_v2` for affected cohort if two consecutive daily breaches. | product + ops | M | Cohort activation dashboards; flag rollback simulation |
| KPI-04 | Day-7 retained workspace activity (%) | 31% | 45% | <35% | **Hold** expansion to next cohort; tune Day-7 lifecycle nudges and admin checklist. | product | M | Retention cohort analysis; lifecycle nudge effectiveness tests |
| KPI-05 | % orgs enabling advanced modules (eligible admins) | 24% | 40% | <22% | **Continue with remediation**; improve admin discoverability banners and deep-link education. | frontend + product | S | Admin discoverability clickstream + completion funnel |
| KPI-06 | Governance task completion latency (Governance tier, median hours) | 22.0 | 8.0 | >14.0 | **Hold Governance-tier upsell**; simplify workflow templates and attestation steps. | backend + product | M | Workflow timing audit; attestation path performance tests |
| KPI-07 | Support ticket volume per 100 active workspaces | 18 | 11 | >16 | **Hold** rollout; activate support hotfix queue and update in-product help cues. | ops + support | S | Ticket taxonomy trend checks; issue-tag quality audits |

---

## 2) Go/No-Go gate logic

### Gate A — Pilot launch (10-20% new workspaces)
- **Go if:**
  - KPI-01, KPI-02, KPI-03 are not red for 7 consecutive days.
  - No critical RBAC/security regression.
- **No-go if:**
  - KPI-03 is red for 2 consecutive days.
  - Any P0 trust-integrity incident occurs.

### Gate B — Broader rollout (50% new workspaces + selected existing)
- **Go if:**
  - Gate A passed.
  - KPI-04 and KPI-07 are not red for 14-day window.
- **Conditional-go if:**
  - KPI-05 is red but all activation/support KPIs are green and remediation plan is active.
- **No-go if:**
  - KPI-07 breaches threshold for >7 days.

### Gate C — Governance upsell expansion
- **Go if:**
  - KPI-06 and KPI-05 in green/amber band for 2 weekly cycles.
  - Support burden within planned envelope.
- **No-go if:**
  - Governance latency remains red after one remediation sprint.

---

## 3) Evidence pack (mandatory artifacts)

### EVID-01 — Test outputs
- **Contents:**
  - CI pass/fail summaries for onboarding, RBAC, telemetry contract suites.
  - Performance test outputs for first-room/invite/thread/call steps.
  - Flag rollback rehearsal logs.
- **Source systems:** CI pipeline + synthetic monitoring + release tooling logs.
- **Owner discipline:** backend + frontend + ops.

### EVID-02 — UX walkthrough recordings
- **Contents:**
  - 5-task moderated walkthroughs (create/join, room, invite, first thread/call, find admin advanced settings).
  - Recordings for at least one novice admin and one experienced admin persona per tier.
  - Annotated timestamps for confusion events and abandonment moments.
- **Source systems:** UX research repository.
- **Owner discipline:** product + design.

### EVID-03 — Support-triage summary
- **Contents:**
  - Top ticket categories mapped to onboarding steps.
  - Ticket volume trend per 100 active workspaces.
  - Mean time to resolution and escalation causes.
  - Recommended docs/copy/product fixes for top 5 drivers.
- **Source systems:** Support desk + incident tracker.
- **Owner discipline:** support + ops + product.

### EVID-04 — Rollout risk register
- **Contents:**
  - Active risks, severity, mitigation owner, and due date.
  - Flag-level rollback triggers and last drill date.
  - Open dependencies blocking go-live.
  - Explicit residual risk acceptance notes.
- **Source systems:** Program risk register + release checklist.
- **Owner discipline:** ops + security + product.

---

## 4) Evidence acceptance checklist for decision meeting

- [ ] Latest KPI dashboard snapshot includes all KPI-01..KPI-07 metrics.
- [ ] 14-day trendlines attached for activation, retention, and support KPIs.
- [ ] Test outputs attached with build identifiers and timestamps.
- [ ] UX walkthrough clips linked with issue annotations.
- [ ] Support-triage summary reviewed with assigned fix owners.
- [ ] Risk register includes mitigation status for all high/critical risks.
- [ ] Decision log records **Go / Conditional Go / No-Go** with rationale.

---

## 5) Decision meeting output format

- **Decision:** `go` | `conditional_go` | `no_go`
- **KPI status summary:** green/amber/red per KPI-01..KPI-07
- **Exceptions approved:** list with owner + expiry date
- **Immediate actions if red:** linked remediation work orders and rollback flags
- **Next review date:** within 7 calendar days
