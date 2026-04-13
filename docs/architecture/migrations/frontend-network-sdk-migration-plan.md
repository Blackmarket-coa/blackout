# Frontend network-call SDK migration plan

## Scope

This migration targets message media resolution paths that were still using ad hoc `fetch()` calls in the frontend layer:

1. `app/components/messages/mediaShared.tsx`
2. `app/components/bmc/messages/mediaShared.tsx`

## Diff plan

1. Introduce typed retry contracts in shared SDK client interfaces (`RetryPolicy`, request-level retry metadata).
2. Extend fetch-based SDK adapter to support configurable retries and retryable/fatal error classification.
3. Introduce a typed media adapter (`createMediaClient`) with `fetchBlob` and `fetchArrayBuffer` methods.
4. Wire the frontend feature layer to shared SDK adapters (`mediaClient`) and remove direct `fetch()` usage.
5. Preserve and strengthen loading/failure UX by surfacing retryable failures with explicit guidance.
6. Add unit tests that lock adapter contracts for retries, failure semantics, and media-array-buffer behavior.

## Acceptance checks

- No direct `fetch()` remains in migrated media feature modules.
- Shared SDK adapter owns retry policy and error typing.
- Media-loading UI continues to expose loading and error states.
- Unit tests cover contracts and adapters used by migrated feature modules.
