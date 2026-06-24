# BMC Unified Design & Behavioral Spec — North-Star + Gap Analysis

> **Status:** Living reference. This document is the canonical north-star for the
> FBM × Blackout "solarpunk redesign" *and* a gap analysis against what the
> codebase already ships. It is a design reference, not an implementation order —
> sequencing is "as we go" (see [Sequencing](#sequencing-as-we-go), no calendar dates).
>
> **Anchor system this pass:** System 5 — Cooperative Gamification (deepest section).

---

## TL;DR — the unified loop

FBM (the marketplace) and Blackout (governance + encrypted messaging) are two
surfaces of one cooperative organism. The intended loop:

1. A **behavioral funnel** (System 2) brings a vendor/member in and produces
   their first contributions, each celebrated with **solarpunk motion + a calm
   consonant earcon** (Systems 3 & 4).
2. Every contribution mints **XP on a non-transferable reputation ledger**
   (System 1), opening a hawala-style *delay-tolerant* trust line that settles
   later — rendered as a growing vine / mycelial node in the solarpunk iconography.
3. XP accrual is governed by **White-Hat cooperative gamification** (System 5):
   individual momentum **plus** collective progress, milestone threshold unlocks,
   and **no dark patterns**.
4. XP redeems for **real internal benefits** across both surfaces (commission
   reductions, featured slots, role/channel grants) — never tradable, never a
   speculative token.
5. The whole experience renders in a **warm, biophilic, accessible** skin that
   shifts toward amber calm at night.

Two governing constraints sit above everything:

- **Two ledgers, one profile.** A single reputation/XP overlay (non-monetary,
  non-transferable) is kept strictly separate from the real-money settlement
  ledger (USDC on compliant rails). XP is never converted to crypto and never
  withdrawn.
- **White-Hat / mutual-value posture.** Lead with intrinsic, cooperative drives.
  The project already encodes this as a **design banlist** in code (see
  [System 5](#system-5--cooperative-gamification-anchor)): gamification must be
  *"personal not comparative, non-coercive, identity-forming not status-conferring,"*
  and must *"never trade for governance privileges."*

---

## Gap Analysis Matrix

Legend: ✅ shipped · 🟡 partial · ⬜ missing.

| # | System | Spec intent (one line) | Status | Where it lives | Key remaining gap |
|---|--------|------------------------|--------|----------------|-------------------|
| 1 | XP + hawala settlement | Soulbound, internal-only XP; delay-tolerant credit; demurrage; separate from USDC | 🟡 | `packages/core/src/reputation`, `creator/level.ts`, `governance/index.ts`; FBM ledger events; `PlaybookOnboardingGrant.demurrage` | No single **cross-platform** balance; non-transferability not formalized; demurrage is metadata-only (no decay computed) |
| 2 | Vendor onboarding | B=MAP + endowed-progress, ≤5-step checklist, pre-filled step 1 | 🟡 | `quests/contracts.ts`, `playbook/contracts.ts` | Quest sheet exists but not framed as a progress-bar funnel with a pre-completed first step |
| 3 | Solarpunk visual | Off-black surfaces, biophilic palette/motion, WCAG-AA | ✅ | `packages/design`, `themeCatalog.ts`, `theme-accessibility.ts`, motion tokens | Reconcile spec's proposed hexes with *shipped* themes (treat shipped as source of truth) |
| 4 | Audio-visual tone | Calm consonant earcons, night-amber grading, opt-in 432 Hz/binaural | 🟡 | `features/audio/`, `public/sound/notification.ogg` | No calm-earcon spec; no night color-temperature shift; no opt-in focus audio |
| 5 | **Cooperative gamification** | White-Hat collective mechanics, no dark patterns, milestone→real benefit | 🟡 | reputation/tiers, `party/useParty.ts`, consent voting, treasury snapshots, ambassador tiers, bounties | **Collective progress thermometers; group goals; enforceable guardrails; milestone→entitlement wiring** |
| 6 | Synthesis | One XP balance, shared tokens, one celebration family across both apps | 🟡 | tokens in `packages/design`; per-domain XP exists | The "one XP balance across both surfaces" unifier is not yet realized |

---

## System 5 — Cooperative Gamification (ANCHOR)

### Stance

White-Hat first. Using Yu-kai Chou's Octalysis vocabulary, lead with the
intrinsic/cooperative drives — **CD1 Epic Meaning** ("you're building a
cooperative economy"), **CD2 Accomplishment** (mastery via tiers), **CD3
Empowerment of Creativity** (store/governance tools), **CD5 Social
Influence & Relatedness** (dens, mentorship, parties). The Black-Hat drives
(CD6 Scarcity, CD7 Unpredictability, CD8 Loss & Avoidance) are used only
lightly, transparently, and where the user stays in control.

This is **not aspirational** — it is already the project's enforced posture.
The quest contract (`packages/blackout-protocol/src/quests/contracts.ts`)
states the rule verbatim:

> *"RPG-style onboarding is in scope, bounded by 'personal not comparative,
> non-coercive, identity-forming not status-conferring.' Quests reward
> narrative beats — they never trade for governance privileges."*

And the Party hook (`apps/blackout-client/src/app/features/playbook/party/useParty.ts`)
re-asserts it at the mechanic level:

> *"party formation is identity-forming, not status-conferring — no 'party
> level,' no XP, no leaderboards."*

**Treat this language as the binding design banlist for all of System 5.** New
cooperative mechanics must pass it; this constrains how some spec ideas can land
(see [the Party tension](#the-party-tension) below).

### What's shipped ✅

- **Threshold gating** (Stack-Overflow model): `REPUTATION_THRESHOLDS` (member 0 /
  vendor 100 / coordinator 500 / arbiter 1000) and `tierFromScore()` in
  `packages/core/src/governance/index.ts`.
- **XP / character sheet**: quadratic curve (`cumulativeXpForLevel`, `levelFromXp`),
  creator titles, and a per-subject "skill tree" in `packages/core/src/creator/level.ts`,
  surfaced by `apps/blackout-client/src/app/features/character-sheet/CharacterSheet.tsx`.
- **Per-subject reputation algebra** (`aggregateReputation`) in
  `packages/core/src/reputation/index.ts` — XP is earned per subject, not as one
  global number, which is the anti-karma-farming posture the spec recommends.
- **Habitica-style Party** (`useParty.ts`) — fast cooperative den spin-off from a
  group of ≥3 members.
- **Sociocratic consent voting** (🌱 safe-to-try / 🌾 concern / 🪨 objection) in
  `packages/blackout-protocol/src/governance/contracts.ts` — cooperative decision
  posture over majoritarian voting.
- **Treasury snapshots** (`GovernanceTreasurySnapshotPayload`), **ambassador tiers**
  (seedling→sapling→canopy→elder, `services/growth.ts`), **bounty system**
  (`packages/core/src/bounty/`), and seasonal **phenology phases**
  (`PLAYBOOK_PHASES`: spring…compost).

### What's partial 🟡

- XP accrual is **creator/subject-centric**, not yet a unified balance that sums
  FBM marketplace actions and Blackout governance actions on one profile.
- Quests are **individual narrative beats**; they are not wired to **collective**
  goals.
- Demurrage exists as **metadata only** (`PlaybookOnboardingGrant.demurrage.ratePerYear`)
  — the decay is not computed anywhere yet.

### What's missing ⬜ (the real System-5 work — priorities, not dates)

1. **Community thermometers / shared progress bars.** Collective goals —
   treasury milestones, category "food-forests" (cooperative pooling), governance
   quorums — rendered as *group* progress, not individual rank. This is the
   highest-value missing mechanic and is fully banlist-compatible (shared goal,
   non-status-conferring). Reuse `GovernanceTreasurySnapshotPayload` as the data
   source for treasury thermometers.
2. **Group goals on the Party** (see tension below) — collective objectives a
   party advances together, expressed as *shared goals*, not shared rewards and
   not a party leaderboard (Qiao et al.: showing shared rewards without shared
   goals produces rank-fixation, "no sense of shared goals").
3. **Anti-dark-pattern guardrails as enforceable invariants**, not just prose.
   Codify: no manufactured streak anxiety, no escalating guilt notifications, no
   monetized loss-recovery, no mandatory competitive leaderboards (any ranking is
   opt-in / relative-to-self / secondary). Borrow Duolingo's *good* lesson —
   leniency/forgiveness (grace periods, no-penalty pause) — not its punishment
   loop. These should be assertable next to the quest/party banlist language so
   the constraint travels with the code.
4. **Milestone-unlock → real benefit wiring.** Connect reputation thresholds to
   FBM **entitlements** so tier-ups grant *real* economic benefits rather than
   vanity badges. The rails already exist: `EntitlementKind` includes
   `role_grant`, `channel_access`, `subscription_tier`, `community_template`,
   `sound_pack`, `profile_cosmetic` (`packages/core/src/marketplace/schema.ts`),
   and lifecycle events include `quest.reward_settled` / `bounty.reward_settled`.
   This is the antidote to "engagement without value."

### The Party tension

The spec proposes Habitica-style **group boss-quests** (collective "boss HP"
reduced by members' verified contributions). The Party hook **explicitly forbids
party level / XP / leaderboards.** Resolution:

- ✅ **Compatible:** a shared *goal* thermometer the party fills together
  (e.g., "fund the commons treasury to X", "reach quorum") — this is a shared
  goal, surfaces collective progress, and confers no individual status.
- ⚠️ **Needs care:** "boss HP per member contribution" can read as a per-member
  scoreboard. To stay inside the banlist, render only **aggregate** progress and
  **never** a per-member contribution ranking. Frame it as *shared goal*, not
  *shared reward*.
- ❌ **Banlisted:** party levels, party XP, party leaderboards.

When designing collective mechanics, default to **shared-goal salience** and run
each against the banlist before building.

---

## Systems 1–4 & 6 — narrative + gaps

### System 1 — XP + hawala settlement

**Principles.** XP is **soulbound** (non-transferable; EIP-5192/4973 pattern in
spirit — remove transferability precisely because it would destroy the signal),
**internal-redemption only** (no fiat/crypto off-ramp, no secondary market), and
sits on a **reputation ledger strictly separate from the settlement ledger**.
Hawala contributes the *design metaphor only*: delay-tolerant bilateral credit
("trust lines" à la Stellar/Ripple credit networks) where a contribution's value
settles later. **Spend-vs-status duality** (Stack Overflow): a spendable allowance
for consumables (featured slots) coexists with a non-consumable lifetime status
that gates tiers. **Demurrage** on the *spendable* balance keeps XP circulating;
lifetime status XP never decays.

**Gaps.** (a) Formalize non-transferability as an invariant. (b) Compute demurrage
(today `PlaybookOnboardingGrant.demurrage` is metadata only). (c) Build the unified
cross-platform balance (shared with System 6).

**Caveat (load-bearing).** Hawala carries real AML/regulatory baggage and is
illegal/regulated in several jurisdictions. Borrow only its *trust + delay-tolerant
settlement model*. Real money must move on compliant USDC rails with proper KYC/AML —
do **not** replicate hawala's anonymity/unregulated aspects.

### System 2 — Vendor onboarding

**Principles.** Fogg's **B=MAP** — behavior needs Motivation, Ability, and a Prompt
to converge; it's easier to raise Ability (cut friction) than Motivation, so strip
each step to its minimum. **Endowed-progress / Zeigarnik** — pre-fill "Account
created ✓" as a completed first step (Nunes & Drèze 2006: 34% vs 19% completion).
**≤5–6 step checklist** (Shopify caps at 5; Etsy ~6), progress bar visible, raw
step-count hidden, skips allowed but de-emphasized. Celebrate each completed step
(variable-ratio reinforcement used **only** on positive milestones — never
manufactured scarcity/loss).

**Gaps.** The quest sheet (`quests/contracts.ts`, 4 quests) and playbook setup
exist but are not yet framed as a single funnel with a **pre-completed first step**
and a hide-the-count progress bar. The "first product" endowment moment and the
"first payment = Reward of the Hunt" celebration are not explicitly designed.

### System 3 — Solarpunk visual system

**Principles.** Off-black surfaces (`#121212`, **never** `#000000`), off-white text
(avoid pure `#FFFFFF` — halation), bioluminescent teal / forest green / amber-gold
accents, earth neutrals; biophilic organic motion ("breathing", vines, blooms);
respect `prefers-reduced-motion`; WCAG AA enforced (4.5:1 text / 3:1 large + UI),
tested per-color on its actual surface. Avoid cyberpunk neon and sterile fintech grey.

**Status: mostly shipped ✅.** `packages/design`, the 5-theme catalog
(`dark_canopy`, `light_grove`, `amoled_night`, `storybook_meadow`,
`adventure_spectrum`), and WCAG validation in `theme-accessibility.ts` already
exist. **Gap:** reconcile the spec's *proposed* hexes with the shipped palette —
**treat the shipped themes as the source of truth** and validate any new tokens
through `theme-accessibility.ts`. Note: `amoled_night` uses pure `#000000` by
design (AMOLED power saving), which is an intentional exception to the
"never `#000000`" rule for that one theme.

### System 4 — Audio-visual tone

**Principles (Calm Technology).** Cluster non-urgent notifications; reserve sound
for events that need attention (a single notification distracts as much as a phone
call and degrades performance even when ignored — Stothart et al. 2015). **Calm
earcon spec:** consonant simple-ratio intervals (octave 2:1, perfect fifth 3:2,
major third 5:4); fundamentals ~500–1000 Hz so harmonics reach the ear's sensitive
2–4 kHz band without sitting in the alarm-salient zone; soft attack (≥20 ms), gentle
release, low spectral centroid, wooden/marimba-like timbre. Urgency tiers invert
Edworthy's parameters (calm = low/slow/harmonic/soft; urgent = higher/faster/inharmonic,
used rarely, ≤6 distinct urgent earcons). **Night mode** shifts the whole UI toward
amber / low-saturation warm grading (~2700K perceptual), since warm/amber light
barely suppresses melatonin while blue strongly does.

**Gaps.** The sound-pack system (`features/audio/`, `notification.ogg`) has no
calm-earcon spec, no urgency tiering, and no night color-temperature shift; opt-in
focus audio is absent.

**Caveat (load-bearing).** 432 Hz tuning and binaural beats are **evidence-modest,
not evidence-strong** (small/mixed studies; some null results). Ship them only as
**optional, honestly-described** enhancements (e.g., a headphones-only "focus
mode") — **never** as marketed health/medical claims. The "432 Hz = frequency of
the universe / Nazi-440" backstory is debunked; do not repeat it.

### System 6 — Synthesis

**Principle.** Shared design tokens unify the two apps: one XP balance, one
color/typography/motion system, one earcon family, one set of celebration moments,
one threshold-gating logic. FBM and Blackout become two surfaces of one organism.

**Gap.** Tokens are shared (`packages/design`), but the **single XP balance across
both surfaces** is the central unifier not yet realized (depends on System 1's
unified ledger). The celebration family (motion + earcon per success) is not yet a
single reusable primitive.

---

## Caveats (carry these into every implementation pass)

- **Hawala** is design inspiration only; real money stays on compliant USDC rails
  with KYC/AML. Do not replicate its anonymity/unregulated nature.
- **432 Hz / binaural beats** are evidence-modest; optional and never medical claims.
- **Palette hexes** in the original brief are partly AI-generated/community palettes;
  the **shipped themes** are the source of truth and any change needs a designer +
  full WCAG audit (WebAIM found 83.9% of sites fail contrast).
- **Gamification is dual-use.** The same mechanics that build a healthy cooperative
  can manipulate. The White-Hat / mutual-value / SDT framing and the in-code design
  banlist are a deliberate ethical constraint, not decoration.
- **Octalysis impact statistics** are vendor-reported; the framework is sound, the
  numbers are promotional.

---

## Sequencing ("as we go")

No calendar dates — an ordered priority list, anchored on System 5 first per the
current focus. Reassess after each step.

1. **System 5 collective mechanics + guardrails** — community/treasury thermometers
   (reuse `GovernanceTreasurySnapshotPayload`), shared-goal Party objectives, and
   the anti-dark-pattern invariants codified next to the existing quest/party banlist.
2. **Milestone → entitlement wiring** — connect `REPUTATION_THRESHOLDS` tier-ups to
   `EntitlementKind` grants (real benefits, not badges).
3. **Unified XP balance** (Systems 1 & 6) — one cross-platform reputation balance;
   formalize non-transferability; compute demurrage on the spendable portion.
4. **Onboarding funnel polish** (System 2) — pre-completed first step + hide-the-count
   progress bar over the existing quest/playbook flow.
5. **Audio + night mode** (System 4) — calm earcon family, urgency tiers, amber
   night grading, optional focus audio.
6. **Visual-token reconciliation** (System 3) — fold any new tokens into the shipped
   themes, validated through `theme-accessibility.ts`.

---

## Key code references

| Area | Path |
|------|------|
| Reputation algebra | `packages/core/src/reputation/index.ts` |
| Tiers / thresholds / tally | `packages/core/src/governance/index.ts` |
| XP curve / character sheet model | `packages/core/src/creator/level.ts` |
| Character sheet UI | `apps/blackout-client/src/app/features/character-sheet/CharacterSheet.tsx` |
| Quests (onboarding + banlist) | `packages/blackout-protocol/src/quests/contracts.ts` |
| Den playbooks / demurrage grant | `packages/blackout-protocol/src/playbook/contracts.ts` |
| Party (banlist at mechanic level) | `apps/blackout-client/src/app/features/playbook/party/useParty.ts` |
| Consent voting / treasury snapshot | `packages/blackout-protocol/src/governance/contracts.ts` |
| FBM ledger events | `packages/blackout-protocol/src/marketplace/events.ts` |
| Entitlement kinds / lifecycle | `packages/core/src/marketplace/schema.ts` |
| Growth ledgers (referral/ambassador/bounty) | `packages/api/src/services/growth.ts` |
| Design tokens | `packages/design/src/index.ts` |
| Theme catalog (5 themes) | `apps/blackout-client/src/app/plugins/theme/themeCatalog.ts` |
| WCAG contrast validation | `apps/blackout-client/src/app/styles/theme-accessibility.ts` |
| Audio sound packs | `apps/blackout-client/src/app/features/audio/` |
