# Static web client (@blackout/client) served by nginx.
#
# Build context is the repository root, e.g.:
#   docker build -f deploy/docker/Dockerfile -t blackout-web .
# The CI publish job (.github/workflows/docker.yml) uses the same context.
#
# NOTE: this repo is a pnpm/Turborepo monorepo. The canonical frontend is
# apps/blackout-client (the former Element-web-derived apps/blackout-web shell
# has been archived to legacy/blackout-web). Earlier revisions of this file were
# an upstream Element-web Dockerfile (yarn + scripts/docker-package.sh) that no
# longer matched this repo and could not build.

# Builder
FROM --platform=$BUILDPLATFORM node:24-bullseye@sha256:8036dbe5b1f465e3acb8b866031cd06e4f84c31b0e83dabbdc59397a40dbe288 AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY config.sample.json ./config.json

RUN pnpm install --frozen-lockfile
RUN pnpm client:build

# Copy the sample config into the built client so the app image ships a default.
RUN cp /src/config.sample.json /src/apps/blackout-client/dist/config.json

# App
FROM nginxinc/nginx-unprivileged:alpine-slim@sha256:9ac6a908ed07ba7d23cbf6048090453a081abf663c53a7c3f3bf96abc16c0799

# Need root user to install packages & manipulate the usr directory
USER root

# Install jq and moreutils for sponge, both used by our entrypoints
RUN apk add jq moreutils

COPY --from=builder /src/apps/blackout-client/dist /app

# Override default nginx config. Templates in `/etc/nginx/templates` are passed
# through `envsubst` by the nginx docker image entry point.
COPY deploy/docker/nginx-templates/* /etc/nginx/templates/
COPY deploy/docker/docker-entrypoint.d/* /docker-entrypoint.d/

RUN rm -rf /usr/share/nginx/html \
  && ln -s /app /usr/share/nginx/html

# Run as nginx user by default
USER nginx

# HTTP listen port
ENV ELEMENT_WEB_PORT=80

HEALTHCHECK --start-period=5s CMD wget -q --spider http://localhost:$ELEMENT_WEB_PORT/health/ready
