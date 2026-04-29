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
| Notifications | **Pass** for current host: push token registration + receive/action callbacks dispatch bridge events and room navigation intent. | **Partial pass**: native notify + unread count command exist via Tauri invoke commands. | **Pass** (WRAP-002 closed 2026-04-27): canonical client routes `notification_interacted` events via react-router (`<NativeBridgeListener />`), persists `notification_token` payloads in localStorage and registers a Matrix HTTP pusher when `VITE_BLACKOUT_PUSH_GATEWAY_URL` is configured (`<NotificationTokenBroker />`), broadcasts `unread_count_changed` from the canonical `totalUnreadAtom` (`<UnreadCountBroadcaster />`), and forwards those events to Tauri's `set_unread_count` command from `initDesktopBridge.ts`. | **Pass** |
| Lifecycle hooks | **Pass** for current host: mobile foreground/background emits resume-sync bridge event; Android back button handling exists. | **Pass** for shell lifecycle: tray toggle, minimize-to-tray, single-instance handling implemented. | **Pass** (WRAP-003 closed 2026-04-27): canonical client mounts `<LifecycleSyncBroker />` which consumes `resume_sync` events by calling `mx.retryImmediately()` and re-emits `resume_sync` from the Page Visibility API on hidden→visible transitions, giving desktop Tauri webview and plain browser sessions parity with native mobile foreground/background. | **Pass** |
| Share / camera / media bridges | **Partial pass**: native share helper exists; camera/plugin permissions configured in Capacitor. | **N/A/Partial**: desktop uses native window + notification shell but no explicit share/camera bridge layer. | **Pass** (WRAP-004 share closed 2026-04-27, camera/media-pick closed 2026-04-27 with BKL-006): canonical client exposes `nativeShare(payload)` + `nativeCanShare()` (Capacitor share → Web Share API → clipboard fallback) and `nativePickPhoto({ source })` (Capacitor `@capacitor/camera` → `<input type="file" capture>` fallback) in `apps/blackout-client/src/platform/nativeMediaBridge.ts`. The media-pipeline customization in BKL-006 ports the canonical consumer surface needed to render picked photos. | **Pass** |

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
- `apps/blackout-client` entry currently initializes web app + service worker/session sync, and (post WRAP-001/WRAP-002) initializes the desktop Tauri deep-link listener, the unread-count→Tauri sink, and mounts the React deep-link/notification router-bridge plus the unread-count broadcaster and notification-token broker. Lifecycle and share/camera bridges are still pending under WRAP-003 and WRAP-004.【F:apps/blackout-client/src/main.tsx†L1-L90】【F:apps/blackout-client/src/platform/native-bridge-contract.ts†L1-L75】【F:apps/blackout-client/src/platform/initDesktopBridge.ts†L1-L60】【F:apps/blackout-client/src/platform/NativeBridgeListener.tsx†L1-L30】【F:apps/blackout-client/src/platform/UnreadCountBroadcaster.tsx†L1-L25】【F:apps/blackout-client/src/platform/NotificationTokenBroker.tsx†L1-L120】

---

## Regressions / unresolved parity gaps

| Gap ID | Area | Severity | Status | Regression risk if wrappers switch to canonical now | Owner | Remediation ETA |
|---|---|---|---|---|---|---|
| WRAP-001 | Deep-link bridge parity (`deep_link_opened`) | High | **Closed 2026-04-27** | Resolved: canonical bridge contract, Tauri listener, and react-router deep-link handler shipped in `apps/blackout-client/src/platform/`. Unit tests cover URL parsing, event round-trip, and react-router navigation. | Frontend Platform Team | 2026-04-29 (closed early) |
| WRAP-002 | Notification bridge parity (`notification_token`, `notification_interacted`, unread sync) | High | **Closed 2026-04-27** | Resolved: `notification_interacted` now routes via react-router; `notification_token` persists locally and (when `VITE_BLACKOUT_PUSH_GATEWAY_URL` is set) registers a Matrix HTTP pusher via `mx.setPusher`; `unread_count_changed` is broadcast from `totalUnreadAtom` and forwarded to Tauri's `set_unread_count`. | Frontend Notifications Team | 2026-05-03 (closed early) |
| WRAP-003 | Lifecycle parity (`resume_sync`, app foreground/background + desktop visibility lifecycle) | Medium | **Closed 2026-04-27** | Resolved: `<LifecycleSyncBroker />` consumes `resume_sync` events (calls `mx.retryImmediately()`) and re-emits them on Page Visibility hidden→visible transitions, covering desktop Tauri webview and plain browser sessions. | Frontend Platform Team | 2026-05-06 (closed early) |
| WRAP-004 | Native share/camera/media bridge parity | Medium | **Closed 2026-04-27** | Resolved fully: `nativeShare()` delegates to `@capacitor/share` → `navigator.share` → `navigator.clipboard.writeText`. Camera/media-pick lands in BKL-006 via `nativePickPhoto({ source })` which delegates to `@capacitor/camera` (camera or gallery, native sheet) → `<input type="file" accept="image/*" capture>` fallback. The media-pipeline manifest in BKL-006 provides the canonical consumer surface. | Frontend Media Team | 2026-05-10 (closed early) |

---

## Recommendation

- **Do not switch wrapper host runtime to `apps/blackout-client` until WRAP-001..WRAP-004 are closed.**
- Implement a canonical bridge layer in `apps/blackout-client` compatible with current wrapper event/command semantics, then run wrapper smoke tests for deep links, notifications, lifecycle, and media/share bridges before cutover.
