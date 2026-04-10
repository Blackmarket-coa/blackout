# Phase 0 client inventory snapshot

## Canonical decision

- Canonical Cinny shell: `apps/blackout-client`.
- Consolidation targets: `apps/blackout-web`, `apps/web`.
- Legacy/reference: `_port`.

## Immediate modularization status

Implemented foundation in `apps/blackout-client`:

- `src/app/core/features/types.ts`
- `src/app/core/features/featureFlags.ts`
- `src/app/core/features/buildRegistry.ts`
- `src/app/core/features/registry.ts`

Converted first-class plugin manifests:

- governance (`features/governance/{manifest,routes,nav}.ts`)
- forum (`features/forum/{manifest,routes,nav}.ts`)
- deaddrop (`features/deaddrop/{manifest,routes,nav,settings}.ts`)

## Follow-up

- Replace remaining hardcoded shell route/nav/settings registration with `featureRegistry` aggregation.
- Add capability checks at action boundaries, not just UI surfaces.
- Move current feature event constants toward `packages/blackout-protocol` imports.
- Move direct network calls from feature hooks/components into `packages/blackout-sdk` actions.
