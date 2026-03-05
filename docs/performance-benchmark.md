# YApi 性能压测执行说明

## 1. 目标门槛
- 菜单接口：`/api/interface/list_menu` P95 < 500ms（1 万接口规模）
- 导入性能：1000 接口导入 < 60s
- 导出性能：OpenAPI3 导出 P95 < 2s
- OpenAPI round-trip：关键字段一致率 >= 99%

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
3. 跑 `perf:roundtrip`，确认 OAS3 导入导出语义一致性。
4. 最后跑 `perf:export`，确认 OAS3 导出能力。
5. 每次改动后保留结果 JSON 作为基线对比。

## 7. OpenAPI round-trip 自评
```bash
BASE_URL=http://127.0.0.1:3000 \
PROJECT_ID=11 \
TOKEN=xxxx \
SPEC_FILE=./test/swagger.v3.json \
TARGET_RATIO=99 \
npm run perf:roundtrip
```

输出字段：
- `consistencyRatio`：关键字段一致率（百分比）
- `missingOperations`：导出后缺失的 operation 列表
- `driftedOperations`：发生字段漂移的 operation 列表（最多 30 条）
- `ok`：是否达标

## 8. 一键全量自评（推荐）
```bash
npm run next:self-assess:api
```

说明：
- 脚本会自动拉起临时 Mongo + API，执行索引检查、核心查询 explain（禁止 `COLLSCAN`）、10k/1000 性能门槛和 round-trip 检查。
- 结果会写入 `reports/next-self-assess-*.json`。

## 9. k6 脚本（可选）
脚本目录：`scripts/perf/k6`

示例：
```bash
# 菜单 P95
k6 run -e BASE_URL=http://127.0.0.1:3000 -e PROJECT_ID=11 -e TOKEN=xxxx scripts/perf/k6/menu.js

# 导出 P95
k6 run -e BASE_URL=http://127.0.0.1:3000 -e PROJECT_ID=11 -e TOKEN=xxxx scripts/perf/k6/export.js

# 1000 接口导入（单次）
k6 run -e BASE_URL=http://127.0.0.1:3000 -e PROJECT_ID=11 -e TOKEN=xxxx -e API_COUNT=1000 scripts/perf/k6/import.js
```
