# QA Triage Kickoff

This document starts post-gate triage after restoring lint/style/test health.

## Current gate status snapshot

- ✅ `yarn lint:js`
- ✅ `yarn lint:types`
- ✅ `yarn lint:style`
- ✅ `yarn test test/unit-tests/steganography --runInBand`
- ⚠️ `yarn audit --groups dependencies --level moderate`
    - Remaining issue: transitive `counterpart` in `@element-hq/web-shared-components` with no upstream patch currently available.

## Triage buckets (initial)

1. **Security / correctness**
    - Steganography transport normalization and decode hardening
    - Auth/account flows with known FIXME/NOTE markers
2. **User-facing reliability**
    - Call state handling edge-cases
    - Widget capability/event support gaps
3. **Maintainability debt**
    - Naming/generalization notes (Scalar, widget types)
    - Legacy adapter cleanup and docs alignment

## First-pass actionable triage queue

Prioritized from `docs/unfinished-code-checklist.md` for follow-up PRs:

1. `src/Notifier.ts` call-id correctness NOTE (possible wrong-call routing in rooms).
2. `src/TextForEvent.tsx` m.widget support NOTE entries.
3. `src/events/EventTileFactory.tsx` m.widget support NOTE entries.
4. `src/components/views/settings/tabs/room/RolesRoomSettingsTab.tsx` m.widget support NOTE entries.
5. `src/LegacyCallHandler.tsx` call-end copy normalization NOTE.
6. `src/components/structures/MatrixChat.tsx` notes around error screen and URL/3pid handling.
7. `src/components/views/settings/ChangePassword.tsx` NOTE mentions need for Playwright safety coverage.
8. `src/components/views/right_panel/VerificationPanel.tsx` QR camera flow NOTE.

## Next step

Address queue item 1 in the next PR with focused tests, then iterate by risk order.
