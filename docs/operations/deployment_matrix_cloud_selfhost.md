# Deployment Matrix: Self-Host vs Managed Cloud

## Audience profiles

- **Ideological co-ops / movement networks:** prioritize sovereignty, censorship resistance, local control.
- **Pragmatic teams / enterprise buyers:** prioritize speed, operational simplicity, compliance reporting.

## Packaging matrix

| Dimension | Self-host coalition (movement-grade) | Managed cloud (enterprise-credible) |
| --- | --- | --- |
| Hosting model | Org-owned homeservers, federation-first | Vendor-operated control plane + customer-isolated tenant |
| Data ownership | Organization retains direct custody | Customer retains contractual ownership; platform operates processors |
| Key custody | Customer-controlled signing/encryption keys (BYOK/HSM optional) | BYOK/KMS integration with managed rotation support |
| Governance audit visibility | Full raw audit trail + local retention policies | Role-scoped audit exports + compliance reporting packs |
| Federation posture | Default-open to approved coalition peers | Policy-driven federation allowlists |
| SLA model | Community SLO + volunteer/on-call rotation | Commercial SLA with support tiers |
| Rollback model | Operator-run preset rollback + runbook execution | Managed rollback with change-approval controls |
| Best fit | High-sovereignty alliances and mutual-aid networks | Fast-moving organizations with procurement/security controls |

## Control-boundary clarifications

### Data ownership
- Message and governance records belong to the tenant/co-op community.
- Platform access is operationally scoped and auditable.

### Key custody
- Signing and encryption keys must be attributable to tenant-owned principals.
- Emergency break-glass actions require dual-control and are audit logged.

### Audit visibility
- Governance decisions, attestations, and broadcast outcomes produce exportable audit artifacts.
- Coalition-level federation incidents include cross-domain event correlation IDs.
