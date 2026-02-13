# ADR 0001: Matrix + Yjs architecture for Blackout domain modules

## Status

Accepted (Phase 0 scaffolding)

## Context

Blackout needs governance, education, and mutual-aid workflows while preserving Matrix as the primary identity and coordination surface.

## Decision

- Use Matrix room IDs as the scope key for all domain documents.
- Introduce domain-first module folders under `src/modules/{governance,education,mutualAid}`.
- Introduce service-first folders under `src/services/{crdt,governance,delegation,deliberation,storage,attestations,telemetry}`.
- Gate all net-new views and engines behind dedicated feature flags:
    - `feature_blackout_governance`
    - `feature_blackout_education`
    - `feature_blackout_mutual_aid`
- Use Yjs for in-memory CRDT state with `y-indexeddb` for local persistence.

## Routing/navigation extension point inventory

- Primary logged-in view composition via `src/components/structures/LoggedInView.tsx`.
- Space and room-selection behaviour via `src/stores/spaces/SpaceStore.ts` and `src/stores/room-list/*`.
- Room rendering entry points via `src/components/views/rooms/RoomView.tsx` and `src/stores/RoomViewStore.tsx`.
- Module-level extension APIs via `src/modules/Navigation.ts` and `src/modules/ModuleComponents.tsx`.

## Consequences

- Existing behaviour is unchanged when feature flags are disabled.
- New modules can be implemented incrementally with minimal impact on Element core flows.
- Yjs document lifecycle can be advanced in later phases without reworking the domain boundaries.
