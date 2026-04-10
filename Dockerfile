# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base

WORKDIR /app

FROM base AS api-deps

COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
COPY packages/shared-types ./packages/shared-types

RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefix apps/api

FROM api-deps AS api-builder

COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types

RUN ./apps/api/node_modules/.bin/tsc -p packages/shared-types/tsconfig.json \
 && npm run build --prefix apps/api

FROM base AS api-prod-deps

COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
COPY packages/shared-types ./packages/shared-types

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --prefix apps/api

FROM node:22-alpine AS api

WORKDIR /app

COPY --from=api-prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=api-builder /app/apps/api/dist ./apps/api/dist

ENV PORT=3300
ENV NODE_ENV=production

EXPOSE 3300

CMD ["node", "apps/api/dist/main.js"]

FROM base AS web-deps

ARG VITE_APP_BASE=/
ENV VITE_APP_BASE=$VITE_APP_BASE

COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
COPY packages/shared-types ./packages/shared-types

RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefix apps/web

FROM web-deps AS web-builder

ARG VITE_APP_BASE=/
ENV VITE_APP_BASE=$VITE_APP_BASE

COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/web ./apps/web
COPY packages/shared-types ./packages/shared-types

RUN ./apps/web/node_modules/.bin/tsc -p packages/shared-types/tsconfig.json \
 && npm run build --prefix apps/web

FROM nginx:alpine AS web

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
