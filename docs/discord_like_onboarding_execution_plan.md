# Blackout IA + Onboarding Blueprint

## Objective
Reduce **time-to-first-value (TTFV) to under 10 minutes** for first-time users by delivering a Discord-familiar core flow, while preserving governance/privacy sovereignty primitives behind progressive disclosure.

**Constraint:** No trust-critical capability is removed. Exposure is deferred, not eliminated.

---

## 1) First-run flow map (TTFV < 10 min)

### Target outcome by minute 10
A new user has:
1. created or joined a workspace,
2. created (or entered) a room,
3. invited at least one teammate,
4. posted first message and started first thread or call.

### Flow map (single happy path)

| Step | UX action | Time budget | Primary CTA | Secondary CTA | User impact | Effort | Risk | Owner | KPI | Failure mode | Rollback trigger |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| 0 | Entry screen with two choices: **Create workspace** / **Join workspace** | 0:45 | Continue | “Explore sample workspace” | Removes blank-page anxiety | S | Low | Product + Design | Start rate | Too many decisions on first screen | Start-to-step-1 drop > 8% |
| 1A | Create workspace: name + purpose template (Team/Community/Class) | 1:15 | Create | Skip template | Fast setup with defaults | S | Low | Product | Workspace creation completion | Template confusion | Template edit rate > 40% within 24h |
| 1B | Join workspace: magic link / code / QR | 1:00 | Join | Request access | Familiar invite flow | S | Medium (abuse) | Growth + Security | Join completion | Invalid links or abuse joins | Abuse join incidents +25% vs baseline |
| 2 | Auto-create first room from template (General by default) with rename option | 1:00 | Enter room | Rename room | Immediate place to act | S | Low | Product + Eng | Room-ready rate | Users stall naming room | Step abandonment > 10% |
| 3 | Invite members modal (email/link/QR), pre-filled permission preset | 1:30 | Send invite | Skip for now | Growth loop without admin complexity | M | Medium | Growth + Admin UX | Invite sent per new workspace | Over-sharing via open link | Invite abuse rate +20% |
| 4 | Guided composer prompt: “Send your first message” | 0:45 | Send message | Skip tutorial | First value moment achieved fast | S | Low | Design + Eng | TTFM, first-message rate | Composer overwhelm | First-message completion < 75% |
| 5 | Nudge card: “Start thread” OR “Start quick call” | 1:30 | Start thread/call | Dismiss | Demonstrates collaboration depth early | M | Medium | Realtime + PM | Thread-or-call initiation | Call setup failure harms trust | Call join failures > 3% |
| 6 | Completion toast + checklist done + optional “Enable advanced controls” (admin only) | 0:30 | Finish onboarding | Open advanced preview | Ends with confidence and next step | S | Low | Product | Checklist completion, D1 retention | Advanced distracts too early | Advanced-click without activation > 30% |

### First-run variants
- **Create path** (new workspace): includes Step 1A + all other steps.
- **Join path** (invited member): uses Step 1B; skips workspace creation and permission setup.
- **Mobile constraint**: call initiation defaults to “thread first” if permission/device setup would exceed 10 minutes.

---

## 2) Navigation simplification

### IA principles
- Prioritize **Chat, Rooms, People, Activity** in primary nav.
- Collapse all advanced/system configuration into **Admin Console**.
- Keep trust-critical controls active but not prominent to non-admin users.

### Proposed top-level navigation (default)
1. **Home** (recents + mentions)
2. **Rooms** (channels + threads)
3. **Calls**
4. **People**
5. **Inbox/Activity**
6. **Settings** (personal only)

### Admin-only expansion points
Governance, stego/privacy, and federation move under:
- **Admin Console → Governance**
- **Admin Console → Privacy & Stego**
- **Admin Console → Federation & Sovereignty**

These sections are:
- Hidden for non-admin roles.
- Collapsed by default for admins.
- Unlocked by tier entitlement + role.

### Keep/Hide/Defer decisions for nav surfaces

| Surface | Decision | Why (value + strategic fit) | KPI affected | Failure mode | Rollback trigger |
|---|---|---|---|---|---|
| Channel list, DMs, threads, calls | **Keep** | Core familiarity and immediate productivity | TTFM, D1 retention | Users still feel cluttered | Navigation confusion tickets > baseline +15% |
| Policy engine entry in primary nav | **Hide** (admin console) | Preserves trust capability without novice overload | Onboarding completion | Admins cannot find policies | Admin search for “policy” fails > 5% sessions |
| Stego/privacy controls in personal settings | **Hide** (admin console section + contextual prompts) | Prevents early fear/complexity, keeps differentiator | Activation rate | Privacy value feels invisible | Privacy feature discovery < target after Day 7 |
| Federation topology menus in setup wizard | **Defer** from onboarding | Not needed for first value | Setup completion | Self-hosting teams blocked | Self-hosted setup failure > 5% |
| Legacy multi-pane advanced settings | **Defer** from default IA | Reduces cognitive overload | Task completion time | Power users frustrated | Admin task time > baseline +20% |

---

## 3) Progressive disclosure spec (Day 0 / 7 / 30)

### Day 0 (activation window)
**Visible to everyone:**
- Chat basics: rooms, DMs, mentions, threads, calls, invite flow.
- Safety baseline toggle (preconfigured).

**Visible to admins only (collapsed):**
- “Advanced controls available” card (read-only preview only).

