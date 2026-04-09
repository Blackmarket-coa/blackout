# Enterprise Admin Suite Architecture

Status: Proposed  
Last updated: 2026-04-09

## 1) Scope

This document defines an enterprise admin suite with:
- **SSO** via **SAML 2.0** and **OIDC**
- **Compliance export pipeline**
- **Retention policy engine**
- Cross-cutting controls for tenant isolation, audit logs, and admin permissions

---

## 2) Architecture overview

```text
Enterprise Admin Console
        |
        v
Admin API Gateway + AuthN/AuthZ
        |
+-----------------------------------------------------+
| Admin Core Services                                  |
| - Identity Federation Service (SAML/OIDC)            |
| - Admin RBAC/ABAC Service                            |
| - Tenant Policy Service (retention/legal hold)       |
| - Compliance Export Orchestrator                     |
| - Audit Log Service                                  |
| - Key Management Integration                         |
+-----------------------------------------------------+
        |
        v
+-----------------------------------------------------+
| Data Plane                                            |
| - Tenant-scoped operational stores                    |
| - Immutable audit/event store                         |
| - Export object storage (encrypted, time-bounded)     |
+-----------------------------------------------------+
```

Principles:
- Default-deny administrative access.
- Tenant isolation as a hard boundary.
- Immutable, tamper-evident audit evidence for regulated actions.
- Policy-driven automation with explicit human approval checkpoints.

---

## 3) SSO architecture (SAML/OIDC)

## 3.1 Federation modes

- **SAML 2.0** SP-initiated and IdP-initiated flows.
- **OIDC** authorization code flow with PKCE for admin portal clients.
- Optional JIT provisioning and SCIM-driven user/group sync.

## 3.2 Tenant SSO configuration model

Per-tenant config:
- Federation type (`saml`, `oidc`, or dual-stack migration).
- IdP metadata (entity ID/issuer, endpoints, certs/JWKS).
- Attribute mapping rules (email, name, groups, department).
- Enforcement flags (MFA required, domain allowlist, session TTL).

## 3.3 Authentication/authorization flow

1. Admin initiates login.
2. Tenant discovery resolves correct IdP config.
3. Assertion/token validated (signature, audience, nonce, time window).
4. Identity mapped to internal principal and tenant context.
5. RBAC/ABAC policy check determines console/API capabilities.

## 3.4 Security controls

- Signed assertions/tokens only; reject weak algs.
- Key rotation handling with overlapping trust windows.
- Replay detection via nonce cache.
- Strict clock-skew bounds and anomaly detection for auth events.

---

## 4) Admin permission model

## 4.1 Role model (baseline)

- **Tenant Owner**: full tenant administrative authority.
- **Security Admin**: identity, SSO, risk, and audit controls.
- **Compliance Admin**: exports, legal hold, retention governance.
- **Support Admin**: limited troubleshooting with sensitive-data restrictions.
- **Read-only Auditor**: evidence access without mutation rights.

## 4.2 Permission primitives

- Resource scope: tenant, workspace, dataset, export job.
- Action scope: `read`, `write`, `approve`, `execute`, `break-glass`.
- Policy conditions: IP range, MFA state, ticket/reference requirement, time window.

## 4.3 Delegation and approval

- Two-person approval for high-impact actions (bulk export, retention override).
- Time-bound delegated roles with automatic expiry.
- Break-glass elevation requires explicit reason and post-action review.

## 4.4 Service/API authorization

- JWT-bound admin sessions with tenant and role claims.
- Fine-grained checks at API and data access layers.
- Separate machine identity roles for background jobs.

---

## 5) Tenant isolation model

## 5.1 Isolation boundaries

- Logical tenant boundary in API, service, and datastore layers.
- Strong row/object-level scoping with tenant IDs.
- Per-tenant encryption context where platform supports envelope keys.

## 5.2 Data access controls

- Every request requires explicit tenant context.
- Cross-tenant queries blocked by policy engine and query guards.
- Export jobs can read only tenant-authorized datasets.

## 5.3 Operational isolation

- Per-tenant rate limits and quotas for admin APIs and exports.
- No shared mutable cache keys across tenants.
- Tenant-specific secrets and configuration namespaces.

---

## 6) Compliance export pipeline

## 6.1 Use cases

