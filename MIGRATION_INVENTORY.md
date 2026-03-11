# MIGRATION_INVENTORY

This inventory captures the Blackout-specific code/assets in the current Element Web fork and maps them to the target monorepo layout from the migration plan.

## Scope and audit method

- Searched for Blackout-specific identifiers (`Blackout`, `blackout`, `im.blackout`, `m.blackout`) across key directories.
- Reviewed deploy and packaging directories that should be preserved/adapted.
- Reviewed `module_system/` and `patches/` for portability guidance.

## Port now (BMC-specific)

| Current path | Why it matters | Destination in target monorepo |
|---|---|---|
| `src/modules/blackout/featureFlags.ts` | Feature flags that gate Blackout modules. | `packages/core/src/types.ts` (flag types) + `packages/core/src/client.ts` (feature gating hooks) |
| `src/modules/blackout/navigation.ts` | Blackout module navigation model/routes. | `packages/ui/src/navigation/` helpers + per-app route wiring |
| `src/modules/blackout/registerNavigation.tsx` | Registers Blackout navigation renderers. | `packages/ui/src/providers/BlackoutProvider.tsx` + `apps/web/src/platform/routing` |
| `src/modules/governance/**` | Governance UI and interaction flow. | Logic to `packages/core/src/governance/*`, UI to `packages/ui/src/components/governance/*` |
| `src/services/governance/ProposalEngine.ts` | Proposal creation/event emission (`im.blackout.governance.proposal`). | `packages/core/src/governance/proposals.ts` + `packages/core/src/events.ts` |
| `src/services/governance/GovernanceStateStore.ts` | Governance event projection/state. | `packages/core/src/governance/*` + `packages/core/src/sync.ts` |
| `src/modules/education/**` | Blackout education module UI. | `packages/ui/src/components/communities/` (or dedicated module area) |
| `src/modules/mutualAid/**` | Mutual aid module UI. | `packages/ui/src/components/communities/` (or dedicated module area) |
| `src/modules/townhall/**` | Townhall module shell/UI. | `packages/ui/src/components/communities/` / voice surfaces |
| `src/services/telemetry/BlackoutTelemetry.ts` | Custom telemetry events for module adoption/errors. | `packages/core/src/types.ts` + app-level telemetry adapters |
| `src/services/storage/ipfsRoomEvents.ts` | Custom Matrix event types for IPFS-linked assets. | `packages/core/src/events.ts` + `packages/core/src/types.ts` |
| `src/p2p/**` | Blackout P2P signaling/data-plane experiments and storage keys. | `packages/core/src/sync.ts` + `packages/core/src/federation.ts` (or deferred feature package) |
| `src/ContentMessages.ts` (Blackout-specific callsites) | Attachment send pipeline hooks into P2P signal events. | `packages/core/src/events.ts` + `packages/core/src/sync.ts` integration points |
| `src/components/views/rooms/SendMessageComposer.tsx` (Blackout hooks) | Composer integration with Blackout send path. | `packages/ui/src/components/chat/MessageInput.tsx` |
| `src/components/views/rooms/EditMessageComposer.tsx` (Blackout hooks) | Edit composer integration with Blackout send path. | `packages/ui/src/components/chat/MessageInput.tsx` |
| `src/components/views/rooms/VoiceRecordComposerTile.tsx` (Blackout hooks) | Voice composer behavior touched by custom logic. | `packages/ui/src/components/voice/*` + mobile/desktop platform wrappers |
| `src/components/views/rooms/wysiwyg_composer/utils/message.ts` (Blackout hooks) | Message formatting path with Blackout behavior. | `packages/ui/src/components/chat/*` shared formatter utilities |
| `src/components/structures/HomePage.tsx` | Home surface wiring includes Blackout module entry points. | `packages/ui/src/components/communities/*` + app wrappers |
| `src/settings/Settings.tsx` | Feature flags/settings toggles for Blackout capabilities. | `packages/ui/src/providers/BlackoutProvider.tsx` + app-specific settings screens |
| `src/i18n/strings/en_EN.json` (Blackout keys) | Translation keys for module labels and flows. | `packages/ui/src/i18n/` (or shared locale package) |
| `src/vector/index.html` | Product branding (title/meta). | `apps/web/public/index.html` |
| `src/vector/mobile_guide/mobile-apps.ts` | Blackout mobile app metadata/deep links. | `apps/mobile/src/platform/` + docs |
| `deploy/kubernetes/phase6/postgres-dr-baseline.yaml` | Existing DR baseline config with Blackout naming. | `deploy/kubernetes/` (adapt only) |
| `deploy/kubernetes/phase6/second-region-dr-footprint.yaml` | Multi-region DR footprint tied to blackout repo/image flow. | `deploy/kubernetes/` (adapt only) |
| `debian/*` | Debian packaging baseline for blackbox/desktop deployment. | `deploy/debian/` |

## Port selectively (branding/theme assets)

| Current path | Action | Destination |
|---|---|---|
| `res/fonts/**` | Keep font families actually used by Blackout brand. | `packages/design/src/fonts/` |
| `res/img/**` + icon/logo assets | Keep Blackout logos/icons only. | `packages/design/src/icons/` + app assets |
| `res/css/**` | Extract only Blackout-specific token overrides; do not port Element structural CSS wholesale. | `packages/design/src/tokens.ts` + `packages/design/src/theme.ts` |

## Review before porting (`patches/`)

| Patch file | Initial classification | Planned action |
|---|---|---|
| `patches/@matrix-org+react-sdk-module-api+2.5.0.patch` | Potentially relevant to module API compatibility. | Re-evaluate against monorepo package boundaries; port behavior, not patch-file itself. |
| `patches/@vector-im+matrix-wysiwyg+2.40.0.patch` | Likely editor/tooling compatibility. | Re-check after selecting web editor stack. |
| `patches/await-lock+3.0.0.patch` | Upstream dependency patch. | Discard unless reproducible bug exists in new stack. |
| `patches/jest-fixed-jsdom+0.0.11.patch` | Test runtime workaround. | Discard; replace with new test strategy. |
| `patches/jsdom+26.1.0.patch` | Test/runtime workaround. | Discard unless needed by retained tests. |
| `patches/linkify-html+4.3.2.patch` | Rendering/linkification tweak. | Re-implement in shared formatter if behavior is product-critical. |
| `patches/react-blurhash+0.3.0.patch` | Type/runtime fix for dependency. | Reassess only if blurhash stays in UI stack. |

## Likely discard (Element-upstream-heavy)

- Most of `src/` outside the files listed above.
- `playwright/` and existing Element E2E strategy.
- `element.io/` environment and upstream config.
- Legacy root build toolchain (webpack/babel scripts) once Turborepo scaffold lands.

## Suggested migration sequence from this inventory

1. Move governance, IPFS event typing, and feature-flag/domain logic into `@blackout/core` first.
2. Rebuild module UIs (`governance`, `education`, `mutual-aid`, `townhall`) in `@blackout/ui` using RN primitives.
3. Extract branding tokens/fonts/icons from `res/` into `@blackout/design`.
4. Adapt `deploy/kubernetes` and `debian` into `deploy/` structure after first green monorepo build.
