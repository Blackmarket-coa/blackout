# Blackout Frontend Comparison (new frontend vs previous frontends vs old blackout-client)

**Date:** 2026-04-14  
**Repo checked:** `/workspace/blackout`

## Scope and interpretation

To make this comparison concrete, this report treats:

- **New Blackout frontend** as `apps/blackout-web` (the actively developed Vite web client with mobile/desktop bridge hooks).
- **Previous frontends** as the lighter/skeleton paths `apps/web` and `packages/web`.
- **Old blackout-client** as `apps/blackout-client` (Cinny-based, Matrix/crypto-heavy, plugin-driven client).

This interpretation is based on workspace layout and package metadata.

## High-level snapshot

| Surface | Purpose in repo | Maturity signal | Runtime/UI stack |
| --- | --- | --- | --- |
| `apps/blackout-web` | Primary daily chat web shell and bridge target for native wrappers | Broad feature surface, many components/settings/services, Vite + tests | TypeScript app shell + custom render pipeline + Vite |
| `apps/web` | Minimal placeholder web entry | Placeholder-only | TS module export scaffold |
| `packages/web` | Small React page/component prototype surface | Limited scope, simple pages | React + TS components/hooks |
| `apps/blackout-client` | Legacy/old Cinny-based “full” client | Largest and deepest implementation, plugin/module architecture, Matrix-heavy | React + Jotai + React Query + router + feature registry |

## Detailed comparison

### 1) Architecture and extensibility

- **`apps/blackout-web` (new):** central `BlackoutWebApp` class coordinates app state, feature panels, onboarding, settings, telemetry, and bridge events from one imperative app shell. This favors rapid UX iteration but concentrates complexity in one class file. (`src/app.ts`).
- **`apps/web` (previous):** explicit placeholder entry with no feature wiring.
- **`packages/web` (previous):** lightweight React composition (`App` -> `ChatPage` + basic page components), useful as a simple prototype but not a full product shell.
- **`apps/blackout-client` (old):** modular feature architecture with registry/composition pipeline and runtime plugin ordering. This is more extensible and governance-friendly for large feature sets, at cost of higher complexity.

### 2) Feature depth

- **New frontend (`apps/blackout-web`)** has broad UX domains in one surface: governance/economics/federation/townhall/revenue/platform ops panels, command palette, widget host, onboarding, attachment/stego helpers, etc.
- **Previous frontends** are thin:
  - `apps/web` has effectively no shipped UI behavior yet.
  - `packages/web` has minimal chat/login/settings placeholders and thin hooks/components.
- **Old blackout-client** has by far the broadest implementation depth and protocol/client internals (large source tree, Matrix bootstrap/auth/crypto flows, plugin modules).

### 3) Platform strategy (web/mobile/desktop)

- **New frontend (`apps/blackout-web`)** explicitly initializes both:
  - Capacitor mobile bridge (keyboard/status bar/deep-link-like event flow), and
  - Tauri desktop bridge listeners.
- Mobile wrapper build scripts point directly to `@blackout/blackout-web build:web`, making it the effective shared bundle for mobile packaging.
- **Old blackout-client** is web-first and rich, but the current wrapper scripts in this repo are aligned to `blackout-web` for packaged mobile flow.

### 4) Operational readiness and testing posture

- `apps/blackout-web` includes targeted scripts for unit/integration/mobile/e2e plus Vite build/preview, indicating release intent for this path.
- `apps/web` only typecheck-like scripts and no runnable dev server.
- `packages/web` is still lightweight and not represented as the canonical deploy target in repo docs/scripts.
- `apps/blackout-client` has mature dev/build/type/lint scaffolding and very broad dependency surface; it remains the deepest “old client” code path.

### 5) Practical trade-off summary

- If your goal is **fast product iteration aligned with mobile/desktop wrappers in this monorepo**, `apps/blackout-web` is the pragmatic “new frontend” center.
- If your goal is **maximum Matrix-native depth and long-term modular extensibility**, old `apps/blackout-client` is still technically richer.
- `apps/web` and `packages/web` are better understood as **transition/prototype tracks**, not full production frontends.

## Evidence appendix (repository facts)

- `apps/web` is explicitly placeholder-only and marked non-canonical in metadata + entrypoint.
- `packages/web` renders a minimal chat page + simple login/settings stubs.
- `apps/blackout-web` app bootstrap wires mobile and desktop bridge initialization in `main.ts`, then mounts `BlackoutWebApp` with extensive domain state in `app.ts`.
- `blackout-mobile` scripts consume `@blackout/blackout-web build:web`.
- `apps/blackout-client` bootstraps React providers + matrix bootstrapper + feature route composition from a feature registry.

## Bottom line

Compared to previous frontend experiments (`apps/web`, `packages/web`), the **new frontend (`apps/blackout-web`) is materially more complete and operationally aligned with wrappers**.  
Compared to the **old blackout-client**, it is currently more wrapper-integrated and product-shell oriented, while the old client remains more modular and deeper on Matrix/client internals.

## Product recommendation: free/default modules vs paid add-ons (to stand out)

This section proposes a monetization split aligned with the current feature entrypoint catalog.

### Free + default (enable for every workspace)

These should be baseline because they drive daily habit and make the core product feel complete out of the box:

1. **Core messaging UX**
   - `timeline_virtualized`, `timeline_threads`, `timeline_receipts`, `timeline_typing`
   - `rich_composer`, `composer_replies`, `composer_edits`
   - `dm_list`, `search_ui`, `quick_switcher`
2. **Trust/safety baseline**
   - `e2ee_defaults`, `dm_permissions`, `nsfw_toggle`, `slowmode`
3. **Onboarding + identity polish**
   - `welcome_screen`, `onboarding_flow`, `extended_profile`, `server_banner`, `invite_splash`
4. **Differentiator to make Blackout memorable (free tier)**
   - **Basic steganography** via `stego_toolkit` / `steganography_layer`
   - include simple hide/reveal workflow and one default carrier type (e.g., image)

### Paid (Pro / Team / Enterprise add-ons)

Use paid tiers for high-cost, high-governance, or advanced-opsec capabilities:

1. **Advanced steganography add-ons (your idea, recommended)**
   - gated upgrades tied to `ephemeral_stego_lifecycle` and advanced `steganography_layer` options:
     - scheduled key/passphrase rotation
     - multi-carrier support (image + audio + document)
     - policy-based expiry and remote-burn workflows
     - audit trails for stego policy events
2. **Governance + operations suites**
   - `governance_entitlements`, `cooperative_governance`, `audit_log`, `automod_panel`, `raid_protection`, `timeout_system`
3. **Federation + scale controls**
   - `federation_boost_policy`, `cell_routing`, `numbers_station`
4. **Premium real-time/community experiences**
   - `townhall_sfu`, `stage_channels`, `soundboard`, optional `rich_presence` features for branded communities

### Suggested packaging model

- **Free**: complete chat + security baseline + basic stego.
- **Pro (creator/community)**: advanced stego pack + stage/townhall media features.
- **Team (org/cell ops)**: governance + moderation + audit controls.
- **Enterprise/Federation**: federation boost policy, cell routing, compliance controls, SLA support.

### Why this positioning can beat competitors

- Most competitors charge for utility/cosmetics; you can offer a unique **opsec-first baseline** by making basic stego free.
- Paid value then becomes clearly “advanced operational capability” (policy, compliance, lifecycle automation), which organizations will pay for.
- This keeps the free tier genuinely sticky while preserving clear monetization headroom.
