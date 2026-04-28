# Frontend Consolidation Archive Signoff Package

Date: 2026-04-13 (UTC)
Canonical shell target: `apps/blackout-client`
Archive candidates: `apps/blackout-web`, `apps/web`, `apps/blackout-gov`, `_port`, `legacy/element`

## Executive recommendation

**Recommendation: NO-GO (defer duplicate-shell archive). One blocker class — wrapper parity — has been resolved early; the remaining blockers are migration backlog (BKL) and boundary exceptions.**

Rationale (evidence-backed):
1. Feature inventory and disposition coverage are complete, but a non-trivial `ported` migration set remains open (28 items) and is not yet implemented in canonical runtime.
2. Wrapper parity report **now PASSES** for deep links, notifications, lifecycle hooks, and share. WRAP-001..WRAP-003 are closed; WRAP-004 share is closed and camera/media-pick is deferred to BKL-006 (no canonical consumer for composer attachments yet). Wrappers can be repointed to `apps/blackout-client` once BKL items finish landing.
3. Boundary audit still lists open exceptions (forum/moderation/blackout-web monolith extraction), which increases archive risk if duplicate shells are removed now.

---

## Signoff criteria review

| Criterion | Status | Evidence | Signoff note |
|---|---|---|---|
| Every custom/legacy feature has disposition + evidence | **PASS** | Parity matrix contains 84 feature rows across all required surfaces; disposition table classifies all 84 with rationale/owner/target. | Inventory/disposition artifact completeness is sufficient for review. |
| Canonical registry renders all approved routes/nav/settings | **PARTIAL (BLOCKED)** | Migration backlog still tracks 28 `ported` items with critical-path dependencies. | Canonical covers `kept` set but not yet all approved `ported` capabilities. |
| Desktop/mobile wrappers consume canonical behavior without feature forks | **PASS** (2026-04-27) for the contract surface; wrapper-host runtime cutover is a separate operational step. | Wrapper parity report now marks parity vs canonical target as PASS for deep links, notifications, lifecycle hooks, and share. Camera/media-pick deferred to BKL-006 (no canonical consumer yet). | Canonical client implements the same `blackout:native-event` contract used by `apps/blackout-web`; wrappers can switch host runtime once the BKL ports below are complete. |
| Architecture boundary compliance (UI via SDK/protocol) | **PARTIAL** | Boundary audit documents governance/deaddrop fixes plus open exceptions with owner/date. | Must close listed exceptions before archive cutover. |

---

## Evidence package (review-ready)

- Feature inventory baseline: `docs/architecture/frontend-consolidation-parity-matrix.md`
- Disposition decisions: `docs/architecture/frontend-consolidation-disposition.md`
- Ported implementation backlog: `docs/architecture/frontend-consolidation-migration-backlog.md`
- Boundary compliance audit: `docs/architecture/frontend-consolidation-boundary-audit.md`
- Wrapper parity verification: `docs/architecture/frontend-wrapper-parity-report.md`
- CI anti-drift safety gates: `docs/architecture/frontend-consolidation-ci-gates.md`

Quantitative snapshot:
- Parity matrix rows: **84**
- Disposition rows: **84**
- Ported rows pending migration: **28**
- Documented wrapper blocker IDs: **WRAP-001..WRAP-004** (WRAP-001..WRAP-003 closed 2026-04-27; WRAP-004 share closed, camera deferred to BKL-006)

---

## Archive checklist

### A. Artifact and ownership readiness
- [x] Parity matrix complete across all scoped surfaces.
- [x] Disposition complete for every feature row.
- [x] Every `ported` item has owner and mapped backlog entry.
- [x] CI anti-drift checks configured for matrix/disposition/backlog synchronization.

### B. Canonical feature readiness (must all be true before archive)
- [ ] All P0/P1 migration backlog items implemented in `apps/blackout-client`.
- [ ] Route/nav/settings contributions from approved `ported` items present in canonical manifests/registry.
- [ ] Boundary exceptions (forum/moderation/monolith extraction) closed or formally accepted with executive waiver.

### C. Wrapper parity readiness (must all be true before archive)
- [x] `blackout-mobile` bridge semantics run against canonical `apps/blackout-client` runtime — deep-link, notification (token + interaction), resume_sync, share all consume the same `globalThis` `blackout:native-event` channel (2026-04-27).
- [x] `blackout-desktop` deep-link/notification/unread/lifecycle flows run against canonical runtime — Tauri `deep-link://new-url` listener and `set_unread_count` invoke wired up in `apps/blackout-client/src/platform/initDesktopBridge.ts` (2026-04-27).
- [x] WRAP-001..WRAP-003 closed with verification evidence; WRAP-004 share closed with camera deferred to BKL-006 (no canonical consumer for composer attachments yet).

### D. Release and rollback controls
- [ ] Archive PR includes rollback strategy (re-enable legacy runtime path if regression).
- [ ] Release notes include user-impact callouts for deprecated/redirected legacy surfaces.
- [ ] Post-cutover smoke validation completed on web + desktop + mobile wrappers.

---

## Blocking issues and required closure

| Blocker ID | Severity | Status | Owner | Required action | Target ETA |
|---|---|---|---|---|---|
| WRAP-001 | High | **Closed 2026-04-27** | Frontend Platform Team | Canonical deep-link bridge compatibility layer landed in `apps/blackout-client/src/platform/{native-bridge-contract.ts,initDesktopBridge.ts,NativeBridgeListener.tsx}`; tests in `apps/blackout-client/tests/unit/native-bridge-{contract,listener}.test.*`. | 2026-04-29 (closed early) |
| WRAP-002 | High | **Closed 2026-04-27** | Frontend Notifications Team | Notification bridge parity landed in `apps/blackout-client/src/platform/{NativeBridgeListener.tsx,NotificationTokenBroker.tsx,UnreadCountBroadcaster.tsx,initDesktopBridge.ts}`; tests in `apps/blackout-client/tests/unit/{native-bridge-listener,notification-token-broker,unread-count-broadcaster,init-desktop-bridge}.test.*`. | 2026-05-03 (closed early) |
| WRAP-003 | Medium | **Closed 2026-04-27** | Frontend Platform Team | Lifecycle parity landed in `apps/blackout-client/src/platform/LifecycleSyncBroker.tsx`; tests in `apps/blackout-client/tests/unit/lifecycle-sync-broker.test.tsx`. | 2026-05-06 (closed early) |
| WRAP-004 | Medium | **Closed 2026-04-27 (share); camera deferred to BKL-006** | Frontend Media Team | Native share parity landed in `apps/blackout-client/src/platform/nativeMediaBridge.ts`; tests in `apps/blackout-client/tests/unit/native-media-bridge.test.ts`. Camera/media-pick deferred to BKL-006 because composer attachment surfaces are not yet ported. | 2026-05-10 (share closed early) |
| EXC-001 / EXC-002 / EXC-003 | Medium | Open | Core/Moderation/Platform teams | Close boundary-audit exceptions or produce explicit waiver with risk acceptance. | 2026-05-08 |

---

## Final signoff statement for reviewers

At this time, the consolidation package is **review-ready** but **not archive-ready**.  
Proceed with migration implementation and wrapper/boundary closure; return for archive signoff once checklist sections B/C are fully green.