- Regulatory export (audit/legal requests).
- Internal compliance review and archival.
- Incident response evidence collection.

## 6.2 Pipeline stages

1. Request creation with purpose + scope + legal basis.
2. Permission and approval checks.
3. Snapshot planning (datasets/time range/filters).
4. Extraction from tenant-scoped stores.
5. Transformation + normalization into export schema.
6. Packaging/signing/checksum generation.
7. Secure delivery to approved destination.
8. Post-delivery audit and expiry/cleanup.

## 6.3 Export controls

- Data minimization by default (include only requested fields).
- Redaction templates by jurisdiction/regulatory profile.
- Tamper-evident manifest with hash tree or signed index.
- Time-limited download URLs and one-time retrieval options.

## 6.4 Reliability

- Orchestrated job queue with checkpoint/retry.
- Idempotent export job IDs.
- Partial-failure resume support.
- Dead-letter workflow for manual intervention.

---

## 7) Retention policy engine

## 7.1 Policy model

Policy dimensions:
- Data class (messages, files, logs, audit events, exports).
- Scope (tenant/workspace/channel/object tags).
- Retention duration (e.g., 30d, 1y, 7y, indefinite/legal hold).
- Deletion mode (hard-delete, soft-delete, tombstone + cryptographic erasure).

## 7.2 Evaluation flow

- Policy compiler validates and materializes effective rules.
- Resolver computes precedence (legal hold > regulatory > tenant default).
- Execution workers apply lifecycle transitions and produce evidence events.

## 7.3 Legal hold handling

- Hold can be applied at tenant/workspace/entity level.
- Hold supersedes deletion schedules until released.
- Every hold add/remove operation requires justification and audit entry.

## 7.4 Safety controls

- Dry-run preview before activating policy changes.
- Blast-radius analysis and warning thresholds.
- Delayed activation window for destructive policy updates.

---

## 8) Audit log architecture

## 8.1 Events to capture

- Authentication events (SSO success/failure, MFA state changes).
- Admin mutations (policy changes, role grants, export requests).
- Sensitive data access (view/download/export).
- Break-glass actions and approvals.

## 8.2 Audit log requirements

- Append-only immutable storage.
- Cryptographic integrity (hash chaining/signatures).
- Tenant-scoped query APIs with least-privilege access.
- Retention aligned to compliance policy with legal hold support.

## 8.3 Search and evidence

- Indexed by actor, time, action, resource, outcome.
- Correlation IDs to tie UI/API/job events end-to-end.
- Exportable evidence bundles for auditors and regulators.

---

## 9) Security and fraud/misuse controls

- Admin session risk scoring (impossible travel, device anomalies).
- Step-up authentication for sensitive operations.
- Just-in-time secrets access for export workers.
- Anti-exfiltration limits (volume/rate alerts, unusual export patterns).
- Mandatory ticket/reference for high-risk admin actions.

---

## 10) Operational boundaries

Designed for:
- Centralized enterprise tenant administration.
- Regulated export/retention workflows with auditable outcomes.
- Federated identity integration with modern IdPs.

Not designed for:
- Consumer self-serve identity federation complexity at large scale without admin ops.
- Unbounded cross-tenant analytics joins.
- Arbitrary root-level access bypassing policy engine.

---

## 11) MVP vs future scope

## 11.1 MVP

- OIDC + SAML login for admins.
- Baseline RBAC roles and tenant-scoped permissions.
- Export pipeline with approval and encrypted artifact delivery.
- Retention policies with legal hold precedence.
- Immutable audit log capture + basic search.

## 11.2 Next

- ABAC conditions and policy simulation tooling.
- SCIM lifecycle automation and advanced group mappings.
- Region-aware redaction packs for export templates.
- Advanced anomaly detection for admin misuse.

## 11.3 Future

- Cross-tenant delegated governance for MSP models.
- Formal policy verification and continuous compliance scoring.
- Privacy-preserving compliance analytics.

---

## 12) Implementation phases

1. **Phase 1**: Tenant model hardening + RBAC + audit event baseline.
2. **Phase 2**: OIDC/SAML federation + attribute/group mapping.
3. **Phase 3**: Compliance export orchestrator + signed artifacts.
4. **Phase 4**: Retention policy engine + legal hold workflows.
5. **Phase 5**: Advanced detection, approval automation, and governance tooling.
