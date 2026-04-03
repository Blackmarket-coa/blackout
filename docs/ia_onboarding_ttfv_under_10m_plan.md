# Blackout IA + Onboarding Redesign for Time-to-First-Value (TTFV) < 10 Minutes

## 1) Decisions made

1. **Adopt a two-lane first-run model:**
   - **Lane A (default):** "Start fast" with opinionated defaults.
   - **Lane B (optional):** "Set up with governance controls" (deferred into admin expansion points).
   - **User impact:** New users reach a working workspace and active conversation quickly without governance overload.
   - **Engineering effort:** **M**
   - **Risk:** Medium (incorrect default assumptions for edge governance-heavy orgs).
   - **Owner role:** Product + Design + Client Platform
   - **KPI:** Median TTFV under 10 minutes; onboarding completion rate +20%.

2. **Make trust-critical primitives always active but not always foregrounded:**
   - Keep encryption, auditability, sovereignty/federation, and governance integrity enforced in system behavior.
   - Move detailed controls into admin-only advanced surfaces.
   - **User impact:** Trust properties preserved; cognitive load reduced.
   - **Engineering effort:** **S**
   - **Risk:** Low (copy/visibility confusion if not explained).
   - **Owner role:** Security + Governance PM + UX Writing
   - **KPI:** No regression in security posture metrics; reduced “settings confusion” tickets.

3. **Navigation simplification baseline:**
   - Core nav becomes: **Home, Rooms, DMs, Activity, Calls, Admin**.
   - Admin contains expandable “Governance & Sovereignty” panel.
   - **User impact:** Faster orientation, Discord-like familiarity.
   - **Engineering effort:** **M**
   - **Risk:** Medium (power users need retraining).
   - **Owner role:** Design Systems + Frontend Platform
   - **KPI:** First-session navigation misclick rate -30%.

4. **Progressive disclosure policy by lifecycle timebox:**
   - Day 0 = basics only; Day 7 = team controls; Day 30 = sovereignty/federation depth.
   - **User impact:** Gradual learning curve.
   - **Engineering effort:** **M**
   - **Risk:** Medium (timing may not match every org maturity).
   - **Owner role:** Product Growth + Lifecycle Messaging
   - **KPI:** Feature adoption curve improves without TTFV regression.

5. **Reversible rollout via feature flags + cohort gating:**
   - Separate flags for nav IA, onboarding wizard, governance disclosure prompts.
   - **User impact:** Lower rollout risk and safe rollback.
   - **Engineering effort:** **S**
   - **Risk:** Low.
   - **Owner role:** Platform + Release Engineering
   - **KPI:** Rollback time < 30 minutes; incident-free launch windows.

---

## 2) Feature scope now / next / later

### Now (0-6 weeks)
- New first-run wizard (workspace → room → invite → first thread/call).
- Simplified nav shell + admin-only advanced entry points.
- Day 0 progressive disclosure state.
- Explainability microcopy for hidden/advanced controls.
- Instrumentation for funnel and drop-off.

**User impact:** Immediate complexity reduction and faster activation.
**Engineering effort:** **M**
**Risk:** Medium
**Owner role:** Product + Design + Web/Desktop Client Leads
**KPI:** TTFV median < 10 min; D1 activation +15%.

### Next (6-12 weeks)
- Day 7 nudges for moderation/governance light controls.
- Template-based room presets by team type (project, support, ops, community).
- Invite path hardening (email, link, QR, policy hints).
- Admin onboarding checklist.

**User impact:** Better team setup quality without first-run overload.
**Engineering effort:** **M**
**Risk:** Medium
**Owner role:** Growth PM + Client + Identity/Invites team
**KPI:** 7-day retained workspaces +12%; invite acceptance +10%.

### Later (12+ weeks)
- Day 30 sovereignty/federation guidance center.
- Governance policy simulation (“preview impact before applying”).
- Cross-surface parity (mobile-first deep onboarding parity).

**User impact:** Advanced trust differentiation for mature orgs.
**Engineering effort:** **L**
**Risk:** Medium/High (cross-surface coordination).
**Owner role:** Governance PM + Mobile + Federation Platform
**KPI:** Admin advanced feature adoption +25% among retained orgs.

