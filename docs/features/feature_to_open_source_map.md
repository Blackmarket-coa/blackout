# Feature to open-source equivalent map

This maps Blackout feature IDs to practical open-source implementations we can adopt while preserving Matrix compatibility and E2EE guardrails.

| Feature ID | Blackout feature | Open-source equivalent(s) | How to apply in Blackout |
|---|---|---|---|
| `stego_toolkit` | Steganographic messaging toolkit | `matrix-js-sdk` crypto/event primitives + `Ajv` | Keep stego metadata in additive event content and validate with schema checks before send/receive. |
| `ephemeral_stego_lifecycle` | Ephemeral stego lifecycle management | `matrix-js-sdk` E2EE/session APIs + Synapse retention controls | Add lifecycle policy in client, enforce server-side retention and deny plaintext fallback in encrypted rooms. |
| `governance_entitlements` | Governance and entitlement policy layer | `Open Policy Agent (OPA)` + Synapse modules | Evaluate policy centrally, return deterministic allow/deny reason codes to UI entrypoints. |
| `federation_boost_policy` | Federation boost policy engine | `OPA` + Synapse modules | Model throttling/revenue-share policy as versioned policy bundles with staged rollout. |
| `townhall_sfu` | Townhall SFU sessions and moderation | `LiveKit` + `Mjolnir` | Use LiveKit for SFU media and Mjolnir/Synapse policy for room moderation safety controls. |
| `rich_composer` | Rich composer ergonomics | `ProseMirror`/`TipTap`-style OSS editor stack (optional) | Keep output Matrix-safe by serializing to compatible message/event formats. |
| `typing_indicators` | Typing indicators | Matrix typing notifications via `matrix-js-sdk` | Use native Matrix typing EDU behavior and preserve disable-by-policy states. |
| `widget_shell_layouts` | Widget shell layouts | Matrix Widget APIs (`matrix-widget-api`) | Keep widget state events protocol-compatible and policy-gated by room/admin controls. |
| `matrix_client_arch` | Matrix-native client architecture | `matrix-js-sdk` | Continue using SDK as canonical transport/state client layer. |
| `homeserver_discovery` | Homeserver discovery and validation | Matrix well-known discovery + `matrix-js-sdk` | Resolve homeserver from `.well-known` and preserve explicit user override controls. |
| `e2ee_defaults` | E2EE defaults and policy controls | `matrix-js-sdk` crypto + Synapse E2EE defaults | Enforce encrypted-room defaults and test no-downgrade behavior in rollout gates. |
| `oidc_delegated_auth` | OIDC delegated authentication | Matrix Authentication Service (MAS) + OIDC providers | Keep auth delegated while preserving Matrix token/session semantics. |
| `matrix_widget_compat` | Matrix widget state-event compatibility | Matrix Widget APIs + Element widget conventions | Validate widget capability negotiation and fallback rendering for non-entitled users. |
| `multiplatform_bootstrap` | Multi-platform Matrix bootstrap | `matrix-js-sdk` + shared config/bootstrap tooling | Standardize bootstrap contracts and reuse feature-flag providers across clients. |
| `epic_delivery_blueprint` | EPIC delivery blueprint panel | `Unleash`/`Flipt`/`Flagsmith` feature flags | Keep this planning UI behind `features.epic.deliveryBlueprint` to support staged rollout and instant disable. |

## Recommended implementation order

1. Map each feature to a **feature flag backend** (Unleash/Flipt/Flagsmith).
2. Add **policy enforcement contract** (OPA or Synapse module) for features with admin/entitlement checks.
3. Add **schema validation** (Ajv) where feature-specific event content is introduced.
4. Add **telemetry** (OpenTelemetry JS) for entrypoint seen/denied/succeeded signals.
5. Gate GA on Matrix compatibility checks (Complement smoke) and encrypted-room regression tests.
