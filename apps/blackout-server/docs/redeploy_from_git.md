# Redeploy from latest Git changes

Use this runbook when you already have a Blackout Server checkout on a host and want to pull the latest repository changes safely.

## Fedora quick commands (systemd + virtualenv)

```bash
cd /srv/blackout
git fetch origin
git checkout main
git pull --ff-only origin main

sudo dnf -y install python3 python3-pip
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -e ./apps/blackout-server

# If your deployment has a migration step, run it here.

sudo systemctl daemon-reload
sudo systemctl restart matrix-synapse.target
sudo systemctl status matrix-synapse.target --no-pager
journalctl -u matrix-synapse.target -n 200 --no-pager
```

## Fedora quick commands (Docker Compose)

```bash
cd /srv/blackout
git fetch origin
git checkout main
git pull --ff-only origin main

sudo dnf -y install docker-cli docker-compose-plugin
sudo systemctl enable --now docker
sudo docker compose pull
sudo docker compose build --pull
sudo docker compose up -d --remove-orphans
sudo docker compose ps
```

## Rollback commands

```bash
cd /srv/blackout
git log --oneline -n 10
git checkout <known-good-sha>
# Then repeat rebuild + restart for your deployment model.
```