**Hidden:**
- quorum/veto governance mechanics,
- stego tuning parameters,
- federation peering topology,
- custom protocol bridge matrix.

### Day 7 (stability + team formation)
**Trigger:** workspace has ≥3 active members OR ≥20 messages.

**Reveal to admins:**
- Governance Pack quick-start templates.
- Privacy & retention presets.
- Basic federation readiness check (not full peering editor).

**Reveal to members:**
- Lightweight explainers (“why this workspace uses X”).

### Day 30 (maturity + optional power)
**Trigger:** sustained activity + admin intent signal (opened admin console twice or explicit enable).

**Reveal to entitled admins/owners:**
- Advanced governance parameters (quorum, delegation depth).
- Sovereignty controls (peering wizard, key management variants).
- High-complexity operations surfaces (failover, bridges) as staged beta.

### Disclosure guardrails
- Every advanced reveal includes: impact summary, recommended default, and rollback note.
- No feature is deleted; only gated by role, tier, and maturity signals.

---

## 4) Explainability microcopy (one-line plain language)

| Advanced capability | One-line microcopy |
|---|---|
| Policy templates | “Start with a proven governance setup, then customize only what you need.” |
| Proposal + approval workflow | “Major rule changes can require team approval before they go live.” |
| Audit log | “See who changed what, when, and why in plain language.” |
| Delegated moderation scopes | “Give moderators limited powers without full admin access.” |
| Quorum/veto settings | “Set how many approvals are needed for sensitive decisions.” |
| Cryptographic attestations | “Publish tamper-evident proof that policies and events are authentic.” |
| Data residency controls | “Choose where workspace data is stored to meet compliance needs.” |
| Key management mode (CMK) | “Use your own encryption keys for tighter security control.” |
| Federation peering | “Connect securely with external or self-hosted networks on your terms.” |
| Stego/privacy advanced options | “Add privacy layers for sensitive coordination when risk is high.” |
| Failover orchestration | “Predefine recovery steps so service stays available during outages.” |
| Protocol bridges | “Link Blackout rooms with other chat systems while keeping governance boundaries.” |

---

## 5) UX debt list (top 10 complexity pain points)

| # | Pain point | Severity | Fix strategy | KPI affected | Owner | Effort | Risk | Failure mode | Rollback trigger |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | Too many setup decisions before first message | Critical | Replace with guided wizard + defaults | Onboarding completion, TTFM | Product + Design | M | Low | Users abandon at setup | Completion drops >3pp |
| 2 | Advanced and basic settings mixed together | High | Split personal settings vs admin console | Settings success rate | Design + Frontend | M | Low | Users can’t locate controls | “Can’t find setting” tickets +20% |
| 3 | Permission model terminology is jargon-heavy | High | Plain-language role presets + glossary tooltips | Admin task time | PM + UX Writing | S | Low | Misconfigured permissions | Permission rollback actions >15% admins/week |
| 4 | Federation appears too early for non-technical users | High | Hide until Day 30/admin intent | Activation rate | Platform PM | S | Low | Perceived product complexity | Setup abandonment +10% |
| 5 | Privacy/stego controls lack contextual explanation | High | Inline one-line explainers + “when to use” hints | Feature adoption quality | UX Writing + Security PM | S | Medium | Either fear or misuse | Privacy control disable rate > target |
| 6 | No clear progress indicator in onboarding | Medium | 4-step checklist with completion state | Flow completion | Frontend | S | Low | Users feel lost | Step-back navigation events +25% |
| 7 | Invite flow mixes growth and security choices | Medium | Separate quick invite vs secure invite advanced | Invite conversion + abuse rate | Growth + Security | M | Medium | Abuse incidents or invite drop | Abuse > threshold OR conversion -10% |
| 8 | Thread vs channel model unclear to new teams | Medium | First-use thread coachmark + examples | Thread adoption | Design | S | Low | Thread misuse/clutter | Thread abandonment > baseline +15% |
| 9 | Call start fails due to device/permission friction | Medium | Preflight checks + fallback to thread prompt | Call start success | Realtime Eng | M | Medium | Failed first collaboration moment | Call failure >3% |
| 10 | Admin value of advanced packs is hard to discover | Medium | Day 7/30 lifecycle nudges with read-only previews | Admin activation of packs | PMM + Product | S | Low | Power features underused | Eligible admin discovery <40% by Day 30 |

---

## Rollout sequence (migration-safe)

1. **Flag foundation (Week 1-2):** ship IA gates and role/tier visibility controls behind flags.
2. **New workspace default (Week 3-4):** new IA + onboarding only for newly created workspaces.
3. **Opt-in existing workspaces (Week 5-6):** admin prompt with one-click revert.
4. **Cohort expansion (Week 7-10):** expand by low-risk cohorts and monitor guardrails weekly.
5. **General availability (post-threshold):** promote after two consecutive weeks meeting KPI guardrails.

### Global rollback conditions
- TTFM median exceeds 10 minutes for two consecutive weekly cohorts.
- Onboarding completion drops by >3 percentage points vs control.
- Security/moderation incident rate rises above pre-rollout baseline.

### Non-negotiables preserved
- Audit logging, policy integrity, key management paths, and federation capabilities remain available to entitled admins throughout rollout.
- Deferred UI exposure does not remove backend/state compatibility.
