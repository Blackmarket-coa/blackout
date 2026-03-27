# MIGRATION_INVENTORY.md

Phase 0 deliverable for the Blackout monorepo migration.

## 0. Preservation snapshot status

- Local archive branch created: `archive/element-web-fork`.
- Local tag created: `v0-element-fork`.
- Remote push steps are documented in `PHASE0_STATUS.md` and are blocked in this environment because no `origin` remote is configured.

## Audit artifacts

Detailed generated file lists are committed under `audit/phase0/` and can be regenerated with:

```bash
./scripts/migration/phase0_audit.sh
```

## Audit scope

This inventory was built from the current repository state and focuses on:

- custom product logic and event types (`im.blackout.*`, Blackout module code)
- reusable packages (`module_system/`, `packages/shared-components/`)
- deployment/package assets (`deploy/kubernetes/`, `debian/`)
- branding assets (`res/`)
- patch files (`patches/`)

## A. High-confidence BMC-specific code to port

These files contain explicit Blackout product behavior and should be migrated first.

| Current path | Evidence | Destination |
|---|---|---|
| `src/modules/blackout/featureFlags.ts` | Defines `feature_blackout_*` flags and legacy aliases. | `packages/core/src/types.ts` + feature gate utilities in `packages/core/src/client.ts` |
| `src/modules/blackout/navigation.ts` | Blackout-specific route IDs/labels. | `packages/ui/src/navigation/` |
| `src/modules/blackout/registerNavigation.tsx` | Registers Blackout module renderers. | `packages/ui/src/providers/BlackoutProvider.tsx` + app router adapters |
| `src/services/governance/ProposalEngine.ts` | Emits `im.blackout.governance.proposal` events. | `packages/core/src/governance/proposals.ts` + `packages/core/src/events.ts` |
| `src/services/governance/GovernanceStateStore.ts` | Reads/projections for `im.blackout.governance.*` events. | `packages/core/src/governance/*` + `packages/core/src/sync.ts` |
| `src/modules/governance/**` | Governance UI and proposal/vote user flows. | logic split: `packages/core/src/governance/*`; UI split: `packages/ui/src/components/governance/*` |
| `src/services/storage/ipfsRoomEvents.ts` | Defines `im.blackout.ipfs.*` Matrix event constants. | `packages/core/src/events.ts` + `packages/core/src/types.ts` |
| `src/p2p/**` | Blackout-specific signal event/payload store/mesh transport. | `packages/core/src/sync.ts`, `packages/core/src/federation.ts` (or deferred experimental package) |
| `src/ContentMessages.ts` (Blackout call sites) | Integrates attachment pipeline with Blackout signal events. | shared send pipeline in `packages/core/src/events.ts` |
| `src/services/telemetry/BlackoutTelemetry.ts` | Product telemetry model for module adoption/errors. | `packages/core/src/types.ts` + app telemetry adapters |
| `src/modules/education/**` | Education module feature UI. | `packages/ui/src/components/communities/education/*` |
| `src/modules/mutualAid/**` | Mutual-aid module feature UI. | `packages/ui/src/components/communities/mutual-aid/*` |
| `src/modules/townhall/**` | Townhall module shell/UI. | `packages/ui/src/components/communities/townhall/*` |
| `src/settings/Settings.tsx` (Blackout entries) | Feature toggles/settings wiring. | `packages/ui/src/providers/BlackoutProvider.tsx` + app settings screens |
| `src/i18n/strings/en_EN.json` (Blackout keys only) | Blackout module/localized labels. | `packages/ui/src/i18n/en_EN.json` (or shared locale package) |
| `src/vector/mobile_guide/mobile-apps.ts` | Blackout mobile app metadata and deep links. | `apps/mobile/src/platform/mobileApps.ts` |
| `src/vector/index.html` | Brand title/application meta for Blackout. | `apps/web/public/index.html` |

## B. Must-preserve package areas

### B1) `module_system/` (PORT ALL)

