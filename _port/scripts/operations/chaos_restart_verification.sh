#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${1:-element-web}"
SELECTOR="${2:-app=element}"

kubectl delete pod -n "$NAMESPACE" -l "$SELECTOR" --force --grace-period=0
kubectl wait --for=condition=ready pod -n "$NAMESPACE" -l "$SELECTOR" --timeout=180s
