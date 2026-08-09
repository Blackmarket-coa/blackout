# Running in Kubernetes

This page covers the **web client** only. The API, Redis, and the canary rollout
are handled by the Helm chart at `deploy/helm/blackout/` — see
[Install](install.md#kubernetes). The client is a static nginx image with no
chart of its own, so the manifests below are the supported way to run it.

The example assumes an Nginx ingress controller is installed.

## Image

The client image is published by
[`.github/workflows/docker.yml`](../.github/workflows/docker.yml) on pushes to
`main` and on `v*` tags:

```text
ghcr.io/blackmarket-coa/blackout-web:latest
```

It is built from `deploy/docker/Dockerfile` (the repo-root `Dockerfile.blackout`
is the equivalent used by `docker-compose.yml`). Pin a version tag rather than
`latest` for anything you care about.

Notes that matter for the manifests:

-   It runs as the **non-root** `nginx` user, so it cannot bind privileged ports.
    The in-container port is `ELEMENT_WEB_PORT`, default `80` — a name inherited
    from the Element-era entrypoint scripts in `deploy/docker/`.
-   It serves `/health/live` and `/health/ready`, both defined in
    `deploy/docker/nginx-templates/default.conf.template`.
-   It **ships `config.sample.json` as its default `/app/config.json`**, which
    points at `matrix.theblackout.app`. If you do not mount your own config, the
    deployment will silently run against the sample homeserver rather than yours.

## Config

`config.json` goes in as a `ConfigMap` and is mounted over `/app/config.json`.
Start from `config.sample.json` in the repo root and edit for your homeserver;
see [Config](config.md) for the available keys.

## Manifests

Save as `blackout-web.yaml`, edit for your environment, then
`kubectl apply -f blackout-web.yaml`.

```yaml
apiVersion: v1
kind: Namespace
metadata:
    name: blackout

---
# Trimmed from config.sample.json. Replace every theblackout.app value with
# your own homeserver — see docs/config.md for the full key reference.
apiVersion: v1
kind: ConfigMap
metadata:
    name: blackout-web-config
    namespace: blackout
data:
    config.json: |
        {
            "default_server_config": {
                "m.homeserver": {
                    "base_url": "https://matrix.example.com",
                    "server_name": "matrix.example.com"
                }
            },
            "brand": "Blackout",
            "disable_custom_urls": false,
            "disable_guests": false,
            "force_verification": false,
            "show_labs_settings": false,
            "features": {},
            "default_federate": true,
            "default_theme": "light",
            "room_directory": {
                "servers": ["matrix.example.com"]
            },
            "setting_defaults": {
                "breadcrumbs": true
            },
            "security": {
                "hardened_mode": true
            }
        }

---
apiVersion: apps/v1
kind: Deployment
metadata:
    name: blackout-web
    namespace: blackout
spec:
    selector:
        matchLabels:
            app: blackout-web
    replicas: 3
    template:
        metadata:
            labels:
                app: blackout-web
        spec:
            terminationGracePeriodSeconds: 30
            containers:
                - name: blackout-web
                  image: ghcr.io/blackmarket-coa/blackout-web:latest
                  volumeMounts:
                      - name: config-volume
                        mountPath: /app/config.json
                        subPath: config.json
                  ports:
                      - containerPort: 80
                        name: http
                        protocol: TCP
                  readinessProbe:
                      httpGet:
                          path: /health/ready
                          port: http
                      initialDelaySeconds: 2
                      periodSeconds: 3
                  livenessProbe:
                      httpGet:
                          path: /health/live
                          port: http
                      initialDelaySeconds: 10
                      periodSeconds: 10
                  lifecycle:
                      preStop:
                          exec:
                              # Let in-flight requests drain before nginx exits.
                              command: ['/bin/sh', '-c', 'sleep 10']
            volumes:
                - name: config-volume
                  configMap:
                      name: blackout-web-config

---
apiVersion: v1
kind: Service
metadata:
    name: blackout-web
    namespace: blackout
spec:
    selector:
        app: blackout-web
    ports:
        - name: default
          protocol: TCP
          port: 80
          targetPort: http

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
    name: blackout-web
    namespace: blackout
    annotations:
        nginx.ingress.kubernetes.io/configuration-snippet: |
            add_header X-Frame-Options SAMEORIGIN;
            add_header X-Content-Type-Options nosniff;
            add_header Content-Security-Policy "frame-ancestors 'self'";
spec:
    ingressClassName: nginx
    rules:
        - host: blackout.example.com
          http:
              paths:
                  - pathType: Prefix
                    path: /
                    backend:
                        service:
                            name: blackout-web
                            port:
                                number: 80
```

## Serving caveats

The same two rules from [Install](install.md#building-from-source-behind-your-own-web-server)
apply here, and the shipped nginx config already handles them — check them if you
put your own proxy in front:

-   `index.html` and `config.json` must **not** be cached; the hashed assets should
    be cached aggressively.
-   Unmatched routes must fall through to `index.html`. The client uses
    history-mode routing, so a hard refresh on `/canopies` has to reach the app
    rather than 404.

Serve it over HTTPS. Browsers block WebRTC — so voice and video — outside a
secure context.
