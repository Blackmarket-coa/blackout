
## Builder

FROM node:24.13.1-alpine AS builder

WORKDIR /src

RUN npm install -g pnpm

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json /src/

COPY packages/ /src/packages/

COPY apps/blackout-client/ /src/apps/blackout-client/

RUN pnpm install --frozen-lockfile

WORKDIR /src/apps/blackout-client

ENV NODE_OPTIONS=--max_old_space_size=4096

RUN pnpm run build

## App

FROM nginx:1.29.5-alpine

COPY --from=builder /src/apps/blackout-client/dist /app

COPY --from=builder /src/apps/blackout-client/docker-nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html \

  && ln -s /app /usr/share/nginx/html

