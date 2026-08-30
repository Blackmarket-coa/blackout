# MAS Identity — the one IdP contract (W2)

Status: **landed dark** (W2, consolidation D4). Matrix Authentication Service
(MAS) is the single identity provider for the BMC ecosystem: Synapse delegates
to it (MSC3861), FreeBlackMarket logs customers in against it, and the Blackout
API's native OIDC login rides it. Everything below ships in templates and
env-gated code; nothing changes behavior until the operator flips the deploy to
Mode B and registers the relying parties. **Blackmask holds no IdP role** — the
proxy/anonymity layer has zero identity surface here by construction (verified:
no Blackmask references exist anywhere in this repo).

This is the **producer-side** contract (Blackout hosts MAS). The FBM mirror is
`free-black-market/docs/contracts/mas-identity-consumer.md`. Deploy mechanics
live in `deploy/docker/blackout-backend/README.md` (Mode B + cutover runbook).

## Issuer layout

One issuer, at the Matrix origin, with a **trailing slash**:

```
MAS_ISSUER = https://matrix.theblackout.app/
```

Under Mode B (`SYNAPSE_AUTH_MODE=mas`) the deploy's nginx routes the OIDC
surface to the MAS container and the compat auth endpoints
(`/_matrix/client/*/login|logout|refresh`) to MAS's compatibility layer, so
password logins keep working during migration. The exact route set is in the
deploy README; the discovery URL is standard:

```
GET https://matrix.theblackout.app/.well-known/openid-configuration
```

### MSC2965 advertisement, per mode

Clients find the IdP through the Matrix client well-known
(`/.well-known/matrix/client`):

| Mode                                  | Well-known template rendered                           | `org.matrix.msc2965.authentication`                              |
| ------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| A — local (`SYNAPSE_AUTH_MODE=local`) | `well-known/matrix/client` (unchanged, byte-identical) | absent                                                           |
| B — MAS (`SYNAPSE_AUTH_MODE=mas`)     | `well-known/matrix/client.mas`                         | `{"issuer": "${MAS_ISSUER}", "account": "${MAS_ISSUER}account"}` |

Rule: the MSC2965 key is advertised **iff** Synapse actually delegates to MAS.
Advertising it in Mode A would send OIDC-native Matrix clients to an issuer
that Synapse doesn't honor.

## Client registry

Every relying party is a **confidential** client registered in
`deploy/docker/blackout-backend/mas/config.yaml.template`, with ids and
secrets threaded from the deploy env. Client ids are 26-char ULIDs (Crockford
base32 — no I/L/O/U); the checked-in values are placeholders the operator
replaces alongside real secrets.

| Client (env id var)                                     | Placeholder id               | Auth method          | Redirect URI (env)              | Purpose                                                   |
| ------------------------------------------------------- | ---------------------------- | -------------------- | ------------------------------- | --------------------------------------------------------- |
| Synapse (`SYNAPSE_MSC3861_CLIENT_ID` = `MAS_CLIENT_ID`) | `0000000000000000000SYNAPSE` | per deploy env       | n/a (token introspection)       | MSC3861: Synapse validates access tokens against MAS      |
| FBM (`MAS_FBM_CLIENT_ID`)                               | `00000000000000000000000FBM` | `client_secret_post` | `MAS_FBM_REDIRECT_URI`          | FBM's Medusa `mas` auth provider (customer login)         |
| Blackout API (`MAS_BLACKOUT_API_CLIENT_ID`)             | `000000000000000000000BKAPI` | `client_secret_post` | `MAS_BLACKOUT_API_REDIRECT_URI` | Native `/v1/auth/oidc/begin` + `/continue` (packages/api) |

