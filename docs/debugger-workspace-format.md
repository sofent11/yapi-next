# Debugger Workspace Format

`apps/debugger` 使用“目录即项目”的本地工作区模型。目录本身就是唯一事实源，适合直接纳入 Git。

## 目录结构

```text
my-api-project/
  project.yaml
  environments/
    shared.yaml
    local.local.yaml
  collections/
    smoke-suite.collection.yaml
    smoke-suite.data.json
  requests/
    bootstrap/
      health-check.request.yaml
    users/
      get-user.request.yaml
      get-user/
        cases/
          smoke.case.yaml
          unauthorized.case.yaml
        bodies/
          get-user.json
        examples/
          response-200.json
  .gitignore
```

## 文件说明

### `project.yaml`

保存项目元信息：

```yaml
schemaVersion: 2
name: Payments Debugger
defaultEnvironment: shared
labels: []
```

### `environments/*.yaml`

保存可共享环境变量、公共请求头和认证配置。建议把可提交的共享变量放进 `shared.yaml`。

### `environments/*.local.yaml`

保存本地敏感信息，例如 token、临时 baseUrl。默认应通过项目根 `.gitignore` 忽略：

```gitignore
environments/*.local.yaml
```

### `requests/**/*.request.yaml`

每个接口一个文件，保存请求模板：

```yaml
schemaVersion: 2
id: req_f3p9s2
name: Get User
method: GET
url: "{{baseUrl}}/users/{{userId}}"
path: /users/{userId}
description: Fetch the current user profile.
tags:
  - users
headers:
  - name: Accept
    value: application/json
    enabled: true
query: []
pathParams:
  - name: userId
    value: "1"
    enabled: true
body:
  mode: none
  text: ""
  fields: []
auth:
  type: inherit
examples: []
order: 0
```

### `requests/**/<request>/cases/*.case.yaml`

每个接口下可以有多个 Case。Case 只保存对基础请求的覆盖项、断言和脚本，不保存运行结果：

```yaml
schemaVersion: 2
id: case_a91k2z
name: unauthorized
extendsRequest: req_f3p9s2
environment: local
notes: Missing auth token
tags:
  - auth
retry:
  count: 1
  delayMs: 500
  when:
    - network-error
    - 5xx
skip:
  enabled: false
  reason: ""
  when: ""
testMode: automation
baselineRef: unauthorized-baseline
overrides:
  headers:
    - name: Authorization
      value: ""
      enabled: false
scripts:
  preRequest: |
    pm.variables.set("traceId", "trace-001")
  postResponse: |
    pm.test("status ok", () => pm.expect(pm.response?.code).to.equal(200))
```

### `collections/*.collection.yaml`

Collection 用于组织多步骤链路回归或数据驱动场景：

```yaml
schemaVersion: 2
id: col_2x91kd
name: smoke-suite
defaultEnvironment: shared
stopOnFailure: true
iterationCount: 1
tags:
  - smoke
vars:
  sku: sku-001
rules:
  requireSuccessStatus: true
  maxDurationMs: 1500
  requiredJsonPaths:
    - $.data.id
setupSteps:
  - key: bootstrap
    requestId: req_bootstrap
    enabled: true
    tags: []
    skipIf: ""
teardownSteps: []
envMatrix:
  - shared
  - staging
defaultRetry:
  count: 1
  delayMs: 500
  when:
    - network-error
    - 5xx
continueOnFailure: false
reporters:
  - json
  - html
  - junit
dataFile: collections/smoke-suite.data.json
steps:
  - key: login
    requestId: req_login
    caseId: case_smoke
    enabled: true
    name: Login
    retry:
      count: 1
      delayMs: 250
      when:
        - assertion-failed
    timeoutMs: 10000
    continueOnFailure: false
    tags:
      - smoke
    skipIf: "{{skipLogin}}"
  - key: profile
    requestId: req_profile
    enabled: true
    tags: []
    skipIf: ""
```

### `collections/*.data.json`

Collection 数据文件支持 JSON / YAML 数组，以及带表头的 CSV。推荐在结构化数据较多时使用 JSON 数组，在测试同学维护批量样本时使用 CSV。

JSON / YAML 每一行都是一次迭代变量：

```json
[
  { "sku": "sku-001", "userId": "u-1" },
  { "sku": "sku-002", "userId": "u-2" }
]
```

CSV 示例：

```csv
sku,userId
sku-001,u-1
sku-002,u-2
```

运行时变量解析优先级：

- `data row vars`
- `steps.<key>.*`
- `collection vars`
- `environment vars`
- `project vars`

### `requests/**/<request>/bodies/*`

当请求体内容较大时，会自动拆分到 sidecar 文件，主 YAML 里通过 `body.file` 指向该文件。

### `requests/**/<request>/examples/*`

导入的响应示例或较大的示例文本会以 sidecar 文件保存，避免在 YAML 中嵌入大段文本。

`snapshot-match` 和 `baselineRef` 默认直接引用这里的 example / baseline，不会额外创建新的快照目录。

## V2 自动化字段

### CaseDocument

- `tags`: Case 级标签，支持桌面端与 CLI 的 tag filter
- `retry`: 统一 retry 结构，字段为 `count`、`delayMs`、`when`
- `skip`: 显式跳过配置，支持说明原因和条件表达式
- `testMode`: `debug` 或 `automation`，用于区分更偏调试还是更偏回归的用法
- `baselineRef`: 引用 request examples 中的 baseline 名称，执行时会转成 `snapshot-match`

### CollectionDocument

- `tags`: 套件标签
- `setupSteps` / `teardownSteps`: 前后置步骤
- `envMatrix`: 环境矩阵，V1 按顺序串行执行
- `defaultRetry`: Collection 默认重试策略
- `continueOnFailure`: 是否允许失败后继续执行后续步骤
- `reporters`: 默认报告格式，支持 `json`、`html`、`junit`

### CollectionStep

- `retry`: Step 级重试，优先级高于 Collection 默认值
- `timeoutMs`: 单步超时覆盖
- `continueOnFailure`: 单步是否忽略失败继续往后执行
- `tags`: Step 级标签
- `skipIf`: 运行时跳过表达式，支持模板变量

## 迁移与缓存

- 旧的 `schemaVersion: 1` workspace 在首次打开或 CLI 执行时会自动迁移到 V2
- 迁移前会先把原始文件备份到 `.yapi-debugger-cache/migrations/<timestamp>/`
- 迁移结果会写入 `.yapi-debugger-cache/migration-manifest.json`
- `.yapi-debugger-cache/` 默认应加入 Git ignore，不参与业务提交

## 设计约束

- `schemaVersion` 当前固定为 `2`
- 文件名使用可读 slug，稳定 ID 放在文档内容中
- 不维护全局索引文件，目录结构即导航结构
- 运行历史不回写项目目录，只保留在应用本地缓存目录
- Collection 报告同样只保留在应用本地缓存目录，不进入 Git
- 大文本拆 sidecar，小文本保留在 YAML 中，兼顾可读性与 diff 质量

## Git 建议

- 提交共享环境：`environments/shared.yaml`
- 忽略本地敏感环境：`environments/*.local.yaml`
- 一个请求一个文件、一个 Case 一个文件，减少多人改同一文件的冲突
- 避免在 YAML 中放超长 JSON 文本，优先让应用自动拆 sidecar
