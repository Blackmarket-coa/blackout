# Dead Drop Appservice Runbook

Operational procedures for the [`apps/deaddrop-appservice/`](../../apps/deaddrop-appservice/)
service. Foundation milestone deliverable per
[`AGGRESSIVE_OPERATIONS_GUIDE.md` §7.2](../AGGRESSIVE_OPERATIONS_GUIDE.md):
the service ships in the repository but has had no operational runbook.

This runbook covers what the service does, how to run it, where its state
lives, common failure modes, restart procedure, and escalation. It does not
cover the cryptographic protocol design; for that, see
[`apps/deaddrop-appservice/README.md`](../../apps/deaddrop-appservice/README.md).

## What it does

A Node.js HTTP server that exposes the `co.bmc.deaddrop` wire protocol used
by the Blackout SDK to deliver opaque-ciphertext envelopes between
participants in a dead-drop conversation. Two API generations co-exist:

- **v1 (opaque-ciphertext)**: `POST /v1/deaddrop/{send,fetch,open}`. The
  server stores only opaque envelopes and returns identical-shape JSON
  across endpoints to defeat traffic-shape analysis. Decoys are generated
  per-room from an HKDF seed.
- **Legacy queue API**: `GET /health` plus `POST /{configure,ingest,flush,clear}`.
  Retained for the existing scheduled-flush flow.

Source of truth: [`apps/deaddrop-appservice/src/index.mjs`](../../apps/deaddrop-appservice/src/index.mjs).

This service is *separate* from the Matrix appservice transactions endpoint
in [`packages/api/src/routes/matrixAppservice.ts`](../../packages/api/src/routes/matrixAppservice.ts)
(registered via [`deploy/matrix-appservice/registration.yaml`](../../deploy/matrix-appservice/registration.yaml)).
Do not confuse the two; they share the word "appservice" but have
different ownership and lifecycle.

## Configuration

Environment variables read by `src/index.mjs`:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP listen port |
| `BLACKOUT_DEADDROP_DECOYS` | `0` | Default decoy count (free tier 0, paid tier 9) |
| `BLACKOUT_DEADDROP_SWEEP_MS` | `60000` | Periodic expired-drop sweep interval |
| `BLACKOUT_DEADDROP_DB_FILE` | `.blackout/data/deaddrop.json` | JSON file persistence path |
| `BLACKOUT_DEADDROP_DB_MODE` | unset | Set to `memory` for tests; persistent JSON otherwise |
| `DEAD_DROP_BOT_USER_ID` | `@deaddrop-bot:example.org` | Sender used when room config has `anonymize: true` |

The service has no runtime secrets of its own. The encryption is end-to-end
between SDK clients; the server only sees opaque envelopes.

## Persistent state

A single JSON file at `BLACKOUT_DEADDROP_DB_FILE`. Contents:

- opaque envelopes keyed by `clue` per room
- per-room HKDF decoy seeds
- legacy-queue per-room queues and configs

The file is small (envelopes are size-bounded by the wire protocol; queues
are length-capped via `maxQueueSize`). Treat it as **critical** for
short-term continuity (in-flight drops) but **not critical** for long-term
recovery — the SDK retries undelivered drops on the client side.

Backup posture:

- Include the file path in the host-side backup set if backups are running
  on the primary host.
- The file is safe to truncate during a clean restart (drops in flight at
  the moment of truncation are lost; clients resend).

## Run

Local development:

```bash
pnpm -C apps/deaddrop-appservice dev   # node --watch
```

Production-style:

```bash
pnpm -C apps/deaddrop-appservice start
```

Tests:

```bash
pnpm -C apps/deaddrop-appservice test
```

The service is plain Node 20+. No build step.

## Health checks

- `GET /health` returns 200 when the HTTP listener is up. The endpoint does
  not validate the persistence backend; for that, observe successful
  `POST /v1/deaddrop/send` traffic in logs.
- A useful smoke test is a no-op `POST /configure` with `{ enabled: false }`
  followed by reading the JSON DB file and confirming the room key is
  present.

## Restart procedure

- [ ] Confirm there is no in-progress flush (legacy API). Either wait for
      the scheduled flush window to pass, or accept that any queued items
      will be redelivered after restart since the queue is on disk.
- [ ] Stop the service (SIGTERM is graceful; the HTTP server closes existing
      connections, the periodic sweep timer is cleared).
- [ ] Start the service via the same launcher (systemd unit, Docker compose
      service, or `pnpm start` under a process manager).
- [ ] Confirm `GET /health` returns 200 within a few seconds of start.
- [ ] Confirm the JSON DB file is readable and has the expected room keys.

If the service refuses to start because the JSON DB file is corrupt:

- [ ] Move the file aside (`mv $BLACKOUT_DEADDROP_DB_FILE $BLACKOUT_DEADDROP_DB_FILE.bak`).
- [ ] Restart; the service initialises an empty store.
- [ ] In-flight drops in the moved-aside file are lost; clients will resend.
- [ ] Investigate the corrupt file out-of-band (likely cause: the host ran
      out of disk during a write).

## Common failure modes

| Symptom | Likely cause | First action |
|---|---|---|
| `POST /v1/deaddrop/send` returns 400 with "envelope shape" error | Client sent extra fields; the server enforces opaque shape. | Update client SDK; do not loosen server validation. |
| Memory growth over time | Sweep timer not running, or expired drops have unrealistic `expiresAt`. | Restart; if recurs, check `BLACKOUT_DEADDROP_SWEEP_MS` is not absurd. |
| All fetches return zero envelopes | Persistence file is missing or unwritable. | `ls -la $BLACKOUT_DEADDROP_DB_FILE`; check disk space and permissions. |
| `BLACKOUT_DEADDROP_DB_MODE=memory` set in production | Tests-only mode leaked to prod. | Unset and restart; data since the last persistent run is lost (clients resend). |
| Decoy count looks wrong | `BLACKOUT_DEADDROP_DECOYS` default of 0 in effect for paid users | Confirm SDK is passing `decoyCount` per request; the server-side default is just a fallback. |

## Escalation

- Any cryptographic concern (envelope schema doubts, key handling) escalates
  to the maintainer immediately. The service stores only opaque ciphertext;
  any apparent leak of structured data is a bug.
- Host-level disk-full conditions affecting the JSON DB file fall under
  [`../operations/oncall_escalation_tree.md`](../operations/oncall_escalation_tree.md).
- If the service must be taken down for an extended window, communicate per
  the comms posture in
  [`../operations/operator_onboarding_pack.md`](../operations/operator_onboarding_pack.md).

## Cross-references

- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §7.2](../AGGRESSIVE_OPERATIONS_GUIDE.md) — runbook list
- [`apps/deaddrop-appservice/README.md`](../../apps/deaddrop-appservice/README.md) — protocol detail
- [`../../packages/api/src/routes/matrixAppservice.ts`](../../packages/api/src/routes/matrixAppservice.ts) — the *other* appservice surface; not this one
- [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md) — host-level SPOFs that affect this service
- [`../operations/oncall_escalation_tree.md`](../operations/oncall_escalation_tree.md) — escalation
