
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

# Framing policy (launch-plan step B2). frame-deny.conf applies to every
# route; embed-frame.conf applies only to the Black Mask chat panel (/embed)
# and ships denying framing too. The entrypoint script rewrites embed-frame.conf
# at container start from BLACK_MASK_FRAME_ANCESTORS (validated; empty or
# invalid keeps the deny). The nginx image runs /docker-entrypoint.d/*.sh
# before starting nginx.
COPY --from=builder /src/apps/blackout-client/nginx/frame-deny.conf /etc/nginx/blackout/frame-deny.conf

COPY --from=builder /src/apps/blackout-client/nginx/embed-frame.conf /etc/nginx/blackout/embed-frame.conf

COPY --from=builder /src/apps/blackout-client/nginx/docker-entrypoint.d/40-black-mask-frame-ancestors.sh /docker-entrypoint.d/40-black-mask-frame-ancestors.sh

RUN chmod 0755 /docker-entrypoint.d/40-black-mask-frame-ancestors.sh

RUN rm -rf /usr/share/nginx/html \

  && ln -s /app /usr/share/nginx/html

