# Blackout Blueprint: Simple Core + Optional Power

## Goal
Deliver a **Discord-familiar default experience** while preserving Blackout differentiation via optional governance and sovereignty depth.

Design rules:
- **Simple Core by default** (mainstream-first UX)
- **Optional Power by role/tier** (admin-discoverable controls)
- **Reversible rollout** (flags, cohorts, rollback)
- **No compromise on security/governance integrity**

---

## A) Default Chat Mode (mainstream familiar)

**Audience:** new workspaces, non-technical teams, invited members.

**Visibility rule:** always visible to all users in all tiers.

| Feature | Keep/Hide/Defer | Why (user value + strategic fit) | KPI affected | Failure mode | Rollback trigger |
|---|---|---|---|---|---|
| Server/Workspace + channel list with unread badges | **Keep** | Matches Discord mental model; immediate orientation | D1 activation, first-session retention | Navigation confusion on multi-space accounts | p75 time-to-first-message worsens >10% vs baseline |
| Text channels + threaded replies | **Keep** | Core team collaboration behavior; low cognitive load | Messages/user/day, thread adoption | Thread misuse causing fragmented chats | Thread usage <10% and confusion tickets >2% of WAU |
| Voice rooms + push-to-talk | **Keep** | Real-time coordination expected by mainstream users | Voice DAU, session length | Permission friction, echo/audio support load | Voice join failures >3% sessions |
| Reactions, mentions, emoji picker, typing indicators | **Keep** | Familiar social affordances improve engagement | 7-day retention, messages sent | Noise/notification fatigue | Notification mute rate spikes >20% |
| One-click invite link + QR invite | **Keep** | Low-friction growth loop for pragmatic teams | Invite conversion, member growth | Unauthorized joins due to over-open links | Abuse/spam incident rate > baseline +25% |
| Basic role presets (Owner/Admin/Member/Guest) | **Keep** | Keeps permissions understandable while safe by default | Admin setup time, permission incidents | Misfit for special org structures | Permission rollback actions >15% admins/week |
| Safety baseline preset (anti-spam + reporting) | **Keep** | Trust signal without forcing governance complexity | Moderation incident rate | False positives frustrate users | Report false-positive ratio >8% |
| DM + group DM | **Keep** | Expected chat capability; essential for parity | DMs/day, retention | Harassment risk in open communities | Abuse report rate in DM > threshold |
| Granular custom role matrix editor | **Hide** (advanced) | Powerful but high cognitive load for onboarding | Onboarding completion | Admins cannot find needed control | >10% admins open help for permissions in week 1 |
| Federation routing / peering setup | **Defer** from onboarding | Strategic differentiator but not first-session value | Setup completion, support volume | Early confusion and drop-off | Setup abandonment >5pp in onboarding experiments |

---

## B) Advanced Modes

## B1) Governance Pack

**Audience:** moderators, compliance-sensitive communities, cooperatives.

**Visibility rule:** hidden by default; discoverable if user is **Workspace Admin+** and workspace tier includes Governance Pack.

| Feature | Keep/Hide/Defer | Why (user value + strategic fit) | KPI affected | Failure mode | Rollback trigger |
|---|---|---|---|---|---|
| Policy templates (community, co-op, newsroom, nonprofit) | **Keep** | Progressive disclosure path from default to structured governance | Template adoption, policy misconfig rate | Template mismatch causes policy edits churn | Template churn >30% within 7 days |
| Proposal + approval workflow for policy changes | **Keep** | Governance trust and accountability moat | Policy rollback rate, admin confidence score | Slow operations due to over-approval | Median policy change lead time >2x baseline |
| Audit log with human-readable explanations | **Keep** | Transparency without requiring protocol expertise | Audit views/admin, trust score | Log noise/verbosity | Audit log bounce rate >60% |
| Delegated moderation scopes | **Keep** | Scale moderation without full admin rights | Incident response SLA | Scope confusion creates gaps | Incident SLA misses +20% |
| Advanced vote configuration (quorum, veto classes) | **Hide** (deep advanced) | Powerful, but should not appear before baseline adoption | Governance completion | Setup paralysis in new orgs | Onboarding completion drops >3pp in exposed cohort |
| On-chain/cryptographic attestation options | **Defer** (later beta) | Strong differentiator but niche early demand | Enterprise conversion, advanced adoption | Support burden + trust confusion | Support tickets tagged “attestation” > threshold with low adoption |

## B2) Sovereignty Pack

**Audience:** self-hosters, regulated teams, infrastructure-capable orgs.

**Visibility rule:** hidden by default; discoverable if user is **Org Owner/SysAdmin** and workspace tier includes Sovereignty Pack.

