# Blackout — AI-First Full-Platform Audit, Repair & Release-Gating Plan

**Status:** Proposed execution plan; no audit or code changes are implied by this document.  
**Date:** 2026-11-03  
**Applies to:** All Blackout applications, packages, integrations, infrastructure, and user-facing capabilities.  
**Related:** [Whole-Product MVP](BLACKOUT_WHOLE_PRODUCT_MVP.md), [Feature Overview](features/OVERVIEW.md), [Known Limitations](../KNOWN_LIMITATIONS.md), [Threat Model](../THREAT_MODEL.md), [Operations Guide](AGGRESSIVE_OPERATIONS_GUIDE.md).

## Mission

Inspect every feature and dependency; determine what actually works in a reproducible environment; automatically repair what can be completed safely; hide what cannot; preserve deferred work; and release only experiences proven reliable, secure, understandable, and useful.

**Default decision:** verified working → visible; fixable → AI repair and retest; incomplete/blocked → hidden behind a default-off gate; unsafe → disabled pending review. Never equate presence of source code, a passing unit test, or a UI screenshot with production readiness.

## Scope: audit everything

Inventory source and runtime surfaces across:
- Web client, mobile shells/native workspace, desktop, navigation, onboarding, accessibility.
- Authentication, identity, account recovery, privacy, Matrix E2EE, media, messaging, calls, notifications.
- Feeds, discovery, social graph, profiles, posts, reactions, short video, search, The Void (if present).
- Canopies, Dens, community governance, moderation, federation, invitations, events, education.
- Coliseum, factions, debates, challenges, rankings, reputation.
- Creator Hub, live streams, VOD, clips, broadcast tooling, subscriptions, tips, gifts, marketplace.
- Coalition maps, resources, tasks, volunteer coordination, location consent and privacy.
- Blackmask/OPSEC-related surfaces, deaddrop, steganography, panic controls, dead-man switch.
- Integrations and bridges (Discord, Twitch, YouTube, Kick, Matrix bridges), Forge/plugins, FBM, Blackstar, BMC Connect.
- API contracts, data stores, jobs, queues, migrations, observability, backup/restore, deployment and self-hosting.
- Security, legal/compliance-dependent flows, abuse reporting, permissions, retention and incident response.

Include hidden routes, dead links, disabled controls, unimplemented buttons, mock data, stale flags, unreachable modules, undocumented env requirements, broken imports, flaky tests, and features only working on one client.

## Evidence-driven inventory

Create a machine-readable register at `docs/audits/feature-inventory.json` (or equivalent generated artifact) plus a human-readable dashboard. Each entry must record:

- Stable feature ID; product area; owner/module paths; UI entry points; APIs/jobs/storage; dependencies.
- Intended user journey and expected behavior; MVP relevance and impact.
- Deployment environment(s), required flags/secrets, availability per web/desktop/mobile.
- Test types and results: static/build/unit/integration/E2E/manual/security/accessibility.
- Evidence links: exact commit, logs, CI run, screenshot or recording where appropriate, timestamp.
- Data/security classification, audience and authorization rules, privacy/retention risk.
- State: `unreviewed`, `verified`, `repairable`, `blocked`, `deferred`, or `unsafe`.
- Visibility: `on`, `off`, or `internal`; repair PR/issue; blocker; next verification.
- Distinguish `code-present`, `tested-local`, `tested-staging`, and `verified-production`.

Do not invent results or claim testing that was not executed. Preserve an immutable audit snapshot for each release candidate.

## AI-first workflow

### Phase A — Repository and deployment discovery

1. Read README, feature inventory, known limitations, threat model, architecture, CI, and deployment manifests.
2. Enumerate apps/packages, feature registries, routes, nav entries, flags, env gates, API endpoints, jobs, schemas, and external dependencies.
3. Build a dependency graph and identify duplicate/abandoned implementations.
4. Check CI/build/test health and establish a clean baseline.
5. Compare code and configured staging/production services, **only where access is authorized**.
6. Produce a gap list prioritized by user harm, MVP value, blast radius, and estimated repair cost.

AI can do source analysis, inventory, test generation, and drafting automatically. Runtime claims require actual execution and evidence.

### Phase B — Automated verification

Run the existing package-manager and repository-specific scripts rather than guessing commands. In isolated, disposable environments, perform:
- Type checks, lint, formatting, dependency and secret scanning.
- Build/test across apps and packages; unit and integration tests.
- API contract tests, database migration dry runs, permission tests, cross-tenant access tests.
- Browser E2E for onboarding, messaging, discovery, posting, communities, Coliseum, creator, Coalition.
- Responsive/mobile checks, accessibility scans, broken-link and navigation sweeps.
- Encryption and decryption failure-path tests, notifications, upload/playback and background jobs.
- Fault injection where safe: service outage, revoked permission, expired token, reconnect, rate limits.

**No automated testing against real user accounts, production private messages, payment flows, or live third-party services without explicit authorization and safe test fixtures.** Do not expose secrets in logs or AI prompts.

### Phase C — Decide per feature

1. **Verified:** All relevant acceptance tests pass in the intended environment; release gate permits visibility.
2. **Repairable:** AI can implement a bounded fix and add regression tests; iterate until passing.
3. **Blocked:** External credentials, deployment, incompatible protocol, unresolved dependency, or human judgment required; hide and document.
4. **Deferred:** Not essential for the current release or too costly/risky to complete now; preserve code and specs behind an off flag.
5. **Unsafe:** Credible security/privacy harm or misleading safety claim; disable exposure immediately and escalate for human review.

Avoid deleting unfinished features merely to simplify the UI. Remove a feature only through an explicit separate deprecation decision.

### Phase D — AI repair loop

