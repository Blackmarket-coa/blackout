# Blackout Web + Gov Delivery Tracker

Snapshot date: 2026-03-17

> Active execution plan: `docs/active-workstreams-2026-04-05.md` (created 2026-04-05) for prioritized sequencing and exit criteria.

## BLACKOUT-WEB (apps/blackout-web)

| Task | Priority | Status | Notes |
| --- | --- | --- | --- |
| Copy Blackout_App source into `apps/blackout-web/` | P0 | In progress | App workspace scaffold created with `src/`, `public/`, `config/`; full Cinny source import pending. |
| Update Matrix homeserver URL config | P0 | Complete | `VITE_MATRIX_HOMESERVER_URL` + `BLACKOUT_SERVER_URL` supported with `railway:<service>` shorthand resolver. |
| DeepDive swipe-to-join feature verification | P0 | Not started | Requires imported Cinny room discovery UI + Synapse connectivity validation. |
| Solarpunk theme | P1 | Not started | Depends on complete UI source import. |
| Room type badges | P1 | Not started | Depends on room-template metadata ingestion. |
| Order notification cards | P1 | Not started | Depends on FBM bridge events in client timeline renderer. |
| Delivery status inline | P2 | Not started | Depends on Blackstar bridge event schema integration. |
| Voice/video call UI | P1 | Not started | Depends on VoIP wiring + SFU/townhall bridge. |
| AI features (optional) | P2 | Not started | Depends on `OLLAMA_URL` bridge service. |
| Railway static deployment | P0 | In progress | Static-friendly app shell and env contract present; production Vite build pipeline pending source import. |

## BLACKOUT-GOV (apps/blackout-gov)

| Task | Priority | Status | Notes |
| --- | --- | --- | --- |
| Copy blackout repo source into `apps/blackout-gov/` | P0 | In progress | App workspace scaffold created with `src/`, `public/`, `config/`; full Element governance source import pending. |
| Update homeserver connection config | P0 | Complete | `VITE_MATRIX_HOMESERVER_URL` + `BLACKOUT_SERVER_URL` supported with `railway:<service>` shorthand resolver. |
| Proposal creation UI | P1 | Not started | Depends on importing governance UI foundation. |
| Voting interface | P1 | Not started | Depends on proposal room-state wiring. |
| Delegation management | P2 | Not started | Depends on DelegatedVotingEngine client bindings. |
| Treasury view | P2 | Not started | Depends on treasury state-event contracts. |
| Meeting scheduler UI | P1 | Not started | Depends on scheduler APIs and agenda generation integration. |
| Governance analytics | P2 | Not started | Depends on proposal + participation telemetry pipelines. |
| Simplified governance view | P1 | Not started | Depends on baseline governance features implementation. |
| Railway static deployment | P0 | In progress | Static-friendly app shell and env contract present; production Vite build pipeline pending source import. |

## Verification

- `pnpm lint`
- `pnpm test`
- `pnpm build`
