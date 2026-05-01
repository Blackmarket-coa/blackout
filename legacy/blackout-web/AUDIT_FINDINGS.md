# Audit findings: links, buttons, and paths

Date: 2026-03-23
Scope: `apps/blackout-web`

## What was audited

1. Runtime UI semantics after auth + workspace render (`ui-audit.test.ts`).
2. API client route construction (`api-client.test.ts`).
3. Source-level spot-check for link/button markup in auth and app templates.

## Findings

### 1) Links

- **No anchor links are currently rendered in the audited app state.**
  - The UI mostly uses action buttons and data-action handlers instead of `<a>` navigation links.
  - The audit test still verifies that any anchors that appear later must carry a non-empty `href`.
- **Risk:** low for current state; medium for future regressions if anchors are introduced without hrefs.

### 2) Buttons

- **Buttons are consistently explicit-typed (`type="button"` or `type="submit"`).**
  - This reduces accidental form submissions and improves predictable keyboard behavior.
- **Buttons are label-bearing in audited state (text content or `aria-label`).**
  - This supports both accessibility and robust role/name query testing.
- **Risk:** low for current state; medium if new icon-only controls are introduced without labels.

### 3) API paths

- **Core API routes resolve to expected `/v1/...` paths.**
  - Verified for servers, server details, channels, message list, and send message operations.
- **Dynamic path segments are URL-encoded.**
  - Server/channel identifiers with spaces or slashes are encoded as expected.
- **Risk:** low in covered operations; medium for any newly-added endpoints not yet in the route assertions.

## Recommendations

1. Keep `ui-audit.test.ts` in CI as a regression gate for semantic correctness.
2. Extend path audit table whenever new API client methods are added.
3. If router-based links are introduced, add assertions for:
   - same-origin internal routes,
   - no `javascript:` URLs,
   - accessible link names.
