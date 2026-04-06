# Client-wide typecheck debt

Last refreshed: 2026-03-23

## Current status

`pnpm --filter @blackout/client typecheck` fails with pre-existing errors outside the crypto bootstrap scope.

## Debt buckets

1. **Matrix SDK event typing mismatches**
    - `StateEvents` / `TimelineEvents` / `AccountDataEvents` strict keys reject custom event types (`co.bmc.*`, `m.room.*`, etc.).
2. **Call and navigation SDK signature drift**
    - event names and API signatures mismatch current `matrix-js-sdk` declarations.
3. **Slate editor type augmentation conflicts**
    - duplicate `CustomTypes` declarations and outdated Slate prop usage.
4. **Space hierarchy and notification count typing drift**
    - mismatched types for hierarchy room conversion and notification enums.

## Follow-up plan

- Add a dedicated matrix-sdk typing compatibility layer for custom state/account data events.
- Normalize Slate model augmentation to one source-of-truth declaration.
- Sweep call/navigation hooks for current `matrix-js-sdk` and `slate` API signatures.
- Gate completion with `pnpm --filter @blackout/client typecheck` green.
