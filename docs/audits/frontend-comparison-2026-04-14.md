# Blackout Frontend Comparison (new frontend vs previous frontends vs old blackout-client)

**Date:** 2026-04-14  
**Repo checked:** `/workspace/blackout`

## Correction (2026-04-14): canonical frontend selection

Per current product direction, **`apps/blackout-client` is the new/canonical frontend**.

- Treat prior references in this document to `apps/blackout-web` as “new frontend” as historical analysis context only.
- Updated interpretation for implementation decisions:
  - **New/canonical:** `apps/blackout-client`
  - **Previous/legacy tracks:** `apps/blackout-web`, `apps/web`, `packages/web`

### Practical implications of this correction

1. Feature packaging and monetization should be implemented through the `apps/blackout-client` feature registry/composition path.
2. Layout integrity decisions should anchor to `apps/blackout-client` shell/routes/settings patterns first.
3. Any `apps/blackout-web` guidance in this file should be treated as migration reference, not source-of-truth for new work.


## Scope and interpretation

To make this comparison concrete, this report now treats:

- **New/canonical Blackout frontend** as `apps/blackout-client` (Cinny-based, Matrix/crypto-heavy, plugin-driven client).
- **Previous frontends** as `apps/blackout-web`, `apps/web`, and `packages/web`.

This interpretation reflects the updated product direction from the team.

## High-level snapshot

| Surface | Purpose in repo | Maturity signal | Runtime/UI stack |
| --- | --- | --- | --- |
| `apps/blackout-web` | Transitional/legacy web shell used in earlier migration phases | Broad feature surface, many components/settings/services, Vite + tests | TypeScript app shell + custom render pipeline + Vite |
| `apps/web` | Minimal placeholder web entry | Placeholder-only | TS module export scaffold |
| `packages/web` | Small React page/component prototype surface | Limited scope, simple pages | React + TS components/hooks |
| `apps/blackout-client` | New/canonical frontend (Cinny-based) | Largest and deepest implementation, plugin/module architecture, Matrix-heavy | React + Jotai + React Query + router + feature registry |

## Detailed comparison

### 1) Architecture and extensibility

- **`apps/blackout-web` (previous):** central `BlackoutWebApp` class coordinates app state, feature panels, onboarding, settings, telemetry, and bridge events from one imperative app shell. This favors rapid UX iteration but concentrates complexity in one class file. (`src/app.ts`).
- **`apps/web` (previous):** explicit placeholder entry with no feature wiring.
- **`packages/web` (previous):** lightweight React composition (`App` -> `ChatPage` + basic page components), useful as a simple prototype but not a full product shell.
- **`apps/blackout-client` (new/canonical):** modular feature architecture with registry/composition pipeline and runtime plugin ordering. This is more extensible and governance-friendly for large feature sets, at cost of higher complexity.

### 2) Feature depth

- **Previous frontend (`apps/blackout-web`)** has broad UX domains in one surface: governance/economics/federation/townhall/revenue/platform ops panels, command palette, widget host, onboarding, attachment/stego helpers, etc.
- **Previous frontends** are thin:
  - `apps/web` has effectively no shipped UI behavior yet.
  - `packages/web` has minimal chat/login/settings placeholders and thin hooks/components.
- **New/canonical blackout-client** has by far the broadest implementation depth and protocol/client internals (large source tree, Matrix bootstrap/auth/crypto flows, plugin modules).

### 3) Platform strategy (web/mobile/desktop)

- **Previous frontend (`apps/blackout-web`)** explicitly initializes both:
  - Capacitor mobile bridge (keyboard/status bar/deep-link-like event flow), and
  - Tauri desktop bridge listeners.
- Mobile wrapper build scripts point directly to `@blackout/blackout-web build:web`, making it the effective shared bundle for mobile packaging.
- **New/canonical blackout-client** is web-first and modular; wrapper alignment for mobile packaging should be treated as migration work if `blackout-client` is now canonical.

