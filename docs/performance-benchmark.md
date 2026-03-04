# YApi 性能压测执行说明

## 1. 目标门槛
- 菜单接口：`/api/interface/list_menu` P95 < 500ms（1 万接口规模）
- 导入性能：1000 接口导入 < 60s
- 导出性能：OpenAPI3 导出 P95 < 2s

## 2. 环境准备
- 启动服务并确认可访问。
- 准备测试项目 `PROJECT_ID`（建议提前灌入约 1 万接口数据）。
- 若项目是私有项目，准备 `TOKEN`。

## 3. 菜单压测
```bash
BASE_URL=http://127.0.0.1:3000 \
PROJECT_ID=11 \
TOKEN=xxxx \
TOTAL_REQUESTS=300 \
CONCURRENCY=20 \
TARGET_P95=500 \
npm run perf:menu
```

输出字段：
- `p95`：菜单接口 P95 延迟（毫秒）
- `ok`：是否达标

## 4. 导出压测（OpenAPI3）
```bash
BASE_URL=http://127.0.0.1:3000 \
PROJECT_ID=11 \
TOKEN=xxxx \
FORMAT=openapi3 \
TOTAL_REQUESTS=50 \
CONCURRENCY=8 \
TARGET_P95=2000 \
npm run perf:export
```

输出字段：
- `p95`：导出接口 P95 延迟（毫秒）
- `ok`：是否达标

## 5. 导入压测（1000 接口）
```bash
BASE_URL=http://127.0.0.1:3000 \
PROJECT_ID=11 \
TOKEN=xxxx \
API_COUNT=1000 \
SYNC_MODE=merge \
TARGET_MS=60000 \
npm run perf:import
```

输出字段：
- `durationMs`：单次导入总耗时（毫秒）
- `ok`：是否达标

## 6. 建议流程
1. 先跑 `perf:menu`，确认菜单链路瓶颈是否解除。
2. 再跑 `perf:import`，确认 bulk 写入链路。
3. 最后跑 `perf:export`，确认 OAS3 导出能力。
4. 每次改动后保留结果 JSON 作为基线对比。
5. 如需查看内置指标快照（管理员登录态）：
   - `GET /api/spec/metrics`
   - 重置指标：`GET /api/spec/metrics?reset=true`

## 7. k6 脚本（可选）
脚本目录：`server/scripts/perf/k6`

示例：
```bash
# 菜单 P95
k6 run -e BASE_URL=http://127.0.0.1:3000 -e PROJECT_ID=11 -e TOKEN=xxxx server/scripts/perf/k6/menu.js

# 导出 P95
k6 run -e BASE_URL=http://127.0.0.1:3000 -e PROJECT_ID=11 -e TOKEN=xxxx server/scripts/perf/k6/export.js

# 1000 接口导入（单次）
k6 run -e BASE_URL=http://127.0.0.1:3000 -e PROJECT_ID=11 -e TOKEN=xxxx -e API_COUNT=1000 server/scripts/perf/k6/import.js
```
