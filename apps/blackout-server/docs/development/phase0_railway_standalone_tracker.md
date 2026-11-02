# Phase 0 Railway / Standalone Setup Tracker

Updated: 2026-03-17

> **2026-11-02.** Every file this tracker lists was removed with the Railway
> template in `42f68f2`; the operator chose removal over fixing the template. The
> open item, a standalone deploy on Railway, will not be done: no Railway path
> for the Synapse homeserver remains in the tree.

## Status snapshot

- [x] Create multi-stage Dockerfile (`services/blackout-server/Dockerfile`).
- [x] Create homeserver config template (`services/blackout-server/homeserver.yaml.template`).
- [x] Create `.env.example` (`services/blackout-server/.env.example`).
- [x] Create Railway config (`railway.toml`).
- [x] Add startup script (`services/blackout-server/entrypoint.sh`).
- [ ] Verify standalone deploy on Railway (pending real environment deployment test).

## Notes

- This repo is already the blackout server codebase, so the monorepo copy step was interpreted as N/A in this branch.
- Deployment verification remains a runtime operation requiring Railway resources and a provisioned PostgreSQL/Redis environment.
