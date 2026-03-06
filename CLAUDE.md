# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key commands

### Install / run
- `npm install`
- `npm start` (starts API + Web via `scripts/start-next.sh`)
- API dev only: `npm run next:api:dev`
- Web dev only: `npm run next:web:dev`

### Build / test
- Full build (shared types + API + Web): `npm run next:build`
- Default test (currently same as build): `npm test`
- API smoke test: `npm run next:smoke:api`
- API self-assess (performance + round-trip): `npm run next:self-assess:api`

### Types
- Shared types build (required after `packages/shared-types` changes): `npm run next:types:build`

### Performance scripts
- `npm run perf:menu`
- `npm run perf:import`
- `npm run perf:export`
- `npm run perf:roundtrip`

## Architecture overview

- Monorepo with two apps and shared types:
  - `apps/api`: NestJS 11 + Fastify + Mongoose (TypeScript) API service.
  - `apps/web`: React 18 + Vite + Ant Design 5 (TypeScript) frontend.
  - `packages/shared-types`: shared TypeScript types consumed by both API and Web.

- API conventions:
  - Global prefix: `/api`.
  - Mock routes bypass the prefix: `/mock/:projectId/*`.
  - Response wrapper must remain `{ errcode, errmsg, data }` for compatibility.

- Web conventions:
  - Web dev server proxies `/api` to the API service. Avoid hard-coded environment-specific API URLs in code.

## Development notes from AGENTS.md

- Repository is “Next-only” (no legacy Koa/ykit/plugin architecture).
- When changing shared types, run `next:types:build` and verify API/Web builds.
- Before finishing work (especially API changes), the expected minimum checks are:
  - `npm run next:build`
  - `npm run next:smoke:api`
  - Run `npm run next:self-assess:api` when performance, import/export, indexing, or OpenAPI semantics change.

## Docs to keep in sync

- If you change startup behavior, ports, env vars, or scripts, update `/Users/sofent/work/yapi/README.md`.
- If you change performance scripts or thresholds, update `/Users/sofent/work/yapi/docs/performance-benchmark.md`.
