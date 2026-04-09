# Turborepo Migration Plan (Web + Mobile + Shared Packages)

## Goals
- Consolidate all app and shared package builds into a single Turborepo workspace.
- Keep delivery risk low by migrating in phases with dual-run compatibility.
- Standardize caching and task pipelines across web, mobile, and shared libraries.

## Target Folder Structure

```text
.
├─ apps/
│  ├─ web/                 # existing apps/blackout-web
│  ├─ mobile/              # existing blackout/apps/mobile
│  ├─ client/              # existing apps/blackout-client
│  ├─ gov/                 # existing apps/blackout-gov
│  └─ appservice/          # existing apps/deaddrop-appservice
├─ packages/
│  ├─ core/                # domain logic + API wrappers + cross-platform hooks
│  ├─ ui/                  # design system components
│  ├─ config/              # shared config + tokens
│  ├─ api-contracts/       # transport + DTO contracts (new)
│  ├─ eslint-config/       # shared lint presets (new)
│  ├─ tsconfig/            # shared TS project references (new)
│  └─ test-utils/          # testing helpers + fixtures (new)
├─ tools/
│  ├─ ci/
│  └─ scripts/
├─ turbo.json
├─ pnpm-workspace.yaml
├─ package.json            # root scripts + devDependencies
└─ tsconfig.base.json
```

## Package Boundaries

### `apps/web`
- Web-only runtime entrypoints (Vite, browser bootstrap, CSS bundling).
- Depends on `@blackout/core`, `@blackout/ui`, `@blackout/config`, `@blackout/api-contracts`.
- Must not export reusable logic to other apps.

### `apps/mobile`
- Mobile runtime entrypoints (Expo Router, native bridge adapters, EAS config).
- Depends on same shared packages as web.
- Platform-specific adapters stay here (storage, push notifications, deep linking).

### `packages/core`
- Pure TypeScript business/domain logic and transport clients.
- Cross-platform hooks/services that do not directly import web-only or native-only modules.
- Exposes stable APIs consumed by both web and mobile.

### `packages/ui`
- Cross-platform-compatible presentational components and tokens where possible.
- For web-only or native-only components, use explicit subpath exports:
  - `@blackout/ui/web`
  - `@blackout/ui/native`

### `packages/config`
- Shared constants, feature flags schema, theme tokens, and environment parsing.
- No runtime side effects; deterministic imports only.

### `packages/api-contracts` (new)
- Event schemas, DTOs, and validation helpers.
- Source of truth for client/server shape alignment.

### `packages/test-utils` (new)
- Shared testing factories, mocks, custom renderers, and fixture builders.
- Prevent duplicate test harness implementations across apps.

### `packages/eslint-config` + `packages/tsconfig` (new)
- Centralized lint/type rules; each app/package extends these.

## Incremental Migration Steps (Low Risk)

1. **Inventory and freeze boundaries (1-2 days).**
   - Map current imports between `apps/*` and `blackout/*`.
   - Add temporary CI check to prevent new cross-tree coupling while migration is active.

2. **Establish root Turborepo control plane (1 day).**
   - Promote a single root `pnpm-workspace.yaml`, `turbo.json`, and root `package.json` scripts.
   - Keep existing package locations working initially (no path moves yet).

3. **Normalize task names across all projects (1-2 days).**
   - Standardize scripts: `build`, `dev`, `lint`, `test`, `typecheck`, `clean`.
   - Configure `turbo.json` pipeline with consistent `inputs` and `outputs`.

4. **Create new shared utility packages without moving apps (2-3 days).**
   - Add `api-contracts`, `eslint-config`, `tsconfig`, `test-utils` packages.
   - Migrate one concern at a time (types first, then lint, then test helpers).

5. **Migrate web app onto shared packages (2-4 days).**
   - Replace relative imports with package imports.
   - Validate parity through existing unit/integration/e2e suites.

