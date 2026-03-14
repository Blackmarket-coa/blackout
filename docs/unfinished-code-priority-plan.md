# Unfinished Code Priority Plan

This plan prioritizes unresolved NOTE/issue markers from `docs/unfinished-code-checklist.md` by user risk, production impact, and implementation leverage.

## Inputs

- Completion tracker baseline: `docs/blackout-reuse-completion-tracker.md` (all major reuse-strategy epics complete; current phase is maintenance).
- Open marker inventory: `docs/unfinished-code-checklist.md` (repository-wide NOTE/issue-marker backlog).
- Centralized execution evidence: `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md`.

## Prioritization model

- **P0 (stability/security correctness):** can cause broken UX, data correctness issues, or policy/security regressions.
- **P1 (product/operational impact):** missing behavior that degrades key workflows, scalability, or operability.
- **P2 (maintainability/debt):** naming/cleanup/ergonomics/documentation improvements.

## Top-10 production-impact triage (owner + milestone)

| Rank | Item                                             | Source marker                                                              | Priority | Owner          | Target milestone | Tracking issue    |
| ---- | ------------------------------------------------ | -------------------------------------------------------------------------- | -------- | -------------- | ---------------- | ----------------- |
| 1    | Notifier call lookup correctness                 | `src/Notifier.ts` L491                                                     | P0       | RTC/Calling    | 2026.03          | `blackout#uc-001` |
| 2    | MatrixChat error-state handling continuity       | `src/components/structures/MatrixChat.tsx` L318                            | P0       | Web Platform   | 2026.03          | `blackout#uc-002` |
| 3    | TimelinePanel event scope guard                  | `src/components/structures/TimelinePanel.tsx` L893                         | P0       | Timeline/Rooms | 2026.03          | `blackout#uc-003` |
| 4    | Room/event ID encoding handling                  | `src/components/structures/MatrixChat.tsx` L1937                           | P0       | Navigation     | 2026.04          | `blackout#uc-004` |
| 5    | Auth flow register-button correctness            | `src/components/structures/auth/Login.tsx` L290                            | P0       | Auth/Identity  | 2026.04          | `blackout#uc-005` |
| 6    | Per-room hide controls in MessagePanel           | `src/components/structures/MessagePanel.tsx` L468                          | P1       | Rooms UX       | 2026.05          | `blackout#uc-006` |
| 7    | ScrollPanel search optimization                  | `src/components/structures/ScrollPanel.tsx` L648                           | P1       | Timeline/Perf  | 2026.05          | `blackout#uc-007` |
| 8    | Keyboard shortcut handling gaps                  | `src/accessibility/KeyboardShortcuts.ts` L165, L325                        | P1       | Accessibility  | 2026.05          | `blackout#uc-008` |
| 9    | Import E2E keys feedback UX                      | `src/async-components/views/dialogs/security/ImportE2eKeysDialog.tsx` L110 | P1       | Security UX    | 2026.05          | `blackout#uc-009` |
| 10   | MatrixChat state consistency under burst actions | `src/components/structures/MatrixChat.tsx` L183                            | P1       | Web Platform   | 2026.06          | `blackout#uc-010` |

## Top-10 status reconciliation (checklist-aligned)

Status labels in this section are derived from `docs/unfinished-code-checklist.md` and indicate whether each tracked `uc-*` marker is currently represented as closed or still outstanding in the tracked backlog.

| Tracking issue | Current status | Checklist evidence | Current evidence link |
| --- | --- | --- | --- |
| `blackout#uc-001` | Partial (resolved in prior batch; not in current “recently resolved” block) | Not listed in open marker sections of current checklist snapshot | `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md` |
| `blackout#uc-002` | Partial (resolved in prior batch; not in current “recently resolved” block) | Not listed in open marker sections of current checklist snapshot | `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md` |
| `blackout#uc-003` | Partial (resolved in prior batch; not in current “recently resolved” block) | Not listed in open marker sections of current checklist snapshot | `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md` |
| `blackout#uc-004` | Complete | Listed in “Recently resolved high-priority markers” | `docs/unfinished-code-checklist.md` |
| `blackout#uc-005` | Complete | Listed in “Recently resolved high-priority markers” | `docs/unfinished-code-checklist.md` |
| `blackout#uc-006` | In progress | Open marker remains under `src/components/structures/MessagePanel.tsx` | `docs/unfinished-code-checklist.md` |
| `blackout#uc-007` | Partial (specific marker resolved; file still has other open marker debt) | `src/components/structures/ScrollPanel.tsx` still appears with an open marker in checklist | `docs/unfinished-code-checklist.md` |
| `blackout#uc-008` | Partial (still planned; no resolved entry in current checklist snapshot) | Not present in current checklist resolved block; remains in ranked queue | `docs/unfinished-code-priority-plan.md` |
| `blackout#uc-009` | Partial (resolved in prior batch; not in current “recently resolved” block) | Not listed in open marker sections of current checklist snapshot | `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md` |
| `blackout#uc-010` | Partial (still planned; no resolved entry in current checklist snapshot) | Not present in current checklist resolved block; remains in ranked queue | `docs/unfinished-code-priority-plan.md` |

## Remaining unresolved queue (ordered P0 -> P1 -> P2)

### P0

No unresolved top-10 P0 items remain in the current ranked queue.

### P1

1. `blackout#uc-006` — Per-room hide controls in MessagePanel.
2. `blackout#uc-008` — Keyboard shortcut handling gaps.
3. `blackout#uc-010` — MatrixChat state consistency under burst actions.

### P2

- Continue long-tail checklist burn-down from `docs/unfinished-code-checklist.md` after P1 closure.

## Suggested delivery cadence (regenerated)

- **Sprint A (P1 closure):** `uc-006` and `uc-008` with regression tests and checklist recount.
- **Sprint B (P1 closure):** `uc-010` plus race/burst simulation tests and checklist recount.
- **Sprint C (P2 burn-down):** next 15 long-tail markers with strict evidence + tracker synchronization.

## Verification

- Last verified date: 2026-03-14
- Verified by: Codex (GPT-5.2-Codex)
- Commands:
  - `rg -n "uc-00[1-9]|uc-010|Recently resolved high-priority markers|Open items" docs/unfinished-code-checklist.md docs/unfinished-code-priority-plan.md`
  - `rg -n "src/components/structures/MessagePanel.tsx|src/components/structures/ScrollPanel.tsx" docs/unfinished-code-checklist.md`
  - `rg -n "2026-03-14-blackout-centralized-work-orders-1-8|2026-03-14-blackout-centralized-work-orders-1-9" docs/unfinished-code-priority-plan.md`
