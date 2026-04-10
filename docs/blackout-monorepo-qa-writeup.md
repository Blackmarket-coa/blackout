# Blackout Monorepo QA Write-up

## Overview

After the reorganization, the `blackout` repository becomes the canonical monorepo containing:

- Frontend: `blackout_app` (Cinny-based client)
- Backend: `blackout_server`
- Shared packages: protocol, SDK, UI, and core modules
- Legacy or supplemental code: retained only when not already present in the Cinny client

The Element-based code in `blackout` is not removed outright, but selectively preserved when it contains functionality missing from the Cinny client.

The goal is to produce a single modular workspace where:

- the frontend loads feature modules
- the backend exposes feature APIs
- shared types and contracts live in reusable packages

## Final Repository Structure

```text
blackout/
│
├─ apps/
│  ├─ blackout-client/          # Cinny-based frontend (from blackout_app)
│  ├─ blackout-server/          # Backend services (from blackout_server)
│  └─ blackout-gov/             # Optional governance surface
│
├─ packages/
│  ├─ core/                     # Shared runtime utilities
│  ├─ config/                   # Shared configs and env helpers
│  ├─ contracts/                # Shared API contracts
│  ├─ blackout-protocol/        # Event schemas and network protocol
│  ├─ blackout-sdk/             # Client/server network helpers
│  ├─ design/                   # Design tokens and themes
│  ├─ ui/                       # Shared UI components
│  └─ web/                      # Web-specific helpers
│
├─ blackout-desktop/            # Desktop wrapper (Tauri)
├─ blackout-mobile/             # Mobile wrapper (Capacitor)
│
├─ legacy/
│  └─ element/                  # Archived Element code
│
├─ tools/                       # Scripts, build utilities
├─ test/                        # Integration and regression tests
│
├─ pnpm-workspace.yaml
├─ turbo.json
└─ package.json
```

## Frontend Architecture

The Cinny-based `blackout_app` becomes the canonical UI.

It acts as a platform shell capable of loading feature modules.

### Client Structure

```text
apps/blackout-client/src/app/
│
├─ core/
│  ├─ routing/
│  ├─ shell/
│  ├─ features/
│  │  ├─ registry.ts
│  │  ├─ featureFlags.ts
│  │  └─ types.ts
│
├─ features/
│  ├─ chat/
│  ├─ governance/
│  ├─ forum/
│  ├─ deaddrop/
│  ├─ moderation/
│  └─ steganography/
│
├─ components/
├─ hooks/
└─ plugins/
```

Each feature registers itself using a manifest pattern.

## Backend Architecture

`blackout_server` becomes the canonical backend.

It is organized by feature modules to match the frontend plugins.

```text
apps/blackout-server/src/
│
├─ modules/
│  ├─ governance/
│  ├─ forum/
│  ├─ deaddrop/
│  ├─ moderation/
│
├─ auth/
├─ db/
├─ middleware/
└─ index.ts
```

Responsibilities:

- API endpoints
- feature workflows
- permission checks
- persistence
- event broadcasting

## Shared Packages

Shared packages allow frontend and backend to stay synchronized.

### `blackout-protocol`

Defines event schemas.

Example:

```ts
export type GovernanceProposalCreated = {
  type: "blackout.governance.proposal_created";
  proposalId: string;
  title: string;
  authorId: string;
};
```

### `blackout-sdk`

Client-side helpers that call backend APIs.

Example:

```ts
export async function createProposal(input: CreateProposalInput) {
  return api.post("/governance/proposals", input);
}
```

### `core`

Shared utilities used by all apps.

Examples:

- event bus
- permission helpers
- runtime configuration

## Migration Strategy

During migration:

- `blackout_app` is copied into `apps/blackout-client`
- `blackout_server` is copied into `apps/blackout-server`
- useful modules from the Element repo are retained if they are missing from Cinny
- duplicates and conflicting implementations are removed

## Conflict Cleanup Rules

Conflicts between Element and Cinny implementations are resolved using these rules:

| Rule | Action |
| --- | --- |
| Feature exists in Cinny | Keep Cinny version |
| Feature exists only in Element | Port it into Cinny feature plugin |
| Duplicate UI component | Keep the simpler version |
| Duplicate networking logic | Move to `blackout-sdk` |
| Duplicate types | Move to `blackout-protocol` |

