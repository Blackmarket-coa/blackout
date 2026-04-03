# Blackout Tiered Packaging for Broader Operational Fit (Category-Focused)

## Goal
Broaden fit from activist/co-op roots to pragmatic teams **without diluting category focus** by packaging value in three clear offerings while preserving trust-critical primitives and reversible upgrade paths.

---

## 1) Starter (Managed): Chat Collaboration Only

### Offer definition
- **What buyers get now:** Fast, Discord-like team chat setup (rooms, threads, calls, invites, roles-lite).
- **What is deferred (not removed):** Attestation workflows, governance decision orchestration, and deep sovereignty controls are hidden behind upgrade paths/admin expansion.

### Ideal customer profile
- 10-200 person teams with urgent collaboration needs and low initial governance maturity.
- Product/engineering squads, operations teams, startup internal comms, pilot programs.

### Deployment model
- **Managed** (default).

### Admin effort level
- **Low** (1 part-time workspace admin).

### Security posture summary
- E2EE and trust-critical primitives remain active by default at platform level.
- Admin-facing advanced controls are not foregrounded in day-0 UX to reduce complexity.

### Required onboarding assets
- 10-minute quickstart wizard (create/join → room → invite → first thread/call).
- “First 3 actions” checklist card in-product.
- 2-minute admin orientation video.
- Invite and room templates (team chat / project / announcements).
- FAQ: “How security works by default”.

### Support burden estimate
- **Low-Medium** (~0.6-1.0 support hours per new workspace in first 30 days).
- Most tickets expected: invites, notification setup, room structure.

### 30/60/90-day expansion path to next tier (Governance)
- **Day 30:** Enable governance lite prompt (role templates, retention presets, audit digest).
- **Day 60:** Pilot attestation requirement for high-sensitivity actions.
- **Day 90:** Upgrade to Governance tier for formal decision workflows and attestable approvals.

### Recommendation frame
- **User impact:** Fastest route to first value under 10 minutes.
- **Engineering effort:** **S/M**
- **Risk:** **Low** (main risk is under-exposing advanced admin capability).
- **Owner role:** Growth PM + Onboarding PM + Client Platform.
- **KPI:** Median TTFV < 10 minutes; onboarding completion > 65%.

---

## 2) Governance: Attestation + Decision Workflows

### Offer definition
- **What buyers get now:** Structured governance controls layered on collaboration:
  - Attestation for sensitive actions.
  - Decision workflows (proposal, quorum/approval, audit trail).
  - Role escalation safeguards.

### Ideal customer profile
- Co-ops, activist networks, DAOs/nonprofits, and compliance-sensitive teams needing transparent decision records.
- 50-500 person organizations where accountability and procedural trust are critical.

### Deployment model
- **Hybrid** (managed control plane + optional self-managed policy/data boundaries).

### Admin effort level
- **Medium** (designated governance admin + ops/admin partner).

### Security posture summary
- Strong procedural integrity: attestable actions, role-gated controls, immutable audit orientation.
- Keeps collaboration UX familiar while introducing policy depth for admins.

### Required onboarding assets
- Governance setup playbook (roles, approval chains, policy presets).
- Attestation quickstart and signer onboarding guide.
- Decision workflow templates (urgent decision, budget approval, membership changes).
- Governance health dashboard starter pack.
- Admin runbook for policy exceptions.

### Support burden estimate
- **Medium-High** (~1.5-2.5 support hours per workspace in first 60 days).
- Most tickets expected: role/policy mapping, workflow misconfiguration, attestation onboarding.

### 30/60/90-day expansion path to next tier (Sovereignty)
- **Day 30:** Introduce federation policy briefing and boundary-mapping workshop.
- **Day 60:** Stage pilot for self-host/hybrid key custody and federation allowlist rules.
- **Day 90:** Upgrade to Sovereignty tier for infrastructure/data jurisdiction and deep interop controls.

