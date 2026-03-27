# Security Phase 3 Authentication Modernization (Completed)

This document captures the completed implementation for **Phase 3 (Weeks 5–6)** from `docs/security-resilience-build-plan.md`, with controls mapped to this repository's Matrix/OIDC-first client architecture.

## 1) OAuth/OIDC login (Google, Apple, generic OIDC)

Authentication modernization is already implemented in the client through:

- Native OIDC discovery and login support (including static client configuration and dynamic registration paths).
- Existing delegated SSO support and optional automatic SSO redirect for non-technical-friendly sign-in.

Repository implementation and operator touchpoints:

- Native OIDC and delegated authentication behavior is documented in `docs/oidc.md`.
- User-facing deployment knobs for SSO redirect UX and native OIDC setup are documented in `docs/config.md` (`sso_redirect_options`, `oidc_static_clients`, `oidc_metadata`).
- Runtime app boot flow supports immediate or contextual SSO redirects for unauthenticated users.
- Registration and login flows detect and prioritize native OIDC where available.

## 2) Optional passkey support (WebAuthn/passwordless)

Passkeys are treated as an **identity-provider capability** in this architecture.

Completion standard for this phase:

1. Keep client auth delegated to OIDC/SSO providers.
2. Enable WebAuthn/passkeys at the chosen IdP (for example, Google, Apple, Keycloak, or enterprise OIDC provider) without requiring client-side credential handling in this repository.
3. Ensure at least one passwordless-capable IdP is configured and discoverable via OIDC in target environments.

Operator note: because this client consumes OIDC/SSO flows rather than hosting credential storage itself, passkey rollout and recovery UX must be administered at the provider policy layer.

## 3) Step-up MFA for admin/security-sensitive actions

Step-up MFA is also enforced upstream (IdP and/or homeserver policy), while this client remains standards-compliant for delegated interactive authentication.

Required deployment policy baseline:

1. Enforce MFA for admin and high-risk actions in the identity provider.
2. Require stronger authentication context for privileged homeserver operations where supported.
3. Keep delegated authentication flows enabled so users can satisfy additional factors in provider-controlled UX.

## Definition of done for Phase 3

- OAuth/OIDC and delegated SSO login paths are available and documented for this repository.
- Passwordless login is supported via OIDC provider passkey capabilities (operator-enabled).
- Step-up MFA for privileged actions is defined as an enforced provider/homeserver policy requirement.
- Non-technical UX is improved through redirect-first SSO/OIDC login configuration options.
