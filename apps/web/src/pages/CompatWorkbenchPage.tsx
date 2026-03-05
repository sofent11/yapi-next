import { CompatWorkspace } from './shared/CompatWorkspace';

export function CompatWorkbenchPage() {
  return (
    <CompatWorkspace
      title="兼容接口迁移工作台"
      description="覆盖本轮新增迁移接口：`open/run_auto_test`、`log/list`、`log/list_by_update`、`test/*`、`interface/interUpload`。"
      requestSource="compat-workbench"
    />
  );
}
