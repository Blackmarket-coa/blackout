# Frontend consolidation assessment

## Question

Can Blackout reuse features from the current frontends and create a single frontend that reads them cleanly while preserving custom and legacy behavior?

## Short answer

Yes — the repository layout and existing architecture support this. The right target is a **single canonical frontend runtime** with a staged parity migration that explicitly captures custom features and legacy elements before deprecating duplicate shells.

## Canonical direction already established

- `apps/blackout-client` is the accepted canonical browser shell.
- `apps/blackout-web` and `apps/web` are consolidation targets.
- `_port` and `legacy/element` are retained as legacy/reference sources for parity checks.
- New modular feature work is intended to land in `apps/blackout-client` via feature registry/manifests.

## Scope that must be captured (custom + legacy)

To avoid feature loss, consolidation should track **all** behavior from these sources:

1. **Canonical custom shell (`apps/blackout-client`)**
   - Existing registry-driven feature modules and route/nav/settings contributions.
2. **Migration shell (`apps/blackout-web`)**
   - Any remaining UI, route, or workflow not yet represented in `apps/blackout-client`.
3. **Legacy browser shell (`apps/web`)**
   - Residual compatibility behavior and paths still referenced in tooling or docs.
4. **Governance-focused surface (`apps/blackout-gov`)**
   - Governance UX flows and related panels not yet integrated into canonical modules.
5. **Element-era references (`_port`, `legacy/element`)**
   - Historically-supported flows used for parity auditing and behavior verification.
6. **Platform wrappers (`blackout-desktop`, `blackout-mobile`)**
   - Native integrations that must remain available after web consolidation (deep links, notifications, lifecycle, sharing, etc.).

## Feature families to include in the parity inventory

A complete inventory should include, at minimum, these families:

- Core Matrix chat + room UX
- Governance
- Forum
- Dead-drop
- Moderation
- Steganography
- Auth/session/recovery/security flows
- Notifications and presence behaviors
- Media upload/viewer/camera/share/deeplink flows
- Settings and capability-gated administration surfaces

## “Clean read” target architecture

A clean consolidated frontend should satisfy all of the following:

- **Single route/nav/settings source of truth** in `apps/blackout-client` through registry aggregation.
- **Feature manifests per domain** (routes, nav entries, settings, capability declarations).
- **No direct backend coupling from UI components**; feature actions go through `@blackout/sdk`.
- **Shared contracts/events in `@blackout/protocol`** for cross-runtime consistency.
- **Shared primitives via workspace packages** (`@blackout/core`, `@blackout/ui`, `@blackout/design`).
- **Thin platform wrappers** (desktop/mobile) that host canonical web behavior rather than forking feature logic.

## Practical migration sequence (capture-first)

1. Freeze net-new feature development outside `apps/blackout-client`.
2. Build a parity matrix by crawling routes, navigation, and settings in:
   - `apps/blackout-client`
   - `apps/blackout-web`
   - `apps/web`
   - `apps/blackout-gov`
   - `_port` / `legacy/element`
3. Classify each item as:
   - already in canonical shell,
   - needs porting,
   - intentionally deprecated.
4. Port missing custom/legacy flows into canonical feature manifests/modules.
5. Move direct network/event typing into `@blackout/sdk` + `@blackout/protocol` where needed.
6. Validate wrapper parity (desktop/mobile native bridges still functioning with canonical web runtime).
7. Keep CI for legacy surfaces green during migration, then archive duplicate shells after signoff.

## Definition of done

Consolidation is complete only when:

- Every custom and legacy feature/element has a parity disposition (kept, ported, or deprecated with rationale).
- Canonical feature registry renders all approved routes/nav/settings entries.
- SDK/protocol boundaries are the default integration path.
- Desktop/mobile wrappers consume canonical web behavior without platform-specific feature forks.
- Duplicated frontends are removed from active development and clearly marked as archived.

## Risks and controls

- **Risk:** Silent feature loss during consolidation.
  - **Control:** Required parity matrix with explicit owner + disposition per item.
- **Risk:** Route drift across legacy shells during migration.
  - **Control:** CI route/registry checks and staged deprecation windows.
- **Risk:** Wrapper regressions after web merge.
  - **Control:** Desktop/mobile smoke tests for deep links, notifications, and lifecycle bridges.

## Recommendation

Proceed with consolidation and explicitly gate each milestone on the parity inventory so the final canonical frontend captures **all custom and legacy features/elements**, not just the currently modularized subset.
