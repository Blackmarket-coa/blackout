# Internal support note: Blackout degraded-state handling

Audience: support, on-call, release managers.

## Scope

This note defines expected behavior and response steps for three degraded states during Blackout rollout:

1. IPFS backend unavailable
2. Feature flag disabled for cohort/user
3. Stale room-state references to removed content

## 1) IPFS backend unavailable

### User-visible behavior

- Governance, education, and mutual-aid views continue to render local/persisted data.
- IPFS-linked content fetches may fail or time out.
- Upload/publish actions backed by IPFS should be disabled or show retry guidance.

### Support response

- Confirm health endpoint and gateway path status.
- Temporarily disable `feature_blackout_ipfs_storage` for affected cohort if failures persist.
- Share status update with expected retry window.

## 2) Feature flag disabled

### User-visible behavior

- Module views behind the disabled flag render no module content.
- No data loss; existing room events remain intact.

### Support response

- Verify cohort assignment and effective feature flags.
- If intentional, confirm rollout stage to requester.
- If unintentional, route to release owner for flag correction.

## 3) Stale room-state references

### User-visible behavior

- References may point to content no longer resolvable by current state.
- UI should preserve non-breaking fallback text and avoid hard failures.

### Support response

- Ask for room ID, event ID, and timestamp.
- Validate latest room-state event and compare with resolved document/index state.
- Escalate reconciliation fixes to module owner if stale pointers persist.

## Escalation

- First-line: support triage + on-call operations.
- Second-line: module owners (governance, education, mutual-aid, storage/IPFS).
- Incident declaration threshold: repeated cross-room failures or sustained inability to access critical governance flows.
