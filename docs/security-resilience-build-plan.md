# Security, Resilience, and Non-Technical UX Build Plan

This plan translates the strategy into an implementation roadmap for this repository, with open-source-first options and copy/paste starter code.

> Phase 1 completion details are tracked in `docs/security-phase1-foundation.md`.
> Phase 2 completion details are tracked in `docs/security-phase2-app-hardening.md`.
> Phase 3 completion details are tracked in `docs/security-phase3-auth-modernization.md`.
> Phase 4 completion details are tracked in `docs/security-phase4-resilience-ha.md`.
> Phase 5 implementation artifacts are tracked in `docs/security-phase5-cluster-platform-security.md`.
> Phase 6 remains open in this plan and is not yet marked complete.

## 0) Goals, constraints, and success metrics

### Primary goals

- Improve security posture with defense-in-depth.
- Raise availability and recovery capability ("hard to take down").
- Reduce user friction for non-technical users.

### Success metrics (track monthly)

- **Security:** critical/high vuln count, secret leaks, mean time to patch.
- **Resilience:** uptime %, error budget burn rate, RTO/RPO.
- **UX:** onboarding completion %, login failure %, support tickets per 1k users.

---

## 1) Implementation phases (12-week baseline)

## Phase 1 (Weeks 1-2): Foundation and guardrails ✅ Complete

### Deliverables

1. Security baseline in CI (SAST, dependency audit, secret scanning).
2. Branch protection and CODEOWNERS for required review.
3. Centralized config and secrets workflow.

### Open source tool choices

- **Semgrep** (SAST)
- **Gitleaks** (secret scanning)
- **npm audit / osv-scanner** (dependency CVEs)
- **Trivy** (container + IaC scanning)

### CI example (`.github/workflows/security.yml`)

```yaml
name: Security checks

on:
    pull_request:
    push:
        branches: [main]

jobs:
    scans:
        runs-on: ubuntu-latest
        permissions:
            contents: read
            security-events: write
        steps:
            - uses: actions/checkout@v4

            - name: Setup Node
              uses: actions/setup-node@v4
              with:
                  node-version: "20"

            - run: npm ci
            - run: npm audit --audit-level=high

            - name: Semgrep
              uses: returntocorp/semgrep-action@v1
              with:
                  config: >-
                      p/security-audit
                      p/secrets

            - name: Gitleaks
              uses: gitleaks/gitleaks-action@v2

            - name: Trivy FS scan
              uses: aquasecurity/trivy-action@0.24.0
              with:
                  scan-type: fs
                  scan-ref: .
                  severity: CRITICAL,HIGH
                  ignore-unfixed: true
```

### Acceptance criteria

- Pull requests fail when high-severity issues are introduced.
- Secret scanning runs on every PR and push.

---

## Phase 2 (Weeks 3-4): App-layer hardening ✅ Complete

### Deliverables

1. Secure HTTP defaults (headers, CORS, rate limiting).
2. Input validation standard for all new endpoints.
3. Consistent authz checks (least privilege).

### Open source packages

- **helmet**
- **cors**
- **express-rate-limit**
- **zod** (or `joi`) for schema validation

### Example middleware (`src/security/http.ts`)

```ts
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import type { Express } from "express";

export function applyHttpSecurity(app: Express): void {
    app.use(
        helmet({
            contentSecurityPolicy: {
                useDefaults: true,
                directives: {
                    "frame-ancestors": ["'none'"],
                },
            },
            referrerPolicy: { policy: "no-referrer" },
        }),
    );

    app.use(
        cors({
            origin: [/^https:\/\/.*\.example\.org$/],
            methods: ["GET", "POST", "PUT", "DELETE"],
            credentials: true,
        }),
    );

    app.use(
        rateLimit({
            windowMs: 60_000,
            max: 120,
            standardHeaders: true,
            legacyHeaders: false,
        }),
    );
}
```

### Example request validation

```ts
import { z } from "zod";

export const CreateProfileSchema = z.object({
    displayName: z.string().min(1).max(64),
    bio: z.string().max(280).optional(),
});
```

### Acceptance criteria

- New endpoints require schema validation.
- Security headers verified via integration tests.

---

## Phase 3 (Weeks 5-6): Authentication modernization (non-technical UX first) ✅ Complete

### Deliverables

1. OAuth/OIDC login (Google, Apple, generic OIDC).
2. Optional passkey support (WebAuthn) for passwordless login.
3. Step-up MFA for admin/security-sensitive actions.

### Open source options

- **Auth.js / NextAuth.js** (if Next.js)
- **oidc-client-ts** (SPA OIDC)
- **Keycloak** (self-hosted identity provider)

### Example (OIDC client skeleton)

```ts
import { UserManager } from "oidc-client-ts";

export const oidc = new UserManager({
    authority: process.env.OIDC_AUTHORITY!,
    client_id: process.env.OIDC_CLIENT_ID!,
    redirect_uri: `${window.location.origin}/auth/callback`,
    response_type: "code",
    scope: "openid profile email",
});
```

### Acceptance criteria

- > =80% of users can authenticate without manually setting a password.
- Admin paths enforce MFA/step-up auth.

---

## Phase 4 (Weeks 7-8): Resilience and high availability ✅ Complete

### Deliverables

1. Stateless app deployment with horizontal scaling.
2. Health probes, graceful shutdown, and retry/circuit-breaker wrappers.
3. Multi-AZ deployment and managed database replication.

### Open source options

- **Kubernetes** + **NGINX Ingress**
- **Prometheus + Alertmanager + Grafana**
- **OpenTelemetry** instrumentation
- **opossum** (Node circuit breaker)

### Circuit breaker example

