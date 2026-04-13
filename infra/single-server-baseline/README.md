# Single-server production baseline manifests

This directory contains a one-server production baseline with:
- Docker Compose stack (`docker-compose.yml`)
- Nginx reverse proxy config (`nginx/`)
- Synapse and coturn templates (`synapse/`, `coturn/`)
- Environment template (`.env.example`)
- Systemd units (`systemd/`)
- Backup hook (`backup/backup.sh`)
- Operations runbook (`RUNBOOK.md`)

Use `RUNBOOK.md` as the source of truth for deployment, rollback, and DR.