For each repairable feature:
1. Reproduce failure and write a failing regression test.
2. Locate root cause and affected callers/dependencies.
3. Propose smallest safe patch; implement on a dedicated branch.
4. Run focused tests, then broader impacted suites.
5. Check privacy, authorization, migrations, backward compatibility, and client parity.
6. Open a PR with before/after evidence, risk assessment, rollback plan, and exact test commands.
7. Auto-merge **only if explicitly authorized**, repository branch protections permit it, and the change is within a predefined low-risk category.

AI may iterate on test failures and generate patches, but must not silently bypass checks, loosen security, fabricate fixtures as production proof, or turn off tests to get a green build.

### Phase E — Feature-gating and UI cleanup

Centralize feature visibility decisions in a typed, auditable feature registry with defaults per environment and client. For unverified capabilities:
- Default to **off** in public release builds.
- Remove entry points from navigation, search, deep links, onboarding prompts, notifications, and promotional copy.
- Deny or guard backend operations as needed; hiding a button **is not access control**.
- Preserve source, tests, migrations, design notes, and a reopening checklist.
- Allow internal/tester visibility only behind explicit permissions and environment gates.
- Clearly label intentionally limited beta features; never show fake live states or inert CTAs.
- Provide safe handling for old links, previously created data, and feature rollback.

Build a feature-flag coverage test that fails if a hidden feature remains reachable through an unauthorized route or API.

### Phase F — Integrated MVP verification

Validate the [Whole-Product MVP](BLACKOUT_WHOLE_PRODUCT_MVP.md) as a cohesive journey: signup → join Den/Canopy → message/call → discover post → publish/react/share → creator profile → Coliseum debate → event/task → report/moderation → return visit.

Record results on supported web/mobile/desktop surfaces. A feature that passes in isolation but breaks the complete journey is not verified.

### Phase G — Pilot and progressive release

1. Internal sandbox → small authorized testers → opt-in beta → broader rollout.
2. Capture crashes, task success, delivery/decryption errors, moderation incidents, and user-reported value with privacy-preserving telemetry.
3. Stop or roll back on critical security, data loss, unauthorized access, or repeated silent failures.
4. Re-run smoke tests after each release and on infrastructure changes.
5. Keep a deferred-feature queue with prerequisites, cost, risk, and next review date.

## Human intervention policy

**AI should complete as much as feasible before asking a human.** Escalate only when required:
- Secrets, OAuth consent, third-party accounts, app-store enrollment, payment provider setup.
- Production access, sensitive data, infrastructure spending, irreversible migration, or public deployment.
- Security and privacy sign-off for high-impact features, cryptography, identity, location, financial flows.
- Legal/compliance decisions, moderation policy, abuse-handling governance, accessibility acceptance.
- Real-world device testing, user research, and final launch approval.

Bundle questions into concise decision packets with evidence, options, recommended action, and what work AI already completed. Do not repeatedly ask for choices AI can resolve from existing architecture or tests.

## Proposed execution waves

| Wave | Areas | Exit criteria |
| --- | --- | --- |
| 0. Baseline | All modules, flags, builds, CI, deployment | Complete inventory, known failures, prioritized queue |
| 1. Trust foundation | Auth, E2EE, roles, privacy, data controls, moderation | Critical security and reliability blockers closed or safely disabled |
| 2. Everyday loop | Home, Dens, Canopies, discovery, messaging, notifications | New user can join, interact, and return |
| 3. Sharing | Posts, video, reactions, feeds, search | Creator-to-reader end-to-end flow passes |
| 4. Expression | Coliseum, governance, events/tasks | Safe debate and organizer flows pass |
| 5. Creator economics | Creator Hub, streams, clips, FBM, tips/subscriptions | Only verified commerce and streaming flows exposed |
| 6. Specialized | Coalition maps/ops, advanced OPSEC, bridges, plugins, native/offline | Each gated by its own privacy/reliability criteria |
| 7. Release | Integrated E2E, pilot, monitoring, rollback | Whole-product MVP release checklist signed off |

Waves can overlap when dependencies allow; risk and user value determine ordering.

## Suggested AI task packet

For each feature, create a task with: target behavior; repository paths; failing test/reproduction; dependency list; threat model; success criteria; allowed tools and environments; change budget; rollback; evidence required; human approval triggers. Prefer small PRs with one observable outcome. Track attempted fixes and stop repeating unsuccessful patches.

## Reporting cadence and artifacts

- `docs/audits/feature-inventory.json`: machine-readable inventory.
- `docs/audits/FEATURE_AUDIT_REPORT.md`: evidence-based pass/fail/blocked report.
- `docs/audits/RELEASE_VISIBILITY_MATRIX.md`: flags, entry points, API gates, environment defaults.
- `docs/audits/DEFERRED_FEATURES.md`: preserved work, blockers, reopening conditions.
- `docs/audits/HUMAN_DECISIONS.md`: only decisions that cannot be automated.
- PRs with linked issues, regression tests, and reproducible CI evidence.

These are **planned outputs**, not files that already exist.

## Success criteria

- 100% of discoverable user-facing features inventoried and classified (with evidence).
- 100% of public navigation and deep links lead to verified working flows or clear safe fallbacks.
- Zero known critical authorization/privacy vulnerabilities in release scope.
- Every MVP golden path passes integrated tests in its supported environment.
- Unready features are safely gated rather than exposed as broken UI.
- AI produces tested repair PRs for fixable gaps; humans review only the decisions and risks requiring human authority.
- Release claims clearly distinguish code present, tested staging, and deployed production.

**Operating principle:** Audit everything. Finish what can be finished. Hide what cannot. Preserve future work. Never sacrifice trust or reliability to inflate a feature count.
