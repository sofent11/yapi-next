import { Badge, Button, Group, Progress, Text } from '@mantine/core';
import type { EnvironmentDocument } from '@yapi-debugger/schema';
import type { ImportRepairChecklist } from '../../lib/repair';

type StepState = {
  key: string;
  label: string;
  complete: boolean;
  detail: string;
};

function buildGuideSteps(input: {
  activeEnvironmentName: string;
  environment: EnvironmentDocument | null;
  checklist: ImportRepairChecklist;
  importedRequestCount: number;
  importedCaseCount: number;
}) {
  const envReady = Boolean(input.environment?.name || input.activeEnvironmentName);
  const authReady = !input.checklist.hasAuthWork;
  const variableReady = input.checklist.missingVariables.length === 0;
  const runnableReady = input.checklist.runnableRequestIds.length > 0;
  const caseReady = input.importedCaseCount > 0;

  return [
    {
      key: 'environment',
      label: '选择环境',
      complete: envReady,
      detail: envReady ? `当前环境：${input.activeEnvironmentName}` : '先选择一个用于导入请求的环境'
    },
    {
      key: 'auth',
      label: '绑定认证',
      complete: authReady,
      detail: authReady ? '当前导入请求未发现待修复认证问题' : '仍有请求需要补全 auth profile 或认证变量'
    },
    {
      key: 'variables',
      label: '修复变量',
      complete: variableReady,
      detail: variableReady ? '导入请求需要的变量都已就位' : `待补 ${input.checklist.missingVariables.length} 个变量`
    },
    {
      key: 'send',
      label: '首次发送',
      complete: runnableReady,
      detail: runnableReady ? `${input.checklist.runnableRequestIds.length}/${input.importedRequestCount} 个请求已具备发送条件` : '还没有可直接发送的导入请求'
    },
    {
      key: 'case',
      label: '保存为 Case',
      complete: caseReady,
      detail: caseReady ? `已沉淀 ${input.importedCaseCount} 个可复跑 Case` : '至少保存一个可复跑 Case，才能形成闭环'
    }
  ] satisfies StepState[];
}

