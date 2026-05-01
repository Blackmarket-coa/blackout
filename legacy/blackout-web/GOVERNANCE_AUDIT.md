# Governance UX / Workflow Audit (April 4, 2026)

## Scope
- Governance button entry points.
- Governance room panel behavior.
- Governance features and persistence.
- Governance workflows across chat + right-panel + room views.
- UI accessibility and consistency concerns.

## Executive summary
The governance surface is discoverable and has multiple entry points, but it is currently **prototype-level** in behavior: actions are mostly static or local-only, not permission-aware, and are weakly connected across views. The current implementation is good for demoing intended flows but not yet robust for production governance operations.

---

## 1) Governance button audit

### What is implemented
- Header includes a governance icon button that opens the governance right panel (`data-panel="governance"`).
- Composer has a dedicated governance trigger button and a secondary governance action within the attachment panel.
- Mobile tab bar includes a governance tab.

### Findings
1. **Mixed affordances and route outcomes**
   - Header governance button opens a right-panel overlay, while composer governance opens a proposal-insertion helper; these are conceptually different flows behind similar naming.
2. **No explicit permission gating at button level**
   - Governance actions appear available by default in chat/composer regardless of role.
3. **Mobile governance tab does not open a dedicated governance surface**
   - Selecting mobile governance switches to chat workspace mode, which can be confusing if users expect a governance dashboard.

### Recommendation
- Add explicit capability checks (e.g., `canPropose`, `canVote`) and disable/annotate governance actions when unavailable.
- Align naming and iconography so each governance trigger communicates whether it opens a dashboard, vote panel, or composer helper.
- Map mobile governance tab to a deterministic governance destination (panel or room type filter).

---

## 2) Governance panel audit

### What is implemented
- Room panel supports feed/proposals/taskboard tabs.
- Proposal creation modal is present with title, description, vote type, duration, and quorum fields.
- App-level handlers switch tabs and open/close modal.

### Findings
1. **Panel content is static mock data**
   - Feed, proposals, and taskboard are hard-coded and not connected to store/stateful proposal entities.
2. **Create proposal action lacks submit workflow**
   - “Create proposal” button has no dedicated data-action handler or submit path to persisted governance state.
3. **State reset risk across navigation contexts**
   - Panel state (`activeGovernanceTab`, modal open/close) is local UI state and not tied to channel-specific governance contexts.

### Recommendation
- Introduce proposal domain state (`Proposal[]`) in store and hydrate views from it.
- Add explicit `data-action="governance-create-proposal"` handler with validation + optimistic update.
- Scope tab/modal state by channel id to avoid cross-room bleed.

---

## 3) Governance features audit

### What is implemented
- Governance-related features are represented in preset and entrypoint registries (`features.governance.entitlements`, `features.bmc.governance`).
- Composer supports governance template CRUD with localStorage persistence and JSON import/export.

### Findings
1. **Feature flags exist, but UI pathways are not consistently gated**
   - Governance controls remain broadly exposed independent of feature-flag checks in several surfaces.
2. **Template persistence is local-only**
   - Governance templates are stored in localStorage, so they are not shared across devices/users and are fragile for collaborative governance.
3. **Validation is permissive and silent on import failures**
   - Import errors are swallowed (`catch { return; }`) with no user feedback.

### Recommendation
- Apply feature-flag and permission checks at render + action layers.
- Move governance templates to server-backed or room-state-backed storage.
- Surface actionable import validation errors to users.

---

## 4) Workflow audit

### Current workflow map
- Governance entry can happen via:
  1) room auto-detection by channel name,
  2) chat header governance right panel button,
  3) composer governance popover,
  4) onboarding “Open governance” action.
- Proposal workflow in composer inserts command snippets (`/proposal`, `/vote`) into message text rather than creating first-class proposal entities.

### Findings
1. **Workflow fragmentation**
   - Governance room panel, governance right-panel, and composer governance each represent different levels of abstraction without a clear hierarchy.
2. **Implicit room typing via regex**
   - Governance room detection is name-based (`governance|proposal|council|treasury`) rather than explicit metadata/capability, increasing false positives/negatives.
3. **Telemetry/event model appears incomplete for governance outcomes**
   - Discovery tracking exists, but proposal lifecycle events (drafted, submitted, voted, closed) are not visible in this surface.

### Recommendation
- Define a single “governance object model” and route all governance surfaces to it.
- Replace regex room inference with explicit room capability tags/state events.
- Add proposal lifecycle telemetry for operational visibility.

---

## 5) UI and accessibility audit

### Strengths
- Buttons generally use explicit `type` and `aria-label` in key controls.
- Tabs and modal semantics are partially present (`aria-label`, `role="dialog"`, `aria-modal`).

### Findings
1. **Tab accessibility is incomplete**
   - Governance tab buttons lack full tab semantics (`role="tab"`, `aria-selected`, keyboard roving behavior).
2. **Modal accessibility is partial**
   - Modal uses dialog role but lacks demonstrated focus trap/initial focus/escape handling.
3. **Action-result visibility is weak**
   - Major governance actions (template import/create proposal) have limited explicit success/error feedback in UI.

### Recommendation
- Normalize all governance tabs to WAI-ARIA tab pattern.
- Implement focus management and escape key close behavior for governance modal.
- Add success/error toasts or inline status regions for governance actions.

---

## Priority remediation plan

### P0 (must-do before production governance)
- Wire proposal creation to persisted store/service.
- Enforce role/capability gating for propose/vote actions.
- Remove name-regex governance detection in favor of explicit room capability metadata.

### P1
- Unify governance panel/composer/right-panel around one proposal model.
- Add robust import/export validation UX.
- Improve modal and tabs accessibility semantics + keyboard behavior.

### P2
- Channel-specific remembered tab state.
- Cross-device governance template sync.
- Governance analytics funnel (open panel → draft → submit → vote).
