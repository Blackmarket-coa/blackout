# Second-Region DR Footprint Validation — 2026-02-20

## Scope

- Control plane: ArgoCD ApplicationSet
- Regions: `primary-eu`, `secondary-us`
- Service: `element-web`

## Procedure

1. Synced `deploy/kubernetes/phase6/second-region-dr-footprint.yaml` to both clusters.
2. Simulated primary region unavailability by pausing ingress in `primary-eu`.
3. Confirmed `secondary-us` served traffic using DR routing policy.
4. Restored primary region and validated dual-region steady state.

## Result

- Second-region DR footprint is active and validated for failover continuity.

## Artifact references

- `deploy/kubernetes/phase6/second-region-dr-footprint.yaml`
- `docs/runbooks/distributed_self_healing_operations.md`
