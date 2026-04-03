# Blackout Execution Plan: Discord-Like Simplicity with Governance + Sovereignty Intact

## 1) Decisions made

1. **Adopt a dual-mode product posture:** `Simple` mode default for all new workspaces; `Advanced` mode available at any time from settings.
2. **Enforce progressive disclosure for governance/privacy:** only show essential trust choices during onboarding; defer policy granularity to guided post-onboarding setup.
3. **Ship in reversible slices with feature flags:** all major onboarding, governance explainers, and packaging flows behind kill switches and cohort targeting.
4. **Standardize safe defaults:** conservative privacy defaults, sane moderation presets, and minimal initial role complexity.
5. **Repackage positioning from “activist/co-op first” to “mission-critical teams with sovereignty needs”:** keep values and decentralization intact while broadening language and templates.
6. **Instrument complexity burden explicitly:** track setup friction and time-to-first-value as first-class product metrics.

---

## 2) Feature scope now / next / later

### Now (0-6 weeks)

| Initiative | User impact | Effort | Risk | Owner role | KPI |
|---|---|---:|---|---|---|
| **Guided workspace creation (3-step wizard)** | Faster first success; less setup anxiety | M | Over-simplifying options for power users | Product + Frontend | Workspace creation completion rate +15%; median setup time < 6 min |
| **Default “Community Baseline” policy pack** | Immediate moderation/governance confidence without manual config | S | Defaults may not fit edge cases | Governance PM + Trust/Safety | % new workspaces using defaults at day 7 > 70% |
| **Just-in-time governance explainers (inline “Why this matters”)** | Better trust comprehension with less cognitive load | S | Tooltip fatigue | UX Writer + Design | Explainer engagement > 35%; policy abandonment -20% |
| **Role templates (Owner/Admin/Member/Guest)** | Reduces permission complexity | M | Template misfit for atypical orgs | Platform + Security | Permission misconfiguration incidents -30% |
| **Feature flags for onboarding + policy UX** | Reversible rollout and safe experiments | S | Flag sprawl / config drift | Platform Infra | 100% of new onboarding features flag-controlled |

### Next (6-12 weeks)

| Initiative | User impact | Effort | Risk | Owner role | KPI |
|---|---|---:|---|---|---|
| **“Trust Center” single pane** (room/server health, policies, audits) | One place to understand governance status | M | Information density creep | Product + Frontend | Weekly active Trust Center users > 40% of admins |
| **Adaptive onboarding by persona** (team lead, moderator, IT admin) | Higher relevance; reduced unnecessary steps | M | Incorrect persona detection | Product Analytics + Frontend | Onboarding step drop-off -25% |
| **Governance simulator (“preview outcome”)** | Confidence before applying complex policy changes | L | Logic mismatch with production behavior | Platform + QA | Rollback after policy changes -40% |
| **Import assistant from Discord/Slack role model** | Easier migration for pragmatic teams | L | Mapping inaccuracies | Integrations + PM | Import completion > 60%; week-4 retention +10% |

### Later (12+ weeks)

| Initiative | User impact | Effort | Risk | Owner role | KPI |
|---|---|---:|---|---|---|
| **Policy marketplace / curated templates** | Faster fit for non-activist verticals | M | Quality control of templates | Ecosystem PM + Governance | % installs from templates > 35% |
| **Delegated governance workflows** (proposal, review, enactment) | Advanced sovereignty with less admin burden | L | Process complexity for small teams | Governance + Platform | Proposal-to-enactment cycle time -30% |
| **Federation readiness score + guided hardening** | Makes decentralization practical for mainstream teams | L | Overreliance on score abstraction | Security + SRE | Federation setup success rate +20% |

---

## 3) UX changes

1. **Onboarding IA simplification**
   - Replace long forms with 3 core decisions: purpose, member model, safety preset.
   - Defer advanced policy controls to a post-onboarding checklist.
2. **Progressive disclosure framework**
   - Use “basic/advanced” sections everywhere governance settings appear.
   - Keep advanced hidden unless user intent is explicit.
3. **Concise explainability standards**
   - Every sensitive control gets one-line summary + “Learn more” drawer.
   - Use plain language (“Who can invite?”) before protocol terms.
4. **Safety-first defaults with visible override**
   - Default to audited presets; expose clear “customize” affordance.
