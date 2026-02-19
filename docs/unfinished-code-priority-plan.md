# Unfinished Code Priority Plan

This plan prioritizes unresolved TODO/FIXME markers from `docs/unfinished-code-checklist.md` by user risk, production impact, and implementation leverage.

## Inputs

- Completion tracker baseline: `docs/blackout-reuse-completion-tracker.md` (all major reuse-strategy epics complete; current phase is maintenance).
- Open marker inventory: `docs/unfinished-code-checklist.md` (repository-wide TODO/FIXME/TBD backlog).

## Prioritization model

- **P0 (stability/security correctness):** can cause broken UX, data correctness issues, or policy/security regressions.
- **P1 (product/operational impact):** missing behavior that degrades key workflows, scalability, or operability.
- **P2 (maintainability/debt):** naming/cleanup/ergonomics/documentation improvements.

## Recommended execution order

### P0 — do first

1. **Notifier call lookup correctness**
   - `src/Notifier.ts` L491: TODO to use `call_id` for correct call targeting instead of single-call-per-room assumption.
   - Why first: incorrect call lookup can misroute call notifications/actions.

2. **MatrixChat error-state handling**
   - `src/components/structures/MatrixChat.tsx` L318: TODO to render explicit error screen instead of spinner-only fallback.
   - Why first: failure masking blocks user recovery and support diagnosis.

3. **TimelinePanel event scope guard**
   - `src/components/structures/TimelinePanel.tsx` L893: TODO to restrict behavior to events in local timeline.
   - Why first: cross-timeline behavior risks acting on unintended events.

4. **Room/event ID encoding handling**
   - `src/components/structures/MatrixChat.tsx` L1937: TODO to handle encoded room/event IDs.
   - Why first: malformed or encoded links can break navigation/open flows.

5. **Legacy call-hangup messaging logic**
   - `src/LegacyCallHandler.tsx` L586: TODO around call end-reason copy/semantics.
   - Why first: user-facing call-end states are high-visibility and support-sensitive.

6. **Auth flow register-button correctness**
   - `src/components/structures/auth/Login.tsx` L290: TODO to check server registration support before showing register action.
   - Why first: exposing unavailable auth actions causes dead-end onboarding.

### P1 — next wave

7. **Per-room hide controls in MessagePanel**
   - `src/components/structures/MessagePanel.tsx` L468: TODO for granular hide options.

8. **ScrollPanel search optimization**
   - `src/components/structures/ScrollPanel.tsx` L648: TODO for binary search over sorted offsets.

9. **Keyboard shortcut handling gaps**
   - `src/accessibility/KeyboardShortcuts.ts` L160, L165, L325: TODOs about unmanaged shortcuts/settings migration.

10. **Widget event support expansion**
    - `src/ScalarMessaging.ts` L192, L211 and `src/TextForEvent.tsx` L917: TODO to support `m.widget` events.

11. **Import E2E keys feedback UX**
    - `src/async-components/views/dialogs/security/ImportE2eKeysDialog.tsx` L110: TODO for import-result feedback.

12. **MatrixChat state consistency note**
    - `src/components/structures/MatrixChat.tsx` L183: TODO about non-instant React state updates under bursts.

13. **Notifier alternative branding path**
    - `src/Notifier.ts` L273: TODO for branding-aware messaging.

14. **Legacy call event grouping heuristic**
    - `src/components/structures/LegacyCallEventGrouper.ts` L95 and `src/TextForEvent.tsx` L64: FIXME for better event-derived grouping logic.

15. **SpaceHierarchy reset TODO**
    - `src/components/structures/SpaceHierarchy.tsx` L622: inline TODO on room reset semantics.

### P2 — maintenance backlog

16. **Scalar naming generification**
    - `src/ScalarAuthClient.ts` L22 and `src/ScalarMessaging.ts` L10, L868: TODOs to remove Scalar-specific naming/API assumptions.

17. **Registration issue tracker follow-up**
    - `src/Registration.tsx` L25: TODO linked to historical matrix-doc issue.

18. **Captcha mobile_register retirement cleanup**
    - `src/components/views/auth/CaptchaForm.tsx` L68: TODO remove temporary compatibility path.

19. **ViewSource modal header refresh**
    - `src/components/structures/ViewSource.tsx` L44: TODO for event header wording refresh.

20. **Send history performance investigation**
    - `src/SendHistoryManager.ts` L30: TODO asking about potential performance issues.

## Mapping to completion-tracker maintenance themes

The completion tracker indicates major Blackout reuse epics are complete and now in maintenance mode. This priority list aligns with that phase by focusing first on:

- correctness/safety regressions in high-traffic flows (calls, timeline, auth),
- operational resilience (explicit error states, deterministic event handling),
- then incremental product polish and debt retirement.

## Suggested delivery cadence

- **Sprint A (P0):** items 1–6, plus regression tests for call lookup, encoded-ID navigation, and login/register gating.
- **Sprint B (P1):** items 7–15, with perf checks for scroll/search and keyboard shortcut handling tests.
- **Sprint C (P2):** items 16–20 during maintenance windows or adjacent feature work.