### Recommendation frame
- **User impact:** Preserves usability while adding decision legitimacy and accountability.
- **Engineering effort:** **M**
- **Risk:** **Medium** (configuration complexity and policy misunderstandings).
- **Owner role:** Governance PM + Security PM + Admin UX.
- **KPI:** Attested action adoption > 50%; governance workflow completion SLA met in 90% of cases.

---

## 3) Sovereignty: Federation / Self-Host / Privacy Controls

### Offer definition
- **What buyers get now:** Full sovereignty posture:
  - Self-host or strict hybrid deployment options.
  - Federation topology and policy controls.
  - Advanced privacy controls and key lifecycle custody.

### Ideal customer profile
- Regulated entities, high-risk NGOs, public-interest orgs, and enterprises with strict data-control mandates.
- 100-2000+ users where jurisdictional control and interop boundaries are non-negotiable.

### Deployment model
- **Self-host or Hybrid** (buyer-selected).

### Admin effort level
- **High** (security admin, platform admin, and governance owner).

### Security posture summary
- Maximum control over infrastructure, key custody, federation boundaries, and privacy posture.
- Highest trust assurance potential, but highest configuration and operational burden.

### Required onboarding assets
- Sovereignty architecture workshop kit.
- Federation policy design workbook.
- Key management and recovery SOP pack.
- Incident response and audit readiness runbooks.
- Change-management checklist for staged policy rollouts.

### Support burden estimate
- **High** (~3.0-5.0 support hours per workspace in first 90 days).
- Most tickets expected: federation trust rules, key lifecycle, deployment/integration issues.

### 30/60/90-day expansion path to next tier
- **Day 30:** Stabilize baseline security posture and audit evidence collection.
- **Day 60:** Expand partner federation policies with staged simulation.
- **Day 90:** No higher tier; move into optimization track (cost, resiliency, policy automation).

### Recommendation frame
- **User impact:** Enables strongest sovereignty guarantees for mission-critical contexts.
- **Engineering effort:** **L**
- **Risk:** **High** (misconfiguration blast radius, longer implementation cycles).
- **Owner role:** Platform/SRE + Security Architecture + Federation Lead.
- **KPI:** 0 critical policy regressions; federation policy change success rate > 95%.

---

## “When NOT to sell this tier” rules

### Do not sell Starter when:
1. Buyer requires attestable approvals in first 30 days.
2. Buyer mandates self-hosted key custody at contract start.
3. Buyer requires explicit federation boundary governance on day 1.

### Do not sell Governance when:
1. Buyer has no admin capacity for policy ownership.
2. Buyer is strictly chat-only with no procedural accountability needs.
3. Buyer requires immediate infrastructure sovereignty and jurisdictional guarantees.

### Do not sell Sovereignty when:
1. Buyer lacks dedicated platform/security operators.
2. Buyer time-to-value objective is under 1 week with minimal setup.
3. Buyer has no regulatory, political, or partner-interoperability driver for deep control.

---

## Objection handling by buyer concern

1. **“This looks too complex for our team.”**
   - Response: Start with Starter managed onboarding; advanced controls are deferred, not forced. You can upgrade with no re-platforming.

2. **“We need trust and accountability, not just chat.”**
   - Response: Governance tier adds attestation and decision workflows while keeping member UX simple.

3. **“We cannot give up infrastructure/data control.”**
   - Response: Sovereignty tier supports self-host/hybrid, federation boundaries, and key custody aligned to your policies.

4. **“We’re worried about migration lock-in.”**
   - Response: Tiering is progression of exposure and operations, not capability removal; expansion paths are reversible and staged.

5. **“Will admins be overwhelmed?”**
   - Response: Admin burden scales by tier intentionally; each tier includes targeted onboarding assets and runbooks.

6. **“Support load will be too high.”**
   - Response: Support burden is estimated upfront by tier, with playbooks/templates reducing ticket volume over 30/60/90 days.

7. **“How do we justify ROI quickly?”**
   - Response: Starter optimizes fast activation (TTFV), Governance reduces decision friction/risk, Sovereignty de-risks compliance and trust-critical operations.
