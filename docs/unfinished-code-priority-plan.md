# Unfinished Code Priority Plan

This plan prioritizes unresolved NOTE/issue markers from `docs/unfinished-code-checklist.md` by user risk, production impact, and implementation leverage.

## Inputs

- Completion tracker baseline: `docs/blackout-reuse-completion-tracker.md` (all major reuse-strategy epics complete; current phase is maintenance).
- Open marker inventory: `docs/unfinished-code-checklist.md` (repository-wide NOTE/issue-marker backlog).

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

## Status update for highest-impact items

- **Notifier call lookup correctness (uc-001):** resolved in code path and closed in checklist; follow-up PR reference: `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-8.md`.
- **MatrixChat error-state handling continuity (uc-002):** resolved in code path and closed in checklist; follow-up PR reference: `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-8.md`.
- **TimelinePanel event scope guard (uc-003):** resolved in code path and closed in checklist; follow-up PR reference: `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-8.md`.
- **ScrollPanel search optimization (uc-007):** resolved in code path and closed in checklist; follow-up PR reference: `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-8.md`.
- **Import E2E keys feedback UX (uc-009):** resolved in code path and closed in checklist; follow-up PR reference: `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-8.md`.

## Suggested delivery cadence

- **Sprint A (remaining P0):** items 4–5, plus regression tests for encoded-ID navigation and login/register gating.
- **Sprint B (P1):** remaining items 6, 8, and 10, with keyboard shortcut handling tests and room-UX controls.
- **Sprint C (P2):** maintenance-window cleanups and deferred naming/documentation debt.
