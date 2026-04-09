# Epic SDET Test Strategy Blueprint

> Use this blueprint when an epic is still in draft (e.g., `Epic context: <paste epic spec>`). Replace placeholders with epic-specific details once the spec is available.

## 1) Strategy Overview

- **Epic name:** `<EPIC_NAME>`
- **Primary objective:** `<ONE_SENTENCE_OBJECTIVE>`
- **In scope:** `<FEATURES / FLOWS>`
- **Out of scope:** `<DEFERRED / NON-GOALS>`
- **Quality gates:**
  - Zero Sev-1/Sev-2 defects open at release candidate cut.
  - Critical user journeys pass in CI and pre-prod.
  - Synthetic checks stable for 7 consecutive days pre-GA.

## 2) Test Pyramid by Layer

### Unit Tests (fast, deterministic)

**Goal:** Validate business logic, validation, state reducers, permission rules, and error mapping close to code.

**Focus areas**
- Domain rules and state transitions.
- Input validation (happy, boundary, malformed).
- Retry/backoff and timeout logic.
- Serialization/deserialization and schema mapping.

**Exit criteria**
- New/changed core modules have unit tests for happy + key negative paths.
- Mutation-sensitive logic (billing, auth, moderation, encryption controls) has branch coverage for critical conditions.

### Integration Tests (service + dependency boundaries)

**Goal:** Validate contracts across modules/services and data consistency with real adapters or high-fidelity test doubles.

**Focus areas**
- API contracts and backward compatibility.
- DB writes/reads, idempotency, ordering, and duplicate handling.
- Third-party provider behavior under degraded responses.
- Feature flag permutations that alter behavior.

**Exit criteria**
- Contract tests pass for all touched endpoints/events.
- No schema drift between producer/consumer.
- Rollback compatibility validated for N-1 release.

### E2E Tests (user outcomes)

**Goal:** Validate top business-critical workflows from user perspective in production-like environment.

**Focus areas**
- Golden path user journey(s).
- Cross-platform/browser parity.
- Auth/session lifecycle and permission boundary checks.
- Error recovery + user-visible resiliency behavior.

**Exit criteria**
- P0 paths green in CI nightly and on release branch.
- Flake rate below agreed threshold (e.g., <2%).
- No unresolved accessibility blocker on critical flows.

## 3) Critical Test Cases (P0 / P1)

Use this table as a minimum baseline; tailor IDs to your test management system.

| Priority | Area | Scenario | Expected Result | Layer |
|---|---|---|---|---|
| P0 | Auth | Valid sign-in with required MFA | User lands on authorized home, session token issued, audit event recorded | E2E + Integration |
| P0 | Auth | Invalid credential + lockout threshold | Proper error message, lockout policy applied, alert metric emitted | Unit + Integration |
| P0 | Data Integrity | Create/update/delete core entity | Data persisted consistently, read models synchronized, no orphan references | Integration |
| P0 | Permissions | Restricted user attempts privileged action | Action denied, no side effects, security event logged | Unit + E2E |
| P0 | Reliability | Dependency timeout during critical transaction | User sees graceful fallback/retry state, transaction remains consistent | Integration + E2E |
| P1 | UX/Recovery | User refreshes/reopens mid-flow | Flow resumes safely or restarts predictably with clear UX guidance | E2E |
| P1 | Feature Flags | Flag off/on migration path | Behavior toggles correctly; no stale cache leaks between states | Integration |
| P1 | Notifications | Event-triggered notification dedupe | Single notification delivered per event key; retries do not duplicate | Unit + Integration |
| P1 | Observability | Error path emits telemetry | Structured logs, traces, and metrics contain correlation IDs | Integration |

## 4) Synthetic Monitoring Checks (Post-deploy + Continuous)

Build synthetic monitors around externally visible outcomes, not internal implementation.

### Availability and latency
- **Health endpoint check** every 1 minute from 3+ regions.
- **Critical API transaction probe** every 5 minutes with P95 SLO threshold.
- **UI smoke journey** every 10–15 minutes (login → key action → confirm outcome).

### Functional correctness probes
- Canary account executes read-only critical journey.
- Write-path probe in isolated synthetic tenant/project (with automatic cleanup).
- Feature-flag state probe (baseline + experimental treatment).

### Security and trust signals
- Certificate expiration monitor.
- Auth/token issuance failure-rate alert.
- Unexpected permission escalation probe (known-denied action remains denied).

### Suggested alert thresholds
- P0 journey success < 99% for 15 minutes => page on-call.
- P95 latency > SLO by 20% for 3 consecutive windows => investigate.
- Error-rate spike > 2x baseline for 10 minutes => triage incident.

## 5) Regression Suite Additions

Add stable, high-signal tests to prevent recurrence of likely failures:

1. **Bug-backfill tests:** one permanent regression test per Sev-1/Sev-2 defect fixed in this epic.
2. **Contract lock tests:** snapshots/schemas for all changed external interfaces.
3. **State migration tests:** forward and rollback migration checks with representative production-like data.
4. **Concurrency race tests:** duplicate requests, out-of-order events, retry storms.
5. **Cross-version compatibility tests:** current release interacting with N-1/N+1 neighbors.
6. **Accessibility regressions:** keyboard-only, focus order, and accessible-name assertions on changed screens.
7. **Performance guardrails:** baseline-vs-change comparison for top 3 expensive transactions.

## 6) Execution Plan and Ownership

- **Test design owner (SDET):** `<NAME>`
- **Automation implementation owner:** `<NAME/TEAM>`
- **Feature team approver:** `<NAME>`
- **Release sign-off approver:** `<NAME>`

### Timeline template
- Sprint N (design): finalize risk matrix + test case review.
- Sprint N+1 (automation): implement unit/integration/e2e + synthetic probes.
- Sprint N+2 (hardening): run regression expansion + flake burn-down.
- Release week: execute go/no-go checklist and evidence pack.

## 7) Risks, Assumptions, Dependencies

- **Assumptions:** test environment parity with production for auth, flags, and observability.
- **Dependencies:** stable test data factory, seeded accounts/tenants, secrets in CI, provider sandboxes.
- **Risks:** flakiness from async systems, non-deterministic third-party responses, missing telemetry dimensions.
- **Mitigations:** deterministic fixtures, retry budget policies, test isolation, and observability contract checks.

## 8) Go/No-Go Checklist

- [ ] All P0 test cases automated or executed manually with evidence.
- [ ] No open Sev-1/Sev-2 defects in epic scope.
- [ ] Synthetic monitors enabled and alert routes validated.
- [ ] Regression additions merged and green in default branch CI.
- [ ] Rollback rehearsed and documented.
- [ ] Release notes include known limitations and support playbook updates.

---

## How to adapt this quickly once epic spec is provided

1. Replace placeholders in sections 1 and 6.
2. Map each epic acceptance criterion to at least one P0/P1 test case.
3. Convert top 3 business risks into synthetic monitors.
4. Convert every critical bug found during development into a permanent regression test.