### 4) Operational readiness and testing posture

- `apps/blackout-web` includes targeted scripts for unit/integration/mobile/e2e plus Vite build/preview, indicating release intent for this path.
- `apps/web` only typecheck-like scripts and no runnable dev server.
- `packages/web` is still lightweight and not represented as the canonical deploy target in repo docs/scripts.
- `apps/blackout-client` has mature dev/build/type/lint scaffolding and very broad dependency surface; it is the deepest and now canonical client path.

### 5) Practical trade-off summary

- If your goal is the **current canonical path**, prioritize `apps/blackout-client` for feature delivery and product decisions.
- If your goal is **maximum Matrix-native depth and long-term modular extensibility**, `apps/blackout-client` remains technically richest.
- `apps/web` and `packages/web` are better understood as **transition/prototype tracks**, not full production frontends.

## Evidence appendix (repository facts)

- `apps/web` is explicitly placeholder-only and marked non-canonical in metadata + entrypoint.
- `packages/web` renders a minimal chat page + simple login/settings stubs.
- `apps/blackout-web` app bootstrap wires mobile and desktop bridge initialization in `main.ts`, then mounts `BlackoutWebApp` with extensive domain state in `app.ts`.
- `blackout-mobile` scripts consume `@blackout/blackout-web build:web`.
- `apps/blackout-client` bootstraps React providers + matrix bootstrapper + feature route composition from a feature registry.

## Bottom line

Compared to `apps/web` and `packages/web`, both `apps/blackout-web` and `apps/blackout-client` are substantially more complete.  
Given updated direction, **`apps/blackout-client` should be treated as the canonical product surface**, with `apps/blackout-web` as legacy/transitional reference.

## Product recommendation: free/default modules vs paid add-ons (to stand out)

This section proposes a monetization split aligned with the canonical `apps/blackout-client` delivery model and feature-module approach.

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

## Implementation guardrails (AI-assisted) to preserve layout integrity and monorepo consistency

Use this as the execution checklist when enabling the free/default vs paid module strategy.

### 1) Keep layout integrity by attaching features to existing UI entry kinds only

- For canonical delivery, map feature controls to stable `apps/blackout-client` feature routes/nav/settings entry points; use `apps/blackout-web/src/settings/feature-entrypoints.ts` only as migration reference taxonomy:
  - `settings_toggle`, `composer_action`, `room_action`, `widget_panel`, `admin_console`, `command_palette`.
- Rule: every new free/default or paid add-on control should map to an existing `UiEntryKind` + stable `id`.
- Avoid introducing ad-hoc panel containers unless there is no existing slot.

### 2) Prevent feature clashes with capability gates and preset layering

- Keep entitlements as data, not hardcoded conditionals in components.
- Use a layered evaluation order:
  1. deployment preset,
  2. workspace/org subscription tier,
  3. user override (if allowed).
- This mirrors existing feature-flag composition patterns in `apps/blackout-client/src/app/core/features/`.

### 3) Keep visual consistency across the monorepo

- Use shared tokens/components first:
  - design tokens from `packages/design`
  - shared primitives from `packages/ui`
  - shared behavior contracts from `packages/core`
- Do not introduce one-off colors/spacing in app surfaces when equivalent tokens already exist.

### 4) Implement stego monetization without UX friction

- Free baseline (`stego_toolkit` / `steganography_layer`) should render with no paywall interruption in core send flow.
- Paid features (`ephemeral_stego_lifecycle` and advanced stego options) should:
  - appear as clearly labeled “Advanced” controls,
  - keep disabled-state affordances visible,
  - route to a single upgrade modal/flow (same pattern everywhere).

### 5) Keep API + contract alignment in monorepo

- Centralize entitlement payload types in shared packages (`packages/contracts` or `packages/blackout-protocol`) and consume through `packages/blackout-sdk`.
- Avoid app-local entitlement type drift.
- Add a single capability resolver module in each frontend surface instead of checking plan logic in many components.

