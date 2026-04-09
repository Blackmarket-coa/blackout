# Repository Feature Inventory (Readmes + Code)

This inventory groups features found by reviewing top-level and feature readmes plus implementation code under `_port/src`.

## Novel features (Blackout-specific)

- Steganographic messaging toolkit with emoji and image carriers, including encode/decode, detection, transport chunking, and carrier compatibility checks.
- Ephemeral stego lifecycle management with timed expiry and optional self-destruct semantics in UI flows.
- Governance/entitlement layer for stego sends with tier limits, deterministic deny reasons, audit logging, and safety invariants.
- Federation boost policy engine with tier envelopes, abuse throttling, and revenue-share ledger/snapshots.
- Paid encrypted room creator-key lifecycle: payment-gated key grants, device binding, key rotation/revocation, and revocation SLA evaluation.
- Plugin sandbox controls with manifest conformance, capability-scoped execution, permission lifecycle, and outbound network guardrails.
- Cosmetic pack publication pipeline with conformance checks for marketplace-style distribution.
- Townhall SFU module: role-aware tokenized sessions, moderation actions (mute-all, publish lock, kick, demote), and audit event streams.

## Discord-like features

- Rich composer ergonomics: user/room/emoji autocomplete, markdown formatting actions, keyboard formatting shortcuts, and edit/reply/quote entry points.
- Real-time typing indicators and timeline-to-composer mention insertion behavior.
- Integrated group call surface via widgets (Jitsi and Townhall SFU), including participant roles and moderation controls.
- Widget shell patterns for room-embedded experiences (apps/panels) with configurable placement/layout.
- Role-based moderation and visible audit logs in the Townhall interface (host/moderator controls).

## Matrix-like features

- Matrix-native client architecture built on `matrix-js-sdk`, with `MatrixChat` app shell and Matrix routing/bootstrap flow.
- Homeserver discovery and validation using `.well-known` and auto-discovery fallback paths.
- End-to-end encryption defaults and policy controls for encrypted DMs/private rooms.
- OIDC delegated authentication support with MSC2965 discovery and dynamic/static client registration paths.
- Matrix widget/state-event compatibility handling (`m.widget` and legacy widget event compatibility).
- Multi-platform Matrix client bootstrap (web/PWA/Electron platform selection) and plugin/module loading model.
- **Tauri v2 Desktop Target** — **Status: Partial**. Evidence exists for desktop CI and app scaffolding via `.github/workflows/blackout-desktop-tauri.yml` and the checked-in desktop wrapper paths under `blackout-desktop/` (including `src-tauri/` configuration and Rust entrypoint).
- Standard Element/Matrix feature surfaces reflected in docs such as keyboard shortcuts, custom homeserver landing page, and widget layouts.

### Objective completion conditions for Tauri v2 Desktop Target

Promote from **Partial** to complete only when all of the following are true:

1. **Signed binaries are produced and verifiably distributed** for target desktop platforms.
2. **Auto-update is end-to-end operational** (signed update metadata, hosted artifacts, successful in-app update flow).
3. **Push-to-talk keybind support is fully implemented** with stable cross-platform behavior and regression coverage.
4. **Overlay support is implemented** (desktop overlay UX capability defined, shipped, and tested for supported platforms).

## Build plan: interactive presets + UI usability for all features

Goal: every feature listed above has (1) a discoverable preset/toggle, (2) an interactive UI entry point, and (3) basic functional validation in automated UI checks.

### Phase 1 — Feature inventory normalization

1. Create a machine-readable feature registry (`docs/features/feature_registry.json`) with per-feature fields:
   - `id`, `name`, `category` (`novel|discord_like|matrix_like`)
   - `status` (`implemented|partial|planned`)
   - `presetKey` (feature-flag or setting key)
   - `uiEntry` (route/component/test id)
   - `owner`, `testCoverage`, `notes`
   - `evidenceType` (`code|docs|runtime|external-infra`)
   - `lastVerifiedAt` (ISO date, nullable for unverified external infra claims)
   - `verifiedBy` (owner/team identity, or `unverified`)
   - `evidencePaths` (repo paths and/or `ops-artifact:<id>` references)
2. Link each registry row to source docs/code pointers.
3. Add CI check that fails if duplicate `id` or missing required fields.
4. Require infrastructure/runtime claims (for example host inventory and tunnel counts) to use `evidenceType: external-infra`. If no verifiable runbook/evidence artifact is attached, force `verifiedBy: unverified` and `lastVerifiedAt: null`.

### Phase 2 — Preset model and configuration plumbing

1. Define three preset bundles in config/settings:
   - `baseline_matrix`
   - `community_plus` (discord-like UX on)
   - `blackout_full` (all novel features enabled)
2. Build a preset resolver that merges:
   - deployment config defaults,
   - tenant/org policy overrides,
   - user overrides (where allowed).
3. Surface active preset in app diagnostics/settings.

### Phase 3 — UI entry-point completeness

1. For each feature in the registry, map a primary UI entry point:
   - settings toggle,
   - composer action,
   - room action,
   - widget panel,
   - admin/governance console.
2. Add/standardize `data-testid` hooks for each entry point.
3. Add “feature unavailable” empty states when policy or entitlement blocks access.

### Phase 4 — Interactive preset UX

1. Add a “Feature Presets” section in settings/admin UX:
   - choose preset,
   - preview included capabilities,
   - apply/rollback with confirmation.
2. For enterprise/self-hosted deploys, expose preset selection via config templates and startup docs.
3. Add an in-app “What this preset enables” explainer panel.

### Phase 5 — Automated usability gates

1. Add UI integration tests per feature category:
   - open entry point,
   - perform one meaningful action,
   - verify visible state/result.
2. Add smoke matrix to CI:
   - run at least one smoke flow per preset (`baseline_matrix`, `community_plus`, `blackout_full`).
3. Add failure budget policy:
   - any new feature without registry + UI test = CI failure.

### Phase 6 — Rollout and operational guardrails

1. Release by cohort:
   - internal → beta → general.
2. Instrument telemetry for:
   - preset adoption,
   - feature open/use success rates,
   - entitlement/policy deny reasons.
3. Maintain rollback playbook per preset and per high-risk feature (stego, paid-room keys, plugin sandbox, townhall moderation).

### Phase 7 — Definition of done

A feature is “preset-complete and UI-usable” only if all conditions are true:

- Present in feature registry.
- Included/excluded in at least one preset by explicit policy.
- Has at least one interactive UI entry point with a stable `data-testid`.
- Has at least one automated UI/integration test path.
- Has documented fallback/disabled behavior.

## Notes

- `_port/` contains the primary legacy implementation that is currently treated as read-only while migration into `packages/` and `apps/` progresses.
- The feature set above reflects what is documented and implemented in-repo, not necessarily what is fully migrated into the new monorepo app shells yet.
