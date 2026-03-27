# _port/ – Parked Sources for Monorepo Migration

This directory holds the original Element Web fork sources that are staged for
selective porting into the new monorepo workspace structure.

**Do not modify files here.** Use this as a read-only reference when porting
code into `packages/` and `apps/`.

## Contents

| Directory / File | Purpose |
|---|---|
| `src/` | Original application source (Blackout + Element upstream) |
| `shared-components/` | Reusable UI component library (was `packages/shared-components/`) |
| `module_system/` | Custom module build/install tooling |
| `res/` | Static resources (fonts, images, themes, CSS) |
| `patches/` | Dependency patches (triage in MIGRATION_INVENTORY.md §E) |
| `element.io/` | Element.io branding (discard candidate) |
| `scripts/` | Build and utility scripts |
| `test/` | Unit/integration tests |
| `playwright/` | E2E test suites |
| `__mocks__/` | Test mocks |
| `*.cjs`, `*.ts`, `*.json` | Legacy build/lint/test configuration |

## Port order (from MIGRATION_INVENTORY.md §G)

1. Core first → `@blackout/core`
2. Design tokens → `@blackout/design`
3. UI rebuild → `@blackout/ui`
4. App shells → `apps/web`, `apps/mobile`, `apps/desktop`
5. Deploy adaptation → `deploy/`

Once all items are ported and validated, this directory will be removed.