### 6) AI workflow constraints (recommended for your team)

When prompting AI to implement changes, require it to:

1. name exact files before editing,
2. reuse existing `apps/blackout-client` feature ids/routes/settings anchors when possible,
3. show the entitlement decision path (preset/tier/override),
4. list any new token/component additions and why reuse was insufficient,
5. provide targeted validation commands for touched workspaces only.

### 7) Minimum validation matrix before merge

For each feature touched, verify:

- desktop web: visible and non-overlapping in intended panel,
- mobile wrapper path: no composer/keyboard regressions,
- entitlement state transitions: free -> paid -> free fallback behavior,
- analytics events: free feature usage vs upgrade intent events are distinct.

Suggested command baseline:

- `pnpm --filter @blackout/web lint`
- `pnpm --filter @blackout/blackout-web test:unit`
- `pnpm --filter @blackout/blackout-web test:integration`
- `pnpm --filter @blackout/blackout-web build:web`

## Suggested phased rollout plan

1. **Phase 1 (safe UX):** enable free/default modules only + basic stego baseline.
2. **Phase 2 (monetization scaffold):** ship upgrade surface + entitlement resolver + telemetry.
3. **Phase 3 (advanced stego paid):** key rotation, multi-carrier, lifecycle policy controls.
4. **Phase 4 (ops packs):** governance/federation premium packs with org-level controls.

This sequencing keeps the product intuitive first, then monetizes advanced capabilities without destabilizing core layout.

## UX/UI comparison: Blackout vs Stoat vs Discord

This section compares current Blackout frontend direction against Stoat and Discord patterns.

### Information basis

- **Blackout evidence:** repository inspection of `apps/blackout-web`, `apps/blackout-client`, `packages/web`, `apps/web`.
- **Stoat evidence:** Stoat landing page positioning and public `for-web` repository metadata.
- **Discord evidence:** support docs for roles/permissions, threads, and forum channels.

### 1) Navigation model and information density

- **Discord:** optimized for high-frequency social chat with familiar server/channel hierarchy and low-friction thread/forum pivots.
- **Stoat:** positions itself as a “better chat app” with Discord-like server/channel model and broad baseline features (voice/files/themes/customization).
- **Blackout (`apps/blackout-client` canonical, with historical `apps/blackout-web` reference):** combines chat with governance/federation/stego capabilities and modular feature composition.

**Assessment:**
Blackout is strongest when it embraces an **“ops + secure collaboration”** positioning rather than trying to out-Discord Discord on pure social speed.

### 2) Baseline affordances users expect

- **Discord:** mature role permissions + channel controls, threads, and forum channels are widely established UX expectations.
- **Stoat:** explicitly markets “don’t pay for basic stuff” and broad baseline chat capabilities.
- **Blackout:** can be competitive if default presets include complete baseline messaging ergonomics (threads/search/replies/edits/typing) before exposing advanced panels.

**Assessment:**
To reduce migration friction, Blackout should keep baseline behaviors as close as practical to Discord/Stoat mental models, then layer differentiated features progressively.

### 3) Differentiation surface

- **Discord:** strongest mainstream familiarity and ecosystem momentum.
- **Stoat:** strongest anti-subscription/open-source value signaling in marketing language.
- **Blackout:** unique advantage is **steganography + governance + federation operations** in one product shell.

**Assessment:**
Blackout should lead with “private-by-default collaboration primitives” (basic stego free), while monetizing advanced lifecycle/policy/ops controls.

### 4) UI coherence risk

- **Discord/Stoat:** relatively chat-first interaction framing.
- **Blackout:** broader module set creates risk of panel clutter and cognitive overload if everything is surfaced at once.

**Assessment:**
Blackout needs stricter progressive disclosure:
1. core chat first,
2. contextual advanced controls second,
3. admin/ops modules hidden behind role + entitlement + intent.

