# Synapse launch verification checklist

Use this during go-live and after major Synapse upgrades.

## 0) Prereqs

```bash
export BASE_URL="https://matrix.theblackout.app"
export SERVER_NAME="theblackout.app"
export SHARED_SECRET="<synapse registration_shared_secret>"
export ADMIN_USER="<existing-admin-username>"
export ADMIN_PASS="<existing-admin-password>"
```

## 1) Run the automated verifier

### Command

```bash
chmod +x infra/single-server-baseline/synapse/verify-launch.sh
infra/single-server-baseline/synapse/verify-launch.sh
```

### Expected success signatures

- `✔ admin login returned access token`
- `✔ open registration is not silently enabled`
- `✔ sync returned next_batch token`
- `✔ room created: !...`
- `✔ space created: !...`
- `✔ dm send succeeded in !...`
- `✔ small upload accepted`
- `✔ large upload correctly rejected`
- `✔ account recovery endpoint is reachable (response captured)`
- `✔ Launch verification completed.`

## 2) Federation readiness (if enabled)

### Command

```bash
ENABLE_FEDERATION_TEST=true infra/single-server-baseline/synapse/verify-launch.sh
```

### Expected success signatures

- `✔ federation endpoints ready`
- `✔ Launch verification completed.`

## Failure triage paths

### Login/register behavior fails

- Check reverse proxy route for `/_matrix/client/*`.
- Confirm `enable_registration: false` and shared-secret settings in Synapse config.
- Inspect Synapse logs for auth/rate-limit errors.

### `/sync` fails or lacks `next_batch`

- Confirm access token validity from login response.
- Check worker/listener health and DB/Redis connectivity.
- Validate server time/NTP sync (token validation issues can occur with skew).

### Room/space creation fails

- Verify user has not hit `rc_joins`/message limits.
- Check room creation endpoint reachability through proxy.
- Inspect power-level and spam checker policy modules if installed.

### DM messaging fails

- Verify second account registration/login succeeded.
- Confirm invite state in `/sync` and client-server event auth.
- Check rate-limit counters and media repository health if message contains media.

### Media upload checks fail

- If small upload fails: inspect media store mount permissions and disk space.
- If large upload is accepted: verify `max_upload_size` rendered into active `homeserver.yaml` and Synapse restarted.
- If large upload returns proxy error: align nginx body size and upstream timeout settings.

### Account recovery check fails

- If endpoint is unreachable: proxy route issue.
- If returns policy error: configure/verify email password-reset settings (SMTP + templates) for full recovery UX.
- Confirm desired launch policy (enabled/disabled) is explicit.

### Federation readiness fails

- Validate `https://theblackout.app/.well-known/matrix/server`.
- Check TLS certificate SAN coverage for apex and matrix subdomain.
- Verify `/_matrix/federation/v1/version` exposed via proxy.
- Use Matrix federation tester to pinpoint DNS, TLS, or signing key issues.
