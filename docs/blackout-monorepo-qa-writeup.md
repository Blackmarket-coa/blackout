# Blackout Monorepo QA Write-up

## Overview

After the reorganization, the `blackout` repository becomes the canonical monorepo containing:

- Frontend: `blackout_app` (Cinny-based client)
- Backend runtime package: `@blackout/server` (implemented in `packages/api`, with canonical app entrypoint in `apps/blackout-server`)
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
│  ├─ blackout-server/          # Python/Synapse service tree retained for server operations
│  └─ blackout-gov/             # Optional governance surface
│
├─ packages/
│  ├─ core/                     # Shared runtime utilities
│  ├─ config/                   # Shared configs and env helpers
│  ├─ contracts/                # Shared API contracts
│  ├─ api/                      # Canonical JS/TS backend package (`@blackout/server`)
│  ├─ server/                   # Alias wrapper package for server runtime commands
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

`@blackout/server` is the canonical JS/TS backend runtime target.

Current executable implementation lives in `packages/api` and is invoked through `apps/blackout-server` scripts (which expose the `@blackout/server` name). The repository also retains `apps/blackout-server` for the Synapse/Python server stack.

```text
packages/api/src/
│
├─ index.ts                     # API entrypoint
├─ modules/                     # Feature modules (incremental migration)
└─ ...
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
- backend runtime entrypoints are consolidated on `@blackout/server` (currently `packages/api` + `apps/blackout-server`)
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

## Repository Reality Check (April 11, 2026)

The checklist above describes the intended target state. Running it against the current repository snapshot on **April 11, 2026** shows the following status.

| Check | Result | Evidence |
| --- | --- | --- |
| Workspace contains `@blackout/client` | ✅ Pass | `apps/blackout-client/package.json` is named `@blackout/client`. |
| Workspace contains `@blackout/server` | ✅ Pass | `apps/blackout-server/package.json` and `packages/api/package.json` expose server runtime scripts/name. |
| Workspace contains `@blackout/protocol` and `@blackout/sdk` | ✅ Pass | `packages/blackout-protocol` and `packages/blackout-sdk` are named correctly. |
| `pnpm dev --filter @blackout/client` resolves | ✅ Pass | Root scripts and client package scripts are aligned for `dev`. |
| `pnpm dev --filter @blackout/server` resolves | ✅ Pass | Root scripts and server package scripts are aligned for `dev`. |
| Feature registry is manifest-based | ✅ Pass | Guard scripts exist for registry completeness and budget checks. |
| Frontend avoids direct `fetch` calls | ⚠️ Partial | This remains a migration guard item tracked under SDK boundary enforcement. |
| Legacy code isolated from active runtime imports | ✅ Pass | `guard:legacy-isolation` and related CI guards are now part of QA automation. |

### Commands run for this check

```bash
pnpm list -r --depth 0
pnpm run guard:workspace-packages
pnpm run guard:dev-filters
pnpm run guard:runtime-targets
pnpm run qa:monorepo
```

### Updated practical checklist for the current repository state

Use this checklist as the executable QA baseline:

1. Validate workspace package graph:

```bash
pnpm list -r --depth 0
```

2. Validate canonical client/server dev filter resolution:

```bash
pnpm run guard:dev-filters
```

3. Validate canonical runtime targets and package assertions:

```bash
pnpm run guard:runtime-targets
pnpm run guard:workspace-packages
```

4. Run the monorepo QA bundle:

```bash
pnpm run qa:monorepo
```

### Migration milestone changelog

- **2026-04-10:** Canonical workspace names aligned in docs and QA checks (`@blackout/client`, `@blackout/server`, `@blackout/protocol`, `@blackout/sdk`).
- **2026-04-10:** Runtime command alignment documented around root shortcuts (`dev:client`, `dev:server`) and filter guards.
- **2026-04-10:** QA write-up updated to reference executable guard commands (`guard:*`, `qa:monorepo`) instead of aspirational-only commands.
- **2026-04-11:** Revalidated monorepo QA command bundle (`guard:workspace-packages`, `guard:dev-filters`, `guard:runtime-targets`, `qa:monorepo`) with passing results.