---

## 3) UX changes

## 3.1 First-run flow map (target < 10 min)

### Step 1: Create or join workspace (0:00-2:30)
- Entry screen with two primary CTAs:
  - **Create workspace** (default highlighted)
  - **Join with invite**
- Minimal required fields only.
- Auto-provision defaults (permissions baseline + starter channels).
- “Why this default?” tooltip with one sentence.

**Exit criteria:** User lands in workspace shell.

### Step 2: Create first room (2:30-4:30)
- One-click room presets: **Team Chat**, **Project Room**, **Announcements**.
- Hidden advanced options under “Customize (optional)”.

**Exit criteria:** At least one room created and focused.

### Step 3: Invite members (4:30-6:30)
- Invite modal prioritized methods:
  1) Copy invite link
  2) Email invite
  3) Directory/integrations (if configured)
- “Can edit later” reassurance copy.

**Exit criteria:** At least one invite sent OR explicit skip with reminder scheduled.

### Step 4: Start first thread or call (6:30-9:30)
- Prompt: “Kick off your first discussion.”
- Two equal choices:
  - **Start thread** (prefilled starter prompt)
  - **Start call** (1-click lightweight room call)
- Success state celebrates first value and shows next best action.

**Exit criteria:** First message/thread OR first call started.

### Step 5: Completion state (9:30-10:00)
- “You’re live” summary card:
  - Workspace created
  - First room active
  - Invite sent/pending
  - First conversation started
- Shows one “Admin setup later” CTA for advanced governance.

**User impact:** Fast confidence and collaborative momentum.
**Engineering effort:** **M**
**Risk:** Medium
**Owner role:** Onboarding PM + UX + Frontend
**KPI:** Wizard completion >70%; first-thread/call conversion >60%.

## 3.2 Navigation simplification

### Primary nav (all users)
- Home
- Rooms
- DMs
- Activity
- Calls

### Secondary (role-conditioned)
- Admin (only admins/mods)
  - Workspace settings (basic)
  - Member roles (basic)
  - **Advanced (collapsed by default): Governance & Sovereignty**
    - Governance policies
    - Steganographic controls
    - Federation/interop settings
    - Key-management/audit advanced

### Rules
- Advanced items never shown in first-run global nav for non-admin users.
- Deep links allowed for experts but surfaced with context banner.

**User impact:** Cleaner information architecture, less intimidation.
**Engineering effort:** **M**
**Risk:** Low/Medium
**Owner role:** Product Design + RBAC/Permissions team
**KPI:** Settings abandonment -25%; support requests about “where do I start?” -30%.

## 3.3 Progressive disclosure spec

### Day 0 (new workspace)
Show:
- Create/join workspace
- Create room
- Invite members
- Start thread/call
- Basic notifications + profile
- Admin quick settings (name, logo, invite policy presets)

Hide behind expansion:
- Full governance policy editor
- Federation topology controls
- Stego/advanced privacy tuning
- Key lifecycle advanced options

Trigger:
- Time-based + completion-based (after first collaborative event).

### Day 7 (active workspace with baseline usage)
Show nudge cards to admins:
- Role templates and moderation presets
- Governance guardrails lite
- Data retention policy presets
- Lightweight audit digest

Keep advanced expert controls collapsed.

Trigger:
- At least 3 active members OR 20+ messages OR 2+ rooms.

### Day 30 (maturing workspace)
Show to admins:
- Federation and sovereignty center
- Advanced governance workflows
- Stego/privacy deep settings with risk explanation
- Policy simulation and rollout staging

Trigger:
- Retention milestone + admin engagement signal.

**User impact:** Correct capability at correct maturity stage.
**Engineering effort:** **M**
**Risk:** Medium
**Owner role:** Lifecycle PM + Data + Admin UX
**KPI:** Advanced feature adoption among eligible admins +20% with no D1 funnel drop.

## 3.4 Explainability microcopy (plain language)

