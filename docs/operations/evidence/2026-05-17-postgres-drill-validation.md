# Postgres drill validation — 2026-05-17

Refresh of [`2026-02-20-postgres-drill-validation.md`](./2026-02-20-postgres-drill-validation.md).
Re-attests that the Postgres migration set boots from empty, the
reversible tail round-trips, and the auth-lifecycle tables required
by the DR-restore workflow exist after `up`.

- Branch: `claude/production-readiness-check-9rxU3`
- HEAD: `b7d3571` (chore(readiness): 2026-05-17 production readiness check + signoff refresh)
- Latest migration: `019_obs_ws_passwords`

## Sandbox constraint

`.github/workflows/dr-backup-verification.yml` runs against a real
docker `postgres:16-alpine` service container. The Docker daemon
isn't available in this Claude Code sandbox
(`/var/run/docker.sock: no such file`), so the drill is reproduced
against PGlite (`@electric-sql/pglite@0.3.16`) — the same in-memory
Postgres engine `tools/ci/verify-migrations-ephemeral.mjs` uses.
Functionally equivalent for the SQL-shape and round-trip checks; not
equivalent for genuine server-side replication or PITR. The
authoritative postgres-on-docker drill continues to run nightly in
`dr-backup-verification.yml`.

## Steps run

### 1. Ephemeral round-trip verifier

```
$ node tools/ci/verify-migrations-ephemeral.mjs
Ephemeral migration verification passed. tables=33 reversible=13
EXIT=0
```

**PASS** — all 19 migrations apply forward; the 13 reversible
migrations (007–019) round-trip cleanly via `.down.sql` → re-apply
`.up.sql` without table-count drift.

### 2. Auth-lifecycle table presence (DR workflow parity check)

The DR workflow at `.github/workflows/dr-backup-verification.yml`
asserts that `users`, `refresh_tokens`, `password_reset_tokens`, and
`revoked_sessions` exist after `migrate:up`. Re-asserted here against
the PGlite-applied schema:

```
TABLE_COUNT: 33
AUTH_LIFECYCLE_ASSERT: PASS
PRESENT_TABLES: ad_revenue_periods,ad_revenue_shares,aid_pools,
  channels,communities,community_boost_pledges,creator_subscription_tiers,
  creator_subscriptions,discord_compat_webhooks,federation_links,
  kick_chat_bridges,linked_accounts,marketplace_entitlements,
  marketplace_license_keys,marketplace_listings_cache,
  marketplace_webhook_events,messages,obs_ws_passwords,
  outbound_event_webhooks,password_reset_tokens,pending_oauth_links,
  refresh_tokens,revoked_sessions,simulcast_destinations,tips,
  twitch_chat_bridges,twitch_event_subscriptions,twitch_irc_bot_tokens,
  users,vote_entries,votes,widget_alert_tokens,youtube_chat_bridges
```

**PASS** — all four auth-lifecycle tables present.

### 3. Migration runner static review

`packages/api/src/db/migrate.ts` manages `schema_migrations` itself
(line 60 — `CREATE TABLE IF NOT EXISTS schema_migrations`), takes a
`pg_advisory_lock` (constant `0x424c_4f43`) before applying, and
rejects checksum drift. Behaviour unchanged since the 2026-02-20
attestation. `pnpm --filter @blackout/api migrate:up | migrate:down |
migrate:status` all wired in `packages/api/package.json:14-17`.
`schema_migrations` itself is therefore created on first
`migrate:up`, not by the raw SQL files — which is why the ephemeral
verifier (raw-SQL apply) does not produce it but the real runner
does.

## Verdict

**PASS.** Schema migration set is structurally sound at HEAD
`b7d3571`. The sandbox-equivalent of the DR workflow's shape +
table-presence assertions passes. The real-postgres + advisory-lock
+ schema_migrations bookkeeping path is exercised nightly by
`dr-backup-verification.yml`; that workflow remains the authoritative
attestation for the genuine server-side semantics this sandbox
cannot reproduce.
