# 内网部署（Next 架构）

旧版 Koa/ykit 与 `yapi-cli server` 部署流程已在本仓库移除。

请使用根目录 README 的 Next 部署方式：

```bash
npm install
npm run next:build
npm run next:start
```

如需冒烟与自评：

```bash
npm run next:smoke:api
npm run next:self-assess:api
```