## QA Checklist

The repository passes QA if the following conditions are true.

### Workspace Validation

Run:

```bash
pnpm list -r --depth 0
```

Expected packages include:

- `@blackout/client`
- `@blackout/server`
- `@blackout/core`
- `@blackout/protocol`
- `@blackout/sdk`

### Frontend Startup

Run:

```bash
pnpm dev --filter @blackout/client
```

Expected:

- client loads
- routes register from feature registry
- no hardcoded routes remain

### Backend Startup

Run:

```bash
pnpm dev --filter @blackout/server
```

Expected:

- API server boots
- feature modules register routes

### SDK Integration

Frontend should not use `fetch` directly.

All network calls must go through:

- `@blackout/sdk`

### Protocol Consistency

Feature payload types must exist in:

- `packages/blackout-protocol`

Client and server both import from this package.

### Feature Plugin Loading

Registry loads plugins dynamically.

Example registry:

```ts
export const featureRegistry = [
  governanceFeature,
  forumFeature,
  deaddropFeature,
];
```

Routes, nav, and settings should derive from the registry.

### Legacy Code Isolation

Element code should live in:

- `legacy/element`

It must not be referenced by the active client.

## Expected Developer Workflow

Start the platform:

```bash
pnpm dev
```

This runs:

- frontend
- backend
- shared packages

## Future Expansion

The architecture supports future additions:

### Node runtime

`packages/node`

Possible responsibilities:

- peer discovery
- federation relay
- decentralized governance

### Logistics plugins

`features/logistics`

### Market plugins

`features/market`

## Final Result

After the reorganization:

- Blackout becomes a modular platform
- Cinny provides the primary UI
- backend modules mirror client features
- protocol and SDK packages unify client/server behavior
- legacy Element code remains available without polluting the new architecture

The system becomes much easier to extend, test, and maintain.

## Repository Reality Check (April 10, 2026)

The checklist above describes the intended target state. Running it against the current repository snapshot on **April 10, 2026** shows several gaps.

| Check | Result | Evidence |
| --- | --- | --- |
| Workspace contains `@blackout/client` | ✅ Pass | Workspace now exposes `@blackout/client`. |
| Workspace contains `@blackout/server` | ✅ Pass | Workspace now exposes `@blackout/server` (scoped from `packages/api`). |
| Workspace contains `@blackout/protocol` and `@blackout/sdk` | ✅ Pass | Workspace now exposes both package names. |
| `pnpm dev --filter @blackout/client` works | ⚠️ Partial | Package exists; runtime validation depends on local app prerequisites. |
| `pnpm dev --filter @blackout/server` works | ⚠️ Partial | Package exists; `dev` script availability is tracked separately. |
| Feature registry is manifest-based | ✅ Pass | `featureRegistry` is built via `buildFeatureRegistry(defaultFeatureFlags)`. |
| Frontend avoids direct `fetch` calls | ❌ Fail | Direct `fetch` usage still exists in multiple client files. |
| Legacy Element code isolated under `legacy/element` | ⚠️ Partial | `legacy/element` does not exist; legacy code appears under `_port/element.io`. |

### Commands run for this check

```bash
pnpm list -r --depth 0
timeout 25s pnpm dev --filter @blackout/client
timeout 25s pnpm dev --filter @blackout/server
rg -n "\\bfetch\\(" apps/blackout-client/src packages
rg -n "featureRegistry|registry" apps/blackout-client/src/app
```

### Updated practical checklist for the current repository state

Use this temporary checklist until package naming and runtime targets are fully aligned:

1. Validate workspace package graph:

```bash
pnpm list -r --depth 0
```

2. Attempt to start the current web client package (temporary name):

```bash
pnpm --filter @blackout/client start
```

Current status: blocked by missing dev dependency `@rollup/plugin-wasm` in the runtime environment.

3. Validate the active API package is wired into the workspace:

```bash
pnpm --filter @blackout/server test
```

Current status: passes (`api test scaffold ok`) but this package does not yet expose a `dev` server script.

4. Track migration debt items before declaring QA pass:

- keep package naming aligned to canonical `@blackout/*` targets across CI/docs
- remove or wrap direct client `fetch` calls through the SDK boundary
- decide canonical legacy location (`legacy/element` vs `_port/element.io`) and enforce via CI guard
