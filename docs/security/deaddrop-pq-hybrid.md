# Deaddrop Post-Quantum Hybrid (v2 envelope)

Status: **built and tested, in no shipped flow.** The ML-KEM-768 primitive
comes from `@noble/post-quantum`. Nothing in the apps encrypts a dead drop
with this suite: the SDK's `createDeadDropActions` has no importer
([`deadman-release-design-2026-10-24.md`](deadman-release-design-2026-10-24.md)
§1). Until 2026-10-26 the record said "shipped end-to-end"; that was not true
([`release-identities-2026-10-26.md`](release-identities-2026-10-26.md), C6).

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

-   New wire format `DeadDropEnvelopeV2`, with strict validators
    (`isOpaqueEnvelopeV2`) that refuse extra fields and require both the
    classical EC public key (`ek`) and the PQ ciphertext (`pqCt`).
-   Negotiation: `SUPPORTED_SUITES` advertises both v1 and v2; servers
    accept either via `isOpaqueEnvelope`. Clients can encrypt v1 against
    legacy peers and v2 against PQ-capable peers without any server
    changes.
-   KDF combiner `deriveHybridAeadKey()` — pure function over byte
    slices, fully tested with deterministic vectors. Construction:

    ```
    ikm  = ec_secret || pq_secret
    salt = ek_x25519 || pq_ciphertext
    info = "blackout-deaddrop-v2-hybrid" [|| transcript]
    key  = HKDF-SHA-256(ikm, salt, info, 32)
    ```

    The two secrets are concatenated as in the TLS hybrid design draft, and
    the whole is in HPKE's shape (a KEM, a KDF over its output with context,
    an AEAD), but it is **not HPKE** (RFC 9180) and not wire-compatible with
    it: there are no labeled derivations, and the recipient's X25519 public
    key is not bound into the derivation, as HPKE's DHKEM and X-Wing bind it.
    This record used to say it "matches draft-irtf-cfrg-hpke (HPKE hybrid)";
    the comparison is in
    [`release-identities-2026-10-26.md`](release-identities-2026-10-26.md) §5.

-   Pluggable `KemProvider` interface with `setKemProvider()` /
    `getKemProvider()`. The default is `NULL_KEM_PROVIDER`, which throws
    on every operation so we cannot accidentally encrypt with a zero-
    strength KEM. The production provider `mlKem768Provider` is exported
    from `@blackout/protocol`. The web client installs it at startup
    (`setKemProvider(mlKem768Provider)`) from 2026-10-26, for release
    identities; before that only tests called `setKemProvider`.
-   `encryptDeadDrop({ suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2',
recipientPqPublicKey })` produces a `DeadDropEnvelopeV2` with a real
    ML-KEM-768 KEM ciphertext. `decryptDeadDrop` dispatches on
    `envelope.v` and accepts `recipientPqSecretKey` for v2.
-   30 regression tests (`apps/blackout-client/tests/unit/sdk/deaddropPqHybrid.test.ts`)
    covering KDF determinism, salt binding, transcript binding, empty-
    secret rejection, v1↔v2 envelope validators, ML-KEM-768 size constants
    (FIPS 203 Table 3), real keypair generation, encapsulate / decapsulate
    round-trip, IND-CCA2 implicit rejection on tampered ciphertext, length
    guards, end-to-end v2 envelope round-trip, and rejection of mismatched
    PQ keys.

## What is deferred

The KEM module follows FIPS 203 ML-KEM-768 exactly through
`@noble/post-quantum`. Open in the v2 path, from the 2026-10-26 review
([`release-identities-2026-10-26.md`](release-identities-2026-10-26.md)):

-   The recipient's X25519 public key is not bound into the derivation
    when the transcript is empty, as it is for every dead drop today (C5).
    Release seals bind it through the recipient's fingerprint.
-   No check that the X25519 output is not all zeros, which RFC 9180
    §7.1.4 requires (C8). Node's WebCrypto refuses small-order keys itself;
    browsers were not checked.
-   AES-GCM gets no associated data, so the envelope's `dropId`, `pad` and
    `expiresAt` are not authenticated by it.

Upgrades:

-   ML-KEM-1024 for higher-strength deployments (drop-in via the same
    `KemProvider` interface).
-   Sender-binding signatures over the envelope so v2 also authenticates
    the sender (today it is sealed-box / anonymous-from-the-server).

## Tracking

-   Source: `packages/blackout-protocol/src/deaddrop/crypto/pqHybrid.ts`,
    `packages/blackout-protocol/src/deaddrop/crypto/mlkem768Provider.ts`,
    `packages/blackout-protocol/src/deaddrop/crypto/envelope.ts`.
-   Tests: `apps/blackout-client/tests/unit/sdk/deaddropPqHybrid.test.ts`.
-   Threat model entry: `THREAT_MODEL.md` §7 R3.
