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
- Standard Element/Matrix feature surfaces reflected in docs such as keyboard shortcuts, custom homeserver landing page, and widget layouts.

## Notes

- `_port/` contains the primary legacy implementation that is currently treated as read-only while migration into `packages/` and `apps/` progresses.
- The feature set above reflects what is documented and implemented in-repo, not necessarily what is fully migrated into the new monorepo app shells yet.
