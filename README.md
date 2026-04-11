[![Chat](https://img.shields.io/matrix/element-web:matrix.org?logo=matrix)](https://matrix.to/#/#element-web:matrix.org)
![Tests](https://github.com/element-hq/element-web/actions/workflows/tests.yaml/badge.svg)
![Static Analysis](https://github.com/element-hq/element-web/actions/workflows/static_analysis.yaml/badge.svg)

# Blackout Monorepo (Web + Desktop + Mobile)

This repository is a pnpm/turborepo monorepo built from an Element Web fork, with additional governance and steganography-focused capabilities.

## What this repo contains

- Upstream Element Web application architecture.
- Desktop app wrapper: `blackout-desktop` (Tauri)
- Mobile app wrapper: `blackout-mobile` (Capacitor)
- Blackout governance-focused features and rollout documentation.
- A steganography subsystem with test coverage and developer tooling.

Key areas:

- Monorepo apps: `apps/*`
- Shared packages: `packages/*`
- App bootstrap/runtime: `src/vector/*`
- Main client features and UI: `src/components/*`, `src/models/*`, `src/settings/*`
- Steganography code: `src/steganography/*`
- Feature and rollout documentation: `docs/*`

For deeper architecture context:

- `docs/repository_functionality_analysis.md`
- `docs/features/governance_features_analysis.md`
- `docs/blackout-reuse-completion-tracker.md`
- `docs/distributed_self_healing_blueprint.md`
- `docs/deploying-blackout-fedora-tauri.md`
- `docs/blackout-monorepo-work-required.md` (active migration work plan)
- `docs/blackout-monorepo-qa-writeup.md` (QA baseline + migration changelog)

---

## Self-healing federation architecture (Blackout roadmap)

This project now defines a target architecture for a decentralized, encrypted, self-healing federation model that can run on low-power nodes (including recycled Android phones).

Primary blueprint:

- `docs/distributed_self_healing_blueprint.md`
- `docs/deploying-blackout-fedora-tauri.md`

What the blueprint includes:

- Event-sourced, append-only, hash-linked data model
- CRDT-based deterministic state rebuild
- Peer replication + gossip discovery + snapshot/replay recovery
- End-to-end encryption model (X25519, AES-GCM, ratchet flows)
- Governance features (voting, tasks, bounty ledger, streaming)
- Migration strategy that preserves compatibility during rollout

Implementation status should be tracked in:

- `docs/project_completion_tracker.md`

---

## Completed Blackout architecture (mental model)

```text
blackout/  (monorepo root)
│
├─ apps/
│  ├─ blackout-client        # main frontend (Cinny-based)
│  │   ├─ core shell
│  │   ├─ feature registry
│  │   ├─ routes/nav/settings
│  │   └─ feature plugins
│  │       ├─ chat
│  │       ├─ governance
│  │       ├─ forum
│  │       ├─ deaddrop
│  │       ├─ moderation
│  │       └─ steganography
│  │
│  ├─ blackout-server        # backend
│  │   ├─ auth
│  │   ├─ db
│  │   ├─ middleware
│  │   └─ feature modules
│  │       ├─ governance
│  │       ├─ forum
│  │       ├─ deaddrop
│  │       └─ moderation
│  │
│  └─ blackout-gov           # optional separate surface
│
├─ packages/
│  ├─ blackout-protocol      # shared event types + schemas
│  ├─ blackout-sdk           # shared API/network helpers
│  ├─ core                   # shared runtime logic
│  ├─ contracts              # API contracts
│  ├─ config                 # config/env helpers
│  ├─ design                 # tokens/themes
│  ├─ ui                     # shared UI
│  └─ web                    # web-specific helpers
│
├─ blackout-desktop
├─ blackout-mobile
│
├─ legacy/
│  └─ element                # preserved Element-era code not in active path
│
├─ tools/
├─ test/
├─ pnpm-workspace.yaml
├─ turbo.json
└─ package.json
```

Runtime flow:

```text
User
  │
  ▼
blackout-client
  │
  ├─ loads feature plugins from registry
  │
  ├─ uses @blackout/sdk for actions
  │
  ▼
@blackout/sdk
  │
  ├─ uses shared types from @blackout/protocol
  │
  ▼
blackout-server
  │
  ├─ validates/contracts
  ├─ runs feature module logic
  ├─ stores data
  └─ emits/handles feature events
```

Feature-level flow:

```text
Feature Plugin in Client
   │
   ├─ UI components
   ├─ routes
   ├─ nav items
   ├─ settings entries
   └─ capability checks
        │
        ▼
   @blackout/sdk
        │
        ▼
   blackout-server module
        │
        ▼
   shared event/contracts in @blackout/protocol
```

System ownership rules:

- `blackout-client` owns the user-facing experience.
- `blackout-server` owns backend behavior.
- `blackout-protocol` owns shared meaning.
- `blackout-sdk` owns client/server wiring.
- Legacy Element code stays isolated under `legacy/element`.

In shorthand: **Cinny UI shell + modular features + shared SDK + shared protocol + modular backend**.

---

## Quick start

### Prerequisites

- Node.js `>=22.18`
- pnpm `9.15.4` (or compatible 9.x)

### Local setup

```bash
git clone https://github.com/Blackmarket-coa/blackout.git
cd blackout
pnpm install
cp config.sample.json config.json
```

Then edit `config.json` as needed. See `docs/config.md` for configuration details.

### Build

```bash
pnpm build
```

### Run app workspaces

```bash
pnpm web:dev
pnpm desktop:dev
pnpm mobile:dev
```

> `mobile:*` root scripts use the Capacitor shell in `blackout-mobile/` (the current runnable mobile app path).
> `pnpm mobile:dev` is a safe preflight + web-bundle build (no platform sync).

Build individual apps:

```bash
pnpm web:build
pnpm desktop:build
pnpm mobile:build
```

Open native projects:

```bash
pnpm mobile:open:ios
pnpm mobile:open:android
```

Platform-specific sync:

```bash
pnpm mobile:sync:android
pnpm mobile:sync:ios
```

On Windows, use the same command:

```bash
pnpm build
```

### Build and run the frontend

```bash
pnpm --filter @blackout/blackout-web build:web
pnpm start
```

> Canonical frontend package: `@blackout/blackout-web` (`apps/blackout-web`).  
> `@blackout/web` and `@blackout/web-ui` are legacy/scaffold paths and are not the deploy target.

Then open:

- Frontend app: `http://localhost:3000/`
- Health endpoint: `http://localhost:3000/health`
- Readiness endpoint: `http://localhost:3000/ready`

If deployed on Railway, use your Railway domain instead of localhost:

- Frontend app: `https://$RAILWAY_PUBLIC_DOMAIN/`
- Health endpoint: `https://$RAILWAY_PUBLIC_DOMAIN/health`
- Readiness endpoint: `https://$RAILWAY_PUBLIC_DOMAIN/ready`

### Deploy to Railway

1. Create a new Railway project and connect this GitHub repo.
2. Use Node.js 22+ and pnpm 9.x.
3. Set commands:
   - Build: `pnpm install --frozen-lockfile && pnpm --filter @blackout/blackout-web build:web`
   - Start: `pnpm start`
4. Expose `PORT` (Railway sets this automatically).
5. Verify:
   - `/` returns the built frontend app.
   - `/health` and `/ready` return 200 JSON.

### Frontend quality checks (`apps/blackout-web`)

```bash
pnpm --filter @blackout/blackout-web test:unit
pnpm --filter @blackout/blackout-web test:integration
pnpm --filter @blackout/blackout-web test:e2e
```

---

## Development workflow

Recommended baseline checks before opening a PR:

```bash
pnpm lint
pnpm test
```

For steganography-specific changes, run targeted suites too:

```bash
pnpm --filter @blackout/blackout-web test
```

Helpful docs:

1. `developer_guide.md`
2. `code_style.md`
3. `CONTRIBUTING.md`
4. `docs/qa-triage-start.md`
5. `docs/repo-readiness-next-steps.md`
6. `mobile-application-build-guide.md`
7. `docs/operations/runbooks/mobile_release_hardening_checklist.md`

---

## Notes for AI-assisted editing

Use this section when working with coding agents or AI copilots.

### 1) Scope the change before editing

- Ask the AI to name exact files it plans to modify.
- Keep changes small and subsystem-focused.
- Prefer incremental PRs over large mixed refactors.

### 2) Require explicit validation commands

Ask AI to run and report exact commands for the touched area, at minimum:

```bash
pnpm lint
pnpm test
pnpm --filter <package-name> test
```

If a command is skipped, require a reason (missing dependency, environment constraint, etc.).

### 3) Preserve behavior unless change request says otherwise

When prompting AI, state clearly:

- “No behavioral changes unless explicitly requested.”
- “Do not silently rename exported APIs.”
- “Do not remove tests without replacement.”

### 4) Prefer targeted tests over blanket runs while iterating

During development, ask AI to run narrow tests first (closest unit/integration target), then broader validation before final commit.

### 5) Demand human-review-friendly outputs

Ask AI to include in each update:

- What changed
- Why it changed
- Risk areas
- Follow-up checks

This keeps reviews fast and avoids hidden side effects.

### 6) Use repo docs as source of truth

Direct AI to prefer repository docs over assumptions:

- `docs/config.md`
- `developer_guide.md`
- `docs/playwright.md`
- `docs/features/*`

### 7) Safety checklist for PR-ready AI changes

Before merge, confirm the AI has:

- Kept secrets and credentials out of code/logs
- Avoided broad formatting-only churn
- Updated docs for behavior/config changes
- Added or updated tests for new logic
- Included rollback notes for risky changes

---

## Security notes (hosting)

Do **not** host Element Web on the same domain as your homeserver.

Recommended response headers:

- `X-Frame-Options: SAMEORIGIN`
- `Content-Security-Policy: frame-ancestors 'self'`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`

See details in this issue: <https://github.com/element-hq/element-web/issues/1977>

---

## Caching requirements

When self-hosting, ensure these are not cached:

- `/config.*.json`
- `/i18n`
- `/home`
- `/sites`
- `/index.html`

Also set `Cache-Control: no-cache` for `/` so clients revalidate on reload after deployment.

---

## Running as desktop app

You can run this client via Element Desktop (Electron wrapper).

- Prebuilt app: <https://element.io/get-started>
- Build instructions: <https://github.com/element-hq/element-desktop>
- Desktop config overrides: `docs/config.md#desktop-app-configuration`

---

## Translations

- Translator guide: `docs/translating.md`
- Developer localization guide: `docs/translating-dev.md`

---

## Module system

Element Web can be extended at runtime via modules.

- Module API: <https://github.com/element-hq/element-modules/tree/main/packages/element-web-module-api>
- Configuration: `docs/config.md#modules`

---

## Issue triage

Issues are triaged by community and the Web App Team.

- Process: <https://github.com/element-hq/element-meta/wiki/Triage-process>
- Labels: <https://github.com/element-hq/element-meta/wiki/Issue-labelling>

---

## Copyright & license

Copyright (c) 2014-2017 OpenMarket Ltd  
Copyright (c) 2017 Vector Creations Ltd  
Copyright (c) 2017-2025 New Vector Ltd

Licensed under one of:

1. GNU Affero General Public License v3 (or later), or
2. GNU General Public License v3 (or later), or
3. Element Commercial License (paid, by agreement)

See `LICENSE` and `LICENSE-GPL-3.0` for details.

---

## Deployment-ready workflow (canonical)

Canonical deployable applications:

- Frontend: `apps/blackout-client`
- Backend: `apps/blackout-server` (runtime delegates to `@blackout/api`)

Canonical shared runtime packages:

- `packages/blackout-protocol`
- `packages/blackout-sdk`

### Reproducible local bootstrap

```bash
git clone <repo>
cd blackout
pnpm install
cp apps/blackout-server/.env.example apps/blackout-server/.env
cp apps/blackout-client/.env.example apps/blackout-client/.env
pnpm build
pnpm dev
```

### Deployment config locations

- Infrastructure configs and docs: `infra/`
- Existing production compose and container assets: `deploy/docker/`
- Kubernetes manifests: `deploy/kubernetes/`

### Health checks expected in CI

At minimum CI should validate install, lint, build, and tests from the monorepo root:

```bash
pnpm install
pnpm lint
pnpm build
pnpm test
```

Deployment readiness checklist and current status:

- `docs/deployment/readiness-checklist.md`
