# SDK internal import debt register

This register tracks approved `matrix-js-sdk/src/*` debt used under `_port/**`.

- Baseline snapshot: `tools/ci/baselines/sdk-internal-import-budget.json`
- Enforcement guard: `tools/ci/check-sdk-internal-import-budget.mjs`
- Review rule: any increase requires an explicit debt-register update in the same PR.

| Category | Owner | Current Count | Approved Budget | Update Reference | Notes |
| --- | --- | ---: | ---: | --- | --- |
| @types | Client Platform | 2 | 2 | baseline-2026-04-25 | Legacy typed helper imports pending public re-export adoption. |
| base64 | Client Platform | 1 | 1 | baseline-2026-04-25 | Replace with stable public utility export when available. |
| browser-index | Client Platform | 2 | 2 | baseline-2026-04-25 | Browser bootstrap internals still depend on legacy entrypoint behavior. |
| crypto-api | E2EE Platform | 87 | 87 | baseline-2026-04-25 | Migrate to public crypto contracts package surface area. |
| event-mapper | Client Platform | 1 | 1 | baseline-2026-04-25 | Single legacy mapper import retained for parity with `_port`. |
| extensible_events_v1 | Events Platform | 15 | 15 | baseline-2026-04-25 | Move to stable event builder/parser APIs when released. |
| feature | Client Platform | 2 | 2 | baseline-2026-04-25 | Internal feature-flags wiring should move to public capability API. |
| http-api | Client Platform | 1 | 1 | baseline-2026-04-25 | Target public HTTP client abstractions. |
| indexeddb-worker | Storage Platform | 1 | 1 | baseline-2026-04-25 | Legacy worker import; migrate once storage worker public path is exposed. |
| interactive-auth | Auth Platform | 6 | 6 | baseline-2026-04-25 | Align with public interactive-auth exports. |
| logger | Client Platform | 286 | 286 | baseline-2026-04-25 | Replace with public logger export or local logger adapter. |
| matrix | Client Platform | 1119 | 1119 | baseline-2026-04-25 | Largest debt bucket; prioritize replacement with top-level SDK entrypoints. |
| matrixrtc | Calling Platform | 11 | 11 | baseline-2026-04-25 | Move to public MatrixRTC package export. |
| models | Client Platform | 6 | 6 | baseline-2026-04-25 | Switch to public model types and read-receipt APIs. |
| NamespacedValue | Client Platform | 6 | 6 | baseline-2026-04-25 | Consolidate namespace helpers behind public symbols. |
| oidc | Auth Platform | 13 | 13 | baseline-2026-04-25 | Migrate OIDC flow code to stable auth exports. |
| pushprocessor | Notifications Platform | 8 | 8 | baseline-2026-04-25 | Replace with public push-rule processing API. |
| randomstring | Client Platform | 17 | 17 | baseline-2026-04-25 | Prefer public random utility function surface. |
| ReEmitter | Client Platform | 1 | 1 | baseline-2026-04-25 | Remove direct re-emitter import through local event wrapper. |
| rendezvous | Auth Platform | 7 | 7 | baseline-2026-04-25 | Migrate rendezvous flows to public login/session exports. |
| room-hierarchy | Spaces Platform | 3 | 3 | baseline-2026-04-25 | Move to public room hierarchy helpers. |
| secret-storage | E2EE Platform | 2 | 2 | baseline-2026-04-25 | Replace with public secret storage API and helpers. |
| sliding-sync | Sync Platform | 2 | 2 | baseline-2026-04-25 | Use public sliding-sync client constructors. |
| testing | QA Platform | 3 | 3 | baseline-2026-04-25 | Restrict usage to test harness wrappers only. |
| types | Client Platform | 164 | 164 | baseline-2026-04-25 | Gradually move to top-level SDK type exports. |
| utils | Client Platform | 61 | 61 | baseline-2026-04-25 | Replace with public utility APIs or internal wrappers. |
| version-support | Client Platform | 1 | 1 | baseline-2026-04-25 | Move to public version capability probes. |
| webrtc | Calling Platform | 52 | 52 | baseline-2026-04-25 | Migrate call stack imports to public call APIs. |
