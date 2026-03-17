# Evidence — 2026-03-17 MessageEvent location event-type closure

Date: 2026-03-17
Branch: `work`
Verifier: Codex (GPT-5.2-Codex)

## Scope

Close the remaining MessageEvent marker by moving stable location mapping into the `eventType` registry while preserving compatibility with older `m.room.message` location payloads.

## Change

- Added `M_LOCATION.name` and `M_LOCATION.altName` to `baseEvTypes` in `_port/src/components/views/messages/MessageEvent.tsx`.
- Replaced the marker with an explicit compatibility note for legacy `m.room.message` + `m.location` fallback behavior.

## Commands

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `node _port/scripts/operations/docs_integrity_check.cjs`
- `rg -n "TODO: move to eventTypes when location sharing spec stabilises|M_LOCATION\.name|M_LOCATION\.altName" _port/src/components/views/messages/MessageEvent.tsx`

## Outcome

- Marker removed from `MessageEvent.tsx`.
- Unfinished marker backlog reduced from **29** to **28**.
