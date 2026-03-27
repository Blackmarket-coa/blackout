# Repository Readiness: What Still Needs To Be Done

This checklist summarizes the remaining work needed to get the repository into a clean, "ready to ship" state.

## 1) Environment and local setup

- Confirm the required toolchain is present: Node `>=22.18` and Yarn Classic (`1.x`).
- Install dependencies from lockfile: `yarn install --frozen-lockfile`.
- Create runtime config by copying `config.sample.json` to `config.json` and setting homeserver/branding values.

## 2) Resolve remaining QA gate

Current branch status is green for lint/type/style/tests, with one remaining audit issue:

- `yarn audit --groups dependencies --level moderate`
    - Current blocker: one moderate vulnerability in transitive dependency `counterpart` under `@element-hq/web-shared-components` (no upstream patch available at time of writing).

## 3) Re-run the baseline before merge/deploy

After fixes, run the same baseline used by this repo:

```bash
yarn install --frozen-lockfile
yarn lint:types
yarn lint:js
yarn lint:style
yarn test test/unit-tests/steganography --runInBand
yarn audit --groups dependencies --level moderate
```

## 4) Triage remaining implementation debt

The unfinished-code scan currently reports a large backlog of `TODO`/`FIXME` markers.
Prioritize this list by user-facing impact and production risk (security, data loss, and message correctness first).

A kickoff triage queue is captured in `docs/qa-triage-start.md`.

## 5) Build and deploy validation

Once quality gates pass:

- Build artifacts with `yarn dist` (or `yarn build` on Windows).
- Validate generated static output in `webapp`/dist directory with real config.
- Smoke-test login, room timeline rendering, media, and steganography send/receive flows.

## 6) Operational recommendation

Treat the repo as functionally close but not yet fully "green" until the remaining audit item above is either remediated upstream or explicitly risk-accepted.
