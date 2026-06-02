FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @blackout/api build

# Runtime entrypoints. The production compose stack runs `./bin/migrate`,
# `./bin/start-app`, `./bin/start-worker` and `./bin/worker-healthcheck` from
# this WORKDIR; they bridge the compose *_PASSWORD_FILE secrets into the
# DATABASE_URL / REDIS_URL the app expects (see bin/_entrypoint-env.sh).
COPY deploy/docker/backend/bin ./bin
RUN chmod +x ./bin/*

# The @blackout/api server listens on $PORT (default 3000); the worker exposes
# no socket. 3000 matches the production compose healthchecks.
EXPOSE 3000
CMD ["./bin/start-app"]
