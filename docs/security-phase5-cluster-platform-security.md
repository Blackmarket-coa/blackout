# Security Phase 5 Cluster and Platform Security (Implementation Artifacts)

This document maps **Phase 5 (Weeks 9–10)** from `docs/security-resilience-build-plan.md` to concrete in-repo deployment artifacts.

## 1) Namespace segmentation + default deny network policies

Implemented via `deploy/kubernetes/phase5/network-security.yaml`:

- namespace hardening labels for restricted Pod Security standards,
- default deny ingress + egress policy,
- explicit egress allowlist for DNS,
- explicit ingress allowlist from ingress controller namespace.

## 2) Policy enforcement for container security

Implemented via `deploy/kubernetes/phase5/pod-security-policy.yaml`:

- Kyverno policy requiring `runAsNonRoot: true`,
- capabilities drop policy requiring `ALL`,
- read-only root filesystem policy requirement.

## 3) Secrets encryption and workload identity

Implemented via `deploy/kubernetes/phase5/secrets-workload-identity.yaml`:

- workload-identity enabled `ServiceAccount` template,
- External Secrets Operator `SecretStore` against Vault,
- `ExternalSecret` mapping runtime secret material into cluster secret objects.

## Operator adoption notes

These manifests are templates and require environment-specific values before production use:

- identity annotations and IAM wiring,
- Vault endpoint/path/role values,
- namespace names and ingress controller namespace labels.
