# Blackout Web + Gov Delivery Tracker

Snapshot date: 2026-04-05

> Active execution plan: `docs/active-workstreams-2026-04-05.md` (created 2026-04-05) for prioritized sequencing and exit criteria.

## BLACKOUT-WEB (apps/blackout-web)

| Task | Priority | Status | Notes |
| --- | --- | --- | --- |
| Copy Blackout_App source into `apps/blackout-web/` | P0 | Complete | Baseline UI source tree now present in `src/` (components, services, settings, tests) and builds via Vite entrypoint. |
| Update Matrix homeserver URL config | P0 | Complete | `VITE_MATRIX_HOMESERVER_URL` + `BLACKOUT_SERVER_URL` supported with `railway:<service>` shorthand resolver. |
| DeepDive swipe-to-join feature verification | P0 | Not started | Requires imported Cinny room discovery UI + Synapse connectivity validation. |
| Solarpunk theme | P1 | Not started | Depends on complete UI source import. |
| Room type badges | P1 | Not started | Depends on room-template metadata ingestion. |
| Order notification cards | P1 | Not started | Depends on FBM bridge events in client timeline renderer. |
| Delivery status inline | P2 | Not started | Depends on Blackstar bridge event schema integration. |
| Voice/video call UI | P1 | Not started | Depends on VoIP wiring + SFU/townhall bridge. |
| AI features (optional) | P2 | Not started | Depends on `OLLAMA_URL` bridge service. |
| Railway static deployment | P0 | Complete | Production static build pipeline validated via `pnpm --filter @blackout/blackout-web build:web` producing `dist/` artifact. |

## BLACKOUT-GOV (apps/blackout-gov)

| Task | Priority | Status | Notes |
| --- | --- | --- | --- |
| Copy blackout repo source into `apps/blackout-gov/` | P0 | Complete | Baseline governance UI shell imported (`src/app.ts`, `src/main.ts`, styles) with Vite web entrypoint and runtime config wiring. |
| Update homeserver connection config | P0 | Complete | `VITE_MATRIX_HOMESERVER_URL` + `BLACKOUT_SERVER_URL` supported with `railway:<service>` shorthand resolver. |
| Proposal creation UI | P1 | Not started | Depends on importing governance UI foundation. |
| Voting interface | P1 | Not started | Depends on proposal room-state wiring. |
| Delegation management | P2 | Not started | Depends on DelegatedVotingEngine client bindings. |
| Treasury view | P2 | Not started | Depends on treasury state-event contracts. |
| Meeting scheduler UI | P1 | Not started | Depends on scheduler APIs and agenda generation integration. |
| Governance analytics | P2 | Not started | Depends on proposal + participation telemetry pipelines. |
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
- `pnpm --filter @blackout/blackout-gov exec vitest run tests/unit/config.test.ts`

Verification snapshot (2026-04-05):

- `@blackout/blackout-gov`: lint ✅, test ✅, build:web ✅.
- `@blackout/blackout-web`: build:web ✅; full lint/test remain failing due pre-existing baseline issues in `src/app.ts` and current integration test suite. Config wiring validation passes via targeted unit test.
