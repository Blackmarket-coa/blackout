#!/usr/bin/env bash
set -euo pipefail

# Validates that required reliability/SLO evidence artifacts referenced by
# tracker/checklist docs are present and non-empty.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

required_files=(
  "docs/reliability_slo_instrumentation.md"
  "docs/reliability_slo_alerting_and_paging.md"
  "docs/reliability_reports/2026-02.md"
  "docs/reliability_reports/backup_verification_2026-Q2.md"
  "docs/drills/postgres_failover_report.md"
  "docs/drills/chaos_drill_report_wave1.md"
  "docs/drills/region_failover_gameday.md"
  "docs/drills/cross_operator_federation_drill.md"
  "docs/distributed_self_healing_blueprint.md"
  "docs/project_completion_tracker.md"
)

missing=0
for file in "${required_files[@]}"; do
  if [[ ! -s "${file}" ]]; then
    echo "missing-or-empty: ${file}"
    missing=1
  fi
done

if [[ "${missing}" -ne 0 ]]; then
  echo "tracker evidence validation failed"
  exit 1
fi

# Check that tracker docs still reference the upstream matrix and this validator.
# Use grep (not rg) so the gate doesn't depend on ripgrep being installed on
# the CI runner.
grep -qF "blackout_upstream_feature_matrix" docs/project_completion_tracker.md
grep -qF "validate_tracker_evidence.sh" docs/project_completion_tracker.md docs/repo_remaining_work_ai_prompts.md

echo "tracker evidence validation passed"
