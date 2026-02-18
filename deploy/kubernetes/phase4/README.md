# Phase 4 Resilience and High Availability manifests

This directory provides production-ready baseline manifests for the Phase 4 deliverables in `docs/security-resilience-build-plan.md`:

- Stateless horizontal scaling (`Deployment` + `HorizontalPodAutoscaler`)
- Graceful termination and probe health checks (`/health/live`, `/health/ready`)
- Multi-zone scheduling and disruption resistance (`topologySpreadConstraints`, `PodDisruptionBudget`)
- SLO-oriented alerting baselines (`ServiceMonitor`, `PrometheusRule`)

## Files

- `element-ha.yaml`: HA deployment primitives.
- `observability.yaml`: metrics scrape and availability alert examples.
- `opentelemetry.yaml`: optional OpenTelemetry Collector trace export bootstrap.
- `upstream-circuit-breaker.yaml`: optional Istio retries/circuit-breaker policy for upstream services.

## Usage

Apply as an overlay after your core namespace/service/config manifests:

```bash
kubectl apply -f deploy/kubernetes/phase4/element-ha.yaml
kubectl apply -f deploy/kubernetes/phase4/observability.yaml
kubectl apply -f deploy/kubernetes/phase4/opentelemetry.yaml
# Optional if using Istio
kubectl apply -f deploy/kubernetes/phase4/upstream-circuit-breaker.yaml
```

Tune `minReplicas/maxReplicas`, CPU targets, and alert thresholds for your SLO budget.


> Note: `opentelemetry.yaml` requires OpenTelemetry Operator CRDs.
