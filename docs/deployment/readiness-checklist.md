# Deployment readiness checklist (Blackout)

Last validated: 2026-04-11 (UTC)

## Verdict

**Mostly yes — deployment-ready for the canonical stack (`apps/blackout-client` + `apps/blackout-server`)**, with one important documentation ambiguity to keep cleaning up: parts of the README still describe `apps/blackout-web` as canonical for some flows.

## IAW checklist (requested definition)

- [x] **Clear app entrypoints**: canonical frontend and backend package scripts exist (`dev`, `build`, and backend `start`/`migrate` delegation).  
- [x] **Environment variables explicit**: `.env.example` templates are committed for both canonical deployables.  
- [x] **Reproducible root build path**: root scripts include `build`, `test`, and `dev`; workspace uses pinned pnpm + turbo scaffolding.  
- [x] **Shared packages are real packages**: `@blackout/protocol` and `@blackout/sdk` each have proper `package.json` metadata and workspace wiring.  
- [x] **Deployment config committed**: infra topology is committed under `infra/` and server Dockerfiles are in-repo.  
- [x] **CI validates health**: CI includes lint/type/test/build and deployment-readiness assertions.  
- [~] **README canonical clarity**: the README contains both `blackout-client` and `blackout-web` canonical statements; this is survivable but should be harmonized to one canonical frontend statement.

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
- Existing deployment assets in `deploy/` remain supported while `infra/` is the canonical organization target.
- CI already enforces a minimal deployment-readiness file/script contract via `tools/ci/check-deployment-readiness.mjs`.
