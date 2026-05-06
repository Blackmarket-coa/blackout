# JWT Signing-Key Rotation

**Audience**: SRE on-call.
**Trigger**: scheduled rotation (quarterly), or unscheduled when a
signing key is suspected compromised.
**Outcome**: every newly issued access/refresh token is signed by the
*new* key while existing valid tokens continue to verify until they
expire.

The Blackout API supports zero-downtime rotation by accepting a primary
signing key plus an optional list of rollover keys for verification only
(`packages/api/src/services/auth.ts:46`). Tokens minted today are signed
with `JWT_SECRET_PRIMARY`; tokens minted yesterday verify against either
the old primary (now in `JWT_SECRET_ROLLOVER`) or the new primary.

---

## Pre-flight

1. Confirm the secret store backing the cluster (External Secrets,
   AWS Secrets Manager, Vault). The chart at `deploy/helm/blackout` reads
   secrets named `JWT_SECRET_PRIMARY` and `JWT_SECRET_ROLLOVER` from the
   `blackout-api` Secret synced from external-secrets.
2. Ensure you have the existing primary key cached. If you only have
   external references, fetch and confirm the value rotates correctly.
3. Verify `tools/ci/check-auth-secrets.mjs` is green on the current
   branch — it ensures no weak defaults can land in code.
4. Coordinate timing: a 24h overlap window (the access-token TTL) is
   the minimum. For refresh tokens, 30 days is the default
   (`packages/api/src/services/refreshToken.ts:7`). Plan the rotation
   window accordingly.

## Procedure

### 1. Generate the new key

```bash
NEW_PRIMARY="$(openssl rand -base64 48 | tr -d '=' | tr '+/' '-_')AbC1!"
# Verify the new key passes the strength check:
node -e 'const s=process.env.NEW; if(s.length<32||/(local-dev-secret|changeme|secret|dev-secret|password)/i.test(s)||!/[a-z]/.test(s)||!/[A-Z]/.test(s)||!/\d/.test(s)||!/[^A-Za-z0-9]/.test(s)) {console.error("FAIL");process.exit(1)} console.log("OK")' NEW="$NEW_PRIMARY"
```

### 2. Stage the rotation in the secret store

| Before | After |
| --- | --- |
| `JWT_SECRET_PRIMARY=K1` | `JWT_SECRET_PRIMARY=K2` |
| `JWT_SECRET_ROLLOVER=` (or empty) | `JWT_SECRET_ROLLOVER=K1` |

Apply the new values to the secret store. The chart's `ExternalSecret`
refresh interval (default `1h`) controls how quickly the synced
`Secret` reflects the change.

### 3. Roll the api deployment

```bash
kubectl rollout restart deployment/blackout-api -n <namespace>
kubectl rollout status   deployment/blackout-api -n <namespace>
```

If using the canary `Rollout` (`values.canary.enabled=true`):

```bash
kubectl argo rollouts get rollout blackout-api-rollout -n <namespace>
kubectl argo rollouts promote blackout-api-rollout -n <namespace>
```

### 4. Verify

```bash
# A freshly minted token must verify (round-trips through /v1/auth/login).
TOKEN="$(curl -s -X POST $BASE_URL/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"smoke@example.com","password":"...redacted..."}' | jq -r .token)"

# An old token (issued before the rollout) must still verify if you can
# capture one from before. Hit any /v1 endpoint with it; status must NOT
# be 401.
curl -fsS -H "authorization: Bearer $OLD_TOKEN" $BASE_URL/v1/messages
```

Expected metrics signal (over the next 30 min):

- `auth_failures_total{reason="invalid_credentials"}` rate flat — no
  spike from clients with old tokens.
- `http_requests_total{status="401"}` rate flat for `/v1/*` paths.
- `refresh_token_reuses_total` flat — rotation must not look like reuse.

### 5. Sunset the old key

After **max(access_token_ttl, refresh_token_ttl)** has elapsed (default:
30 days, controlled by `REFRESH_TOKEN_TTL_SECONDS`):

```yaml
JWT_SECRET_PRIMARY: K2
JWT_SECRET_ROLLOVER: ""    # or omit
```

Apply the secret update and roll the deployment again.

---

## Compromise scenario (out-of-band rotation)

If `JWT_SECRET_PRIMARY` is suspected leaked, the timeline collapses:

1. Generate the new key (step 1).
2. Set `JWT_SECRET_PRIMARY=K2` and **leave `JWT_SECRET_ROLLOVER` empty**
   so old tokens fail verification immediately. Coordinate user
   communication ahead of the rollout — every active session is
   invalidated.
3. Roll the api (step 3).
4. Force a denylist sweep so any access token still in the wild that
   *would* validate against an old envelope is rejected:

   ```sql
   -- Inside the production database, truncate the refresh-token tree
   -- so users must re-authenticate with credentials.
   DELETE FROM refresh_tokens;
   DELETE FROM revoked_sessions WHERE expires_at < NOW();
   ```

5. File an incident, link this runbook + the precipitating event, and
   capture the metric snapshot from step 4 above.
