# Blackout Playwright Harness

End-to-end coverage for the canonical client (`apps/blackout-client`) plus
launch-smoke specs (`playwright/e2e/launch-smoke/**`) that map to the
release-blocker case IDs in
[`docs/launch-smoke-suite.md`](../docs/launch-smoke-suite.md).

## Layout

| Path | Purpose |
|---|---|
| `services.ts` | Worker fixture options (homeserver-type, etc.). |
| `e2e/launch-smoke/` | Specs covering the LS-* automated set. |

## Running

```bash
# Local — assumes the dev server is already running on $BASE_URL.
BASE_URL=http://localhost:8080 \
BLACKOUT_E2E_BASE_URL=http://localhost:8080 \
LS_AUTH_USERNAME=smoke_member_a \
LS_AUTH_PASSWORD=<password> \
pnpm playwright test playwright/e2e/launch-smoke
```

```bash
# CI — playwright.config.ts spawns a static server via `npx serve` against
# ./webapp. The smoke seed users + homeserver must be reachable before the
# job runs; see docs/launch-smoke-suite.md "Environment & Data Preconditions".
CI=true pnpm playwright test playwright/e2e/launch-smoke
```

## Coverage status (2026-05-10)

All 16 automated LS-* cases are seeded. Selectors are deliberately lenient
(role-based + regex labels) so the specs survive small UX refinements;
tighten once the launch shell stabilizes and add `data-testid` hooks for
the brittle paths (call participant list, mention badge, redaction
tombstone).

| ID | Spec | Status |
|---|---|---|
| LS-AUTH-01 | auth.spec.ts | ✅ seeded |
| LS-AUTH-02 | auth.spec.ts | ✅ seeded |
| LS-AUTH-03 | auth.spec.ts | ✅ seeded |
| LS-AUTH-05 | auth.spec.ts | ✅ seeded |
| LS-MSG-01..03 | messaging.spec.ts | ✅ seeded (two-context) |
| LS-MEDIA-01..03 | messaging.spec.ts | ✅ seeded (in-memory PNG/TXT/EXE fixtures) |
| LS-MOD-01 | moderation-governance.spec.ts | ✅ seeded |
| LS-MOD-03 | moderation-governance.spec.ts | ✅ seeded |
| LS-GOV-01 | moderation-governance.spec.ts | ✅ seeded (drives BKL-003 tab strip) |
| LS-GOV-02 | moderation-governance.spec.ts | ✅ seeded |
| LS-CALL-01 | calls.spec.ts | ✅ seeded (fake media stream via Chrome project) |
| LS-CALL-03 | calls.spec.ts | ✅ seeded (mute toggle local-state check) |

Manual-only cases (LS-AUTH-04, LS-MSG-04, LS-MEDIA-04, LS-MOD-02, LS-GOV-03,
LS-CALL-02, LS-CALL-04) stay in the human-run release-day runbook.

## Required environment variables

| Var | Purpose | Default |
|---|---|---|
| `BLACKOUT_E2E_BASE_URL` | Gate that opts a checkout into the live-stack run | unset (skip) |
| `BASE_URL` | Playwright's `baseURL` | http://localhost:8080 |
| `LS_AUTH_USERNAME` / `LS_AUTH_PASSWORD` | Single-user auth specs | smoke_member_a / change-me |
| `LS_MEMBER_A_USERNAME` / `LS_MEMBER_A_PASSWORD` | DM / message / mention sender | smoke_member_a |
| `LS_MEMBER_B_USERNAME` / `LS_MEMBER_B_PASSWORD` | DM / message recipient | smoke_member_b |
| `LS_MODERATOR_USERNAME` / `LS_MODERATOR_PASSWORD` | LS-MOD-01 actor | smoke_moderator |
| `LS_OWNER_USERNAME` / `LS_OWNER_PASSWORD` | LS-GOV-* proposer | smoke_owner |
| `LS_SMOKE_ROOM` | Room alias (no leading `#`) | smoke-launch |
| `LS_CALL_ROOM` | Voice channel room | falls back to `LS_SMOKE_ROOM` |

API-level coverage for the same case IDs lives in
`packages/api/test/launch-smoke.integration.test.ts` and is wired into the
`launch-smoke` CI job (.github/workflows/ci.yml). The Playwright tier here
is the client-rendered counterpart and is intentionally minimal until the
dev-server harness for the launch shell stabilizes.
