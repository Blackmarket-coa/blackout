# Enable Matrix registration (invite-token mode)

> Live homeserver: `matrix.theblackout.app`.
> Template that backs it: `infra/single-server-baseline/synapse/`.

Use this runbook to turn signup on when the client shows *"Account
creation is disabled on matrix.theblackout.app. Contact your server
admin."* The recommended posture is **invite-only via one-time tokens**
issued by an admin through Synapse's built-in Admin API. No
matrix-registration sidecar required.

## 1. Flip the env

On the Synapse host, edit `infra/single-server-baseline/.env`:

```
SYNAPSE_ENABLE_REGISTRATION=true
SYNAPSE_ENABLE_REGISTRATION_WITHOUT_VERIFICATION=true
SYNAPSE_REGISTRATION_REQUIRES_TOKEN=true
```

The third key is new. If it isn't present in your `.env`, copy the
value from `.env.example`.

## 2. Safety check before re-rendering

`render-homeserver.sh` will refuse without `--force`, because if any
secret in `.env` changed since the last render, re-rendering would
rotate the macaroon key and log every user out. Confirm none did:

```
diff <(grep -E '^(SYNAPSE_REGISTRATION_SHARED_SECRET|SYNAPSE_MACAROON_SECRET_KEY|SYNAPSE_FORM_SECRET)=' .env) \
     <(grep -E '^(registration_shared_secret|macaroon_secret_key|form_secret):' synapse/homeserver.yaml | sed 's/: */=/' | tr -d '"')
```

Output should be empty *for the secret values* (the key names differ;
ignore that). If the values match, `--force` is safe. If they
don't, **stop** — pull the deployed `homeserver.yaml` secrets back
into `.env` first, or hand-edit `homeserver.yaml` directly (see §5).

## 3. Re-render & restart

```
cd infra/single-server-baseline/synapse
./render-homeserver.sh --force
```

Then, depending on how Synapse runs on this host:

```
# systemd
systemctl restart matrix-synapse

# docker compose
docker compose -f infra/single-server-baseline/docker-compose.yml up -d synapse
```

## 4. Verify the flow

The `/register` endpoint should advertise the token flow:

```
curl -s -X POST https://matrix.theblackout.app/_matrix/client/v3/register \
     -H 'Content-Type: application/json' -d '{}' | jq
```

Expected: a `401` with a `flows` array containing
`m.login.registration_token`. If you still get
`{"errcode":"M_FORBIDDEN","error":"Registration has been disabled"}`,
Synapse didn't pick up the new config — re-check §1/§3.

## 5. Bootstrap an admin user (one-time, only if you have none)

`register_new_matrix_user` uses `registration_shared_secret` from
`homeserver.yaml` and bypasses the token gate, so it works even with
`registration_requires_token: true`:

```
# systemd install
register_new_matrix_user -a \
  -c /etc/matrix-synapse/homeserver.yaml \
  http://localhost:8008

# docker install
docker exec -it matrix-synapse register_new_matrix_user -a \
  -c /data/homeserver.yaml http://localhost:8008
```

`-a` makes the new account an admin. Skip it for a non-admin account.

## 6. Issue an invite token

Get an access token by logging in as the admin (any Matrix client will
do; copy the token from settings → help & about → access token).

The recommended path is `mint-invite-token.sh` in this directory,
which wraps the admin API and prints just the token string:

```
ADMIN_ACCESS_TOKEN='syt_…' ./mint-invite-token.sh --uses 1 --expires-in 7d
```

Or call the API directly:

```
ACCESS_TOKEN='syt_…'
curl -s -X POST https://matrix.theblackout.app/_synapse/admin/v1/registration_tokens/new \
     -H "Authorization: Bearer ${ACCESS_TOKEN}" \
     -H 'Content-Type: application/json' \
     -d '{"uses_allowed": 1, "expiry_time": null}' | jq
```

Response includes `"token": "abc123"`. Share that string with the
prospective user. They paste it into the signup form.

Optional knobs on the POST body:

| Field | Type | Meaning |
| --- | --- | --- |
| `token` | string | Force a specific token string; omit to let Synapse generate one. |
| `uses_allowed` | int \| null | Number of accounts the token can create. `null` = unlimited. |
| `expiry_time` | int (ms epoch) \| null | When the token stops working. `null` = never. |
| `length` | int | Length of the generated token (when `token` is omitted). |

## 7. Manage outstanding tokens

```
# List
curl -s https://matrix.theblackout.app/_synapse/admin/v1/registration_tokens \
     -H "Authorization: Bearer ${ACCESS_TOKEN}" | jq

# Inspect one
curl -s https://matrix.theblackout.app/_synapse/admin/v1/registration_tokens/$TOKEN \
     -H "Authorization: Bearer ${ACCESS_TOKEN}" | jq

# Revoke
curl -s -X DELETE https://matrix.theblackout.app/_synapse/admin/v1/registration_tokens/$TOKEN \
     -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

## 8. Closing the gate again

To go back to fully closed:

```
# in .env
SYNAPSE_ENABLE_REGISTRATION=false
# (you can leave SYNAPSE_REGISTRATION_REQUIRES_TOKEN as-is; it has no
#  effect once enable_registration is false)
```

Re-render (§2/§3) and restart. Existing accounts are unaffected.

---

## Appendix — hand-editing `homeserver.yaml` instead

If §2's safety check fails (the live `homeserver.yaml` has secrets that
no longer exist in `.env`, e.g. the host was bootstrapped manually),
don't re-render. Edit the deployed file directly:

```yaml
enable_registration: true
enable_registration_without_verification: true
registration_requires_token: true
```

Restart Synapse. Continue at §4. Then reconcile `.env` against the
running `homeserver.yaml` so the next `--force` render is safe.
