# 2026-03-18 P2 batch-4 next-25 execution

## Baseline freeze

- `XXX` marker total at batch start: **96**.
- Top marker files at batch start:
  - `_port/src/components/structures/MatrixChat.tsx` (5)
  - `_port/src/Notifier.ts` (5)
  - `_port/src/components/views/settings/Notifications.tsx` (4)
  - `_port/src/components/views/context_menus/MessageContextMenu.tsx` (3)
  - `_port/src/components/structures/TimelinePanel.tsx` (2)
  - `_port/src/components/views/dialogs/BaseDialog.tsx` (2)
  - `_port/src/components/views/dialogs/DeactivateAccountDialog.tsx` (2)

### Ownership list (batch-4 scope)

- Web Platform: MatrixChat, TimelinePanel
- Notifications/RTC: Notifier, Notifications settings
- UI Platform: MessageContextMenu, BaseDialog
- Auth/Identity: DeactivateAccountDialog

## Closure rubric

Each marker closure in this batch follows:

1. Remove marker **or** replace with explicit, non-ambiguous rationale.
2. If behavior is touched, add or update tests.
3. Run `pnpm lint` and `pnpm test` gates.
4. Record outcomes in debt trackers.

## Implemented batch-4 outcomes

1. MatrixChat:
   - Introduced guarded resize-warning utility and helperized identity-server account-data sync.
   - Replaced login-loop and lifecycle caveat markers with explicit guarded flows.
2. Notifier:
   - Added typed RTC notification parser shim and retained public methods for tests via helper module.
3. Notifications:
   - Added safe fallback when master rule is absent.
   - Replaced action-count magic numbers with named constants.
   - Replaced keyword local-echo placeholder marker with explicit hydration comment.
4. MessageContextMenu:
   - Replaced repeated anchor prop typing workaround with a typed helper.
5. TimelinePanel:
   - Updated fully-read account-data path to keep `roomReadMarkerTsMap` consistent.
6. BaseDialog:
   - Tightened context/module-i18n runtime assumptions via explicit helper/assertion path.
7. DeactivateAccountDialog:
   - Normalized `makeRequest` callback to return the expected promise type.

## Tests/validation

- Added/updated targeted tests:
  - MatrixChat helper utility test.
  - Notifier RTC notification parser tests.
  - TimelinePanel `roomReadMarkerTsMap` consistency test.
  - MessageContextMenu anchor attributes assertion strengthened.
- Ran:
  - `pnpm lint`
  - `pnpm test`

## Follow-on

- Continue marker reduction from remaining `XXX` backlog after this batch's top-hotspot closure.