- **Governance Policies:** “Set clear decision rules so your workspace stays fair and accountable.”
- **Steganographic Controls:** “Add optional hidden-signal protections for high-sensitivity operations.”
- **Federation Settings:** “Choose which external servers your team can connect with, and on what terms.”
- **Sovereignty Mode:** “Keep your team’s data and control aligned with your own infrastructure choices.”
- **Key Management (Advanced):** “Control how encryption keys are rotated, recovered, and audited.”
- **Audit Trails:** “See a tamper-evident history of important admin and governance actions.”
- **Policy Simulation:** “Preview who is affected before turning a rule on for everyone.”
- **Role Escalation Controls:** “Limit sensitive permissions to reduce accidental or risky changes.”
- **Retention Rules:** “Decide how long data is kept to match legal and trust requirements.”
- **Interop/Federation Bridges:** “Connect partner communities while keeping your boundaries explicit.”

**User impact:** Reduces fear and ambiguity around advanced controls.
**Engineering effort:** **S**
**Risk:** Low
**Owner role:** UX Writing + Governance PM
**KPI:** Tooltip/help CTR and reduced advanced-setting confusion tickets.

## 3.5 UX debt list (top 10 complexity pain points)

1. **Too many choices at first launch**
   - Severity: **Critical**
   - Fix: Replace with 4-step guided path + skip-safe defaults.

2. **Advanced governance visible to all roles by default**
   - Severity: **High**
   - Fix: RBAC-based visibility + admin-only expansion.

3. **Room creation asks advanced metadata too early**
   - Severity: **High**
   - Fix: Preset templates first, advanced metadata collapsed.

4. **Invite experience fragmented across surfaces**
   - Severity: **High**
   - Fix: Unified invite flow with consistent order and copy.

5. **First-thread/call action not strongly prompted**
   - Severity: **High**
   - Fix: Post-room creation success CTA to start thread/call.

6. **Security language too technical for non-experts**
   - Severity: **Medium**
   - Fix: Plain-language microcopy with “learn more” depth.

7. **Settings taxonomy too deep and inconsistent**
   - Severity: **Medium**
   - Fix: Flatten IA and group under user/admin/advanced layers.

8. **No maturity-based guidance for admins**
   - Severity: **Medium**
   - Fix: Day 7/30 lifecycle nudges and checklists.

9. **Inconsistent mobile/web onboarding parity**
   - Severity: **Medium**
   - Fix: Shared onboarding contract + cross-surface UX spec.

10. **Insufficient funnel instrumentation**
   - Severity: **Critical**
   - Fix: End-to-end event schema + dashboard and alerts.

**User impact:** Reduces abandonment and improves confidence.
**Engineering effort:** **M**
**Risk:** Medium
**Owner role:** Product Ops + Design + Analytics + Client teams
**KPI:** Drop-off at each onboarding step reduced by 20%+.

---

## 4) Operational packaging changes

1. **Persona-packaged onboarding modes (same primitives, different defaults):**
   - Activist/co-op mode (trust-forward defaults surfaced early for admins).
   - Pragmatic team mode (collaboration-first defaults surfaced first).
   - **No primitive removal; only exposure sequencing changes.**
   - **User impact:** Better fit across segments.
   - **Engineering effort:** **M**
   - **Risk:** Medium
   - **Owner role:** Product Marketing + Product
   - **KPI:** Conversion uplift by segment.

2. **Admin “Trust Setup Later” checklist:**
   - Queued tasks for governance depth after first value achieved.
   - **User impact:** Keeps first run light while preserving integrity path.
   - **Engineering effort:** **S**
   - **Risk:** Low
   - **Owner role:** Admin UX + Governance PM
   - **KPI:** 30-day admin trust checklist completion rate.

3. **Feature-flagged rollouts by cohort:**
   - New orgs first, then selected existing orgs.
   - **User impact:** Safer rollout quality.
   - **Engineering effort:** **S**
   - **Risk:** Low
   - **Owner role:** Release + Analytics
   - **KPI:** Regression incidents per cohort.

---

## 5) Metrics and instrumentation

### Primary success metrics
- Median TTFV (first-run start → first thread/call): **< 10 min**.
- Onboarding completion rate (all four core steps).
- D1 and D7 workspace activation rates.