export function ImportRepairPanel(props: {
  activeEnvironmentName: string;
  environment: EnvironmentDocument | null;
  checklist: ImportRepairChecklist | null;
  importedRequestCount: number;
  importedCaseCount: number;
  importedAtLabel?: string | null;
  importFormat?: string | null;
  previewSummary?: {
    endpoints: number;
    conflicts: number;
    warnings: number;
    runnableScore: number;
  } | null;
  onOpenImport: () => void;
  onOpenEnvironmentCenter: () => void;
  onOpenFirstBlocked: () => void;
  onOpenFirstRunnable: () => void;
  onOpenTaskRequest?: (requestId: string | null) => void;
  onSeedMissingVariables: (scope: 'local' | 'shared') => void;
  onApplyImportedBaseUrl?: () => void;
}) {
  if (!props.checklist) {
    return (
      <section className="workspace-main repair-center">
        <div className="panel-toolbar">
          <div className="breadcrumb-list">
            <span className="breadcrumb-chip">Repair Center</span>
          </div>
          <div className="panel-toolbar-actions">
            <Button size="xs" onClick={props.onOpenImport}>Open Import</Button>
          </div>
        </div>

        <div className="repair-empty-state">
          <Text fw={700}>No import session to repair yet.</Text>
          <Text size="sm" c="dimmed">
            Import an OpenAPI, Swagger, HAR, or Postman collection first. The repair center will turn the importer warnings into a runnable checklist and next-step guide.
          </Text>
        </div>
      </section>
    );
  }

  const guideSteps = buildGuideSteps({
    activeEnvironmentName: props.activeEnvironmentName,
    environment: props.environment,
    checklist: props.checklist,
    importedRequestCount: props.importedRequestCount,
    importedCaseCount: props.importedCaseCount
  });
  const completedSteps = guideSteps.filter(step => step.complete).length;
  const progress = guideSteps.length === 0 ? 0 : Math.round((completedSteps / guideSteps.length) * 100);

  return (
    <section className="workspace-main repair-center">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">Repair Center</span>
          {props.importFormat ? <span className="breadcrumb-chip">{props.importFormat}</span> : null}
          {props.importedAtLabel ? <span className="breadcrumb-chip">{props.importedAtLabel}</span> : null}
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" onClick={props.onOpenImport}>Import More</Button>
          <Button size="xs" variant="default" onClick={props.onOpenEnvironmentCenter}>Open Environments</Button>
        </div>
      </div>

      <div className="repair-layout">
        <div className="repair-column">
          <div className="repair-hero">
            <div>
              <Text className="section-kicker">Import To Runnable</Text>
              <h2 className="section-title">把导入 warning 变成可执行修复清单</h2>
            </div>
            <div className="repair-summary-grid">
              <div className="summary-chip">
                <span>Imported</span>
                <strong>{props.importedRequestCount}</strong>
              </div>
              <div className="summary-chip">
                <span>Runnable</span>
                <strong>{props.checklist.runnableRequestIds.length}</strong>
              </div>
              <div className="summary-chip">
                <span>Blocked</span>
                <strong>{props.checklist.blockedRequestIds.length}</strong>
              </div>
              <div className="summary-chip">
                <span>Missing Vars</span>
                <strong>{props.checklist.missingVariables.length}</strong>
              </div>
            </div>
            <Progress value={progress} size="lg" radius="xl" color={progress === 100 ? 'teal' : 'blue'} />
            <Text size="sm" c="dimmed">
              {completedSteps}/{guideSteps.length} steps complete. 目标是让导入请求在当前工作区里快速进入“可发送、可保存、可复跑”的状态。
            </Text>
          </div>

          <div className="inspector-section">
            <div className="checks-head">
              <h3 className="section-title">Next-Step Guide</h3>
              {props.onApplyImportedBaseUrl ? (
                <Button size="xs" variant="default" onClick={props.onApplyImportedBaseUrl}>Adopt Imported Base URL</Button>
              ) : null}
            </div>
            <div className="repair-step-list">
              {guideSteps.map(step => (
                <div key={step.key} className={step.complete ? 'repair-step is-complete' : 'repair-step'}>
                  <div className="repair-step-copy">
                    <strong>{step.label}</strong>
                    <span>{step.detail}</span>
                  </div>
                  <Badge color={step.complete ? 'teal' : 'orange'} variant={step.complete ? 'filled' : 'light'}>
                    {step.complete ? 'Done' : 'Pending'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="inspector-section">
            <div className="checks-head">
              <h3 className="section-title">Batch Repair</h3>
              <Group gap={8}>
                <Button size="xs" variant="default" disabled={!props.checklist.firstBlockedRequestId} onClick={props.onOpenFirstBlocked}>
                  Open First Blocked
                </Button>
                <Button size="xs" variant="default" disabled={!props.checklist.firstRunnableRequestId} onClick={props.onOpenFirstRunnable}>
                  Send First Runnable
                </Button>
              </Group>
            </div>
            <div className="repair-actions">
              <Button size="xs" variant="light" disabled={props.checklist.missingVariables.length === 0} onClick={() => props.onSeedMissingVariables('local')}>
                Seed Missing Vars To Local Overlay
              </Button>
              <Button size="xs" variant="default" disabled={props.checklist.missingVariables.length === 0} onClick={() => props.onSeedMissingVariables('shared')}>
                Seed Missing Vars To Shared Env
              </Button>
              <Text size="sm" c="dimmed">
                批量补空变量后，Repair Center 会自动刷新。你可以随后在 Environment Center 一次性填充值。
              </Text>
            </div>
          </div>
        </div>

        <div className="repair-column">
          <div className="inspector-section">
            <h3 className="section-title">Repair Tasks</h3>
            <div className="checks-list">
              {props.checklist.tasks.map(task => (
                <div key={task.id} className="check-card">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={700}>{task.title}</Text>
                      <Text size="sm" c="dimmed">{task.description}</Text>
                    </div>
                    <Badge color={task.severity === 'blocking' ? 'red' : task.severity === 'warning' ? 'orange' : 'blue'}>
                      {task.severity}
                    </Badge>
                  </Group>
                  {task.requestName ? (
                    <Text size="xs" c="dimmed" mt={8}>
                      Request: {task.requestName}
                    </Text>
                  ) : null}
                  <Group gap={8} mt={12}>
                    {task.requestId ? (
                      <Button size="xs" variant="default" onClick={() => props.onOpenTaskRequest?.(task.requestId || null)}>
                        Open Request
                      </Button>
                    ) : null}
                    {task.category === 'variables' || task.category === 'auth' ? (
                      <Button size="xs" variant="subtle" onClick={props.onOpenEnvironmentCenter}>
                        Open Environments
                      </Button>
                    ) : null}
                    {task.category === 'baseUrl' && props.onApplyImportedBaseUrl ? (
                      <Button size="xs" variant="subtle" onClick={props.onApplyImportedBaseUrl}>
                        Apply Imported Base URL
                      </Button>
                    ) : null}
                    {task.category === 'variables' ? (
                      <Button size="xs" variant="subtle" onClick={() => props.onSeedMissingVariables('local')}>
                        Seed Missing Vars
                      </Button>
                    ) : null}
                  </Group>
                </div>
              ))}
              {props.checklist.tasks.length === 0 ? (
                <div className="empty-tab-state">No repair tasks left. This import session is ready for daily use.</div>
              ) : null}
            </div>
          </div>

          <div className="inspector-section">
            <h3 className="section-title">Session Snapshot</h3>
            <div className="summary-grid">
              <div className="summary-chip">
                <span>Blocking</span>
                <strong>{props.checklist.blockingCount}</strong>
              </div>
              <div className="summary-chip">
                <span>Warnings</span>
                <strong>{props.checklist.warningCount}</strong>
              </div>
              <div className="summary-chip">
                <span>Auth Work</span>
                <strong>{props.checklist.hasAuthWork ? 'Yes' : 'No'}</strong>
              </div>
              <div className="summary-chip">
                <span>Script Risk</span>
                <strong>{props.checklist.hasScriptWarnings ? 'Yes' : 'No'}</strong>
              </div>
            </div>
            {props.previewSummary ? (
              <Text size="sm" c="dimmed" mt={12}>
                Latest import preview: {props.previewSummary.endpoints} endpoints, {props.previewSummary.conflicts} conflicts, {props.previewSummary.warnings} warnings, runnable score {props.previewSummary.runnableScore}%.
              </Text>
            ) : null}
            {props.checklist.missingVariables.length > 0 ? (
              <div className="repair-tag-list">
                {props.checklist.missingVariables.map(variable => (
                  <Badge key={variable} variant="light" color="orange">{variable}</Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
