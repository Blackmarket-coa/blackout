# Dependency Risk Acceptance Record (2026-03-06)

## Decision summary

Security and Platform jointly accept two moderate transitive dependency advisories that remain in the current lockfile after baseline rollout checks.
No direct runtime exploit path is currently known in this repo's deployed feature set, and compensating controls are in place while upstream remediation is tracked.

- Decision: **Accepted with compensating controls**
- Approval date: **2026-03-06**
- Review cadence: **Re-evaluate on every dependency refresh and before each production rollout**

## Advisory inventory

### 1) `dompurify` via `posthog-js`

- Audit finding: `DOMPurify contains a Cross-site Scripting vulnerability`.
- Severity: Moderate.
- Dependency path: `posthog-js > dompurify`.
- Patched version: `>=3.3.2`.
- Current disposition: **Risk accepted temporarily** until `posthog-js` path is upgraded or replaced.

Compensating controls:

1. Keep CSP and trusted-types-aligned frontend hardening enabled in production configuration.
2. Continue static analysis and unit-test coverage on login/timeline/media/steganography UI flows before release.
3. Re-run `yarn audit --groups dependencies --level moderate` during release candidate validation.

### 2) `counterpart` via `@element-hq/web-shared-components`

- Audit finding: `counterpart vulnerable to prototype pollution`.
- Severity: Moderate.
- Dependency path: `@element-hq/web-shared-components > counterpart`.
- Patched version: none available upstream.
- Current disposition: **Risk accepted temporarily** pending upstream fix or dependency replacement.

Compensating controls:

1. Restrict input deserialization surface to typed module boundaries already enforced in the app.
2. Maintain release-gate lint/type/test baseline to detect unsafe callsite drift.
3. Track upstream package health and cutover plan in the next dependency maintenance cycle.

## Evidence

- Command evidence: `yarn audit --groups dependencies --level moderate` (2 moderate findings).
- Linked rollout tracker: `docs/rollout-readiness-status.md`.
