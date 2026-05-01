# Frontend fetch inventory and boundary classification

## Migrated to `@blackout/sdk`

- `src/app/features/call/CallProvider.tsx`:
  - Matrix well-known call focus lookup (`/.well-known/matrix/client`) via
    `clientQueries.getWellKnownMatrixClient`.
- `src/app/pages/client/home/DeepDive.tsx`:
  - Deep dive feed retrieval (`/deep-dive-feed.json`) via
    `clientQueries.getDeepDiveFeed`.
- `src/app/features/steganography/RevealMessagePanel.tsx`:
  - Image blob retrieval via SDK `fetchBlob` media helper.
- `src/app/components/messages/mediaShared.tsx`:
  - Encrypted media retrieval via `mediaClient.fetchArrayBuffer`.

## Allowed direct `fetch()` exemptions (in guarded scope)

The two files below sit inside the lint/CI-guarded scope (`src/app/components/**`,
`src/platform/**`, `src/app/features/**`, `src/app/pages/**`) and are explicitly
exempted in:
- `apps/blackout-client/eslint.config.js` (`no-restricted-syntax` `ignores`)
- `tools/ci/check-no-direct-fetch-in-client-features.mjs` (`exemptFiles`)

| File | Rationale |
| --- | --- |
| `src/app/components/bmc/auth/homeserver.ts` | Runtime client-config bootstrap loader. Reads `/config.json` once before the SDK is initialized, so it cannot route through `clientQueries`. |
| `src/platform/nativeMediaBridge.ts` | Capacitor camera bridge converts a `data:` URI to a `Blob` via `fetch(dataUrl)`. This is a synchronous local decode, not a network call. |

## Out-of-scope direct `fetch()` (allowed without exemption flag)

The lint rule and CI guard do **not** apply to these paths because they are
system-level / runtime entrypoints that intentionally sit below the SDK:

- `src/sw.ts` — service worker request proxy/bootstrap.
- `src/client/auth.ts` — OIDC/auth refresh internals.
- `src/app/utils/dom.ts`, `src/app/utils/matrix.ts` — DOM/Matrix utility
  internals (image and well-known fetches that pre-date the SDK).

Reclassifying any of these into the SDK is tracked separately as part of the
SDK boundary roadmap; for now they sit outside the lint scope on purpose.

## Guardrail

- ESLint flat-config rule `no-restricted-syntax` (in
  `apps/blackout-client/eslint.config.js`) blocks `fetch()` call expressions
  in:
  - `src/app/features/**/*.{ts,tsx}`
  - `src/app/pages/**/*.{ts,tsx}`
  - `src/app/components/**/*.{ts,tsx}` (with explicit `ignores`)
  - `src/platform/**/*.{ts,tsx}` (with explicit `ignores`)
- CI guard at `tools/ci/check-no-direct-fetch-in-client-features.mjs` mirrors
  the same scope and exemption set; it runs as `pnpm
  guard:no-direct-fetch-in-client-features`.

Adding a new exemption requires updating **all three** of: this inventory,
the ESLint config, and the CI guard's `exemptFiles` set.
