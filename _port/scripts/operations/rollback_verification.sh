#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${1:-element-web}"
DEPLOYMENT="${2:-element}"

kubectl rollout undo "deployment/${DEPLOYMENT}" -n "$NAMESPACE"
kubectl rollout status "deployment/${DEPLOYMENT}" -n "$NAMESPACE" --timeout=180s