Both relying parties run **authorization-code + PKCE (S256) + nonce** even
though they are confidential clients. Redirect URIs are exact-match on both
ends: MAS enforces its registered list, and each relying party additionally
allowlists what callers may supply (`BLACKOUT_OIDC_REDIRECT_ALLOWLIST` /
FBM's callback config).

## Claim semantics

| Claim                | Value                                             | Rules                                                                                        |
| -------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `sub`                | MAS account ULID                                  | Stable, opaque. **Never a Matrix localpart** — do not parse or display it as identity.       |
| `preferred_username` | Matrix **localpart** (e.g. `b3q7…`)               | In the id_token under the `profile` scope; fall back to the userinfo endpoint if absent.     |
| mxid                 | `@<preferred_username>:<MATRIX_SERVER_NAME>`      | Constructed by the relying party; the server name comes from deploy config, not from claims. |
| `nonce`              | Echo of the relying party's per-transaction nonce | MUST be verified (both relying parties bind it: Blackout hashes it into the pending row).    |

Consumers key their local accounts as follows: FBM stores `sub` as the auth
identity's `entity_id` and carries the mxid in `user_metadata`; the Blackout
API maps `preferred_username` → its `users.username` (the localpart IS the
username — see the migration section).

## Scopes

`openid profile` is the default and the minimum (profile carries
`preferred_username`). Add `email` only if MAS is configured to hold emails —
Blackout accounts are email-optional by design (no-PII account numbers), so
relying parties MUST NOT require an email claim.

## Provisioning trust — one flag, one policy

Both delegated-login paths on the Blackout API — `POST /v1/auth/matrix/exchange`
(Matrix token) and `POST /v1/auth/oidc/continue` (MAS code) — provision a
Blackout row for an unknown localpart **only** when
`BLACKOUT_MATRIX_EXCHANGE_TRUSTED_HS=1`, and refuse with the same
`matrix_exchange_provisioning_disabled` (403) otherwise. The trust assertion is
identical in both cases: _accounts on this homeserver/issuer are
Blackout-exclusive_ (registration happens only through our own flow). A shared
or open-registration issuer would let anyone claim a localpart and inherit its
Blackout account, so the flag stays off unless that exclusivity holds.

## Migration — bespoke accounts → MAS {#migration}

There is deliberately **no account-mapping table to build**: the
account-number ↔ mxid mapping is already a pure function, and the login flow
already round-trips through Matrix.

**Today (Mode A):**

1. The account number (26-char base32, `packages/core/src/auth/accountNumber.ts`)
   is the only credential. The localpart is derived one-way:
   `b + base32(sha256("blackout-acct:" + number))[0..20]` — deterministic on
   client and server, nothing persisted.
2. The account number IS the Matrix password. Client login =
   `POST /_matrix/client/v3/login` with `(derived localpart, account number)`.
3. The Matrix access token is exchanged at `POST /v1/auth/matrix/exchange`
   (whoami → localpart → `users.username`) for the local JWT + refresh pair.

**Flip day (Mode B):** the operator runs `syn2mas` (deploy README runbook),
which moves users **including their password hashes** into MAS. MAS's
compatibility layer then serves `/_matrix/client/*/login`, so step 2 — same
endpoint path, same `(localpart, account number)` credentials — keeps working
byte-identically, and step 3 is untouched. Account-number users never notice
the cutover; that continuity IS the migration path.

**After the flip**, the native OIDC login (`/v1/auth/oidc/begin` +
`/continue`) becomes available alongside exchange, minting the _same_ local
session from a MAS authorization-code flow instead of a Matrix token.

### Retirement ladder (each rung is its own later change)

1. **Local password login/registration** (`/v1/auth/login`, `/register`):
   fold into account-number + MAS flows; these are the only rungs that touch
   user-visible behavior.
2. **Local JWT + refresh pair**: stays until the API can accept MAS access
   tokens directly — today ~376 `requireUser`/`verifyJwt` call sites and 84
   test files minting local JWTs assume it. Until then the exchange/OIDC
   routes translate MAS identity → local session at the edge.
3. **WebAuthn** (`/v1/auth/webauthn/*`): flagged **orphaned** — it
   authenticates the local session only; under MAS the second factor belongs
   in the IdP. Do not extend it.

The `blackout.auth.session.continued` envelope and the SDK's
`beginOidcLogin`/`continueOidcSession`/`signOut` actions are the stable client
surface across every rung (naming note: the `co.bmc.*` constants in
`packages/blackout-protocol/src/auth-threads/contracts.ts` are a known split
from the `blackout.*` wire literals; reconciling is a protocol-version bump,
out of W2 scope).

## Enablement checklist (operator)

Dark-by-default env, per surface:

-   Deploy: `SYNAPSE_AUTH_MODE=mas`, `MAS_ISSUER`, real client ids/secrets +
    redirect URIs for FBM and the Blackout API (`deploy/docker/blackout-backend/.env.example`).
-   Blackout API: `BLACKOUT_OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET/REDIRECT_ALLOWLIST`
    (+ `LINKED_ACCOUNT_ENCRYPTION_KEYS` prerequisite) — `packages/api/.env.example`.
    All four unset ⇒ `/v1/auth/oidc/*` returns 503 `oidc_not_configured`.
-   FBM: `MAS_OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET` (consumer doc).
-   Post-flip verification lives in the deploy README's cutover runbook
    (MSC2965 well-known, account-number continuity, both relying-party smoke
    tests, the FBM embedded-chat `mintLoginToken` risk).
