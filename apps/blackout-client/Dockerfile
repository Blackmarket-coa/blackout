## Builder
FROM node:24.13.1-alpine AS builder

WORKDIR /src

COPY .npmrc package*.json /src/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . /src/
ENV NODE_OPTIONS=--max_old_space_size=4096
RUN npm run build


## App
FROM nginx:1.29.5-alpine

COPY --from=builder /src/dist /app
COPY --from=builder /src/docker-nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html \
  && ln -s /app /usr/share/nginx/html
