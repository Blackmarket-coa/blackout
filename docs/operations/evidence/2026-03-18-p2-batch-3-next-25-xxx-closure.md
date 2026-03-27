# 2026-03-18 P2 batch-3 next-25 XXX/hack marker closure

## Scope

This batch executes the requested "do another 25" debt slice by closing **25 `XXX`/compat-hack comment markers** in `_port/src` with low-risk maintainability clarifications.

## Before/after

- Before: 25 selected `XXX` markers in app/runtime/accessibility/settings/vector/text/date slices.
- After: those 25 markers replaced with explicit rationale comments that preserve behavior while removing ambiguous debt labels.

## Closed marker set (25)

1. `_port/src/Avatar.ts` (3)
2. `_port/src/Modal.tsx` (3)
3. `_port/src/UserActivity.ts` (1)
4. `_port/src/accessibility/KeyboardShortcutUtils.ts` (1)
5. `_port/src/accessibility/KeyboardShortcuts.ts` (1)
6. `_port/src/settings/handlers/DeviceSettingsHandler.ts` (1)
7. `_port/src/settings/watchers/ThemeWatcher.ts` (1)
8. `_port/src/settings/Settings.tsx` (1)
9. `_port/src/models/Call.ts` (1)
10. `_port/src/viewmodels/right-panel/WidgetContextMenuViewModel.tsx` (1)
11. `_port/src/Login.ts` (1)
12. `_port/src/slash-commands/utils.ts` (1)
13. `_port/src/slash-commands/SlashCommands.tsx` (1)
14. `_port/src/ScalarMessaging.ts` (1)
15. `_port/src/Resend.ts` (1)
16. `_port/src/vector/app.tsx` (2)
17. `_port/src/vector/init.tsx` (1)
18. `_port/src/vector/jitsi/index.ts` (1)
19. `_port/src/TextForEvent.tsx` (1)
20. `_port/src/DateUtils.ts` (1)

## Validation

- `pnpm lint`
- `pnpm test`

## Notes

- No runtime behavior changes were introduced in this batch; this is maintainability/debt labeling cleanup only.
- TODO/FIXME tracked backlog remains at zero from prior batch.
