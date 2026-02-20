#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

required_files=(
  docs/operations/tracker_evidence_matrix.md
  docs/project_completion_tracker.md
  deploy/kubernetes/phase4/element-ha.yaml
  deploy/kubernetes/phase6/redis-ha.yaml
  deploy/kubernetes/phase6/postgres-dr-baseline.yaml
  deploy/kubernetes/phase6/ingress-waf-rate-limit.yaml
  deploy/kubernetes/phase6/federation-alerts.yaml
  deploy/kubernetes/phase6/second-region-dr-footprint.yaml
  deploy/kubernetes/phase6/scaleout-automation.yaml
  docs/runbooks/distributed_self_healing_operations.md
  docs/runbooks/bot_abuse_spike_playbook.md
  docs/operations/slo_error_budget_policy.md
  docs/operations/secrets_rotation_break_glass.md
  docs/operations/oncall_escalation_tree.md
  docs/operations/game_day_exercises.md
  docs/operations/dashboards/federation_resilience_dashboard.json
  docs/operations/evidence/2026-02-20-no-spof-topology-review.md
  docs/operations/evidence/2026-02-20-chaos-restart-verification.md
  docs/operations/evidence/2026-02-20-rollback-verification.md
  docs/operations/evidence/2026-02-20-postgres-drill-validation.md
  docs/operations/evidence/2026-02-20-federation-backlog-recovery-drill.md
  docs/operations/evidence/2026-02-20-second-region-failover-validation.md
  docs/operations/evidence/2026-02-20-scaleout-automation-validation.md
  docs/operations/evidence/2026-02-20-operator-onboarding-signoff.md
  docs/templates/incident_template.md
  docs/templates/postmortem_template.md
  .github/workflows/dr-backup-verification.yml
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || { echo "Missing required artifact: $file"; exit 1; }
done

ruby -ryaml -e 'files=Dir["deploy/kubernetes/phase6/*.yaml"]+Dir[".github/workflows/*.yml"]; files.each{|f| YAML.load_stream(File.read(f))}; puts "YAML parse OK (#{files.size} files)"'
python -m json.tool docs/operations/dashboards/federation_resilience_dashboard.json >/dev/null

echo "Tracker evidence validation OK"
