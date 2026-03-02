# Client ↔ Server alignment snapshot (Blackout vs Blackout_server)

Date: 2026-03-02

## Scope checked

- Client repository: this repo (`blackout`).
- Server repository reference: `https://github.com/Blackmarket-coa/Blackout_server` (HEAD checked via `git ls-remote`, then shallow clone for inspection).

## What appears aligned

1. **Blackout signaling event model exists on both sides.**
   - Client docs reference `m.blackout.signal` as part of the p2p data-plane architecture.
   - Server README declares acceptance and validation of `m.blackout.signal` in blackout mode.

2. **Self-healing roadmap messaging appears aligned at a high level.**
   - Client and server READMEs both reference a distributed self-healing blueprint + tracker model.

## What is still likely not aligned (or not yet integrated end-to-end)

1. **Townhall backend contract may not be implemented in Blackout_server.**
   - Client contains a `TownhallTokenService` using `POST /api/townhall/token` and test coverage for that endpoint contract.
   - No obvious `townhall` or `/api/townhall/token` implementation was found in the sampled `Blackout_server` checkout.

2. **Client townhall rollout checklist is still incomplete.**
   - The client build plan still has unchecked items (Matrix state event policy schema, LiveKit/TURN provisioning, moderation/audit controls, observability, 250/500 load gates, security signoff).

3. **Client still tracks post-rollout maintenance backlog.**
   - Project tracker is marked 100% for rollout gates, but explicitly retains a maintenance backlog stream in docs (unfinished-code marker management and follow-up epics).

## Practical next checks to confirm full alignment

1. Define a **shared contract doc** for townhall token request/response schema and auth semantics.
2. Add a **cross-repo integration test**:
   - client `TownhallTokenService` request shape ↔ server token endpoint response contract.
3. Pin both repos to a **compatibility matrix** (`client commit` ↔ `server commit`) in release docs.

