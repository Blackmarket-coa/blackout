# Frontend fetch inventory and boundary classification

## Migrated to `@blackout/sdk`
- `src/app/features/call/CallProvider.tsx`:
  - Matrix well-known call focus lookup (`/.well-known/matrix/client`) now via `clientQueries.getWellKnownMatrixClient`.
- `src/app/pages/client/home/DeepDive.tsx`:
  - Deep dive feed retrieval (`/deep-dive-feed.json`) now via `clientQueries.getDeepDiveFeed`.
- `src/app/features/steganography/RevealMessagePanel.tsx`:
  - Image blob retrieval now via SDK `fetchBlob` media helper.

## Allowed direct `fetch` exemptions
- `src/sw.ts`:
  - Service worker runtime request proxy/bootstrap network path.
- `src/app/components/messages/mediaShared.tsx` and `src/app/components/bmc/messages/mediaShared.tsx`:
  - Direct media retrieval for browser media handling.
- `src/app/components/ClientConfigLoader.tsx`:
  - Runtime client bootstrap config loading.
- `src/client/auth.ts`:
  - Auth refresh low-level client internals.
- `src/app/utils/dom.ts`, `src/app/utils/matrix.ts`:
  - Utility/system-level media and DOM internals.

## Guardrail
- ESLint now blocks `fetch()` usage in `src/app/features/**` and `src/app/pages/**` via `no-restricted-syntax`.
