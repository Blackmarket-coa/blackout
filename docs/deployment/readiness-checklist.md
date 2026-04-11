# Deployment readiness checklist (Blackout)

Last validated: 2026-04-11 (UTC)

## Status

**Yes — this repository is deployment-ready for the documented canonical stack** (`apps/blackout-client` + `apps/blackout-server`), with reproducible bootstrap commands and committed infra scaffolding.

## Evidence

- Canonical frontend and backend entrypoints are explicit and versioned under `apps/`.
- `.env.example` templates exist for both canonical deployable apps.
- Root install/build/test commands are executable (`pnpm install`, `pnpm build`, `pnpm test`).
- Shared protocol/sdk are real workspace packages with package metadata.
- Infra config location is explicit under `infra/`.
- CI now includes a deployment-readiness assertion check.

## Canonical bootstrap

```bash
git clone <repo>
cd blackout
pnpm install
cp apps/blackout-server/.env.example apps/blackout-server/.env
cp apps/blackout-client/.env.example apps/blackout-client/.env
pnpm build
pnpm dev
```

## Notes

- Legacy Element code remains isolated under `legacy/element` and is not part of canonical runtime startup.
- Existing deployment assets in `deploy/` remain supported while `infra/` is the canonical organization target going forward.
