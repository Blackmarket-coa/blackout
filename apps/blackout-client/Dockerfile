
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

RUN addgroup -g 101 -S nginx \
  && adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx \
  && touch /var/run/nginx.pid \
  && chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /app

USER nginx
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -q --spider http://localhost:80/health || exit 1

