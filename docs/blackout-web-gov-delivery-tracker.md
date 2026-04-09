# Blackout Web + Gov Delivery Tracker

Snapshot date: 2026-04-05

> Active execution plan: `docs/active-workstreams-2026-04-05.md` (created 2026-04-05) for prioritized sequencing and exit criteria.

## BLACKOUT-WEB (apps/blackout-web)

| Task | Priority | Status | Notes |
| --- | --- | --- | --- |
| Copy Blackout_App source into `apps/blackout-web/` | P0 | Complete | Baseline UI source tree now present in `src/` (components, services, settings, tests) and builds via Vite entrypoint. |
| Update Matrix homeserver URL config | P0 | Complete | `VITE_MATRIX_HOMESERVER_URL` + `BLACKOUT_SERVER_URL` supported with `railway:<service>` shorthand resolver. |
| DeepDive swipe-to-join feature verification | P1 | In progress | Swipe controls are present in `DeepDivePanel` with unit coverage; end-to-end room-join verification against Synapse still pending. |
| Light Theme | P1 | Partial | Token definition is present via canonical theme catalog entry `light_grove` in `packages/core/src/themes.ts`; component-level parity and full UI exposure remain in progress. |
| AMOLED Theme | P1 | Partial | Token definition is present via canonical theme catalog entry `amoled_night` in `packages/core/src/themes.ts`; component-level parity and full UI exposure remain in progress. |
| Room type badges | P1 | Complete | Channel sidebar renders room-kind classes and governance badge variants with unit coverage. |
| Order notification cards | P1 | Not started | Depends on FBM bridge events in client timeline renderer. |
| Delivery status inline | P2 | In progress | Message list now renders inline delivery state badges (`sending`, `delivered`, `failed`) with unit test coverage; bridge-sourced status wiring still pending. |
| Voice/video call UI | P1 | Not started | Depends on VoIP wiring + SFU/townhall bridge. |
| AI features (optional) | P2 | In progress | DeepDive panel now supports optional AI recommendation explanation affordances behind `aiRecommendationsEnabled`; model-service integration remains optional/future. |
| Railway static deployment | P0 | Complete | Production static build pipeline validated via `pnpm --filter @blackout/blackout-web build:web` producing `dist/` artifact. |


### Theme rollout detail (BLACKOUT-WEB)

| Theme | Token-definition status | Component coverage status | Runtime toggle/UI exposure status | Evidence |
| --- | --- | --- | --- | --- |
| Light Theme (`light_grove`) | Complete | Partial | Partial | Canonical ID is defined in `packages/core/src/themes.ts`; rollout parity tests exist, while broader component-by-component adoption is still underway. |
| AMOLED Theme (`amoled_night`) | Complete | Partial | Partial | Canonical ID is defined in `packages/core/src/themes.ts`; rollout parity tests exist, while broader component-by-component adoption is still underway. |

## BLACKOUT-GOV (apps/blackout-gov)

| Task | Priority | Status | Notes |
| --- | --- | --- | --- |
| Copy blackout repo source into `apps/blackout-gov/` | P0 | Complete | Baseline governance UI shell imported (`src/app.ts`, `src/main.ts`, styles) with Vite web entrypoint and runtime config wiring. |
| Update homeserver connection config | P0 | Complete | `VITE_MATRIX_HOMESERVER_URL` + `BLACKOUT_SERVER_URL` supported with `railway:<service>` shorthand resolver. |
| Proposal creation UI | P1 | Complete | Baseline proposal creation form is now rendered in governance shell. |
| Voting interface | P1 | Complete | Baseline approve/block/abstain controls are now rendered in governance shell. |
| Delegation management | P2 | In progress | Delegation metrics are visible in baseline P2 operations surface pending live data binding. |
| Treasury view | P2 | In progress | Treasury balance card is present in baseline operations surface pending state-event integration. |
| Meeting scheduler UI | P1 | Complete | Baseline meeting scheduler form is now rendered in governance shell. |
| Governance analytics | P2 | In progress | Participation and active-proposal metrics are visible in baseline operations surface pending telemetry wiring. |
| Simplified governance view | P1 | Not started | Depends on baseline governance features implementation. |
| Railway static deployment | P0 | Complete | Production static build pipeline validated via `pnpm --filter @blackout/blackout-gov build:web` producing `dist/web/` artifact. |

## Verification

- `pnpm --filter @blackout/blackout-web lint`
- `pnpm --filter @blackout/blackout-web test`
- `pnpm --filter @blackout/blackout-web build:web`
- `pnpm --filter @blackout/blackout-gov lint`
- `pnpm --filter @blackout/blackout-gov test`
- `pnpm --filter @blackout/blackout-gov build:web`
- `pnpm --filter @blackout/blackout-web exec vitest run tests/unit/config.test.ts`
- `pnpm --filter @blackout/blackout-web exec vitest run tests/unit/deepdive-panel.test.ts tests/unit/channel-sidebar.test.ts tests/unit/theme-parity.test.ts tests/unit/message-item.test.ts`
- `pnpm --filter @blackout/blackout-gov exec vitest run tests/unit/config.test.ts`
- `pnpm --filter @blackout/blackout-gov exec vitest run tests/unit/app.test.ts`

Verification snapshot (2026-04-05):

- `@blackout/blackout-gov`: lint ✅, test ✅, build:web ✅.
- `@blackout/blackout-web`: build:web ✅; full lint/test remain failing due pre-existing baseline issues in `src/app.ts` and current integration test suite. Config wiring validation passes via targeted unit test.
