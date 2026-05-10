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

| ID | Status | Notes |
|---|---|---|
| LS-AUTH-01 | ✅ stubbed | Valid login lands off `/login`. |
| LS-AUTH-02 | ✅ stubbed | Wrong password surfaces a user-safe error. |
| LS-AUTH-03 | ⏳ pending | Drive `/forgot-password` UI; assert 202 confirmation. |
| LS-AUTH-05 | ⏳ pending | Login → hard-refresh → still authenticated. |
| LS-MSG-01..03 | ⏳ pending | Two browser contexts; verify timeline parity. |
| LS-MEDIA-01..03 | ⏳ pending | Drag-and-drop fixture with image + non-image. |
| LS-MOD-01, LS-MOD-03 | ⏳ pending | Capability boundary checks via second context. |
| LS-GOV-01, LS-GOV-02 | ⏳ pending | Governance dashboard tab navigation + vote cast. |
| LS-CALL-01, LS-CALL-03 | ⏳ pending | LiveKit token presence; mute toggle UI state. |

API-level coverage for the same case IDs lives in
`packages/api/test/launch-smoke.integration.test.ts` and is wired into the
`launch-smoke` CI job (.github/workflows/ci.yml). The Playwright tier here
is the client-rendered counterpart and is intentionally minimal until the
dev-server harness for the launch shell stabilizes.
