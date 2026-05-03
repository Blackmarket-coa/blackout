# Key Transparency Log

Status: **shipped**. Pluggable persistence (in-memory or JSON-file) and
optional Ed25519 witness signatures over each tree head.

## What it is

An RFC 6962-compatible append-only Merkle log of users' cross-signing
master keys. The log is the auditability primitive that detects a
malicious or compromised homeserver from substituting a key for a
targeted user. It is **not** a blockchain — there is no consensus, no
token, no global write-throughput problem; it is a single-writer
append-only structure with cryptographic inclusion and consistency
proofs.

The construction follows RFC 6962 (Certificate Transparency) so the
proofs interoperate with off-the-shelf CT verifiers and the
auditability properties carry over:

```
leaf_hash(d)        = SHA-256(0x00 || d)
node_hash(L, R)     = SHA-256(0x01 || L || R)
```

## API surface

`/v1/key-transparency/`:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/append` | Append a new `(userId, masterKey)` leaf. Returns the new leaf index and root. |
| `GET` | `/root` | Current tree head (size + root hash). |
| `GET` | `/sth` | Current Signed Tree Head (size + root hash + witness signature + scheme). |
| `GET` | `/inclusion/:leafIndex` | Inclusion proof (leaf-up audit path) for a specific leaf. |
| `GET` | `/consistency?from=&to=` | Consistency proof between two tree sizes. |
| `GET` | `/lookup/:userId` | All leaves for a user. |
| `POST` | `/verify` | Server-side inclusion verifier (mirror of the client function for diagnostics). |
| `POST` | `/verify-sth` | Server-side STH verifier — pure function, identical to the client verifier. |

The service module (`packages/api/src/services/keyTransparency.ts`) is
storage-agnostic. `verifyInclusion` is a pure function so the client
runs *exactly the same* verification code as auditors do.

## What clients should do

On every session start:

1. Fetch the current root.
2. Fetch the inclusion proof for their own most-recent leaf.
3. Run `verifyInclusion(proof, root)`. Failure = treat as a security
   incident and surface a verified-device warning. Do not proceed.

A regular auditor (every N minutes) should fetch successive roots and
run `consistencyProof(from, to)` to ensure the log is genuinely
append-only — no rewrites, no truncations.

## Persistence (operator config)

Set `KT_LOG_FILE` to a writable path on the API host (e.g.
`/var/lib/blackout/key-transparency.json`) and the log is loaded from
that file on boot and atomically rewritten on every append. Without
the env var the log defaults to in-memory, which is the right choice
for unit tests and ephemeral CI runs but explicitly *not* for
production.

The JSON shape is `{ "version": 1, "entries": [...] }`. A future SQL
adapter slots in by implementing `KeyTransparencyStorage` (see
`packages/api/src/services/keyTransparencyStorage.ts`); the Merkle
construction does not need to change.

## Witnesses (operator config)

Set `KT_WITNESS_ED25519_SEED` to a 32-byte secret (hex or base64url)
and the API will sign every Signed Tree Head with that key. The
public key is published in the STH itself so any third party can
fetch `GET /v1/key-transparency/sth` and verify the signature using
`verifySignedTreeHead` (re-exported in the same module so client and
auditor run identical code).

Multi-witness deployments work today by running multiple API replicas
with different seeds and gossiping the STHs out-of-band — clients
treat divergent witnessed roots as a security incident. Without the
env var the STH endpoint returns an explicitly-unsigned response
(`scheme: 'none'`), not a forged one.

## Still left (rate-limiting & federation)

- **Rate-limiting append.** Any caller that can hit the API can
  currently append. Tighten to "the authenticated user can only
  append their own master key, and rotation is bounded to N times/day"
  before exposing externally.
- **Federation gossip.** The witness scheme is per-deployment.
  Federated deployments should periodically gossip STHs so that a
  malicious operator running both the homeserver and the witness key
  cannot fork the log. This is a topology decision, not a code change.

## Tracking

- Source: `packages/api/src/services/keyTransparency.ts`,
  `packages/api/src/services/keyTransparencyStorage.ts`,
  `packages/api/src/routes/keyTransparency.ts`.
- Tests: `packages/api/test/keyTransparency.integration.test.ts`
  (27 tests covering empty/append/root, RFC 6962 hash vectors,
  inclusion verification across many tree sizes, consistency proofs,
  tampering rejection, JSON-file persistence round-trip + corruption
  guard + cross-process growth, and Ed25519 witness STH sign/verify
  including tampering and witness-key-swap rejection).
- Threat model entry: `THREAT_MODEL.md` §7 R5.