| Current path | Purpose | Destination |
|---|---|---|
| `module_system/BuildConfig.ts` | Build module manifest/config parser. | `packages/config/src/moduleBuildConfig.ts` |
| `module_system/installer.ts` | Module install + compatibility logic. | `packages/config/src/moduleInstaller.ts` (adapt to pnpm workspace tooling) |
| `module_system/scripts/install.ts` | CLI entrypoint for installer flow. | `scripts/module/install.ts` or `packages/config/bin/install-modules.ts` |

### B2) `packages/shared-components/` (PORT ALL, rewrite for RN primitives)

Port all source under `packages/shared-components/src/**`, with component-level rewrite from DOM primitives to `react-native` primitives and `react-native-web` compatibility.

Suggested destination buckets:

- room list + event tiles -> `packages/ui/src/components/channels/*`, `packages/ui/src/components/chat/*`
- crypto verification views -> `packages/ui/src/components/shared/*` + `apps/mobile/src/screens/verification/*`
- hooks/viewmodel utilities -> `packages/ui/src/hooks/*`
- i18n utilities -> `packages/ui/src/i18n/*`

## C. Branding assets (selective extraction)

| Current path | Action | Destination |
|---|---|---|
| `res/fonts/**` | Keep only fonts used by Blackout brand identity. | `packages/design/src/fonts/` |
| `res/img/**`, `res/themes/**`, brand icons/logos | Keep Blackout-owned brand assets only. | `packages/design/src/icons/` + app assets |
| `res/css/**` | Do not port structural Element CSS. Extract tokens only (colors, typography, spacing, radii, shadows). | `packages/design/src/tokens.ts`, `packages/design/src/theme.ts` |

## D. Deploy/packaging to keep and adapt

| Current path | Action | Destination |
|---|---|---|
| `deploy/kubernetes/**` | Keep and adapt image/release refs to monorepo apps. | `deploy/kubernetes/**` |
| `debian/**` | Keep packaging baseline for blackbox/desktop target. | `deploy/debian/**` |
| `docker/**` + root `Dockerfile` | Replace with monorepo web build container strategy. | `deploy/docker/**` |

## E. Patch triage (`patches/`)

| Patch file | Triage result | Migration action |
|---|---|---|
| `patches/@matrix-org+react-sdk-module-api+2.5.0.patch` | Potentially product-relevant module API behavior. | Re-implement behavior in first-party code; avoid runtime patching in new workspace. |
| `patches/@vector-im+matrix-wysiwyg+2.40.0.patch` | Editor stack compatibility workaround. | Re-evaluate once web composer stack is finalized. |
| `patches/linkify-html+4.3.2.patch` | Message rendering/linkification behavior tweak. | Port only if user-visible behavior is required. |
| `patches/await-lock+3.0.0.patch` | dependency workaround | likely discard |
| `patches/jest-fixed-jsdom+0.0.11.patch` | test-environment workaround | discard under new testing strategy |
| `patches/jsdom+26.1.0.patch` | test-environment workaround | discard unless reproducible in new stack |
| `patches/react-blurhash+0.3.0.patch` | dependency typing/runtime workaround | keep only if blurhash remains in UI stack |

## F. Explicit discard candidates (Element-upstream-heavy)

- `src/**` except items in sections A and B.
- `element.io/**`.
- existing Playwright strategy (`playwright/**`) unless test assets are intentionally reused.
- legacy root webpack/babel/jest wiring once Turborepo migration starts.

## G. Phase-ordered port plan from this inventory

1. **Core first**: move event constants, governance engines, p2p/IPFS/event typing into `@blackout/core`.
2. **Design tokens**: extract brand palette/fonts/tokens from `res/` into `@blackout/design`.
3. **UI rebuild**: rewrite `packages/shared-components/src/**` + module UIs in `@blackout/ui` using RN primitives.
4. **App shells**: wire `apps/web`, `apps/mobile`, `apps/desktop` to shared packages.
5. **Deploy adaptation**: update `deploy/kubernetes`, `deploy/docker`, `deploy/debian` for monorepo build outputs.

## H. Open validation items (manual follow-up)

- Confirm whether any additional BMC-specific logic exists in non-obvious upstream files that do not include `blackout` identifiers.
- Confirm exact subset of `res/` assets that are legally/brand-approved for long-term use.
- Confirm whether any current `patches/` contain security-critical behavior before final discard.
