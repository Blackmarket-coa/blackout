# Native WebAuthn / Passkey Support

Status: **scaffold** (gated behind `WEBAUTHN_ENABLED=1`).

This document describes the native WebAuthn / passkey surface added to
the Blackout API, what it does today, and what must land before the
feature flag can be flipped on in production.

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
- 14 regression tests covering challenge handling, parsing, validation,
  storage, and the safety stops in `verifyAttestation` /
  `verifyAssertion`.

## What is NOT implemented yet

`verifyAttestation` and `verifyAssertion` currently return
`{ ok: false, code: 'verification_not_implemented' }` after the
clientDataJSON checks pass. The remaining cryptographic surface is:

1. CBOR decoding of `attestationObject` and `authenticatorData`.
2. COSE_Key extraction (kty, alg, crv, x/y or n/e).
3. rpIdHash equality check against `SHA-256(rpId)`.
4. User-Present / User-Verified flag enforcement.
5. Signature verification (ES256, EdDSA, RS256 at minimum).
6. Sign-counter monotonicity check (cloning detection).
7. Attestation-statement format verification (`packed`, `none`,
   optionally `tpm`, `android-key`, `apple`).
8. Optional MDS-rooted authenticator trust.

This work should be delivered in a focused follow-up that adds a vetted
dependency (recommended: `@simplewebauthn/server`) rather than a hand-
rolled implementation. Until then, **do not enable
`WEBAUTHN_ENABLED=1` in production** — `register/finish` and
`login/finish` will reject every credential with the
`verification_not_implemented` code, which is the safe-by-default
posture.

## Tracking

- Source: `packages/api/src/services/webauthn.ts`,
  `packages/api/src/routes/webauthn.ts`.
- Tests: `packages/api/test/webauthn.integration.test.ts`.
- Threat model entry: `THREAT_MODEL.md` §7 R4.
- Follow-up tag: `TODO(WEBAUTHN-VERIFY)` in `webauthn.ts`.
