# Phase 5 Cluster and Platform Security manifests

This directory provides baseline in-repo artifacts for Phase 5 deliverables from `docs/security-resilience-build-plan.md`:

- Namespace segmentation and default-deny network policies
- Container policy enforcement templates (Kyverno)
- Secrets encryption/workload identity integration templates (Vault + External Secrets)

## Files

- `network-security.yaml`: namespace security labels and default-deny/allowlist NetworkPolicies.
- `pod-security-policy.yaml`: Kyverno `ClusterPolicy` templates for non-root, dropped capabilities, and read-only root filesystem.
- `secrets-workload-identity.yaml`: `ServiceAccount` workload identity and External Secrets + Vault integration template.

## Usage

```bash
kubectl apply -f deploy/kubernetes/phase5/network-security.yaml
kubectl apply -f deploy/kubernetes/phase5/pod-security-policy.yaml
kubectl apply -f deploy/kubernetes/phase5/secrets-workload-identity.yaml
```

Adjust namespace labels, ingress namespace names, Vault endpoints/roles, and workload identity annotations to your platform.
