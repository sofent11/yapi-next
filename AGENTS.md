# AGENTS

本文件定义本仓库的人类开发者与 AI 代理协作规则。

## 1. 项目事实（必须遵守）

- 本仓库已是 Next-only 形态，不再包含旧 Koa/ykit/plugin 架构。
- 技术栈：
  - API: `apps/api`（NestJS + Fastify + TS）
  - Web: `apps/web`（React + Vite + TS）
  - Shared Types: `packages/shared-types`
- 统一运行入口在根 `package.json`。

## 2. 代码改动边界

### API 改动
- 目录：`apps/api/src/**`
- 必须保持兼容响应包裹格式：`{ errcode, errmsg, data }`
- 新增或变更接口时，优先保持已有兼容路由行为稳定。

### Web 改动
- 目录：`apps/web/src/**`
- 默认走 `/api` 代理，不要在代码中硬编码环境相关地址。

### 类型改动
- 目录：`packages/shared-types/src/index.ts`
- 改动 shared types 后，必须执行 `next:types:build` 并验证 API/Web 构建。

## 3. 必跑校验（提交前）

最小校验：

```bash
npm run next:build
npm run next:smoke:api
```

涉及性能、导入导出、索引或 OpenAPI 语义变更时，额外执行：

```bash
npm run next:self-assess:api
```

## 4. 性能与兼容门槛

以下门槛用于回归判断：
- 菜单接口 P95 < 500ms（1 万接口）
- 1000 接口导入 < 60s
- OpenAPI 导出 P95 < 2s
- OpenAPI round-trip 一致率 >= 99%

如低于门槛，禁止宣称“完成迁移”或“可发布”。

## 5. 脚本约定

- 启动：`npm start`（调用 `scripts/start-next.sh`）
- 冒烟：`scripts/smoke-next-api.sh`
- 自评：`scripts/self-assess-next-api.sh`
- 压测脚本：`scripts/perf/*`

新增脚本时：
- 默认放在 `scripts/`
- 保持可重复执行与幂等（尤其是索引相关脚本）

## 6. 文档约定

当你修改以下内容时，必须同步更新文档：
- 启动方式、端口、环境变量、脚本命令 -> `README.md`
- 性能脚本参数与门槛 -> `docs/performance-benchmark.md`

## 7. 变更原则

- 小步提交：先可运行，再优化。
- 不引入与当前架构无关的历史兼容代码。
- 不保留不可达代码、废弃脚本、未使用依赖。
- 任何“临时方案”必须在 PR/提交说明里标记清理计划。

## 8. 代理执行清单（Checklist）

每次任务结束前，代理应确认：
- [ ] 改动范围仅在当前架构内（apps/packages/scripts/docs）
- [ ] `npm run next:build` 通过
- [ ] `npm run next:smoke:api` 通过（如改动 API）
- [ ] 必要时 `npm run next:self-assess:api` 通过
- [ ] README/相关文档已同步
