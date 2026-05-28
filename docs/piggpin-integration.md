# piggPin Integration

## Overview

piggPin is a peer-to-peer encrypted collaborative cartography application — no
accounts, no cloud, all data encrypted client-side. It is embedded in Blackout
as a Coalition tab via an iframe pointing to the piggPin live site.

piggPin runs fully independently with its own IndexedDB store, WASM crypto
engine, WebRTC P2P sync, and Leaflet map tiles. It has no dependency on
the Blackout API or Matrix protocol.

## Architecture

```
Blackout Shell
  └── Coalition View
        └── "Map" tab (when piggpin flag = true)
              └── PiggPinView (React component)
                    └── <iframe src="https://app.piggpin.space">
                          └── piggPin SPA (fully self-contained)
```

The iframe loads piggPin from its own origin — no CORS issues (piggPin
permits framing via its CSP). Updates to piggPin take effect immediately
with no Blackout rebuild.

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Live site embed** | piggPin deploys independently — no build coupling, no static file management, no path resolution issues |
| **Client-only integration** | No backend API bridge — piggPin data stays client-side, encrypted, never touches the Blackout API |
| **Fully decoupled** | piggPin runs on its own domain with independent infrastructure — zero shared state with Blackout |

## File Inventory

All paths relative to `<blackout-root>/apps/blackout-client/`.

### Feature Module (5 files — created)

| File | Purpose |
|------|---------|
| `src/app/features/piggpin/PiggPinView.tsx` | iframe wrapper — loading spinner, loaded iframe, error + retry (15s timeout) |
| `src/app/features/piggpin/manifest.ts` | Feature definition — id `'piggpin'`, capability gate `{ flags: ['piggpin'] }` |
| `src/app/features/piggpin/routes.ts` | Route `/coalition/map` |
| `src/app/features/piggpin/nav.ts` | Sidebar navigation item |
| `src/app/features/piggpin/index.ts` | Re-exports `piggpinFeature` |

### Feature Registration (4 files — modified)

| File | Change |
|------|--------|
| `src/app/core/features/manifest.ts` | Added `'piggpin'` to `featureModuleManifest` allowlist |
| `src/app/core/features/featureFlags.ts` | Added `piggpin: boolean` flag, default `true` |
| `src/app/core/features/coreModules.ts` | Registered `piggpinFeature` with `piggpin` flag |
| `../../packages/core/src/coalition/events.ts` | Added `'piggpin'` to `COALITION_TABS` constant |

### Coalition Integration (2 files — modified)

| File | Change |
|------|--------|
| `src/app/state/coalition.ts` | Added `piggpin: 'Map'` to `COALITION_TAB_LABELS` |
| `src/app/features/coalition/CoalitionView.tsx` | Conditional `piggpin` tab injection after `'map'` + `PiggPinView` render |

## Feature Flag

| Property | Value |
|----------|-------|
| Name | `piggpin` |
| Type | `boolean` |
| Default | `true` |
| Env override | `BLACPIGGPIN=true\|false` |
| Scope | Toggles the Coalition tab AND the `/coalition/map` route |

Disabling: set `BLACPIGGPIN=false`, rebuild, redeploy.
The tab and route are removed from the bundle — zero runtime footprint.

## Coalition Tab Integration

Tab order: `Chat | For You | Local | Map | Events | Rings | Shop | Tasks | Kits | Documents`

The piggPin tab ("Map") appears after "Local." `CoalitionView.tsx` dynamically
computes the tab list:

- If `piggpin` flag is true and `'piggpin'` not in the list — splice after `'map'`
- If `piggpin` flag is false — filter `'piggpin'` out
- When the `'piggpin'` tab is active, renders `<PiggPinView />`

## Data Isolation

piggPin runs on `app.piggpin.space` — a completely separate origin from
Blackout. All storage is isolated by the browser's same-origin policy:

| Storage | piggPin | Blackout |
|---------|---------|----------|
| IndexedDB | `app.piggpin.space` origin | Blackout origin |
| localStorage | `app.piggpin.space` origin | Blackout origin |
| Cookies | `app.piggpin.space` origin | Blackout origin |

No shared keys, no shared databases, no cross-origin access.

## Updating piggPin

piggPin is independently deployed. Updates to `app.piggpin.space` take
effect in Blackout immediately — the iframe always loads the live site.
No Blackout rebuild, no static file copy, no path configuration needed.

The piggPin source repository is the single source of truth for the
application. Deploy it to the live site whenever changes are ready.

## Dependency Graph

```
piggpin feature enabled?
  ├── YES → CoalitionView includes "Map" tab → PiggPinView renders iframe
  │         → Sidebar shows "Map" nav item → /coalition/map route active
  └── NO  → Tab hidden, route unregistered, zero DOM footprint
```

## Troubleshooting

### Coalition tab doesn't appear
- Verify `piggpin` flag is `true` (or `BLACPIGGPIN=true` is set)
- Restart the dev server after configuration changes
- Hard-refresh the browser

### Map tab shows loading spinner or error
- Verify `https://app.piggpin.space` is reachable from the browser
- Check the browser console for CSP or CORS errors
- piggPin's iframe has a 15-second timeout — after that it shows a retry button
