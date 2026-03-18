[![Chat](https://img.shields.io/matrix/element-web:matrix.org?logo=matrix)](https://matrix.to/#/#element-web:matrix.org)
![Tests](https://github.com/element-hq/element-web/actions/workflows/tests.yaml/badge.svg)
![Static Analysis](https://github.com/element-hq/element-web/actions/workflows/static_analysis.yaml/badge.svg)

# Blackout Web Client (Element fork)

This repository is a fork of Element Web with additional governance and steganography-focused capabilities.

## What this repo contains

- Upstream Element Web application architecture.
- Blackout governance-focused features and rollout documentation.
- A steganography subsystem with test coverage and developer tooling.

Key areas:

- App bootstrap/runtime: `src/vector/*`
- Main client features and UI: `src/components/*`, `src/models/*`, `src/settings/*`
- Steganography code: `src/steganography/*`
- Feature and rollout documentation: `docs/*`

For deeper architecture context:

- `docs/repository_functionality_analysis.md`
- `docs/features/governance_features_analysis.md`
- `docs/blackout-reuse-completion-tracker.md`
- `docs/distributed_self_healing_blueprint.md`

---

## Self-healing federation architecture (Blackout roadmap)

This project now defines a target architecture for a decentralized, encrypted, self-healing federation model that can run on low-power nodes (including recycled Android phones).

Primary blueprint:

- `docs/distributed_self_healing_blueprint.md`

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

On Windows, use the same command:

```bash
pnpm build
```

### Run the placeholder frontend shell

```bash
pnpm start
```

Then open:

- Frontend shell: `http://localhost:3000/`
- Health endpoint: `http://localhost:3000/health`
- Readiness endpoint: `http://localhost:3000/ready`

If deployed on Railway, use your Railway domain instead of localhost:

- Frontend shell: `https://$RAILWAY_PUBLIC_DOMAIN/`
- Health endpoint: `https://$RAILWAY_PUBLIC_DOMAIN/health`
- Readiness endpoint: `https://$RAILWAY_PUBLIC_DOMAIN/ready`

---

## Development workflow

Recommended baseline checks before opening a PR:

```bash
pnpm lint
pnpm test
```

For steganography-specific changes, run targeted suites too:

```bash
pnpm --filter @blackout/web test
```

Helpful docs:

1. `developer_guide.md`
2. `code_style.md`
3. `CONTRIBUTING.md`
4. `docs/qa-triage-start.md`
5. `docs/repo-readiness-next-steps.md`

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
