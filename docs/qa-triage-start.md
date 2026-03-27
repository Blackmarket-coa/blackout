# QA Triage Kickoff

This document starts post-gate triage after restoring lint/style/test health.

## Current gate status snapshot

- ✅ `yarn lint:js`
- ✅ `yarn lint:types`
- ✅ `yarn lint:style`
- ✅ `yarn test test/unit-tests/steganography --runInBand`
- ⚠️ `yarn audit --groups dependencies --level moderate`
    - Remaining findings (`dompurify`, `counterpart`) are formally accepted with compensating controls in `docs/security-dependency-risk-acceptance-2026-03-06.md`.

## Triage buckets (initial)

1. **Security / correctness**
    - Steganography transport normalization and decode hardening
    - Auth/account flows with known issue/NOTE markers
2. **User-facing reliability**
    - Call state handling edge-cases
    - Widget capability/event support gaps
3. **Maintainability debt**
    - Naming/generalization notes (Scalar, widget types)
    - Legacy adapter cleanup and docs alignment

## Ranked follow-up queue (owners + milestones)

| Rank | Item                                                                                              | Owner                | Target milestone |
| ---- | ------------------------------------------------------------------------------------------------- | -------------------- | ---------------- |
| 1    | `src/Notifier.ts` call-id correctness NOTE (possible wrong-call routing in rooms).                | Messaging Core       | M1 (next sprint) |
| 2    | `src/TextForEvent.tsx` m.widget support NOTE entries.                                             | Timeline UX          | M1               |
| 3    | `src/events/EventTileFactory.tsx` m.widget support NOTE entries.                                  | Timeline UX          | M1               |
| 4    | `src/components/views/settings/tabs/room/RolesRoomSettingsTab.tsx` m.widget support NOTE entries. | Room Settings        | M2               |
| 5    | `src/LegacyCallHandler.tsx` call-end copy normalization NOTE.                                     | Calling              | M2               |
| 6    | `src/components/structures/MatrixChat.tsx` notes around error screen and URL/3pid handling.       | Client Shell         | M2               |
| 7    | `src/components/views/settings/ChangePassword.tsx` NOTE for Playwright safety coverage.           | Auth + QA Automation | M3               |
| 8    | `src/components/views/right_panel/VerificationPanel.tsx` QR camera flow NOTE.                     | Security UX          | M3               |

## Next step

Execute rank 1 and rank 2 as parallel PRs, then re-score residual queue by incident impact before sprint close.
