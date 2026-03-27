# Dead Drop Matrix Appservice (Node.js)

This service implements dead drop room delivery semantics for `co.bmc.deaddrop` rooms.

## What it does

1. Listens for queued message ingest requests (`/ingest`) for dead drop-enabled rooms.
2. Stores queued messages in memory (replace with DB in production).
3. Flushes messages to rooms on schedule (`interval`/`cron`) or manual trigger (`/flush`).
4. Supports anonymized delivery via bot sender identity when `anonymize=true`.

## Event model

Room state event:

```json
{
  "type": "co.bmc.deaddrop",
  "content": {
    "enabled": true,
    "schedule": {
      "type": "interval",
      "intervalMinutes": 60,
      "cronExpression": "0 * * * *"
    },
    "anonymize": true,
    "maxQueueSize": 100,
    "retentionHours": 48
  }
}
```

Queue count event (published by appservice back to room state in production):

```json
{ "type": "co.bmc.deaddrop.queue", "content": { "queueCount": 18 } }
```

## HTTP API (prototype)

- `GET /health`
- `POST /configure` `{ roomId, config }`
- `POST /ingest` `{ roomId, sender, content, condition? }`
- `POST /flush` `{ roomId }`
- `POST /clear` `{ roomId }`

## Run

```bash
pnpm -C apps/deaddrop-appservice start
```

> Note: This prototype uses in-memory queue storage and logs message delivery. Production deployment should use persistent DB storage and Matrix AS transaction handling (`/_matrix/app/*`).
