# Wireflow: Default Chat Onboarding + Advanced Feature Discovery

## Objective
Provide a concrete wireflow for simple-by-default onboarding and staged advanced-feature discovery, with plain-language copy and anti-confusion heuristics.

---

## A) Default chat onboarding wireflow (Day 0)

## Flow map (happy path)

```text
[Landing]
  ├─ CTA: Create workspace
  └─ CTA: Join with invite
        ↓
[Workspace setup (minimal)]
  - name + optional avatar
        ↓
[Create first room]
  - presets: Team Chat / Project / Announcements
  - optional: Customize (collapsed)
        ↓
[Invite members]
  - copy link / email / directory
  - skip with reminder allowed
        ↓
[First value action]
  - start thread OR start call
        ↓
[Success state]
  - "You're live" + next best action
  - admin-only: "Set up governance later"
```

## Screen-by-screen copy (plain language)

### 1) Landing
- **Header:** “Get your team talking in minutes.”
- **Primary CTA:** “Create workspace”
- **Secondary CTA:** “Join with invite”
- **Helper text:** “You can change settings later.”

### 2) Workspace setup
- **Header:** “Name your workspace”
- **Helper text:** “This is what your team will see.”
- **Inline reassurance:** “You can rename anytime.”

### 3) Create first room
- **Header:** “Create your first room”
- **Preset labels:** “Team Chat”, “Project Room”, “Announcements”
- **Optional toggle:** “Customize (optional)”
- **Helper text:** “Start simple. Add details later.”

### 4) Invite members
- **Header:** “Invite your team”
- **Primary option:** “Copy invite link”
- **Secondary options:** “Invite by email”, “Use directory”
- **Skip text:** “Skip for now”
- **Skip helper:** “We’ll remind you after your first message.”

### 5) First value action
- **Header:** “Kick off your first conversation”
- **Primary CTA:** “Start a thread”
- **Secondary CTA:** “Start a call”
- **Helper text:** “One action here marks your workspace as live.”

### 6) Success state
- **Header:** “You’re live 🎉”
- **Checklist:**
  - Workspace created
  - Room created
  - Invite sent or scheduled
  - First conversation started
- **Admin CTA:** “Set up advanced controls (admins only)”

---

## B) Advanced feature discovery wireflow (Day 7 / Day 30)

## Discovery logic
- **Day 0:** advanced controls hidden from member navigation; admin sees collapsed advanced entry.
- **Day 7:** governance-lite nudges appear for eligible admins.
- **Day 30:** federation/sovereignty deep controls appear for eligible admins.

## Flow map (admin discovery)

```text
[Admin Home / Activity]
   ↓ (eligibility met)
[Nudge card: Improve trust controls]
   ├─ CTA: Review governance basics
   └─ Dismiss
        ↓
[Admin Settings]
   - Basic settings visible
   - Advanced panel collapsed
        ↓ expand
[Advanced: Governance & Sovereignty]
   ├─ Governance policies
   ├─ Attestation workflows
   ├─ Federation settings
   └─ Privacy/key controls
        ↓
[Contextual explainability panel]
   - one-line plain-language purpose
   - risk level + who should change this
        ↓
[Apply staged change]
   - preview impact
   - confirm with audit note
```

## Discovery moment copy (plain language)

### Day-7 governance nudge
- **Title:** “Ready for clearer team decision rules?”
- **Body:** “Set lightweight governance defaults so approvals and responsibilities are easier to manage.”
- **CTA:** “Review governance basics”

### Day-30 sovereignty nudge
- **Title:** “Need stronger control over data and federation?”
- **Body:** “Configure where data lives, how servers connect, and who can change high-risk settings.”
- **CTA:** “Open sovereignty controls”

### Advanced panel intro
- **Title:** “Advanced controls (admins)”
- **Body:** “These settings protect trust and infrastructure. Use defaults unless your team has a specific policy need.”

### Example one-line explainers
- **Governance policies:** “Define how important decisions are proposed, approved, and recorded.”
- **Attestation workflows:** “Require accountable sign-off for sensitive actions.”
- **Federation settings:** “Control which outside servers your workspace can communicate with.”
- **Key/privacy controls:** “Manage encryption custody and privacy posture for high-risk environments.”

---

## C) Anti-confusion heuristics (must-apply UX rules)

1. **One primary action per step**
   - Each onboarding screen has a single strongest CTA; others are secondary.

2. **Optional means truly optional**
   - Advanced options are collapsed and never required for first value.

3. **Progress always visible**
   - Show step indicator (e.g., 2 of 4) and completion checklist.

4. **Reversible choices by default**
   - Add “You can change this later” where choices are non-critical.

5. **Role-aware visibility**
   - Never show non-admin users high-risk admin controls.

6. **Explain before ask**
   - For advanced settings, show a one-line purpose + risk before input fields.

7. **Use plain words, avoid jargon-first labels**
   - Prefer “Decision rules” over “Governance protocol” in entry surfaces.

8. **Prevent dead-end skips**
   - If user skips invite step, queue reminder tied to first-message milestone.

9. **Detect confusion signals early**
   - Trigger inline help after repeated backtracking or prolonged idle at a step.

10. **Protect trust-critical actions with staged confirmation**
   - Preview impact, show affected users, require audit note on high-risk saves.

---

## D) Instrumentation hooks for confusion + discovery

- `onboarding_step_viewed`
- `onboarding_step_completed`
- `onboarding_step_skipped`
- `advanced_panel_opened`
- `advanced_setting_help_opened`
- `nudge_seen_day_7`
- `nudge_clicked_day_7`
- `nudge_seen_day_30`
- `nudge_clicked_day_30`
- `confusion_signal_backtrack`
- `confusion_signal_idle_timeout`

These events should be segmented by role, tier, and client surface for tuning.
