# Phase 6 Implementation Artifacts — Plugin Ecosystem and Cosmetic Marketplace

This directory captures implementation evidence for **Phase 6 — Plugin Ecosystem and Cosmetic Marketplace**.

## Workstream progress

### 1. WASM/sandboxed JS runtime with capability-based permission manifests

- `src/steganography/plugins/PluginSandbox.ts`
    - `PluginSandboxRuntime` enforces manifest conformance (`id`, `name`, `version`, declared capabilities).
    - Registration blocks plugins that declare capabilities without implementing matching hooks.
    - Runtime execution context denies network access by default and exposes only policy-gated network requests.

### 2. Plugin API primitives (`encode`, `decode`, `render`, `transform`)

- `src/steganography/plugins/PluginSandbox.ts`
    - Plugin hook contracts include `encode`, `decode`, `render`, and `transform` primitives.
    - Runtime dispatch methods (`executeEncode`, `executeDecode`, `executeRender`, `executeTransform`) enforce capability declaration before invocation.

### 3. Hard runtime bans (no raw sockets, no background network unless approved)

- `src/steganography/plugins/PluginSandbox.ts`
    - Default `networkPolicy` is `none`; network permission changes are rejected for offline-only plugins.
    - `approved_background` plugins begin in `prompt` state and require explicit grant before any network request.
    - Runtime allows only HTTPS requests to configured allowlisted origins; `ws://`, `wss://`, and non-allowlisted exfiltration targets are denied.

### 4. Cosmetic asset pipeline (signed packs, rendering-only effects)

- Initial guardrails established in plugin runtime:
    - Cosmetic/render plugins can run as render-only capabilities without network permissions.
    - Network access for remote cosmetic assets is explicit, policy-gated, and revocable.
- Signed cosmetic pack distribution pipeline is implemented with manifest conformance checks, HMAC-based signing/verification, and marketplace publication controls that require approved publisher identity plus a review ticket.
- Additional hardening now blocks duplicate publication of the same `packId@version` and signs an immutable manifest snapshot so post-sign source mutations cannot invalidate or silently alter signed artifacts.

## Exit criteria evidence

### Permission prompts are explicit and revocable

- `PluginSandboxRuntime` models explicit permission state transitions (`prompt` → `granted` / `denied`) per plugin.
- Runtime supports explicit revoke path via `revokeNetworkPermission()`.

### Plugin conformance tests block disallowed network/exfiltration behavior

- `test/unit-tests/steganography/PluginSandboxRuntime-test.ts`
    - Validates registration conformance and capability hook enforcement.
    - Verifies network requests are blocked before grant and allowed after explicit grant.
    - Verifies raw sockets and non-allowlisted origins are blocked as conformance violations.

## Test inventory

| Test file                                                    | Coverage area                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `test/unit-tests/steganography/PluginSandboxRuntime-test.ts` | Capability manifest conformance, permission prompt/grant/revoke lifecycle, banned socket/exfiltration targets |
| `test/unit-tests/steganography/CosmeticPackPipeline-test.ts` | Signed cosmetic-pack conformance, tamper detection, immutable-signature input behavior, approved-publisher publication gate, duplicate-publication prevention, and review-ticket enforcement |

## Phase 6 completion checklist

- [x] Implement capability-scoped plugin sandbox runtime.
- [x] Add plugin API primitives (`encode`, `decode`, `render`, `transform`) with runtime gating.
- [x] Enforce runtime network bans and explicit permission prompts.
- [x] Add conformance tests for disallowed network/exfiltration behavior.
- [x] Implement signed cosmetic pack pipeline end-to-end.
