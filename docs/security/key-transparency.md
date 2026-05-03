# Key Transparency Log

Status: **shipped** (in-memory backend; persistence is a deployment
follow-up).

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
| `GET` | `/root` | Current signed tree head (size + root hash). |
| `GET` | `/inclusion/:leafIndex` | Inclusion proof (leaf-up audit path) for a specific leaf. |
| `GET` | `/consistency?from=&to=` | Consistency proof between two tree sizes. |
| `GET` | `/lookup/:userId` | All leaves for a user. |
| `POST` | `/verify` | Server-side verifier (mirror of the client function for diagnostics). |

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

## What is NOT done yet

- **Persistence.** The log lives in process memory, which is fine for
  tests and small operators but not for production. A follow-up should
  back it with a Postgres `(leaf_index, leaf_data)` table plus an
  S3/object-store snapshot of root hashes. The data structure does not
  change; only the storage adapter.
- **Witnesses.** A second-party witness (e.g. a third-party auditor
  that signs the root every minute and gossips it) would close the
  "signed-but-divergent-views" attack. Plumb in a follow-up.
- **Rate-limiting append.** Currently any authenticated user can
  append. Tighten to "user can only append their own master key, and
  rotation is bounded to N times/day" before exposing externally.

## Tracking

- Source: `packages/api/src/services/keyTransparency.ts`,
  `packages/api/src/routes/keyTransparency.ts`.
- Tests: `packages/api/test/keyTransparency.integration.test.ts`
  (16 tests covering empty/append/root, RFC 6962 hash vectors,
  inclusion verification across many tree sizes, consistency proofs,
  tampering rejection).
- Threat model entry: `THREAT_MODEL.md` §7 R5.
