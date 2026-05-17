# Signup Enablement Runbook

Operator-facing checklist for turning on (and turning off) end-user signups against the production Blackout / Synapse stack. Read this when standing up a
new environment, when launching the homeserver to the public, or during an incident that needs new-user signups paused.

## Scope

This runbook covers the Matrix-backed signup path (`/_matrix/client/v3/register`) the web LoginPage and mobile RegisterScreen target. The JWT-backed
`packages/api` `/auth/register` endpoint reuses the same enablement bit through its own service config; the controls below cover Synapse.

The web client (`apps/blackout-client`) automatically probes the homeserver's `/register` endpoint at LoginPage mount and hides the "Create account" tab
when the server returns 403. Deep links to `/register` show an inline "signups are disabled" notice in the same case. This means the client follows the
server's enablement state without restart.

## Gate Strategies (pick one)

Production should always pair `enable_registration: True` with **one** of these gates. Bare-open registration is not supported for go-live.

### A. Email verification (recommended for public launch)

Requires a working SMTP provider in the Synapse config. Synapse will send a verification email and the RegisterForm UIA flow walks the user through
clicking the link before issuing the access token.

```bash
SYNAPSE_ENABLE_REGISTRATION=true
SYNAPSE_EMAIL_SMTP_HOST=smtp.your-provider.example
SYNAPSE_EMAIL_SMTP_PORT=587
SYNAPSE_EMAIL_SMTP_USER=postmaster@your-domain.example
SYNAPSE_EMAIL_SMTP_PASS=<from your provider>
SYNAPSE_EMAIL_FROM_ADDRESS=noreply@theblackout.app
```

Verify with a probe (replace `MATRIX_BASE_URL`):

```bash
curl -sS -X POST -H 'Content-Type: application/json' -d '{}' "$MATRIX_BASE_URL/_matrix/client/v3/register"
```

Expected: HTTP 401 with a JSON body containing a `flows` array that includes `"m.login.email.identity"`.

### B. Registration tokens (recommended for invite-only or early beta)

Synapse refuses registration unless the user presents an admin-minted token. Good for closed beta or controlled-growth periods.

```bash
SYNAPSE_ENABLE_REGISTRATION=true
SYNAPSE_REGISTRATION_REQUIRES_TOKEN=true
```

Mint a token (requires the Synapse `registration_shared_secret`):

```bash
docker compose exec synapse register_new_matrix_user \
  -k "$SYNAPSE_REGISTRATION_SHARED_SECRET" \
  --no-admin -u <new-user> -p <temp-password> http://localhost:8008
```

For bulk invite tokens use the admin API: `POST /_synapse/admin/v1/registration_tokens/new`.

### C. reCAPTCHA (recommended for high-volume open signup)

Google reCAPTCHA v2 (visible widget). RegisterForm lazy-loads the script and surfaces the challenge automatically when the homeserver advertises the
`m.login.recaptcha` UIA stage.

```bash
SYNAPSE_ENABLE_REGISTRATION=true
SYNAPSE_ENABLE_REGISTRATION_CAPTCHA=true
SYNAPSE_RECAPTCHA_PUBLIC_KEY=<from Google reCAPTCHA console>
SYNAPSE_RECAPTCHA_PRIVATE_KEY=<from Google reCAPTCHA console>
```

The `apps/blackout-server/docker/conf/homeserver.yaml` template (lines 131–143) reads these env vars; restart the synapse service after rotating keys.

## Verification

After applying any gate strategy, run the launch-smoke auth pack against the live stack:

```bash
BLACKOUT_E2E_BASE_URL=https://<deployment-base-url> \
LS_AUTH_USERNAME=smoke_member_a LS_AUTH_PASSWORD=<from secret store> \
LS_AUTH_REGISTRATION_TOKEN=<one-time token if strategy B is active> \
pnpm test:e2e -- launch-smoke/auth.spec.ts
```

The release gate requires every `LS-AUTH-*` to pass — LS-AUTH-06 (fresh signup) specifically covers the path this runbook configures.

Manual click-through (release-day evidence):

1. Browser → `/register` on the prod URL. The Create-account tab is selected automatically.
2. Submit a unique username + password (+ email / token / CAPTCHA as the active gate requires).
3. Land on the home surface; `mx_access_token` is set in localStorage; `mx_user_id` matches the new account.
4. Sign out → `/login` → sign back in with the new credentials.

## Pause Signups in an Incident

When abuse, spam, or capacity pressure forces a freeze:

1. Flip `SYNAPSE_ENABLE_REGISTRATION=false` in the deployment env file.
2. Restart the synapse service: `docker compose restart synapse` (Compose) or `kubectl rollout restart deployment/synapse` (k8s).
3. Verify with the curl probe above — expected response is HTTP 403 with `M_FORBIDDEN`.
4. The web client auto-detects this on the next page load: the Create-account tab disappears and `/register` deep links display the
   `registration-disabled-notice` banner.

To re-enable, flip the env var back and restart. No client rebuild is needed.

## Cross-references

- `apps/blackout-server/docker/conf/homeserver.yaml` — Synapse template that consumes the env vars above.
- `apps/blackout-client/src/app/components/bmc/auth/LoginPage.tsx` — host UI that owns the deep-link routing and the disable-notice banner.
- `apps/blackout-client/src/app/components/bmc/auth/homeserver.ts` — `useRegistrationAvailability` hook that drives the conditional rendering.
- `playwright/e2e/launch-smoke/auth.spec.ts` — LS-AUTH-06 signup happy-path coverage.
- `docs/launch-smoke-suite.md` — release-gate criteria, including the LS-AUTH-06 entry.
