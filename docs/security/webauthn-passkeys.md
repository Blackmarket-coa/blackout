# Native WebAuthn / Passkey Support

Status: **shipped** (gated behind `WEBAUTHN_ENABLED=1`). Verification is
backed by `@simplewebauthn/server`.

This document describes the native WebAuthn / passkey surface in the
Blackout API and the operator knobs that govern it.

## What ships today

-   HTTP routes under `/v1/auth/webauthn/`:
    -   `POST /register/begin` — signed-in callers only: issues a
        registration challenge bound to the caller's session and the
        `PublicKeyCredentialCreationOptions` shape the client should pass
        to `navigator.credentials.create()`, with the caller's Blackout id
        and username as the user entity. It takes no body, `{}`, or a
        `userId` that names the caller (Blackout id or local Matrix id);
        any other `userId` is refused `403 user_mismatch`.
    -   `POST /register/finish` — signed-in callers only: accepts the
        attestation response, validates clientDataJSON, consumes the
        challenge issued to the same session, and stores the credential
        under the caller's Blackout id. A credential id that is already
        registered, to anyone, is refused `409 credential_exists` rather
        than replacing the stored record.
    -   `POST /login/begin` — no session (sign-in comes first): issues a
        login challenge and the allow-list of credentials registered for
        the account named by a Blackout id or local Matrix id.
    -   `POST /login/finish` — no session: accepts the assertion response,
        validates clientDataJSON / challenge and the signature. It mints
        no session; nothing signs in with a passkey yet.
-   Until 2026-10-26 both registration routes took any `userId` and no
    session (F7 in `docs/security/api-findings-triage-2026-10-25.md`).
-   Storage shape for credentials (`PasskeyCredential`). Credentials and
    challenges are kept in memory, so a restart forgets them.
-   Single-use, time-bounded challenge management with strict
    user/purpose binding (see `consumeChallenge`).
-   ClientDataJSON parsing and validation (origin allow-list, challenge
    match via `timingSafeEqual`, type pinning, cross-origin rejection).
-   Operator config knobs:
    -   `WEBAUTHN_ENABLED` — feature flag.
    -   `WEBAUTHN_RP_ID` — Relying Party ID (eTLD+1 of the app domain).
    -   `WEBAUTHN_RP_NAME` — display name.
    -   `WEBAUTHN_ORIGINS` — comma-separated origin allow-list.
-   15 service tests covering challenge handling, parsing, validation,
    storage, the clientData pre-checks in `verifyAttestation` /
    `verifyAssertion`, and the failure paths after delegation to
    `@simplewebauthn/server` (`verification_failed`), and 7 route tests
    that register and sign in with a software authenticator (session
    binding, another account refused, credential ids registered once).

## Verification (now wired)

Cryptographic verification is delegated to `@simplewebauthn/server`,
which covers:

1. CBOR decoding of `attestationObject` and `authenticatorData`.
2. COSE_Key extraction (kty, alg, crv, x/y or n/e).
3. rpIdHash equality check against `SHA-256(rpId)`.
4. User-Present / User-Verified flag enforcement.
5. Signature verification (ES256, EdDSA, RS256 at minimum).
6. Attestation-statement format verification (`packed`, `none`, `tpm`,
   `android-key`, `apple`, `fido-u2f`).

In addition, `verifyAssertion` enforces sign-counter monotonicity in
this module: if the new counter is not strictly greater than the stored
one (and the authenticator is not the always-zero variant) the assertion
is rejected with `sign_counter_regression`, which is how cloned
authenticators are detected.

`requireUserVerification` defaults to `false` so that platform
authenticators that surface UV via biometrics, but report it as a
flag, are accepted. Operators that want strict UV can flip this in
`packages/api/src/services/webauthn.ts`.

## Tracking

-   Source: `packages/api/src/services/webauthn.ts`,
    `packages/api/src/routes/webauthn.ts`.
-   Tests: `packages/api/test/webauthn.integration.test.ts` (service),
    `packages/api/test/webauthn-routes.integration.test.ts` (routes).
-   Threat model entry: `THREAT_MODEL.md` §7 R4.
-   Dependency: `@simplewebauthn/server`.
