# Blackout Remaining Work — AI Prompt Pack

This document provides copy/paste AI prompts for all currently tracked **remaining work** in this repository.

## Source trackers used

- `docs/unfinished-code-checklist.md` (open marker inventory: 89).
- `docs/unfinished-code-priority-plan.md` (P0/P1 ranked queue).
- `docs/blackout-governance-completion-tracker.md` (maintenance exceptions).
- `docs/blackout-reuse-completion-tracker.md` (maintenance exceptions).
- `docs/blackout_centralized_release_readiness_gate.md` (release residual risks).

## Prompt usage contract

For each prompt below, require the agent to:

1. Implement code/docs changes (no placeholder text).
2. Add or update automated tests.
3. Run validation commands and include exact output summaries.
4. Update related tracker rows/counts and evidence links.
5. Record owner/date/risks/next-review metadata in docs.

---

## Prompt 1 — Unfinished-marker priority plan reconciliation (meta-fix)

```text
Reconcile `docs/unfinished-code-priority-plan.md` with `docs/unfinished-code-checklist.md` and latest evidence files.

Tasks:
- Align status for each top-10 `blackout#uc-*` item with checklist reality.
- Replace stale references to old evidence artifacts with current artifact links.
- Regenerate delivery cadence so only unresolved items remain in future sprints.
- Add a verification block with date/verifier/commands.

Done when:
- No top-10 item has contradictory state across priority plan and checklist.
- Evidence links all resolve to current docs.
- Remaining-item list is accurate and ordered P0 -> P1 -> P2.
```

## Prompt 2 — uc-006 follow-up validation (completed)

```text
Validate completed `blackout#uc-006` implementation from `src/components/structures/MessagePanel.tsx` and keep only post-merge hardening tasks.

Tasks:
- Re-run regression coverage for room-scoped hide settings (room A/B isolation + persistence).
- Add a UI entry point for toggling the room-scoped preference if product scope requires user-facing controls.
- Verify the global `showHiddenEventsInTimeline` behavior remains unchanged when no room override exists.
- Keep checklist/priority plan/evidence docs synchronized for future closures.

Done when:
- Existing uc-006 closure remains stable under regression tests.
- Optional UX follow-up is either implemented or explicitly deferred with owner/date.
- Tracker counts remain synchronized.
```

## Prompt 3 — uc-008 follow-up validation (completed)

```text
Validate completed `blackout#uc-008` keyboard-shortcut hardening and maintain follow-up coverage.

Tasks:
- Re-run regression tests for malformed shortcuts, unsupported platform override contexts, and collision handling.
- Validate deterministic UI/runtime parity when shortcut definitions collide.
- Add any additional accessibility edge-case tests found in triage.
- Keep docs/trackers/evidence synchronized with latest command outputs.

Done when:
- uc-008 closure remains stable under regression coverage.
- Collision and unsupported-context fallback behavior remains deterministic.
- Tracker metadata remains synchronized.
```

## Prompt 4 — uc-010 follow-up validation (completed)

```text
Validate completed `blackout#uc-010` burst-action state consistency hardening and keep negative-path coverage healthy.

Tasks:
- Re-run burst navigation ordering tests to confirm stale transitions are ignored.
- Re-run malformed/partial send-event payload tests and send-failure handling coverage.
- Add any additional race-regression tests discovered during triage.
- Keep evidence and tracker counts synchronized.

Done when:
- uc-010 closure remains stable under regression and negative-path coverage.
- No regression is observed in baseline MatrixChat navigation/send flows.
- Tracker inventory remains synchronized.
```

## Prompt 5 — Long-tail unfinished marker burn-down (batch executor)

```text
Close the next 15 unresolved markers from `docs/unfinished-code-checklist.md` in strict priority order:
- first stability/security-sensitive markers,
- then product-impact markers,
- then debt markers.

For each marker:
- implement a concrete fix,
- add regression tests,
- remove or replace the marker with actionable rationale if intentionally deferred,
- capture evidence links.

After batch completion:
- regenerate checklist counts,
- update `docs/unfinished-code-priority-plan.md`,
- update centralized evidence and release-gate residual risk wording.

