# Blackout — working notes for Claude

Encrypted-communications platform. A **Matrix/Synapse fork** (Python, 542 `.py`
files under `apps/blackout-server/synapse/`) plus a TypeScript monorepo —
web client, desktop (Tauri), mobile (Capacitor) — orchestrated by turbo + pnpm.

---

## Read these first

### The default branch is `develop`, not `main`

Base PRs on `develop`. `.github/workflows/pull_request_base_branch.yaml` enforces
it. This is the single most common way to waste a PR here.

### Fork discipline: keep your changes inside `blackout_runtime/`

`apps/blackout-server/PATCHES.md` is the contract with upstream. Blackout features
belong in:

-   `blackout_runtime/` — module semantics, API resources, governance/reputation
-   `blackout_runtime_tests/` — runtime + integration coverage
-   `tests/blackout_runtime/` — end-to-end homeserver API tests

Anything you must change **outside** those directories gets documented in
`PATCHES.md` _before_ the merge. That file is how the next upstream sync knows
what it's about to clobber.

### Upstream merges are not currently automatable — don't promise otherwise

`PATCHES.md` records a real rehearsal: `git merge --allow-unrelated-histories
upstream/develop` produced extensive add/add conflicts across the tree, because
this history diverges from `element-hq/synapse` as _unrelated_. The intended
monthly-merge cadence is aspirational until someone does a one-time history
reconciliation or re-forks from a fresh baseline.

So: if a Synapse security advisory lands, you cannot just merge upstream. You
port the specific patch by hand into our tree and note it in `PATCHES.md`.

---

## Security work: fix or explain, never baseline

`docs/security/` holds the triage record, one file per pass (e.g.
`semgrep-triage-2026-09-13.md`). The standing rule from that pass:

**Every finding gets a fix or a written explanation. Nothing gets silently
baselined.** A suppression file that grows without a paper trail is how a real
finding hides behind ninety-eight false ones.

When a suppression genuinely can't be attached where you want it — `nosemgrep`
does **not** bind in JSX attribute position, which cost three attempts to
discover — leave the finding visible and explain it in the triage doc rather
than widening the ignore to file scope.

Existing worked examples in the tree:

-   `synapse/util/manhole.py` — ephemeral key generation rather than the shipped
    hardcoded one.
-   `synapse/handlers/cas.py` — `_parse_cas_xml` rejects DOCTYPE outright. Python's
    `ElementTree` expands entities; a CAS response is attacker-adjacent input.

### Claims about safety must be true

A prior pass found the UI describing Tor as "active" when it wasn't wired. In a
tool whose users may be relying on it for physical safety, an overstated privacy
claim is a defect of the highest severity, not a copy nit. If you can't verify a
protection is on, the UI must not say it is.

`THREAT_MODEL.md`, `TRUST.md`, `KNOWN_LIMITATIONS.md` are load-bearing — update
them when behaviour changes rather than letting them drift.

---

## Licensing

Three files, deliberately: `LICENSE-AGPL-3.0`, `LICENSE-GPL-3.0`,
`LICENSE-COMMERCIAL`. Check which applies to the subtree you're touching before
adding headers or changing terms.

---

## Commands

```bash
pnpm build          # turbo run build
pnpm lint           # turbo run lint
pnpm test           # turbo run test
pnpm dev            # turbo run dev --parallel

pnpm web:dev        # @blackout/client
pnpm desktop:dev    # Tauri
pnpm mobile:dev     # Capacitor

pnpm ci:parity              # centralized CI parity check
pnpm smoke:aligned
pnpm guard:feature-registry # feature registry must stay in sync
```

Python side lives under `apps/blackout-server/` (Synapse's own tooling, plus a
Rust component — `Cargo.toml` at that level).

## Layout

`apps/blackout-server` (Synapse fork) · `apps/blackout-client` (web) ·
`apps/deaddrop-appservice` · `blackout-desktop` (Tauri) · `blackout-mobile` ·
`packages/*` · `infra/`, `deploy/` · `services/perturbation` ·
`playwright/`, `load/`, `audit/`

Note `apps/blackout-gov` was **deleted**. If you see it on disk it is untracked
`node_modules` residue — `git ls-files apps/blackout-gov` returns zero. Don't
resurrect it.

---

## Working conventions

-   Base on `develop`.
-   Keep the fork surface small and documented in `PATCHES.md`.
-   Security findings: fix or explain in `docs/security/`. Never baseline silently.
-   Never overstate a privacy or safety guarantee in user-facing text.
-   Verify before asserting — check the tree, the config, the running behaviour.
-   Never disable TLS verification or unset `HTTPS_PROXY`.
