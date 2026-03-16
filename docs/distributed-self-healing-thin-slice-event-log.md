# Distributed self-healing thin slice: append-only log + signature + tamper checks

## Scope

First end-to-end implementation slice for the blueprint checklist:

1. Append-only event log abstraction.
2. Ed25519 signature verification on ingest.
3. Hash-chain tamper validation (`previousHash` continuity).

## Proposed module boundaries

- `core/events/EventLog.ts`
- `crypto/signatures/Ed25519Verifier.ts`
- `core/ingest/TamperGuard.ts`

## Acceptance checks

- Ingest rejects events with invalid signatures.
- Ingest rejects events with broken hash linkage.
- Replay of valid event stream rebuilds deterministic state snapshot.

## Follow-on

- Add integration tests for replay/duplication rejection.
- Extend to encrypted payload envelopes (X25519 + AES-GCM).