```ts
import CircuitBreaker from "opossum";

async function callUpstream(payload: unknown) {
    // ... remote API call
}

export const upstreamBreaker = new CircuitBreaker(callUpstream, {
    timeout: 2500,
    errorThresholdPercentage: 50,
    resetTimeout: 10_000,
});
```

### Kubernetes readiness/liveness snippet

```yaml
livenessProbe:
    httpGet:
        path: /health/live
        port: 8080
    initialDelaySeconds: 15
    periodSeconds: 10
readinessProbe:
    httpGet:
        path: /health/ready
        port: 8080
    initialDelaySeconds: 10
    periodSeconds: 5
```

### Acceptance criteria

- Single node/pod failure does not impact user-facing availability.
- Service-level objectives defined with alert thresholds.
- In-repo manifests include probe endpoints, HA scaling primitives, OpenTelemetry collector bootstrap, and optional upstream retry/circuit-breaker policy templates.

---

## Phase 5 (Weeks 9-10): Cluster and platform security ✅ Complete

### Deliverables

1. Namespace segmentation + default deny network policies.
2. Policy enforcement for container security.
3. Secrets encryption and workload identity.

### Open source options

- **Kyverno** or **OPA Gatekeeper**
- **cert-manager** for TLS automation
- **External Secrets Operator** + Vault

### Kyverno policy example (require non-root)

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
    name: require-non-root
spec:
    validationFailureAction: Enforce
    rules:
        - name: check-run-as-non-root
          match:
              any:
                  - resources:
                        kinds: ["Pod"]
          validate:
              message: "Containers must run as non-root"
              pattern:
                  spec:
                      securityContext:
                          runAsNonRoot: true
```

### Acceptance criteria

- New workloads are blocked unless policy-compliant.
- Cross-namespace traffic restricted by explicit policy.
- In-repo templates provide namespace segmentation, default-deny networking, Kyverno enforcement, and Vault-backed external secret wiring baselines.

---

## Phase 6 (Weeks 11-12): UX hardening and compliance controls 🚧 Planned / Not yet marked complete

### Deliverables

1. User-safe error messaging and issue reporting flow.
2. Guided onboarding and help surface.
3. Data retention and privacy workflows documented.

### Open source options

- **Intro.js / Shepherd.js** for guided tours
- **Sentry** (OSS/self-hosted option: GlitchTip)
- **PostHog** (self-hostable product analytics)

### Error UX standard

- Never show stack traces to end users.
- Show plain-language recovery actions.
- Include "Report issue" action with redacted telemetry context.

### Acceptance criteria

- Onboarding completion increases release-over-release.
- Support tickets tied to confusing errors drop measurably.

---

## 2) Cross-cutting architecture decisions

## Secrets and config

- Use environment-only secret injection.
- No secrets in repo, logs, or client bundles.
- Rotate keys every 90 days minimum.

## Observability

- Structured logs with request IDs.
- Metrics: auth failures, latency p95/p99, error rates.
- Tracing for all critical flows.

## Backup and disaster recovery

- Daily encrypted backups; verify restore monthly.
- Define and test disaster runbooks.
- Target starting point: **RTO <= 1 hour**, **RPO <= 15 minutes**.

---

## 3) Implementation backlog (epics and tickets)

1. **SEC-EPIC-1 CI security baseline**
    - Add `security.yml` workflow.
    - Enforce PR checks.
    - Add vulnerability triage runbook.
2. **SEC-EPIC-2 App hardening**
    - Add `helmet`/CORS/rate-limit middleware.
    - Add schema validation helper.
    - Add authz policy checks in service layer.
3. **ID-EPIC-1 Login modernization**
    - OIDC provider setup.
    - Social login integration.
    - Admin MFA + recovery policy.
4. **REL-EPIC-1 HA and failover**
    - Horizontal pod autoscaling.
    - Multi-zone deployment.
    - Circuit breaker wrappers for external dependencies.
5. **PLAT-EPIC-1 K8s security posture**
    - Kyverno/Gatekeeper policies.
    - NetworkPolicy defaults.
    - Secret store integration.
6. **UX-EPIC-1 Non-technical user experience**
    - Guided onboarding.
    - Friendly errors + one-click issue reporting.
    - In-app help center.

---

## 4) Recommended open-source stack (reference)

- **Identity:** Keycloak (+ social identity brokering)
- **Policy:** Kyverno
- **Secrets:** HashiCorp Vault + External Secrets Operator
- **Monitoring:** Prometheus + Grafana + Alertmanager
- **Logging:** Loki (or ELK)
- **Tracing:** OpenTelemetry + Jaeger
- **Security scans:** Semgrep + Gitleaks + Trivy
- **Feature flags/experimentation:** Unleash

---

## 5) Risk register (initial)

- **Risk:** Overly strict policies block deploys.  
  **Mitigation:** Start in `audit` mode for 2 sprints, then enforce.
- **Risk:** OAuth misconfiguration causes login loops.  
  **Mitigation:** Add staging callback tests and smoke checks.
- **Risk:** Alert fatigue.  
  **Mitigation:** SLO-based alerts, remove low-signal noise.
- **Risk:** "Impossible to take down" expectation mismatch.  
  **Mitigation:** Publish SLO/SLA and disaster recovery objectives.

---

## 6) First sprint plan (ready-to-run)

1. Add CI security workflow (Semgrep, Gitleaks, Trivy, npm audit).
2. Add HTTP security middleware and input schema validation utility.
3. Add `/health/live` and `/health/ready` endpoints.
4. Add OpenTelemetry SDK bootstrap + basic trace export.
5. Draft onboarding/error UX copy for top 5 user flows.

**Definition of done:**

- All new checks green in CI.
- No new critical/high vulnerabilities introduced.
- Auth and onboarding changes validated by at least 5 non-technical test users.
