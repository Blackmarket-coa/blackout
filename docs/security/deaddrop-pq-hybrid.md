# Deaddrop Post-Quantum Hybrid (v2 envelope)

Status: **wire format + KDF combiner shipped**; ML-KEM-768 primitive
deferred to a follow-up that adds a vetted dependency.

## Why hybrid

Deaddrops carry information that may sit in a server-opaque store for
longer than any single human session. The classical `v1` suite
(`sealedbox-x25519-aes256gcm-v1`) is sound today, but is vulnerable to
**harvest-now-decrypt-later**: an attacker can record ciphertext now
and decrypt it later if a quantum computer breaks X25519.

The `v2` suite (`sealedbox-x25519-mlkem768-aes256gcm-v2`) defends
against this by adding an ML-KEM-768 KEM leg next to the X25519 ECDH
leg. Both shared secrets are mixed into the AEAD key via HKDF-SHA-256.
An attacker must break **both** X25519 and ML-KEM-768 to recover the
key, so the hybrid is strictly stronger than either primitive alone.

## What lands today

- New wire format `DeadDropEnvelopeV2`, with strict validators
  (`isOpaqueEnvelopeV2`) that refuse extra fields and require both the
  classical EC public key (`ek`) and the PQ ciphertext (`pqCt`).
- Negotiation: `SUPPORTED_SUITES` advertises both v1 and v2; servers
  accept either via `isOpaqueEnvelope`. Clients can encrypt v1 against
  legacy peers and v2 against PQ-capable peers without any server
  changes.
- KDF combiner `deriveHybridAeadKey()` — pure function over byte
  slices, fully tested with deterministic vectors. Construction:

  ```
  ikm  = ec_secret || pq_secret
  salt = ek_x25519 || pq_ciphertext
  info = "blackout-deaddrop-v2-hybrid" [|| transcript]
  key  = HKDF-SHA-256(ikm, salt, info, 32)
  ```

  This matches draft-irtf-cfrg-hpke (HPKE hybrid) and the TLS hybrid
  design draft.
- Pluggable `KemProvider` interface with `setKemProvider()` /
  `getKemProvider()`. The default is `NULL_KEM_PROVIDER`, which throws
  on every operation so we cannot accidentally encrypt with a zero-
  strength KEM.
- 19 regression tests (`apps/blackout-client/tests/unit/sdk/deaddropPqHybrid.test.ts`)
  covering KDF determinism, salt binding, transcript binding, empty-
  secret rejection, and v1↔v2 envelope validators.

## What is deferred

The ML-KEM-768 primitive itself is not implemented. WebCrypto does not
yet expose ML-KEM, so the production provider must wrap a vetted
library (recommended: `@noble/post-quantum`'s `ml_kem768`). That
follow-up should:

1. Add `@noble/post-quantum` to `packages/blackout-protocol`.
2. Implement a `KemProvider` backed by `ml_kem768.{keygen,encapsulate,decapsulate}`.
3. Wire the provider in protocol bootstrap (`setKemProvider(...)`).
4. Extend `encryptDeadDrop` to accept a `suite: 'v1' | 'v2'` selector
   and produce a `DeadDropEnvelopeV2` when v2 is requested.
5. Extend `decryptDeadDrop` to dispatch on `envelope.v`.
6. Add round-trip tests using the real KEM.

Until that follow-up ships, calling `deriveHybridAeadKey()` works (it
is pure HKDF over caller-supplied bytes) but `encryptDeadDrop` /
`decryptDeadDrop` remain v1-only — there is no path that accidentally
emits a v2 envelope without the operator opting in via `setKemProvider`.

## Tracking

- Source: `packages/blackout-protocol/src/deaddrop/crypto/pqHybrid.ts`,
  `packages/blackout-protocol/src/deaddrop/crypto/envelope.ts`.
- Tests: `apps/blackout-client/tests/unit/sdk/deaddropPqHybrid.test.ts`.
- Threat model entry: `THREAT_MODEL.md` §7 R3.
