# Phase 4 Resilience and High Availability manifests

This directory provides production-ready baseline manifests for the Phase 4 deliverables in `docs/security-resilience-build-plan.md`:

- Stateless horizontal scaling (`Deployment` + `HorizontalPodAutoscaler`)
- Graceful termination and probe health checks (`/health/live`, `/health/ready`)
- Multi-zone scheduling and disruption resistance (`topologySpreadConstraints`, `PodDisruptionBudget`)
- SLO-oriented alerting baselines (`ServiceMonitor`, `PrometheusRule`)

## Files

- `element-ha.yaml`: HA deployment primitives.
- `observability.yaml`: metrics scrape and availability alert examples.

## Usage

Apply as an overlay after your core namespace/service/config manifests:

```bash
kubectl apply -f deploy/kubernetes/phase4/element-ha.yaml
kubectl apply -f deploy/kubernetes/phase4/observability.yaml
```

Tune `minReplicas/maxReplicas`, CPU targets, and alert thresholds for your SLO budget.
