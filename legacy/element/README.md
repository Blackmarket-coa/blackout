# Legacy Element Archive

## Purpose
This directory is the canonical archive namespace for upstream Element-branded distribution artifacts that are kept for historical and migration reference.

## Support status
- **Status:** archival only.
- **Runtime support:** none.
- **Change policy:** only migration, provenance, and documentation updates are allowed.

## Import restrictions
Code in active runtime packages must not import from:
- `legacy/` paths
- `_port/` paths

CI enforces this via `pnpm guard:legacy-runtime-imports`.
