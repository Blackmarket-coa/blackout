# Native WebAuthn / Passkey Support

Status: **shipped** (gated behind `WEBAUTHN_ENABLED=1`). Verification is
backed by `@simplewebauthn/server`.

This document describes the native WebAuthn / passkey surface in the
Blackout API and the operator knobs that govern it.

## What ships today

- HTTP routes under `/v1/auth/webauthn/`:
  - `POST /register/begin` — issues a registration challenge and the
    `PublicKeyCredentialCreationOptions` shape the client should pass
    to `navigator.credentials.create()`.
  - `POST /register/finish` — accepts the attestation response,
    validates clientDataJSON, consumes the challenge, and (will)
    persist the credential.
  - `POST /login/begin` — issues a login challenge and the allow-list
    of credentials registered for the user.
  - `POST /login/finish` — accepts the assertion response and
    validates clientDataJSON / challenge.
- Storage shape for credentials (`PasskeyCredential`).
- Single-use, time-bounded challenge management with strict
  user/purpose binding (see `consumeChallenge`).
- ClientDataJSON parsing and validation (origin allow-list, challenge
  match via `timingSafeEqual`, type pinning, cross-origin rejection).
- Operator config knobs:
  - `WEBAUTHN_ENABLED` — feature flag.
  - `WEBAUTHN_RP_ID` — Relying Party ID (eTLD+1 of the app domain).
  - `WEBAUTHN_RP_NAME` — display name.
  - `WEBAUTHN_ORIGINS` — comma-separated origin allow-list.
- 16 regression tests covering challenge handling, parsing, validation,
  storage, the clientData pre-checks in `verifyAttestation` /
  `verifyAssertion`, and the failure paths after delegation to
  `@simplewebauthn/server` (`verification_failed`).

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

- Source: `packages/api/src/services/webauthn.ts`,
  `packages/api/src/routes/webauthn.ts`.
- Tests: `packages/api/test/webauthn.integration.test.ts`.
- Threat model entry: `THREAT_MODEL.md` §7 R4.
- Dependency: `@simplewebauthn/server`.
