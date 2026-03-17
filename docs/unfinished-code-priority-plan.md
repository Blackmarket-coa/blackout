# Unfinished Code Priority Plan

This plan prioritizes unresolved NOTE/issue markers from `docs/unfinished-code-checklist.md` by user risk, production impact, and implementation leverage.

## Inputs

- Completion tracker baseline: `docs/blackout-reuse-completion-tracker.md` (all major reuse-strategy epics complete; current phase is maintenance).
- Open marker inventory: `docs/unfinished-code-checklist.md` (repository-wide NOTE/issue-marker backlog, 29 open items).
- Centralized execution evidence: `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md`.
- Revenue expansion roadmap: `docs/14-stream-revenue-implementation-plan.md` (cross-functional monetization backlog to schedule alongside unfinished-code burn-down).

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
| `blackout#uc-006` | Complete | Listed in “Recently resolved high-priority markers” | `docs/unfinished-code-checklist.md` |
| `blackout#uc-007` | Partial (specific marker resolved; file still has other open marker debt) | `src/components/structures/ScrollPanel.tsx` still appears with an open marker in checklist | `docs/unfinished-code-checklist.md` |
| `blackout#uc-008` | Complete | Listed in “Recently resolved high-priority markers” | `docs/unfinished-code-checklist.md` |
| `blackout#uc-009` | Partial (resolved in prior batch; not in current “recently resolved” block) | Not listed in open marker sections of current checklist snapshot | `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md` |
| `blackout#uc-010` | Complete | Listed in “Recently resolved high-priority markers” | `docs/unfinished-code-checklist.md` |


- `blackout#uc-006` closure evidence: `_port/src/components/structures/MessagePanel.tsx`, `_port/test/unit-tests/components/structures/MessagePanel-test.tsx`, `docs/operations/evidence/2026-03-14-uc-006-messagepanel-room-hide-controls.md`.

- `blackout#uc-008` closure evidence: `_port/src/accessibility/KeyboardShortcutUtils.ts`, `_port/test/unit-tests/accessibility/KeyboardShortcutUtils-test.ts`, `docs/operations/evidence/2026-03-14-uc-008-keyboard-shortcuts-gap-closure.md`.

- `blackout#uc-010` closure evidence: `_port/src/components/structures/MatrixChat.tsx`, `_port/test/unit-tests/components/structures/MatrixChat-test.tsx`, `docs/operations/evidence/2026-03-14-uc-010-matrixchat-burst-state-consistency.md`.

- Batch closure evidence (15-marker sweep): `docs/operations/evidence/2026-03-14-batch-15-marker-closure.md`.

## Remaining unresolved queue (ordered P0 -> P1 -> P2)

### P0

No unresolved top-10 P0 items remain in the current ranked queue.

### P1

No unresolved top-10 P1 items remain in the current ranked queue.

### P2

- Continue long-tail checklist burn-down from `docs/unfinished-code-checklist.md` after P1 closure.

## Remaining marker risk queue (owner + milestone)

