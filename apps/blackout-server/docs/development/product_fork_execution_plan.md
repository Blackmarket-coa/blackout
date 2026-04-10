# Product fork execution plan (moderate scope, protocol-compatible)

This plan defines how Blackout Server becomes an independently-operated product
fork while remaining Matrix/Synapse protocol compatible.

For completion-oriented implementation prompts, see:
`docs/development/product_fork_ai_prompts.md`.

## Goal

Own the parts that matter commercially and operationally:

- release train and version policy,
- runtime defaults and deploy profiles,
- packaging/image lifecycle,
- security patch intake and response SLAs,
- selective behavior divergence behind explicit feature flags.

Keep protocol compatibility and upstream interoperability by default.

## Non-goals (for this phase)

- Full namespace rewrite (`synapse.*` -> `blackout.*`).
- Breaking federation/client compatibility.
- Replacing upstream internals when a config-level fork policy is sufficient.

## Timeline (6-week kickoff)

### Week 1: Release ownership foundation

1. Define branch model:
   - `upstream-sync/*` for tracked imports,
   - `work` (or `main`) for productized releases.
2. Define semantic version strategy:
   - `X.Y.Z-blackout.N` for product releases,
   - changelog sections for `fork-policy`, `runtime-defaults`, `security-backports`.
3. Add release checklist:
   - upstream diff review,
   - compatibility smoke tests,
   - CVE delta review,
   - image provenance + signing.

### Week 2: Runtime default profiles

Introduce explicit runtime profiles and document expected behavior:

- `managed` (postgres+redis expected),
- `standalone` (sqlite fallback, single-node),
- `constrained` (lower memory/resource defaults).

Profile selection must be deterministic and observable in startup logs.

### Week 3: Packaging and image lifecycle

1. Publish fork-owned image tags:
   - `blackout-server:<version>`,
   - `blackout-server:stable`,
   - `blackout-server:canary`.
2. Add image metadata:
   - source revision,
   - upstream base revision,
   - build timestamp/SBOM artifact pointer.

### Week 4: Security backport workflow

1. Define upstream security intake cadence (daily scan + weekly backport window).
2. Define emergency patch policy:
   - severity thresholds,
   - target patch SLA,
   - release communication template.
3. Track patched upstream commit hashes in release notes.

### Week 5: Selective divergence policy

Document allowed divergence categories:

- default config and deployment UX,
- operational controls and safety guards,
- pricing/feature-gating surfaces,
- observability and readiness standards.

Document prohibited divergence categories for this phase:

- federation protocol behavior changes without compatibility testing,
- signing/auth semantics that break interoperability.

### Week 6: CI/release hardening

Add/standardize CI gates for fork releases:

- lint + unit tests,
- docker build + startup health smoke,
- managed profile smoke and standalone profile smoke,
- compatibility sanity check for `/_matrix/client/versions`.

## Operating rules

1. Upstream first for bugfixes that are broadly useful.
2. Fork-local changes should be:
   - explicitly documented,
   - feature-flagged when behavior changes,
   - covered by regression tests.
3. Every release notes entry should state:
   - **what diverged**,
   - **why**,
   - **rollback path**.

## Initial backlog (high-priority)

1. Add explicit `BLACKOUT_PROFILE` runtime selector in container entrypoint.
2. Add release checklist markdown and fork changelog section template.
3. Add CI smoke jobs for managed and standalone profiles.
4. Add security intake/backport runbook.
