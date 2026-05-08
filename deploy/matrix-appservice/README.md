# Synapse Appservice — Blackout API

Synapse appservice registration stub for the Blackout API's
`PUT /_matrix/app/v1/transactions/:txnId` endpoint
(`packages/api/src/routes/matrixAppservice.ts`).

## What it does

When Synapse, Conduit, or Dendrite receives events in rooms that the
appservice has claimed (via the `namespaces` regexes), it batches them
into transactions and POSTs them to `url`. The Blackout API
authenticates the homeserver with `hs_token` and dedupes by `txnId`.
For each `m.room.message` event in the batch, the appservice fans the
message out to the linked source platform via the outbound chat router
(Twitch IRC, YouTube live chat, Kick, etc.).

## Install

1. Generate two 32-byte random hex tokens (one per direction) and put
   them in your secret store:

   ```sh
   export MATRIX_APPSERVICE_AS_TOKEN=$(openssl rand -hex 32)
   export MATRIX_APPSERVICE_HS_TOKEN=$(openssl rand -hex 32)
   ```

   - `MATRIX_APPSERVICE_HS_TOKEN` — homeserver → appservice. The
     Blackout API authenticates inbound transactions against this.
   - `MATRIX_APPSERVICE_AS_TOKEN` — appservice → homeserver. Reserved
     for future use (the current route is receive-only).

2. Render `registration.yaml` with the tokens substituted in:

   ```sh
   envsubst < registration.yaml \
     > /etc/synapse/appservices/blackout.yaml
   ```

3. Add the rendered path to Synapse's `homeserver.yaml`:

   ```yaml
   app_service_config_files:
     - /etc/synapse/appservices/blackout.yaml
   ```

4. Set `MATRIX_APPSERVICE_HS_TOKEN` in the Blackout API's environment
   (the same value as in step 1) and restart both Synapse and the
   Blackout API.

## Verify

```sh
curl -X PUT \
  -H "Authorization: Bearer ${MATRIX_APPSERVICE_HS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"events":[]}' \
  http://blackout-api:3000/_matrix/app/v1/transactions/test1
```

Expected response: HTTP 200, body `{}`. A 403 means the `hs_token`
disagreement; a 503 means the API can't read the env var.

## Namespace conventions

- `@blackout_*` users — virtual users created by Blackout bridges
  (e.g., `@blackout_twitch_alice:example.org` for a Twitch chatter
  named `alice`).
- `#blackout_*` aliases — virtual room aliases. Reserved for future
  use; the appservice does not currently create or claim rooms.
- Rooms — empty namespace. Events arrive via federation or other
  bridge invites; the appservice consumes them but does not claim
  ownership.
