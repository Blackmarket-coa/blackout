# Playwright TODO Triage

Triaged: 2026-04-10  
Scope: all TODO/FIXME comments in `_port/playwright/` and `apps/blackout-web/tests/`

> **Constraint**: Files under `_port/` are upstream Element Web (read-only, enforced by `port-guard`).
> Fixes must be applied upstream or in a new blackout-specific playwright fixture.

---

## 1. Missing rich-text mode tests — Commands & Mentions

**Severity**: MEDIUM  
**Files**:
- `_port/playwright/e2e/composer/RTE.spec.ts:35` — `test.describe("Commands")`
- `_port/playwright/e2e/composer/RTE.spec.ts:89` — `test.describe("Mentions")`

**Gap**: Both `describe` blocks only contain `test.describe("Plain text mode")` sub-suites.
Rich text mode (enabled by the `feature_wysiwyg_composer` lab flag) has zero test coverage for:

- **Commands**: `/` autocomplete opening, `//`/`/ ` closing it, selecting commands with click or Enter
- **Mentions**: `@` autocomplete opening on first character, pill insertion with `data-mention-type="user"`,
  cursor-back-to-incomplete-mention reopening the autocomplete

**Action**: Implement the missing rich-text sub-suites. Since `_port/` is read-only, either:
- Contribute the tests upstream to `element-hq/element-web`
- Add a parallel blackout Playwright spec in `apps/blackout-web/tests/e2e/` if the blackout app
  exposes the same WYSIWYG composer

---

## 2. OAuth mock server does not validate Bearer token

**Severity**: MEDIUM (test correctness — not a production security issue)  
**File**: `_port/playwright/plugins/oauth_server/index.ts:54`

**Gap**: The `/oauth/userinfo` endpoint returns a successful `200` response regardless of whether
the `Authorization` header is present or carries the correct token:

```ts
app.get("/oauth/userinfo", (req, res) => {
    // TODO: validate that the request carries an auth header which matches the access token we issued above
    res.send({ sub: this.sub, name: "Alice" });
});
```

The access `token` is scoped in the closure but never compared against `req.headers.authorization`.
As a result, SSO tests in `login-sso.spec.ts`, `soft_logout_oauth.spec.ts`, and
`oidc/oidc-native.spec.ts` do not actually verify that the client transmits the correct Bearer token
to the userinfo endpoint.

**Fix** (upstream or in a new blackout OAuth fixture):

```ts
app.get("/oauth/userinfo", (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
        res.status(401).json({ error: "invalid_token" });
        return;
    }
    res.send({ sub: this.sub, name: "Alice" });
});
```

**Action**: Contribute fix upstream, or create a blackout-specific OAuth server fixture that
includes this validation from the start.

---

## 3. Other TODOs (lower priority)

| File | Line | Note |
|------|------|------|
| `_port/playwright/pages/ElementAppPage.ts` | 208 | Right-panel navigation helper doesn't account for open member list; low blast radius |
| `_port/playwright/e2e/invite/invite-dialog.spec.ts` | 111 | Room-header invite test not implemented; covered by separate `room-header.spec.ts` |
| `_port/playwright/e2e/utils.ts` | 24 | `waitForRoom()` is broken and `@deprecated`; callers should be migrated off it |
| `_port/playwright/e2e/read-receipts/index.ts` | 354 | Timing `waitForTimeout` workaround for flaky multi-message tests; needs root-cause fix |
| `_port/playwright/e2e/threads/threads.spec.ts` | 106,110 | Read-receipt group hidden in bubble layout; tests disabled pending layout fix |
| `_port/playwright/e2e/spotlight/spotlight.spec.ts` | 191 | Cross-homeserver / MSC1929 room discovery not testable without multi-HS fixture |

All items above are in `_port/` (read-only). Track upstream or accept as known limitations.
