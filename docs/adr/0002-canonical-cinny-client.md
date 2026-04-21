# ADR 0002: Canonical frontend is the Cinny-based blackout-client

## Status

Accepted (Phase 0 architecture freeze)

## Context

The monorepo currently has overlapping browser-focused clients in `apps/blackout-client`, `apps/blackout-web`, and `apps/web`, plus legacy Element-era code in `_port`.

Phase 0 requires choosing one canonical browser shell to avoid parallel feature implementation and route drift.

## Decision

- Adopt `apps/blackout-client` as the canonical Cinny-based browser shell.
- Keep `apps/blackout-web` and `apps/web` operational during migration, but mark them as consolidation targets.
- Treat `_port` as legacy/reference-only for parity checks and historical behavior.
- Build net-new modular feature work (registry, manifests, capability gating, plugin loaders) in `apps/blackout-client` first.

## Consequences

- New modular feature manifests (governance/forum/deaddrop) land in one shell and can be registered consistently.
- Documentation and platform architecture can reference a single frontend runtime target.
- Migration effort is required to absorb any still-unique flows from `apps/blackout-web` and `apps/web`.

## Tradeoffs

- Short-term duplicate maintenance remains while migration work is in-flight.
- Teams familiar with `apps/blackout-web` may need to update local workflows.
- Some integration tests may need to be re-pointed gradually.

## Migration implications

1. Keep existing CI passing for all three web apps while introducing plugin architecture in `apps/blackout-client`.
2. Port unique routes/components from `apps/blackout-web` and `apps/web` into feature modules.
3. Mark duplicated routes as deprecated and archive once parity is complete.
4. Preserve `_port` only for migration reference and parity auditing.
