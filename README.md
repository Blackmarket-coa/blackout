[![Chat (devs)](https://img.shields.io/matrix/blackout-dev:theblackout.app?label=chat%20(devs)&logo=matrix)](https://matrix.to/#/#blackout-dev:theblackout.app)
[![Chat (testers)](https://img.shields.io/matrix/welcome:theblackout.app?label=chat%20(testers)&logo=matrix)](https://matrix.to/#/#welcome:theblackout.app)

# Blackout

Federated, end-to-end-encrypted communication platform built on the Matrix
protocol — with first-class governance, mutual aid, steganography, deaddrop
encrypted messaging, LiveKit-based voice and video, and post-quantum hybrid
encryption (X25519 + ML-KEM-768). This repository is a pnpm/turborepo
monorepo containing web, Tauri desktop, Capacitor mobile, a Synapse-derived
homeserver, and a Node/Hono API server.

## For testers (no setup required)

- Hosted instance: **[`https://matrix.theblackout.app`](https://matrix.theblackout.app)**.
- **Join the beta — no CLI needed:** registration is invite-gated. Open the
  community invite link, click **Create account**, and the registration token
  is filled in for you:

  > **Invite link:** `https://matrix.theblackout.app/invite/COMMUNITY_TOKEN`
  >
  > _Maintainers: replace `COMMUNITY_TOKEN` above with a multi-use community
  > invitation minted via the invitations flow (`POST /v1/invitations`, or the
  > in-app Invitations panel). The link pre-fills the Synapse registration
  > token, so testers never touch the CLI._

  If the link is exhausted or expired, request a fresh one via the
  [invite-request issue template](https://github.com/Blackmarket-coa/blackout/issues/new/choose).
- Browse public rooms before signing up at
  [`https://matrix.theblackout.app/explore`](https://matrix.theblackout.app/explore).
- See [`TESTERS.md`](TESTERS.md) for the 5-minute orientation and what to try first.
- During the **96-hour V1 Test Flight**, open the Coliseum Coalition once
  you're signed in — eight challenges, each a real area we want stress-tested.
  Briefs: [`docs/coliseum/`](docs/coliseum/README.md).
- Report what you find via [Issues](https://github.com/Blackmarket-coa/blackout/issues/new/choose) or [Discussions](https://github.com/Blackmarket-coa/blackout/discussions).
- Pick a role (Scout / Operator / Builder / Signal / Federation Team) in [`CONTRIBUTOR_ROLES.md`](CONTRIBUTOR_ROLES.md).

## What this repo contains

- Web client (`apps/blackout-client`) — Matrix-protocol web app with Blackout's feature plugins.
- Desktop wrapper: `blackout-desktop` (Tauri)
- Mobile wrapper: `blackout-mobile` (Capacitor)
- Mobile native workspace: `mobile/` (shared auth/session, native bridge contracts, and core surface controllers)
- API server (`packages/api`) — Hono-based runtime delegated to by `apps/blackout-server`.
- Homeserver (`apps/blackout-server`) — Synapse-derived; see deployment assets under `deploy/` and `infra/`.
- Coalition + governance primitives (`packages/core/src/coalition/`, `packages/core/src/governance/`).
- Blackout governance-focused features and rollout documentation.
- A steganography subsystem with test coverage and developer tooling.

Key areas:

- Monorepo apps: `apps/*`
- Shared packages: `packages/*`
- App bootstrap/runtime: `src/vector/*`
- Main client features and UI: `src/components/*`, `src/models/*`, `src/settings/*`
- Steganography code: `src/steganography/*`
- Feature and rollout documentation: `docs/*`

For beta testers:

- [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) — features deferred for beta, deduped against testing reports

For security context, start with:

- [`THREAT_MODEL.md`](THREAT_MODEL.md) — top-level adversary model, trust boundaries, accepted residual risks
- [`SECURITY.md`](SECURITY.md) — vulnerability disclosure process

For deeper architecture context:

- `docs/repository_functionality_analysis.md`
- `docs/features/governance_features_analysis.md`
- `docs/blackout-reuse-completion-tracker.md`
- [`docs/matrix-upstreams.md`](docs/matrix-upstreams.md) (upstream Matrix dependency registry with adoption decisions)
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

In shorthand: **Cinny UI shell + modular features + shared SDK + shared protocol + modular backend**.

---


## Minimum viable bridges

For a practical initial integration footprint, start with:

- **Hookshot (webhooks):** good default for inbound webhooks, feed mirroring, and lightweight workflow automation.
- **`matrix-appservice-bridge` family path:** add IRC/Discord/Slack bridges by deploying the relevant appservice bridge sidecar and registering each appservice in Synapse (`app_service_config_files`).
- **When to prefer Mautrix bridges:** choose Mautrix when you need protocol-specific maturity (e.g., richer media/thread parity or stronger community-maintained bridge semantics) and can accept the extra operational surface.

Operational readiness checklist for bridge deployments:

- Define ingress and Synapse-side rate limits before exposing webhook or federation-facing bridge endpoints.
- Run bridge bots with least privilege (room-scoped moderator roles rather than server-wide admin whenever possible).
- Store bridge tokens/registration secrets in a secret manager (not plaintext `.env` in production), and rotate regularly.

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
> `mobile:workspace:*` scripts target the new `mobile/` workspace for shared native logic and release tooling.
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

### Build and run the canonical frontend

```bash
pnpm --filter @blackout/client build
pnpm --filter @blackout/client dev
```

> Canonical frontend package: `@blackout/client` (`apps/blackout-client`).

Default local URL:

- Frontend app: `http://localhost:5173/`

### Deploy to Railway

1. Create a new Railway project and connect this GitHub repo.
2. Use Node.js 22+ and pnpm 9.x.
3. Set commands:
   - Build: `pnpm install --frozen-lockfile && pnpm --filter @blackout/client build`
   - Start: `pnpm --filter @blackout/client dev -- --host 0.0.0.0 --port $PORT`
4. Expose `PORT` (Railway sets this automatically).
5. Verify:
   - `/` returns the frontend app.

### Legacy frontend quality checks (`apps/blackout-web`)

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

For steganography-specific changes in the legacy web surface, run targeted suites too:

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
- Require an explicit pre-edit file plan (exact relative paths) and reject edits outside that list unless the AI updates the plan first.
- Require justification whenever the AI proposes creating a new design token or UI component (why reuse was insufficient, where it will be consumed, and why it belongs at that layer).

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

### 8) Reuse shared packages before app-local additions

Before accepting app-local styling or logic in `apps/*`, require AI to explicitly check and document whether reuse is possible from:

- `packages/design` (tokens, themes, primitives)
- `packages/ui` (shared UI building blocks)
- `packages/core` (shared business/runtime logic)

Only allow new app-local implementations when those packages cannot satisfy requirements without causing coupling or regressions, and require that rationale in the PR summary.

---

## Security notes (hosting)

Do **not** host the Blackout web client on the same domain as your homeserver.

Recommended response headers:

- `X-Frame-Options: SAMEORIGIN`
- `Content-Security-Policy: frame-ancestors 'self'`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`

See [`SECURITY.md`](SECURITY.md) for the full disclosure process and
[`THREAT_MODEL.md`](THREAT_MODEL.md) for trust boundaries.

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

Blackout ships a Tauri desktop wrapper in `blackout-desktop/`.

- Prebuilt releases: <https://github.com/Blackmarket-coa/blackout/releases>
- Local dev: `pnpm desktop:dev`
- Production build: `pnpm desktop:build`
- Signing-chain verification (per-OS): see `blackout-desktop/docs/signing-verification.md` (under construction; tracked in launch-prep seeded issues)
- Desktop config overrides: `docs/config.md#desktop-app-configuration`

---

## Translations

- Translator guide: `docs/translating.md`
- Developer localization guide: `docs/translating-dev.md`

---

## Module system

Blackout is extended at runtime via the feature-plugin registry. Each plugin
is a self-contained module loaded by the client runtime; the chat,
governance, forum, deaddrop, moderation, and steganography surfaces are
themselves plugins built on this registry.

- Plugin authoring: see the in-tree plugins under `apps/blackout-client/src/app/features/` for working examples.
- Configuration: `docs/config.md#modules`
- Discussions for new plugin ideas live in the [Plugin Ideas Discussion category](https://github.com/Blackmarket-coa/blackout/discussions/new?category=plugin-ideas).

---

## Issue triage

Issues are triaged by maintainers and `role:operator` contributors during
the V1 Test Flight. The full label scheme lives in
[`.github/labels.yml`](.github/labels.yml). Key dimensions:

- `T-*` — type of work (Defect, Enhancement, Task, etc.)
- `severity:*` — defect severity (critical → papercut)
- `surface:*` — web / desktop / mobile / server
- `area:*` — subsystem (coalition, governance, mutual-aid, steganography, deaddrop, livekit, federation, voice-video, performance, onboarding, e2ee)
- `challenge:*` — Coliseum challenge linkage (during the test flight)
- `H{N}-{N}` — test-flight cohort timestamp

Contributor workflow expectations are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Copyright & license

Copyright (c) 2014-2017 OpenMarket Ltd  
Copyright (c) 2017 Vector Creations Ltd  
Copyright (c) 2017-2025 New Vector Ltd  
Copyright (c) 2024-2026 Black Market Coalition

Licensed under one of:

1. GNU Affero General Public License v3 (or later) — see [`LICENSE-AGPL-3.0`](LICENSE-AGPL-3.0)
2. GNU General Public License v3 (or later) — see [`LICENSE-GPL-3.0`](LICENSE-GPL-3.0)
3. Blackout Commercial License (paid, by agreement) — see [`LICENSE-COMMERCIAL`](LICENSE-COMMERCIAL)

Upstream Element/Matrix copyrights are preserved per the project's AGPL/GPL
inheritance.

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