Done when:
- 15 markers are closed with tests,
- counts are synchronized in all linked docs,
- evidence references are complete and current.
```

## Prompt 6 — Governance maintenance follow-ups

```text
Execute governance maintenance exceptions from `docs/blackout-governance-completion-tracker.md`:
1) quorum/threshold policy tuning,
2) governance-action integration test expansion.

Tasks:
- Implement policy tuning controls and defaults with operator-safe bounds.
- Add/expand integration tests for new governance-action paths.
- Update governance tracker status/evidence/remaining-work/owner/next-review fields.
- Add dated evidence note under `docs/operations/evidence/`.

Done when:
- Both exception items have concrete implementation/test evidence.
- Exception rows are either closed or carry explicit dated residual-risk notes.
```

## Prompt 7 — Reuse maintenance follow-ups

```text
Execute reuse maintenance exceptions from `docs/blackout-reuse-completion-tracker.md`:
- delegation abuse-pattern tuning,
- education moderation/access policy options,
- mutual-aid workflow automation expansion,
- sortition fairness validation at larger scale.

Tasks:
- Implement each follow-up with measurable acceptance criteria.
- Add appropriate tests/simulations for each area.
- Update tracker evidence and next-review metadata.
- Record residual risks with owner/date where scope remains partial.

Done when:
- Each exception has code/docs evidence and test results.
- Tracker exception table is fully current.
```

## Prompt 8 — Centralized CI replay for release promotion

```text
Run an authoritative centralized-build CI replay to resolve release-gate CI drift risk.

Tasks:
- Execute canonical lint/test/build/security commands in CI pipeline.
- Archive links or artifact identifiers in release-gate docs.
- Compare local evidence vs CI evidence and note deltas.
- Update `docs/blackout_centralized_release_readiness_gate.md` risk register.

Done when:
- CI evidence is linked in release gate.
- CI drift risk is either closed or clearly bounded with owner/date.
```

## Prompt 9 — Final sign-off completion workflow

```text
Complete owner/date sign-off blocks in `docs/blackout_centralized_release_readiness_gate.md`.

Tasks:
- Collect sign-off decisions from Release, Security, Governance, and Infra owners.
- Record decision, owner, and date in the gate artifact.
- Ensure go/no-go recommendation is explicit and justified by linked evidence.

Done when:
- All sign-off blocks are complete.
- Gate artifact is directly usable for release decisioning.
```

## Prompt 10 — Monthly tracker integrity auto-check

```text
Implement a monthly docs integrity check that validates:
- canonical status vocabulary (`Complete`, `In progress`, `Partial`, `Blocked`),
- required tracker schema fields,
- synchronized unfinished-marker counts across docs,
- no stale evidence-file references.

Tasks:
- Add a script under `_port/scripts/operations/` to run checks.
- Add tests or validation fixtures for parser logic.
- Document usage and wire command into release checklist docs.

Done when:
- Integrity script runs clean on current docs.
- Any failure emits actionable errors for maintainers.
```

---

## Recommended execution order

1. Prompt 1 (reconcile plan/checklist truth).
2. Prompt 5 (unfinished marker burn-down).
3. Prompt 2 (uc-006 regression hardening, optional UX follow-up).
4. Prompt 3 (uc-008 regression hardening).
5. Prompt 4 (uc-010 regression hardening).
6. Prompts 6 and 7 (governance/reuse maintenance exceptions).
7. Prompt 8 (authoritative CI replay).
8. Prompt 9 (final sign-offs).
9. Prompt 10 (prevent recurrence).

## Verification

- Last verified date: 2026-03-14
- Verified by: Codex (GPT-5.2-Codex)
- Commands:
  - `rg -n "Open items: \*\*98\*\*|Resolved items tracked in this checklist: \*\*20\*\*|Total files with tracked markers: \*\*73\*\*" docs/unfinished-code-checklist.md`
  - `rg -n "Approved exception notes|Residual risk register|Sign-off blocks" docs/blackout-governance-completion-tracker.md docs/blackout-reuse-completion-tracker.md docs/blackout_centralized_release_readiness_gate.md`
