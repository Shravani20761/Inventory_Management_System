# syntax=docker/dockerfile:1
# Multi-stage: build Vite SPA, serve with nginx (proxies /api + /generated → backend)

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY index.html ./
COPY vite.config.js ./
COPY public ./public
COPY src ./src
COPY shared ./shared

# Browser-relative API path — nginx proxies to the backend service
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:1.27-alpine AS runner

RUN apk add --no-cache curl

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# nginx envsubst variables (docker entrypoint supports /etc/nginx/templates)
ENV BACKEND_UPSTREAM=backend:3001 \
    NGINX_ENVSUBST_FILTER=BACKEND_UPSTREAM \
    NGINX_PORT=80

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD curl -fsS http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
