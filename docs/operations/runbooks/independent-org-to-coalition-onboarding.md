# Independent Org -> Coalition Onboarding Flow

This runbook packages federation onboarding for both movement-grade collectives and enterprise governance teams.

## 1) Preconditions

- Source org has a stable Matrix homeserver and governance room namespace.
- Coalition federation policy is published (trusted domains, moderation baseline, incident escalation contacts).
- Governance signature policy is agreed (`signer key custody`, `rotation cadence`, `revocation handling`).

## 2) Onboarding sequence

1. **Identity + trust bootstrap**
   - Exchange homeserver domain attestations.
   - Register governance signer keys and verify out-of-band fingerprints.
2. **Federated room linkage**
   - Create coalition broadcast room with explicit inter-org ACLs.
   - Join source org governance moderators and observers.
3. **Governance broadcast validation**
   - Send signed governance broadcast event from source org room.
   - Verify delivery and signature validation in coalition room.
4. **Failure-path drill**
   - Simulate remote server timeout and replay.
   - Confirm retry semantics and operator alerting.
5. **Audit handoff**
   - Export initial audit bundle (delivery confirmations, signer verification logs, moderation decisions).

## 3) Cross-community broadcast failure handling

| Failure mode | Expected system behavior | Operator action |
| --- | --- | --- |
| Remote homeserver timeout | Retry with bounded backoff; preserve signed event payload | Track pending relay queue and notify counterpart ops contact |
| Signature mismatch | Reject broadcast; log deterministic rejection reason | Trigger signer key verification + possible key revocation workflow |
| Partial federation partition | Queue delivery + reconcile after reconnect | Run federation recovery drill; compare event IDs across orgs |
| Duplicate relay replay | Idempotent event handling by event ID/signature tuple | Confirm dedupe counters and close incident as informational |

## 4) Exit criteria

- Cross-community broadcast succeeds in steady-state and degraded-state tests.
- Failure handling evidence is recorded with timestamps and owners.
- Coalition moderators sign off on onboarding packet.
