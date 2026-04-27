# Frontend Wrapper Parity Report

Date: 2026-04-13 (UTC)
Canonical runtime target: `apps/blackout-client`
Wrapper surfaces audited: `blackout-mobile`, `blackout-desktop`

## Method

Static parity audit comparing wrapper integration points against:
1. current wrapper host runtime (`apps/blackout-web`), and
2. canonical consolidation target (`apps/blackout-client`).

Evidence sources include wrapper configs/bridge code and web-runtime bridge handlers.

---

## Parity status by native integration area

| Integration area | blackout-mobile (current) | blackout-desktop (current) | Canonical `apps/blackout-client` readiness | Parity vs canonical target |
|---|---|---|---|---|
| Deep links | **Pass** for current host: handles `matrix://` + `blackout://` in `appUrlOpen`, dispatches bridge events to web runtime. | **Pass** for current host: Tauri deep-link plugin enabled with `matrix` and `blackout` schemes, forwards URLs to web bridge. | **Pass** (WRAP-001 closed 2026-04-27): canonical client now exposes the same `native-bridge-contract` types/dispatchers in `apps/blackout-client/src/platform/native-bridge-contract.ts`, a Tauri `deep-link://new-url` listener in `apps/blackout-client/src/platform/initDesktopBridge.ts`, and a `<NativeBridgeListener />` mounted under the router that routes `deep_link_opened` events to `/room/:roomId` via react-router. Mobile dispatch path (Capacitor `appUrlOpen` → `dispatchNativeBridgeEvent`) is unchanged and is consumed by the new listener. | **Pass** |
| Notifications | **Pass** for current host: push token registration + receive/action callbacks dispatch bridge events and room navigation intent. | **Partial pass**: native notify + unread count command exist via Tauri invoke commands. | **Fail**: canonical client entry has no native notification bridge contract wiring. | **Fail** |
| Lifecycle hooks | **Pass** for current host: mobile foreground/background emits resume-sync bridge event; Android back button handling exists. | **Pass** for shell lifecycle: tray toggle, minimize-to-tray, single-instance handling implemented. | **Fail/Gap**: canonical client has no wrapper lifecycle contract consumption path. | **Fail** |
| Share / camera / media bridges | **Partial pass**: native share helper exists; camera/plugin permissions configured in Capacitor. | **N/A/Partial**: desktop uses native window + notification shell but no explicit share/camera bridge layer. | **Fail/Gap**: canonical client runtime does not expose wrapper bridge adapters for native share/camera contracts. | **Fail** |

---

## Before/after comparison (wrapper host runtime)

### Before consolidation (wrappers host `apps/blackout-web`) — observed status
- Mobile and desktop wrappers are explicitly wired to `apps/blackout-web` distribution/dev runtime and consume its native bridge contract.
- Deep links/notification/lifecycle flows are functionally integrated through `apps/blackout-web/src/main.ts` + `platform/native-bridge-contract.ts`.

### After consolidation target (wrappers host `apps/blackout-client`) — current readiness
- Readiness is **not yet parity-complete**.
- Core blocker: wrappers currently depend on `apps/blackout-web` bridge contract surface; equivalent contract wiring is not yet present in `apps/blackout-client` entry/runtime.

Result: moving wrappers to canonical `apps/blackout-client` **today** would regress deep-link and native-bridge-dependent flows until bridge parity work lands.

---

## Evidence highlights

- Mobile wrapper points to `../apps/blackout-web/dist` and initializes native deep-link, push, lifecycle, and share bridges that dispatch to the blackout-web bridge contract.【F:blackout-mobile/capacitor.config.ts†L5-L6】【F:blackout-mobile/src/mobile-bootstrap.ts†L1-L105】【F:blackout-mobile/src/mobile-bootstrap.ts†L133-L143】
- Desktop wrapper build/dev also targets `apps/blackout-web`; deep-link schemes include both `matrix` and `blackout`; native commands cover unread count and notifications.【F:blackout-desktop/src-tauri/tauri.conf.json†L6-L12】【F:blackout-desktop/src-tauri/tauri.conf.json†L54-L61】【F:blackout-desktop/src-tauri/src/main.rs†L20-L43】
- `apps/blackout-web` has explicit mobile/desktop bridge initialization and a typed native bridge contract used by wrappers.【F:apps/blackout-web/src/main.ts†L1-L95】【F:apps/blackout-web/src/platform/native-bridge-contract.ts†L1-L78】
- `apps/blackout-client` entry currently initializes web app + service worker/session sync, and (post WRAP-001) also initializes the desktop Tauri deep-link listener and mounts the React deep-link router-bridge. Notification, lifecycle, and share/camera bridges are still pending under WRAP-002..WRAP-004.【F:apps/blackout-client/src/main.tsx†L1-L80】【F:apps/blackout-client/src/platform/native-bridge-contract.ts†L1-L75】【F:apps/blackout-client/src/platform/initDesktopBridge.ts†L1-L33】【F:apps/blackout-client/src/platform/NativeBridgeListener.tsx†L1-L21】

---

## Regressions / unresolved parity gaps

| Gap ID | Area | Severity | Status | Regression risk if wrappers switch to canonical now | Owner | Remediation ETA |
|---|---|---|---|---|---|---|
| WRAP-001 | Deep-link bridge parity (`deep_link_opened`) | High | **Closed 2026-04-27** | Resolved: canonical bridge contract, Tauri listener, and react-router deep-link handler shipped in `apps/blackout-client/src/platform/`. Unit tests cover URL parsing, event round-trip, and react-router navigation. | Frontend Platform Team | 2026-04-29 (closed early) |
| WRAP-002 | Notification bridge parity (`notification_token`, `notification_interacted`, unread sync) | High | Open | Push token registration, notification click routing, and unread tray sync may break/regress. | Frontend Notifications Team | 2026-05-03 |
| WRAP-003 | Lifecycle parity (`resume_sync`, app foreground/background + desktop visibility lifecycle) | Medium | Open | Resume-sync and lifecycle-driven refresh behavior may diverge. | Frontend Platform Team | 2026-05-06 |
| WRAP-004 | Native share/camera/media bridge parity | Medium | Open | Mobile native share/camera pathways may fall back or become inconsistent. | Frontend Media Team | 2026-05-10 |

---

## Recommendation

- **Do not switch wrapper host runtime to `apps/blackout-client` until WRAP-001..WRAP-004 are closed.**
- Implement a canonical bridge layer in `apps/blackout-client` compatible with current wrapper event/command semantics, then run wrapper smoke tests for deep links, notifications, lifecycle, and media/share bridges before cutover.