| Rank | Item | Risk class | Owner | Milestone | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/components/views/messages/MImageBody.tsx` image-size cap behavior | Data/UI correctness | Timeline UX | 2026.04 | Complete (2026-03-16) |
| 2 | `src/components/views/room_settings/AliasSettings.tsx` alias validation/error surfacing | Security + data correctness | Rooms/Identity | 2026.04 | Complete (2026-03-16) |
| 3 | `src/indexing/EventIndex.ts` lazy-loading assumptions in indexing | Data correctness/perf | Search/Indexing | 2026.04 | Complete (2026-03-16) |
| 4 | `src/stores/spaces/SpaceStore.ts` parent-rebuild permission handling | Data correctness | Spaces | 2026.04 | Complete (2026-03-16) |
| 5 | `src/components/views/right_panel/VerificationPanel.tsx` QR camera entry path | Security UX | Security UX | 2026.05 | Complete (2026-03-16) |
| 6 | `src/components/views/rooms/LinkPreviewWidget.tsx` media rendering factoring | Reliability/UX | Media UX | 2026.05 | Complete (2026-03-16) |
| 7 | `src/components/views/rooms/Stickerpicker.tsx` multi-store support | Product capability | Integrations | 2026.05 | Complete (2026-03-16) |
| 8 | `src/components/views/settings/Notifications.tsx` view logic decomposition | Maintainability | Notifications | 2026.05 | Complete (2026-03-16) |
| 9 | `src/stores/widgets/WidgetStore.ts` broader widget-store consolidation | Maintainability | Widgets Platform | 2026.06 | Complete (2026-03-16) |
| 10 | `src/autocomplete/UserProvider.tsx` sender-member lazy-load fallback | Perf + correctness | Composer/Autocomplete | 2026.06 | Complete (2026-03-16) |


## Regenerated next top-10 P2 burn-down queue (2026-03-16 refresh)

| Rank | Marker | Owner | Milestone | Status |
| --- | --- | --- | --- | --- |
| 1 | `src/components/views/room_settings/RoomProfileSettings.tsx` L53/L141 | Room Settings | 2026.03 | In progress |
| 2 | `src/components/views/rooms/BasicMessageComposer.tsx` L751 | Composer | 2026.03 | In progress |
| 3 | `src/components/views/rooms/LegacyRoomList.tsx` L433 | Rooms Navigation | 2026.03 | In progress |
| 4 | `src/components/views/rooms/RoomSublist.tsx` L86 | Rooms UX | 2026.03 | In progress |
| 5 | `src/components/views/rooms/RoomTile.tsx` L298 | Notifications UX | 2026.03 | In progress |
| 6 | `src/components/views/settings/ChangePassword.tsx` L241 | Security UX | 2026.03 | In progress |
| 7 | `src/components/views/settings/tabs/room/BridgeSettingsTab.tsx` L61/L83 | Integrations | 2026.03 | In progress |
| 8 | `src/components/views/settings/tabs/user/AccountUserSettingsTab.tsx` L151/L160 | Account Settings | 2026.03 | In progress |
| 9 | `src/device-listener/DeviceListenerOtherDevices.ts` L86/L121 | E2EE Device Mgmt | 2026.03 | In progress |
| 10 | `src/integrations/IntegrationManagers.ts` L84 | Integrations Session Mgmt | 2026.03 | In progress |

## Suggested delivery cadence (regenerated)

- **Sprint A (P2 burn-down):** completed 2026-03-16 for composer/widget-store/room-list marker clusters (evidence: `docs/operations/evidence/2026-03-16-p2-marker-sprint-composer-widget-roomlist.md`).
- **Sprint B (P2 burn-down):** completed 2026-03-16 for utils/notifications/widgets/test-scaffolding marker closures (evidence: `docs/operations/evidence/2026-03-16-p2-marker-sprint-batch-4.md`).
- **Sprint C (P2 burn-down):** completed 2026-03-16 for ranked risk items #1-#10 with code closures + evidence sync (evidence: `docs/operations/evidence/2026-03-16-sprint-c-risk-queue-1-10-closure.md`).
- **Sprint D (P2 burn-down):** completed 2026-03-16 for regenerated top-10 queue closure plus self-healing/townhall mitigation validation (evidence: `docs/operations/evidence/2026-03-16-sprint-d-top10-selfhealing-townhall-closure.md`).

## Verification

- Last verified date: 2026-03-16
- Verified by: Codex (GPT-5.2-Codex)
- Commands:
  - `rg -n "uc-00[1-9]|uc-010|Recently resolved high-priority markers|Open items" docs/unfinished-code-checklist.md docs/unfinished-code-priority-plan.md`
  - `rg -n "test/unit-tests/components/structures/MatrixChat-test.tsx|test/unit-tests/components/views/beacon/RoomCallBanner-test.tsx|src/vector/index.html" docs/unfinished-code-checklist.md`
  - `rg -n "2026-03-14-blackout-centralized-work-orders-1-9|2026-03-14-batch-15-marker-closure" docs/unfinished-code-priority-plan.md`
  - `rg -n "Open items: \*\*28\*\*|open marker inventory: 28|backlog remains high \(28\)" docs/unfinished-code-checklist.md docs/project_completion_tracker.md docs/blackout_centralized_release_readiness_gate.md`
