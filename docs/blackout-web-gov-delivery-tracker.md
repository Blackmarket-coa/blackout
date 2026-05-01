# Blackout Web + Gov Delivery Tracker — RETIRED (2026-05-01)

This tracker has been retired. It tracked work against `apps/blackout-web/` and
`apps/blackout-gov/`, but `apps/blackout-web/` was archived to
`legacy/blackout-web/` on 2026-05-01 (canonical frontend is now
`@blackout/client` at `apps/blackout-client/`). Treat this file as historical
context only.

## Where the work lives now

- **Canonical frontend (replaces blackout-web):** `apps/blackout-client/` —
  feature-entrypoint, plugin, and registry work is the live migration target.
  The frontend-consolidation migration backlog
  (`docs/architecture/frontend-consolidation-migration-backlog.md`) tracks the
  remaining `ported` items that previously lived in blackout-web.
- **Governance UI (apps/blackout-gov):** still in flight. The tracker rows for
  delegation management, treasury view, governance analytics, and the
  simplified governance view captured below remain accurate and are the basis
  for the open governance workstream.
- **Theme parity (light_grove, amoled_night):** canonical theme tokens are in
  `packages/core/src/themes.ts`; component-level rollout in
  `apps/blackout-client/` is tracked as part of the frontend-consolidation
  backlog.

## Verification commands (no longer current)

The verification commands below are kept for archival reference and **no
longer apply** — `pnpm --filter @blackout/blackout-web ...` resolves to the
archived `legacy/blackout-web/` package, and the production deploy targets
`@blackout/client` via Tauri / Railway / Netlify. Use:

- `pnpm --filter @blackout/client run typecheck`
- `pnpm --filter @blackout/client test:unit`
- `pnpm --filter @blackout/client test:integration`
- `pnpm --filter @blackout/client run build`
- `pnpm --filter @blackout/blackout-gov lint|test|build:web` (governance app
  remains live)

## Archived snapshot (2026-04-05) — for history only

The original delivery tracker rows are preserved below. They reflect status
against the now-archived `apps/blackout-web/` shell and should not be cited as
current canonical-client status.

### BLACKOUT-WEB (apps/blackout-web → legacy/blackout-web, archived 2026-05-01)

| Task | Priority | Status (2026-04-05) | Notes |
| --- | --- | --- | --- |
| Copy Blackout_App source into `apps/blackout-web/` | P0 | Complete | Baseline UI source tree imported; archived 2026-05-01. |
| Update Matrix homeserver URL config | P0 | Complete | `VITE_MATRIX_HOMESERVER_URL` + `BLACKOUT_SERVER_URL` resolver retained in legacy shell. |
| DeepDive swipe-to-join feature verification | P1 | In progress | Carry-forward to `apps/blackout-client/` if/when ported from migration backlog. |
| Light Theme | P1 | Partial | Token in `packages/core/src/themes.ts`; canonical-client adoption tracked separately. |
| AMOLED Theme | P1 | Partial | Same as Light Theme. |
| Room type badges | P1 | Complete | Carried in legacy shell; canonical-client port pending if listed in migration backlog. |
| Order notification cards | P1 | Not started | Depends on FBM bridge; carry-forward to canonical client. |
| Delivery status inline | P2 | In progress | Carry-forward. |
| Voice/video call UI | P1 | Not started | Depends on VoIP/SFU wiring; carry-forward. |
| AI features (optional) | P2 | In progress | Carry-forward (optional). |
| Railway static deployment | P0 | Complete | Repointed to `@blackout/client` on 2026-05-01. |

### BLACKOUT-GOV (apps/blackout-gov) — still live

| Task | Priority | Status (2026-04-05) | Notes |
| --- | --- | --- | --- |
| Copy blackout repo source into `apps/blackout-gov/` | P0 | Complete | Baseline governance shell. |
| Update homeserver connection config | P0 | Complete | Same env wiring as web. |
| Proposal creation UI | P1 | Complete | Baseline form rendered. |
| Voting interface | P1 | Complete | Approve/block/abstain controls rendered. |
| Delegation management | P2 | In progress | Live data binding pending — tracked in active gov workstream. |
| Treasury view | P2 | In progress | State-event integration pending. |
| Meeting scheduler UI | P1 | Complete | Baseline form rendered. |
| Governance analytics | P2 | In progress | Telemetry wiring pending. |
| Simplified governance view | P1 | Not started | Depends on baseline gov features; tracked in active gov workstream. |
| Railway static deployment | P0 | Complete | `pnpm --filter @blackout/blackout-gov build:web` produces `dist/web/`. |
