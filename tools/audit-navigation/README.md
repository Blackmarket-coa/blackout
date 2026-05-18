# Navigation Consistency Audits

Tooling that proves every route in the blackout clients is reachable, escapable, and visually sound across breakpoints. Pairs a Playwright-driven web crawler with a static Expo Router auditor; the same invariants are codified as targeted Playwright specs under `playwright/e2e/navigation-audit/`.

## Invariants

For each route × viewport (mobile 375, tablet 900, desktop 1280):

1. **Home button visible** — a `data-testid="primary-rail-home"` / `data-testid="bottom-tab-home"` / `aria-label="Home"` / `a[href="/home"]` is in the DOM and visible.
2. **No dead ends** — at least one outbound link or back affordance is visible.
3. **Back navigation** — `history.back()` produces a URL change and not a 404.
4. **Modals close** — Esc closes every modal opened via the dev-only `window.__openModal(name)` bridge.
5. **Responsive layouts render** — `[data-shell="app"]` mounts, mobile-only chrome (`bottom-tab-bar`, `mobile-top-bar`) appears only under the 760px breakpoint.
6. **No hidden overflow** — `document.body.scrollWidth` ≤ viewport, and no `overflow: hidden` container clips content past a 16px tolerance.

## Run it

```sh
# Build the client once so vite preview has a bundle to serve.
pnpm --filter @blackout/client build

# Boot the preview server, run the crawler, run the mobile auditor.
E2E_PORT=4173 pnpm --filter @blackout/client exec vite preview --port 4173 --host 127.0.0.1 &
pnpm audit:navigation

# Or just the targeted Playwright regression suite (manages its own server):
pnpm test:e2e:navigation
```

Reports land in `audit/navigation/`:

- `web-report.{json,md}` — every finding from the crawler, grouped by invariant.
- `mobile-report.{json,md}` — Expo Router static findings.
- `playwright-results/` & `playwright-html/` — Playwright artefacts (HTML reporter, traces, videos).

The crawler exits non-zero on any `error`-severity finding. Pass `--report-only` for a warn-only baseline run.

## Files

```
tools/audit-navigation/
  types.ts            — shared finding/report types
  route-manifest.ts   — canonical WEB_ROUTES + SHELL_ROOT_PATHS + KNOWN_MODALS
  report.ts           — JSON + markdown writers
  crawl-web.ts        — Playwright crawler entry point
  audit-mobile.ts     — Expo Router static auditor

playwright/e2e/navigation-audit/
  helpers.ts                  — shared assertions / viewport helpers
  home-button.spec.ts
  back-navigation.spec.ts
  modal-closure.spec.ts
  responsive-layout.spec.ts
  overflow.spec.ts
  dead-ends.spec.ts

playwright.navigation-audit.config.ts
audit/navigation/                — generated reports land here
```

## Wiring the modal sweep

The crawler's modal-closure check looks for `window.__openModal(name)`. To enable it in a dev build, add this snippet to `AppShell.tsx` (or any always-mounted component):

```tsx
import { useSetAtom } from 'jotai';
import { createSpaceModalAtom } from '../../state/createSpaceModal';
import { createRoomModalAtom } from '../../state/createRoomModal';
import { searchModalAtom } from '../../state/searchModal';

// ...inside AppShell()
const setCreateSpace = useSetAtom(createSpaceModalAtom);
const setCreateRoom = useSetAtom(createRoomModalAtom);
const setSearch = useSetAtom(searchModalAtom);
useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).__openModal = (name: string) => {
        if (name === 'createSpace') setCreateSpace(true);
        else if (name === 'createRoom') setCreateRoom(true);
        else if (name === 'search') setSearch(true);
    };
    return () => {
        delete (window as any).__openModal;
    };
}, [setCreateSpace, setCreateRoom, setSearch]);
```

Without the bridge the modal sweep emits `info`-severity findings and the Playwright modal specs `test.skip()` themselves.

## Adding new routes

1. Add the constant in `apps/blackout-client/src/app/pages/paths.ts`.
2. Append an entry to `WEB_ROUTES` in `tools/audit-navigation/route-manifest.ts`.

The Playwright specs and crawler iterate the manifest, so no further changes are required.
