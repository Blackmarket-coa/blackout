# Blackout architecture overview

Blackout is organized as a monorepo with clear boundaries between product apps, shared packages, and infrastructure.

## Client

- Canonical frontend app: `apps/blackout-client`
- Responsibilities:
  - UI rendering and interaction flows
  - Session/auth UX
  - Feature toggles for governance, forums, moderation, and dead-drop
  - Calling backend APIs through typed SDK boundaries

## Server

- Canonical backend app: `apps/blackout-server`
- Responsibilities:
  - Authentication/session handling
  - API contract enforcement
  - Persistence and caching integration
  - Governance and moderation service logic

## Protocol package

- Package: `packages/blackout-protocol`
- Responsibilities:
  - Shared request/response and event contracts
  - Data shape consistency between client and server
  - Typed primitives reused by SDK and apps

## SDK package

- Package: `packages/blackout-sdk`
- Responsibilities:
  - Client-side API wrappers over backend routes
  - Runtime-safe helpers for feature modules
  - Narrow dependency on `@blackout/protocol`

## Feature plugin model

Blackout feature delivery should follow a plugin-style pattern:

1. Define a contract in `@blackout/protocol`.
2. Add SDK surface in `@blackout/sdk`.
3. Implement server handlers in `apps/blackout-server`.
4. Register feature entrypoints and UI in `apps/blackout-client`.
5. Control rollout with feature flags (`VITE_FEATURE_*` or server-side config).

This keeps feature work isolated while preserving shared typing and deploy-time safety.
