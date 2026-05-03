# Dead Drop Matrix Appservice (Node.js)

This service is the Matrix-side delivery layer for `co.bmc.deaddrop` rooms.
It exposes two APIs:

## v1 (opaque-ciphertext) API

The new dead-drop wire protocol. The server stores only opaque envelopes
(`{ v, suite, pad, dropId, clue, ek, nonce, ct, expiresAt }`) and rejects
any submission that contains additional fields.

The three endpoints intentionally accept and return identical-shape JSON
to defeat traffic-shape analysis (cf. SecureDrop Protocol).

- `POST /v1/deaddrop/send`  `{ roomId, envelope }` → `{ ok, dropId, clue }`
- `POST /v1/deaddrop/fetch` `{ roomId, clue, decoyCount? }` → `{ envelopes, decoyCount }`
- `POST /v1/deaddrop/open`  `{ roomId, clue }` → `{ ok, deleted }`

Decoys are generated server-side from a per-room HKDF seed so they are
byte-length and structurally indistinguishable from real envelopes for
the same room/bucket. Recipients silently fail to decrypt them. The
caller passes `decoyCount` based on its tier (paid → 9, free → 0).

## Legacy queue API

Retained for the existing scheduled-flush flow:

- `GET /health`
- `POST /configure` `{ roomId, config }`
- `POST /ingest`    `{ roomId, sender, content, condition? }`
- `POST /flush`     `{ roomId }`
- `POST /clear`     `{ roomId }`

## Persistence

JSON file at `process.env.BLACKOUT_DEADDROP_DB_FILE` (default
`.blackout/data/deaddrop.json`). Stores opaque envelopes keyed by clue and
per-room decoy seeds. Set `BLACKOUT_DEADDROP_DB_MODE=memory` for tests.

## Run

```bash
pnpm -C apps/deaddrop-appservice start
pnpm -C apps/deaddrop-appservice test
```