| Feature | Keep/Hide/Defer | Why (user value + strategic fit) | KPI affected | Failure mode | Rollback trigger |
|---|---|---|---|---|---|
| Deployment profiles (Hosted / Self-hosted / Hybrid) | **Keep** | Clear sovereignty choice without technical overload | Deployment conversion, setup success | Wrong profile choice at setup | Setup failure >5% by selected profile |
| Data residency selector + retention presets | **Keep** | Practical compliance value for pragmatic teams | Enterprise win rate, admin completion | Misunderstood legal semantics | Residency-related support escalations >10/week |
| Key management mode (managed vs customer-managed) | **Keep** | Critical trust differentiator with staged complexity | KMS adoption, security posture score | Misconfiguration risk for CMK | Encryption/key errors >1% active workspaces |
| Federation peering wizard | **Hide** (advanced setup) | Important sovereignty feature but not day-0 essential | Federation setup success | Failed peering harms trust | Federation failure >15% attempts |
| Multi-region failover orchestration UI | **Defer** | Valuable for mature teams; high complexity upfront | Uptime SLA adherence | Misconfigured failover events | Failover test success <95% in pilot cohort |
| Custom protocol bridge matrix | **Defer** | High strategic optionality, low initial onboarding value | Integration adoption | Reliability issues affect perceived quality | Bridge incident rate > baseline +20% |

---

## C) Feature-flag map and visibility rules

## Flag taxonomy

- `core.default_chat_mode` (global, ON by default)
- `adv.governance_pack.enabled`
- `adv.sovereignty_pack.enabled`
- `adv.governance.deep_vote_config`
- `adv.sovereignty.peering_wizard`
- `adv.sovereignty.failover_ui`
- `adv.protocol.bridge_matrix`

## Visibility policy

1. **Hidden by default:** all `adv.*` flags are OFF for new workspaces.
2. **Discoverability gates:** show “Unlock advanced controls” entry if:
   - user role is Admin+ for Governance Pack; Owner/SysAdmin for Sovereignty Pack, and
   - workspace tier entitles the pack.
3. **Contextual reveal:** first reveal is read-only preview + impact note + recommended template.
4. **Safety lock:** deep-advanced controls require explicit “I understand impact” confirmation.
5. **Auditability:** every advanced toggle writes actor, timestamp, workspace, previous/new value.

## Flag operations

- Owner per flag: PM + Engineering manager.
- Required metadata: hypothesis, KPI target, rollback threshold, expiry date.
- Rollout order: internal dogfood -> design partners -> 10% eligible admins -> 50% -> GA.

---

## D) Kill/Defer list for initial onboarding (high-complexity surfaces)

These surfaces are removed from initial onboarding and moved to post-activation setup:

| Surface | Decision | Why | KPI protected | Failure mode if shown too early | Rollback trigger |
|---|---|---|---|---|---|
| Full permission matrix editor | **Defer** | Too many decisions before first value | Onboarding completion | Choice paralysis | Completion drops >3pp |
| Federation topology configuration | **Defer** | Infrastructure-heavy, low day-0 need | Time-to-first-message | Early abandonment | p50 setup time >10 min |
| Custom governance constitution builder | **Defer** | High conceptual load for mainstream teams | Activation rate | Users skip setup entirely | Setup abandonment > baseline +15% |
| Multi-region + failover topology UI | **Defer** | Requires SRE maturity not present at onboarding | Successful setup rate | Misconfiguration incidents | Pilot failover success <95% |
| Advanced cryptographic attestation panel | **Hide** then staged beta | Niche high-value feature; poor first-run fit | Support burden, trust score | Misinterpretation of trust semantics | Ticket volume spikes with low adoption |

---

## E) Migration-safe rollout plan

## Phase 0 (Weeks 1-2): Guardrails + baseline

- Keep existing users on current experience by default.
- Introduce flags and entitlement plumbing.
- Launch Default Chat Mode for **new workspaces only**.
- Baseline metrics captured for control cohort.

## Phase 1 (Weeks 3-4): Opt-in migration

- Existing workspace admins get in-product “Try Simple Core” prompt.
- One-click rollback for 30 days.
- Auto-generated diff preview: what changes in nav/settings visibility.

## Phase 2 (Weeks 5-8): Assisted migration

- Target cohorts: low-governance-complexity teams first.
- CS playbook for migration support.
- Weekly review of activation, support tickets, and policy incidents.

## Phase 3 (Weeks 9-12): Scale + stabilize

- Promote to default for eligible existing workspaces with strong metrics.
- Keep advanced packs hidden unless entitlement + role rules satisfied.
- Decommission unused flags and keep high-risk controls gated.

## Migration safety controls

- Snapshot config before migration; restore in one click.
- Immutable audit event for each migration/rollback.
- Rollback trigger (global): if any guardrail metric degrades >10% for 2 consecutive weeks.

---

## Success scorecard (must pass)

- Onboarding completion +15%.
- p50 time-to-first-message < 6 minutes.
- No increase in moderation/security incident rate.
- Advanced feature adoption concentrated in admin cohorts (not accidental exposure).
- Support tickets per 1k WAU flat or improved during rollout.
