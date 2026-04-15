# YApi Next

YApi Next 是一个基于 TypeScript 的 API 管理平台，提供接口设计、导入导出、Mock、自动化测试与兼容历史 API 的能力。

当前仓库已完成全量重构，运行形态为：
- 后端：NestJS 11 + Fastify + Mongoose（TypeScript）
- 前端：React 19 + Vite + Mantine UI + Tailwind CSS v4（TypeScript）
- 数据库：MongoDB
- 独立调试器：Tauri 2 + React 19 + Vite（本地优先桌面 API Debugger）

## 目录结构

```text
.
├── apps/
│   ├── api/                 # NestJS API 服务
│   ├── web/                 # React + Vite 前端
│   └── debugger/            # Tauri 独立桌面 API Debugger
├── packages/
│   ├── shared-types/        # 前后端共享类型
│   ├── debugger-schema/     # 调试器工作区与 DTO schema
│   ├── debugger-core/       # 调试器工作区装载、保存与请求解析
│   └── debugger-importers/  # OpenAPI / HAR / Postman 导入解析
├── scripts/                 # 启动、冒烟、自评与压测脚本
├── static/                  # 运行时静态资源（头像默认图等）
├── docs/                    # 项目文档
└── test/                    # OpenAPI 样例文件
```

## 环境要求

- Node.js >= 22
- npm >= 10
- MongoDB >= 7

## 快速开始

```bash
npm install
npm start
```

默认端口：
- API: `http://127.0.0.1:3300`
- Web: `http://127.0.0.1:5173`

`npm start` 会同时启动 API 与 Web，Web 默认代理 `/api` 到 API 服务。

## 常用脚本

### 构建与运行

```bash
# 全量构建（shared-types + api + web）
npm run next:build

# 独立桌面调试器开发
npm run debugger:dev

# 仅运行调试器前端开发服务器
npm run debugger:web:dev

# 构建调试器前端资源
npm run debugger:build

# 构建调试器桌面安装包
npm run debugger:bundle

# 仅检查 Web TypeScript 类型
npm run next:web:typecheck

# 仅后端开发
npm run next:api:dev

# 仅前端开发
npm run next:web:dev

# 启动（同 npm start）
npm run next:start
```

### 质量校验

```bash
# 默认测试（当前等价于 next:build）
npm test

# Web 类型检查（next:web:build 已内置执行）
npm run next:web:typecheck

# Web 样式审计（检查 legacy 类是否已在 tailwind.css 中定义）
npm run next:web:style:audit

# API 兼容冒烟（临时 Mongo + API）
npm run next:smoke:api

# 全量自评（索引/查询计划/性能/round-trip）
npm run next:self-assess:api
```

### 索引与性能

```bash
# 创建/校验数据库索引（幂等）
npm run db:create-indexes

# 性能脚本
npm run perf:menu
npm run perf:import
npm run perf:export
npm run perf:roundtrip
```

## 关键环境变量

### 启动相关
- `PORT`：API 端口（默认 `3300`）
- `MONGO_URL`：MongoDB 连接串
- `API_BODY_LIMIT_MB`：请求体上限（默认 `20`）

### Web 开发相关
- `VITE_PORT`：Web 端口（默认 `5173`）
- `VITE_HOST`：Web 监听地址（默认 `0.0.0.0`）
- `API_PORT`：用于 Vite 代理目标端口（默认 `3300`）
- `API_PROXY_TARGET`：直接指定代理地址，优先于 `API_PORT`
- `VITE_APP_BASE`：Web 部署子路径，默认 `/`。例如部署到 `/yapi/` 时设置为 `/yapi/`

### Debugger 开发相关
- `apps/debugger` 默认在 `http://localhost:1420` 提供前端开发服务器，并由 Tauri 2 载入
- 独立调试器不依赖 `apps/api` 运行，不直接与 YApi 后台交互
- 远程规范导入仅支持通过 URL 拉取文本内容，可按 Bearer、自定义 Header 或 Query 参数携带 token

### Docker 构建相关
- 根目录 `.env` 中的 `VITE_APP_BASE` 会传入 Docker 构建阶段，用于生成前端静态资源路径
- Docker 多阶段构建已按 `api` 和 `web` 分离；仅修改 `apps/web` 时，不会再因为共享 builder 把 `api` 目标一并重编译
- 可从 [`.env.example`](/Users/sofent/work/yapi/.env.example) 复制一份为根目录 `.env`

部署到子路径（例如 `/yapi/`）时，可使用：

```bash
cp .env.example .env
# 然后把 .env 中的 VITE_APP_BASE 改为 /yapi/
docker compose up -d --build
```

## API 约定

- 全局前缀：`/api`
- 健康检查：`GET /api/health`
- Mock 路由（不走 `/api` 前缀）：`/mock/:projectId/*`
- 兼容响应包裹：`{ errcode, errmsg, data }`

## OpenAPI 支持

- 导入：Swagger 2.0 / OpenAPI 3.x（自动识别）
- 导出：OpenAPI 3（主路径）+ Swagger 2（兼容）
- round-trip 自评：基于 `test/swagger.v3.json`

## 独立 Debugger

`apps/debugger` 是一个与当前后台解耦的桌面 API Debugger，目标是“本地优先、文本友好、可 Git 协作”：

- 工作区目录即项目，接口、Case、环境变量都以 YAML / JSON 文本文件落盘
- 支持从 OpenAPI 3.x、Swagger 2.0、HAR、Postman Collection v2.1 导入到本地项目
- 支持接口下多个 Case、环境切换、原生桌面请求发送、响应查看
- 一期不依赖 YApi API，不做云同步和团队实时协同

工作区格式与目录约定见：
- `docs/debugger-workspace-format.md`

## 部署建议

生产部署建议最小流程：

```bash
npm ci
npm run next:build
npm run next:self-assess:api
npm run next:start
```

可选使用 PM2：

```bash
pm2 start "npm run next:start" --name yapi-next
```

## 参考文档

- 性能压测说明：`docs/performance-benchmark.md`
- OpenAPI 兼容说明：`docs/openapi-doc.html`
- 调试器工作区格式：`docs/debugger-workspace-format.md`

## 许可证

Apache License 2.0
