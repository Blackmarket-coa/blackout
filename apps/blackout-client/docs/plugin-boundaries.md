# Plugin boundaries for `apps/blackout-client`

## Module folder structure

```text
src/app/core/features/
  buildRegistry.ts
  capabilityGate.ts           # capability + flag gate evaluator for customizations
  composition.ts              # route/nav/settings composition via manifests
  coreModules.ts
  featureFlags.ts
  plugins.ts
  registry.ts
  types.ts                    # plugin categories + manifest contracts

src/app/features/<feature>/
  manifest.ts                 # feature-level customization manifests
  nav.ts                      # nav contributions
  routes.ts                   # route contributions
  settings.ts                 # settings contributions (optional)
```

## Manifest contracts

Each `manifest.ts` now contributes `customizations` entries with a strict category and optional gate:

-   `category` must be one of:
    -   `visual/layout plugin`
    -   `interaction plugin`
    -   `workflow plugin`
    -   `service-backed plugin`
-   `capabilityGate` supports:
    -   `allOf`: required capabilities
    -   `anyOf`: at least one required capability
    -   `not`: block when capability is present
    -   `flags`: required feature flags
-   contribution surfaces:
    -   `routes`
    -   `navItems`
    -   `settings`

## Capability gate strategy

1. **Feature enrollment**: `buildFeatureRegistry()` still decides which features are loaded by top-level feature flags.
2. **Customization gating**: `resolveFeatureCustomizations()` evaluates each customization gate (`allOf`, `anyOf`, `not`, `flags`).
3. **Surface composition**: route/nav/settings composers now flatten only enabled customizations.
4. **Compatibility fallback**: if a feature has no `customizations`, legacy `routes/navItems/settings` are adapted as a single workflow customization.

This allows one feature to host multiple plugins with different access requirements without hardcoding route/nav/settings wiring.

## Examples: migrated customizations

1. **Governance Workbench** (`workflow plugin`)

    - Contributes governance routes + nav.
    - Gate: `governance.read` + `governance` flag.

2. **Dead Drop Controls** (`interaction plugin`)

    - Contributes Dead Drop routes + nav + settings section.
    - Gate: `deaddrop.read` + `deaddrop` flag.

3. **Draupnir Console** (`service-backed plugin`)
    - Contributes moderation routes + nav.
    - Gate: `moderation.read` + `moderation` flag.
