FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @blackout/api build

EXPOSE 3001
CMD ["pnpm", "--filter", "@blackout/api", "start"]