5. **Reduced decision count in first session**
   - Hard cap of 7 decisions before first successful conversation/channel activity.

---

## 4) Operational packaging changes

1. **New edition framing**
   - **Blackout Team**: pragmatic default package (hosted or self-hosted quickstart).
   - **Blackout Sovereign**: full governance/federation depth for high-control organizations.
2. **Vertical onboarding kits** (nonprofit, co-op, startup, agency, newsroom)
   - Include starter roles, moderation policy, compliance hints, and rollout checklist.
3. **Admin launch playbooks**
   - Day 0, Day 7, Day 30 operating guides to move from setup to healthy governance.
4. **Support/CS enablement**
   - “Complexity triage” scripts: identify when to keep defaults vs unlock advanced controls.
5. **Rollout governance**
   - Feature release rubric requiring: flag, rollback path, KPI hypothesis, documentation delta.

---

## 5) Metrics and instrumentation

### Core north-star and guardrail metrics

- **Time to First Value (TTFV):** minutes from signup to first active channel conversation.
- **Onboarding completion rate:** % users completing guided setup.
- **Governance confidence score:** in-product pulse (“I understand my workspace safety setup”).
- **Policy error rate:** reverted/misconfigured permissions per 100 admin actions.
- **Advanced feature adoption quality:** usage of advanced controls without increase in support tickets.

### Event instrumentation requirements

- `onboarding_started`, `onboarding_step_completed`, `onboarding_completed`
- `preset_applied`, `preset_customized`, `policy_changed`, `policy_reverted`
- `explainability_opened`, `learn_more_clicked`
- `advanced_mode_enabled`, `advanced_mode_disabled`
- `first_channel_created`, `first_message_sent`, `first_admin_invite_sent`

### Measurement cadence

- Weekly product review: funnel conversion + friction heatmap.
- Bi-weekly governance review: policy safety incidents + rollback data.
- Monthly strategy review: segment retention (activist/co-op vs pragmatic teams).

---

## 6) Validation checklist

### Product validation

- [ ] New users can complete setup and send first message in < 10 minutes (p50).
- [ ] At least 70% of new workspaces stay on defaults through day 7 without incident.
- [ ] Fewer than 3 governance concepts shown before first successful collaboration event.

### Engineering validation

- [ ] Every new UX flow is behind a runtime flag.
- [ ] Every flag has owner, expiry date, and rollback runbook.
- [ ] No regression in auth, encryption, or moderation enforcement tests.

### GTM/operations validation

- [ ] Team vs Sovereign packaging is reflected in docs, pricing narrative, and demos.
- [ ] At least 3 vertical kits reviewed by design partner teams.
- [ ] CS playbooks reduce governance-related support resolution time by 20%.

---

## 7) Execution plan (2-week slices)

### Slice 1 (Weeks 1-2): Baseline simplification + flags

- Finalize onboarding 3-step IA and copy.
- Implement feature flags and rollout cohorts.
- Add baseline policy pack and role templates.
- Instrument core onboarding + policy events.

### Slice 2 (Weeks 3-4): Explainability + first-run quality

- Launch inline governance explainers.
- Introduce post-onboarding checklist for advanced settings.
- Run A/B test: current onboarding vs guided onboarding.
- Review metrics and tighten confusing steps.

### Slice 3 (Weeks 5-6): Trust visibility + packaging shift

- Ship Trust Center v1 for admins.
- Publish Team vs Sovereign packaging pages and docs.
- Enable vertical onboarding kits for 2 target segments.
- Train CS/support on complexity triage scripts.

### Slice 4 (Weeks 7-8): Persona adaptation + migration utility

- Add persona-based onboarding branching.
- Prototype Discord/Slack role import assistant.
- Run pilot with pragmatic team cohort.
- Iterate based on drop-off and misconfiguration signals.

### Slice 5 (Weeks 9-10): Governance simulation (beta)

- Deliver policy change simulator for high-risk actions.
- Gate to admin beta cohort.
- Compare rollback/incidence metrics vs control.

### Slice 6 (Weeks 11-12): Consolidation + scale decision

- Promote winning onboarding flows to broader rollout.
- Retire low-performing flags.
- Publish QBR with KPI outcomes and recommended scale/hold decisions.