6. **Migrate mobile app onto shared packages (2-4 days).**
   - Move cross-platform logic to `packages/core` with adapter interfaces.
   - Keep native adapters in `apps/mobile`.

7. **Relocate directories to target structure in small PRs (2-5 days).**
   - Move `apps/blackout-web -> apps/web` then add compatibility aliases.
   - Move `blackout/apps/mobile -> apps/mobile` and `blackout/packages/* -> packages/*`.
   - Use codemods + path alias bridge to avoid big-bang rename.

8. **Turn on strict dependency constraints (1 day).**
   - Enforce no app-to-app imports.
   - Enforce no platform-specific imports from shared core.

9. **Remove compatibility shims and dead paths (1-2 days).**
   - Delete temporary alias mappings and legacy script wrappers.
   - Keep one release cycle of monitoring before final cleanup.

## CI Caching Strategy

### Turbo cache fundamentals
- Enable remote cache (Vercel Remote Cache, S3-backed cache, or similar).
- Cache key dimensions should include:
  - lockfile hash (`pnpm-lock.yaml`)
  - task name
  - task inputs (`src/**`, config files, env allowlist)
  - Node + pnpm versions

### Recommended `turbo.json` patterns
- `build`: cacheable, depends on `^build`, explicit outputs (e.g., `dist/**`, `.next/**`, Expo artifacts where applicable).
- `test`: cacheable for deterministic unit tests; split integration/e2e into separate non-cached or lightly cached tasks.
- `lint` + `typecheck`: cacheable with narrow inputs.
- `dev`: non-cacheable, persistent.

### CI job design
- **PR fast path:** run `turbo run lint typecheck test --filter=...[origin/main]`.
- **Main branch full path:** run full `build` and full test matrix.
- **Nightly:** run uncached integration/e2e smoke to catch cache-blind regressions.

### Cache hygiene
- Declare env vars via `globalEnv`/`env` in turbo config to avoid hidden invalidation.
- Avoid non-deterministic generators in cacheable tasks (timestamps, random seeds without pinning).
- Pin package manager and Node versions in CI.

## Common Failure Modes and Fixes

1. **Failure:** cache misses on every CI run.
   - **Cause:** missing/unstable lockfile, changing env vars, or untracked config inputs.
   - **Fix:** pin toolchain, commit lockfile, declare env allowlist, and explicitly set task `inputs`.

2. **Failure:** shared package imports break on mobile bundling.
   - **Cause:** web-specific modules leak into core/ui package exports.
   - **Fix:** split exports by platform (`/web`, `/native`) and enforce lint rule against forbidden imports.

3. **Failure:** task graph cycles after package extraction.
   - **Cause:** accidental circular dependencies (`core <-> ui`, app importing another app).
   - **Fix:** enforce one-way dependency layers and run dependency-cycle checks in CI.

4. **Failure:** typecheck passes locally but fails in CI.
   - **Cause:** path aliases resolved differently or project references incomplete.
   - **Fix:** centralize TS config in `packages/tsconfig`, use `tsc -b`, and remove ad-hoc local path overrides.

5. **Failure:** longer build times after migration.
   - **Cause:** over-broad task inputs or missing outputs declarations.
   - **Fix:** reduce input globs, define exact outputs, and split coarse tasks into smaller cacheable units.

6. **Failure:** flaky integration tests appear “cached green.”
   - **Cause:** integration/e2e mistakenly marked fully cacheable.
   - **Fix:** disable cache for flaky suites or add stable replay fixtures; reserve cache for deterministic scopes.

7. **Failure:** developers bypass Turborepo tasks with direct package scripts.
   - **Cause:** inconsistent local workflows and documentation gaps.
   - **Fix:** make root scripts canonical (`pnpm build`, `pnpm test` via turbo), document and enforce in CI.

## Recommended Migration Exit Criteria
- All apps build/test/typecheck through root turbo commands only.
- No imports from legacy paths or app-to-app edges.
- CI demonstrates consistent cache hit rate on unchanged packages.
- Rollback plan documented for one release window post-cutover.
