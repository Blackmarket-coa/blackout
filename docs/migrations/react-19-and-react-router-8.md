# Migration plan: React 18 → 19 (and react-router 7 → 8)

**Status:** Planned — not started. **Owner:** _TBD_. **Created:** 2026-07-25 (pre-launch audit follow-up).

## Why

The pre-launch audit flagged a react-router advisory (GHSA-qwww-vcr4-c8h2, "RSC-mode CSRF bypass"), fixed in **react-router 8**. Two facts shape this work:

1. **The advisory does not currently apply to Blackout.** The client is a Vite SPA that imports `react-router` in **library mode only** — 83 plain `from 'react-router'` imports, zero `@react-router/server` / RSC / framework-mode usage. The CSRF-bypass affects RSC mode, so we are not exposed today. It is silenced with a time-boxed, documented ignore (`osv-scanner.toml`, `.trivyignore`, `pnpm.auditConfig`, expiring 2026-10-31).
2. **react-router 8 requires React ≥ 19.2.7.** The entire v8 line peers on React 19. Blackout is on **React 18.2**. So "upgrade react-router" is really a **React 18 → 19 migration** — a framework upgrade, not a router bump. That is why it was not bundled into the audit-remediation PR.

This document is the plan to do it deliberately.

## The hard blocker: `folds`

The client's design system is [`folds`](https://www.npmjs.com/package/folds) (a Cinny-derived component library: `Text`, `Box`, `Button`, `Dialog`, `config`, …), imported by **322 files** in `apps/blackout-client/src`. Its **latest** release still declares `peerDependencies.react: "17.0.0"` — it has not been updated for React 18 (we already run it on 18 by ignoring the peer warning), let alone React 19.

React 19 has **runtime** behaviour changes (ref-as-prop + ref cleanup functions, `forwardRef` deprecation path, StrictMode double-invocation timing, removal of legacy context / string refs / `ReactDOM.render`) that a typecheck and unit tests **will not catch** — only exercising the real UI will. Running an unmaintained React-17-era design system across 322 files on React 19 is the primary risk, and it cannot be validated without running the full client.

**Good news** (from the audit probe): the codebase is otherwise clean for React 19 — **0** `propTypes`, **0** `defaultProps` on function components, **0** string refs, and it already uses `createRoot` + `StrictMode`. `jotai` (`>=17`), `matrix-js-sdk`, `@vanilla-extract/css`, and `@testing-library/react` (`^18 || ^19`) all support React 19.

## Decision required first: the `folds` strategy

Pick one before starting — this determines the size of the whole effort:

| Option                      | Effort  | Notes                                                                                                                                          |
| --------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Upgrade `folds`**      | Low–Med | Only if a React-19-compatible `folds` (or a maintained fork) exists. Check upstream Cinny — if they've moved to React 19, adopt their version. |
| **B. Fork & patch `folds`** | Med     | Vendor `folds`, bump its peer + fix any React-19 runtime issues in the library. Adds a maintenance burden.                                     |
| **C. Replace `folds`**      | High    | Migrate the 322 files to another system. Out of scope for a router-security fix.                                                               |

Recommendation: **A if available, else B.** Do not pursue C for this reason alone.

## Step-by-step

1. **Resolve `folds`** (above). Confirm a React-19-compatible version/fork and pin it.
2. **Bump the React family** in `apps/blackout-client/package.json`:
   `react` / `react-dom` → `^19.2.7`, `@types/react` / `@types/react-dom` → `^19`. Update the root `pnpm.overrides` entries (`@types/react`, `@types/react-dom`) accordingly. `pnpm install`.
3. **Typecheck** (`pnpm --filter @blackout/client typecheck`). Expect a batch of `@types/react` 19 changes (notably: `useRef` requires an initial argument, `ReactElement`/children typing, `JSX` namespace moved to `react/jsx-runtime`). Fix mechanically; run the official codemods: `npx codemod@latest react/19/migration-recipe` and `npx types-react-codemod@latest preset-19 ./apps/blackout-client/src`.
4. **Unit tests** (`pnpm --filter @blackout/client test:unit`). The client suite is jsdom-based; fix any act()/StrictMode fallout.
5. **react-router 7 → 8**: bump `react-router` to `^8.3.0`, remove the deferral. The 83 import sites use only stable core APIs (`Link`, `useNavigate`, `useParams`, `useSearchParams`, `useMatch`, `createBrowserRouter`, `RouterProvider`, `useRoutes`, `Navigate`, `Outlet`, `generatePath`, `matchPath`, `isRouteErrorResponse`, `useRouteError`, `createMemoryRouter`, `MemoryRouter`, `Routes`, `Route`) — review the v8 changelog for any signature changes among these.
6. **Build** (`pnpm --filter @blackout/client build`) and **bundle-size** check (CI `MAX_BUNDLE_KB`).
7. **Run the app** (this is the step typecheck/units can't replace): boot the client against a homeserver and click through the shell, rooms, calls, settings, and the `folds`-heavy surfaces. Watch the console for React 19 ref/effect warnings.
8. **Visual + e2e**: run `pnpm e2e:visual` (regenerate baselines only after human review) and the Playwright smoke/state-explosion suites.
9. **Remove the advisory ignores** for GHSA-qwww-vcr4-c8h2 from `osv-scanner.toml`, `.trivyignore`, and `pnpm.auditConfig` once react-router 8 is in.

## Verification gates (all must pass)

-   Client typecheck + unit + build green.
-   No new React 19 runtime warnings in the console on the main surfaces.
-   Visual-regression + Playwright smoke green (with reviewed baselines).
-   `pnpm audit --prod` clean **without** the react-router ignore.
-   Desktop (Tauri) and mobile (Capacitor) wrappers smoke-tested, since they embed the client bundle.

## Rollback

The change is confined to `apps/blackout-client` deps + call-site fixups (+ the `folds` decision). If runtime issues surface post-merge, revert the React/react-router bump commit; the advisory ignores remain valid until 2026-10-31.
