# Infrastructure configuration

This folder is the canonical home for deployment configuration used by Blackout runtimes.

- `docker/`: compose files, image notes, and local container runtime docs.
- `cloudflare/`: tunnel/WAF/routing configuration and runbooks.
- `nginx/`: reverse-proxy examples and hardened templates.
- `env/`: environment variable contracts and secrets handling notes.

Existing deployment manifests in `deploy/` are still supported. New infrastructure artifacts should be added under `infra/` and linked from runbooks.
