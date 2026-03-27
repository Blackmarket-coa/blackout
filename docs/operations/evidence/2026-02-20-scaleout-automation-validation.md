# Scale-Out Automation Validation — 2026-02-20

## Scope

- Autoscaler: KEDA `ScaledObject`
- Trigger: Prometheus ingress RPS metric
- Target deployment: `element`

## Procedure

1. Applied `deploy/kubernetes/phase6/scaleout-automation.yaml`.
2. Generated synthetic request load above configured threshold.
3. Observed replica increase from 3 to 9.
4. Stopped load and confirmed scale-down to baseline.

## Result

- Scale-out automation responded correctly to load and recovered to baseline.

## Artifact references

- `deploy/kubernetes/phase6/scaleout-automation.yaml`
- `deploy/kubernetes/phase4/element-ha.yaml`
