# Installing Blackout

**Familiarise yourself with [SECURITY.md](../SECURITY.md) and
[THREAT_MODEL.md](../THREAT_MODEL.md) before starting — they apply to every
installation method.**

_Serve Blackout over HTTPS. Browsers refuse VoIP and video over plain HTTP,
since WebRTC requires a [secure context](https://developer.mozilla.org/docs/Web/Security/Secure_Contexts).
`localhost` counts as secure, so local development over HTTP is fine._

There are no prebuilt release tarballs or distribution packages. Blackout is
built from source in this monorepo; the supported paths are Docker, Kubernetes,
and a direct build behind your own web server.

## Docker Compose (quickest self-host)

`docker-compose.yml` builds the client image from `Dockerfile.blackout` and
serves it on port 8080:

```bash
git clone https://github.com/Blackmarket-coa/blackout.git
cd blackout
docker network create blackout-backend   # compose expects this to already exist
docker compose up -d --build
```

The app is then on <http://localhost:8080>. The compose file joins an external
`blackout-backend` network so the client can sit alongside a homeserver and the
API; put those on the same network.

To supply your own client config, mount it over `/app/config.json`:

```bash
docker run --rm -p 127.0.0.1:8080:80 \
  -v "$PWD/config.json:/app/config.json" \
  blackout-app
```

Copy `config.sample.json` as a starting point — see [Config](config.md) for the
available keys. The image ships `config.sample.json` as its default config, so
an unconfigured container points at the sample homeserver, not yours.

### Image behaviour

Built on `nginxinc/nginx-unprivileged`, running as a non-root user. Binding to
port 80 on the host may therefore need elevated privileges — prefer publishing a
high port (as the compose file does) or change the in-container port:

-   `ELEMENT_WEB_PORT` — port nginx listens on inside the container. Defaults to
    `80`. (The name is inherited from the Element-era entrypoint scripts in
    `deploy/docker/`.)

A healthcheck polls `/health/ready`.

### Building the image directly

```bash
docker build -f Dockerfile.blackout -t blackout-app .
```

The build runs `pnpm install --frozen-lockfile` and `pnpm client:build` inside
`node:22-bullseye`, then copies `apps/blackout-client/dist` into the nginx
image.

## Kubernetes

A Helm chart lives at `deploy/helm/blackout/` covering the API, client, and
supporting services. Configure it through `values.yaml`:

```bash
helm install blackout deploy/helm/blackout/ \
  --set global.domain=blackout.example.com \
  --values my-overrides.yaml
```

See [Kubernetes](kubernetes.md) for a worked ingress example, and
`deploy/helm/blackout/values.yaml` for the full set of knobs (API replica count,
Postgres-backed store, pgNotify cache invalidation, resource limits).

## Building from source behind your own web server

```bash
git clone https://github.com/Blackmarket-coa/blackout.git
cd blackout
pnpm install
cp config.sample.json config.json    # then edit for your homeserver
pnpm web:build
```

That writes a static bundle to `apps/blackout-client/dist/`. Point Caddy, nginx,
Apache, or any static host at it. Two things to get right:

-   Set caching headers so `index.html` and `config.json` are **not** cached while
    the hashed asset files are cached aggressively.
-   Serve `index.html` for unmatched routes — the client uses history-mode routing,
    so a hard refresh on `/canopies` must not 404.

See [README.md](../README.md#quick-start) for the full local-development setup,
including the server and mobile workspaces.

## Blackout feature presets (enterprise/self-hosted)

Blackout runtime preset selection can be configured at startup with environment
variables:

-   `VITE_RELEASE_COHORT` (`internal|beta|general`)
-   `VITE_FEATURE_DEPLOYMENT_DEFAULTS`
-   `VITE_FEATURE_TENANT_POLICY`
-   `VITE_FEATURE_USER_OVERRIDES`

Use `deploy/docker/feature-presets.env.template` as a starting point for
enterprise/self-hosted environments. The template includes:

1. deployment default preset selection,
2. cohort-based staged release,
3. tenant/org policy overrides,
4. user override payloads (honored only when tenant policy allows them).

When configured, the app's **Feature Presets** admin/settings UX supports
choosing a preset, previewing included capabilities ("What this preset
enables"), applying with confirmation, and rolling back to deployment defaults
with confirmation. For operations guidance, see
[feature-preset-rollout-and-rollback.md](operations/runbooks/feature-preset-rollout-and-rollback.md).