### 5) Practical target state for Blackout

To stand out while remaining intuitive:

- Keep **chat UX parity** with Discord/Stoat defaults for daily use.
- Make **basic stego free and obvious** in composer flow.
- Keep **advanced stego and ops suites paid** but discoverable via consistent “Advanced” affordances.
- Preserve layout integrity by binding all features to existing `UiEntryKind` slots and shared design tokens.

### Bottom-line positioning statement

- **Discord:** best-in-class mainstream social chat polish.
- **Stoat:** open-source Discord-like alternative with strong “no paywall on basics” messaging.
- **Blackout (recommended):** secure, operations-aware collaboration stack where baseline chat is familiar, and the differentiated value is trustworthy stego + governance/federation controls.

## Governance packaging model (mirror stego strategy)

Apply the same pattern used for steganography:

- **Free baseline governance**: enough to make day-to-day coordination useful for every workspace.
- **Paid advanced governance**: higher-complexity controls, compliance, and org-scale workflows.

### Free + default governance baseline

Recommended to include by default:

1. **Proposal lifecycle essentials**
   - create proposal
   - vote (approve/block or basic multi-choice)
   - view current and closed proposals
2. **Participation UX basics**
   - proposal summaries in channel context
   - vote status visibility for participant trust
   - lightweight notification/reminder surface
3. **Basic moderation-linked governance controls**
   - role-gated proposal creation
   - minimum quorum/threshold presets (simple presets only)

### Paid advanced governance add-ons

Recommended paid capabilities:

1. **Governance policy engine**
   - advanced quorum/threshold formulas
   - weighted/delegated voting rules
   - conditional execution policies
2. **Compliance and audit controls**
   - full governance audit trails
   - export/reporting workflows
   - retention and evidence controls
3. **Organization-scale operations**
   - multi-workspace policy templates
   - role delegation matrices
   - staged approval chains and emergency override workflows
4. **Advanced analytics**
   - participation quality and trend analysis
   - policy effectiveness metrics
   - governance health scoring dashboards

### UX guardrails (same pattern as stego)

- Keep baseline governance actions fully usable with no paywall interruption.
- Show advanced governance controls as visible but clearly marked “Advanced”.
- Use one consistent upgrade entrypoint across proposal, settings, and admin surfaces.
- Never block reading governance outcomes in free tier; only gate advanced authoring/policy depth.

### Packaging alignment suggestion

- **Free:** baseline governance + baseline stego.
- **Pro:** advanced stego + advanced governance for creators/community operators.
- **Team/Enterprise:** policy/compliance/governance-at-scale controls.

This keeps differentiation strong while ensuring free-tier teams can still coordinate meaningfully.

## Execution workstreams (blackout-client canonical path)

These workstreams implement the free/default + paid model for both stego and governance while preserving UX consistency.

### Workstream A — Entitlement foundation and capability resolver

- Build a single source of truth for feature access decisions.
- Ensure all UI and API checks consume the same entitlement state.

### Workstream B — Free baseline UX enablement (stego + governance)

- Turn on baseline stego and governance flows by default.
- Ensure zero paywall friction in core chat and proposal participation paths.

### Workstream C — Advanced paid controls and upgrade surfaces

- Introduce paid-only advanced stego and governance capabilities.
- Keep advanced controls discoverable with consistent “Advanced” affordances.

### Workstream D — Layout integrity and design-system conformance

- Validate that new controls fit existing client layout slots and do not overload primary chat views.
- Enforce token/component reuse from shared monorepo packages.

### Workstream E — Contracts/API alignment and telemetry

- Align entitlement contracts across client/sdk/server packages.
- Add event instrumentation for free usage, upgrade intent, and paid feature adoption.

### Workstream F — QA, migration, and rollout controls

- Add targeted tests for entitlement transitions and panel behavior.
- Roll out in phases with kill switches and preset-based rollback.