### Supporting metrics
- Invite send rate and invite acceptance rate.
- First-room creation success rate.
- First-thread/call conversion rate.
- Settings confusion signals (help opens, backtracking, support tickets).
- Admin adoption of Day 7 and Day 30 controls.

### Required event schema (minimum)
- `onboarding_started`
- `workspace_created` / `workspace_joined`
- `room_created`
- `invite_sent`
- `first_thread_started`
- `first_call_started`
- `onboarding_completed`
- `advanced_settings_opened`
- `governance_module_opened` (admin only)
- `federation_settings_opened` (admin only)

### Instrumentation guardrails
- Privacy-preserving analytics defaults.
- Role-aware event collection (admin vs member).
- Sampling strategy for high-volume events.

**User impact:** Transparent, measurable UX improvement without trust regression.
**Engineering effort:** **M**
**Risk:** Medium (instrumentation debt).
**Owner role:** Data Platform + Product Analytics + Privacy Engineering
**KPI:** Dashboard freshness SLA and metric completeness > 98%.

---

## 6) Validation checklist

### Product + UX
- [ ] New users can complete first-run in under 10 minutes without documentation.
- [ ] All trust-critical primitives remain enabled and accessible to authorized admins.
- [ ] Advanced settings are discoverable but not interruptive.
- [ ] Copy is plain-language and comprehension-tested.

### Engineering + Security
- [ ] Feature flags support instant rollback.
- [ ] RBAC gates for advanced settings verified.
- [ ] No regression in encryption/governance integrity checks.
- [ ] Event telemetry validated in staging.

### GTM + Operations
- [ ] Persona packaging aligned to target segments.
- [ ] Support scripts updated for new IA.
- [ ] Admin enablement docs and in-product checklist live.

---

## 7) Execution plan (2-week slices)

### Slice 1 (Weeks 1-2): Align + baseline instrumentation
- Finalize IA decisions and first-run success criteria.
- Add event schema and baseline dashboards.
- Draft microcopy and role-based visibility rules.
- **Owner:** Product + Analytics + Design + Security
- **Risk:** Low
- **Effort:** **S/M**
- **Exit KPI:** Baseline funnel observable end-to-end.

### Slice 2 (Weeks 3-4): Build first-run wizard v1
- Implement 4-step guided flow with defaults.
- Add create/join branching and skip-safe paths.
- Ship behind feature flag for internal cohort.
- **Owner:** Client Platform + Onboarding PM
- **Risk:** Medium
- **Effort:** **M**
- **Exit KPI:** Internal median TTFV < 10 min.

### Slice 3 (Weeks 5-6): Nav simplification + admin expansion
- Deploy simplified nav shell.
- Move governance/stego/federation to admin-only advanced expansion.
- Add contextual explainability microcopy.
- **Owner:** Design Systems + RBAC + Frontend
- **Risk:** Medium
- **Effort:** **M**
- **Exit KPI:** Settings confusion rate reduced in pilot cohort.

### Slice 4 (Weeks 7-8): Pilot rollout + tuning
- Roll out to 10-20% new workspaces.
- Tune step copy, defaults, and invite path based on telemetry.
- Validate no security/governance regressions.
- **Owner:** Release + Product Ops + Security
- **Risk:** Medium
- **Effort:** **S/M**
- **Exit KPI:** Pilot hits TTFV target with no critical regressions.

### Slice 5 (Weeks 9-10): Day 7 disclosure package
- Ship lifecycle nudges and admin checklist for governance lite controls.
- Add retention/moderation presets.
- **Owner:** Lifecycle PM + Admin UX
- **Risk:** Medium
- **Effort:** **M**
- **Exit KPI:** Day 7 admin engagement uplift.

### Slice 6 (Weeks 11-12): Day 30 advanced trust package
- Launch sovereignty/federation center for eligible admins.
- Add policy simulation preview and staged rollout flows.
- **Owner:** Governance PM + Federation Platform + Security
- **Risk:** Medium/High
- **Effort:** **L**
- **Exit KPI:** Advanced control adoption increases without harming retention.
