# Blackout continuwuity Fork

This is a Blackout-specific fork of
[continuwuity](https://forgejo.ellis.link/continuwuation/continuwuity), a
community-maintained Matrix homeserver in Rust (itself a continuation of
[conduwuit](https://github.com/girlbossceo/conduwuit)). It serves as the
Rust-based server path for the [Blackout](https://github.com/Blackmarket-coa/blackout)
communication platform.

## Repositories

| Role | URL |
|------|-----|
| Upstream | https://forgejo.ellis.link/continuwuation/continuwuity |
| Fork (GitHub) | https://github.com/bookenjoyer67/blackout-continuwuity |
| Fork (Forgejo) | https://forgejo.ellis.link/bookenjoyer67/continuwuity |

## Changes from upstream

- **Login security module** — rate limiting, IP blocking, and account lockout
  for brute-force protection. Configurable thresholds, graduated lock
  durations, and admin room management commands. Submitted upstream as
  `feat/login-security`.
- **Admin API extensions** (in progress) — room member listing, token
  management, user management endpoints for Blackout's governance tools.

## Upstream contribution policy

- Generic bug fixes, security patches, and broadly useful features are
  submitted upstream as PRs to `continuwuation/continuwuity`.
- Blackout-specific features (custom admin APIs, governance tooling) stay
  in this fork.
- `main` is kept in sync with upstream and feature branches are rebased
  periodically to minimize drift.

## Related

- [Blackout](https://github.com/Blackmarket-coa/blackout) — federated,
  end-to-end-encrypted communication platform
- [FEDERATION.md](https://github.com/Blackmarket-coa/blackout/blob/main/FEDERATION.md) —
  federation setup for self-hosters
- [docs/self-hosting.md](https://github.com/Blackmarket-coa/blackout/blob/main/docs/self-hosting.md) —
  deployment guide covering this fork
