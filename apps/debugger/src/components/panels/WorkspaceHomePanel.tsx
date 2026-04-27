import { Badge, Button, Group, Text } from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconFolders,
  IconGitBranch,
  IconHistory,
  IconLifebuoy,
  IconPlayerPlay,
  IconPlugConnected,
  IconUpload
} from '@tabler/icons-react';
import type { WorkspaceIndex } from '@yapi-debugger/schema';
import type { GitStatusPayload } from '../../lib/desktop';

type RiskItem = {
  id: string;
  title: string;
  description: string;
  severity: 'warning' | 'danger';
};

type ImportSessionSummary = {
  format: string;
  importedAt: string;
  importedRequestCount: number;
  runnableCount: number;
  blockedCount: number;
  warningCount: number;
  runnableScore: number;
};

type RecentRunSummary = {
  requestId: string;
  requestName: string;
  status: number;
  durationMs: number;
  timestamp: string;
};

type CollectionRunSummary = {
  collectionId: string;
  collectionName: string;
  status: string;
  failedSteps: number;
  finishedAt: string;
};

type TaskTone = 'neutral' | 'warning' | 'success';

type TaskItem = {
  id: string;
  title: string;
  detail: string;
  tone: TaskTone;
  statusLabel: string;
  primaryLabel: string;
  primaryAction: () => void;
  secondaryLabel?: string;
  secondaryAction?: () => void;
};

function summaryCounts(workspace: WorkspaceIndex) {
  return {
    requests: workspace.requests.length,
    cases: workspace.requests.reduce((total, record) => total + record.cases.length, 0),
    collections: workspace.collections.length,
    environments: workspace.environments.length
  };
}

function gitStatusTone(gitStatus: GitStatusPayload | null) {
  if (!gitStatus?.isRepo) return 'gray';
  if (gitStatus.dirty || gitStatus.behind > 0) return 'orange';
  return 'teal';
}

function displayLabel(value: string | null | undefined, fallback = '时间未知') {
  if (!value || value === 'Invalid Date') return fallback;
  return value;
}

function workspacePulseCopy(counts: ReturnType<typeof summaryCounts>) {
  const parts = [
    counts.requests > 0 ? `${counts.requests} 个请求` : null,
    counts.cases > 0 ? `${counts.cases} 个 Case` : null,
    counts.collections > 0 ? `${counts.collections} 个 Collection` : null
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '当前还没有可继续的请求资产。';
}

export function WorkspaceHomePanel(props: {
  workspace: WorkspaceIndex;
  gitStatus: GitStatusPayload | null;
  gitRisks: RiskItem[];
  importSession: ImportSessionSummary | null;
  repairSummary: {
    blockingCount: number;
    warningCount: number;
    runnableCount: number;
  } | null;
  recentSuccess: RecentRunSummary | null;
  lastCollectionRun: CollectionRunSummary | null;
  suggestedCommitMessage: string;
  onOpenImport: () => void;
  onOpenRepair: () => void;
  onOpenEnvironmentCenter: () => void;
  onOpenFirstBlocked: () => void;
  onOpenFirstRunnable: () => void;
  onOpenLastSuccessfulRequest: () => void;
  onRunLastCollection: () => void;
  onOpenCollections: () => void;
  onOpenHistory: () => void;
  onRefreshGit: () => void;
  onCopySuggestedCommitMessage: () => void;
}) {
  const counts = summaryCounts(props.workspace);
  const blockingCount = props.repairSummary?.blockingCount ?? props.importSession?.blockedCount ?? 0;
  const warningCount = props.repairSummary?.warningCount ?? props.importSession?.warningCount ?? 0;
  const runnableCount = props.repairSummary?.runnableCount ?? props.importSession?.runnableCount ?? 0;
  const hasWorkspaceContent = counts.requests > 0 || counts.collections > 0 || Boolean(props.importSession);

  const tasks: TaskItem[] = [];

  if (!props.importSession && counts.requests === 0) {
    tasks.push({
      id: 'import-api',
      title: '导入 API 规范',
      detail: '当前工作区还没有请求资产。',
      tone: 'neutral',
      statusLabel: '待开始',
      primaryLabel: '导入 API',
      primaryAction: props.onOpenImport
    });
  }

  if (props.importSession && (blockingCount > 0 || counts.environments === 0 || warningCount > 0)) {
    tasks.push({
      id: 'repair-import',
      title: blockingCount > 0 ? '处理导入阻塞' : counts.environments === 0 ? '补环境与认证' : '检查导入提醒',
      detail:
        blockingCount > 0
          ? `${blockingCount} 个阻塞项，${warningCount} 个提醒，最近导入 ${props.importSession.importedRequestCount} 个请求。`
          : counts.environments === 0
            ? `最近导入 ${props.importSession.importedRequestCount} 个请求，但还没有可用环境。`
            : `最近导入 ${props.importSession.importedRequestCount} 个请求，还有 ${warningCount} 个提醒待确认。`,
      tone: blockingCount > 0 || warningCount > 0 ? 'warning' : 'neutral',
      statusLabel: blockingCount > 0 ? `${blockingCount} blocked` : warningCount > 0 ? `${warningCount} warnings` : '待配置',
      primaryLabel: blockingCount > 0 ? '打开首个阻塞项' : counts.environments === 0 ? '打开环境中心' : '打开 Import Tasks',
      primaryAction: blockingCount > 0 ? props.onOpenFirstBlocked : counts.environments === 0 ? props.onOpenEnvironmentCenter : props.onOpenRepair,
      secondaryLabel: blockingCount > 0 || warningCount > 0 ? 'Import Tasks' : undefined,
      secondaryAction: blockingCount > 0 || warningCount > 0 ? props.onOpenRepair : undefined
    });
  }

  if (!props.recentSuccess && runnableCount > 0) {
    tasks.push({
      id: 'send-first-request',
      title: '发送首个成功请求',
      detail: `${runnableCount} 个请求已可运行，先建立第一条真实响应。`,
      tone: 'neutral',
      statusLabel: `${runnableCount} runnable`,
      primaryLabel: '打开可运行请求',
      primaryAction: props.onOpenFirstRunnable,
      secondaryLabel: '环境中心',
      secondaryAction: props.onOpenEnvironmentCenter
    });
  }

  if (props.recentSuccess && counts.cases === 0) {
    tasks.push({
      id: 'save-case',
      title: '把成功请求保存为 Case',
      detail: `最近跑通的是 ${props.recentSuccess.requestName}，现在还没有可复用 Case。`,
      tone: 'neutral',
      statusLabel: '未沉淀',
      primaryLabel: '打开最近成功请求',
      primaryAction: props.onOpenLastSuccessfulRequest,
      secondaryLabel: 'History',
      secondaryAction: props.onOpenHistory
    });
  }

  if (counts.cases > 0 && counts.collections === 0) {
    tasks.push({
      id: 'build-collection',
      title: '创建第一个 Collection',
      detail: `已经有 ${counts.cases} 个 Case，但还没有回归编排。`,
      tone: 'neutral',
      statusLabel: '待编排',
      primaryLabel: '打开 Collections',
      primaryAction: props.onOpenCollections,
      secondaryLabel: props.recentSuccess ? '打开最近成功请求' : undefined,
      secondaryAction: props.recentSuccess ? props.onOpenLastSuccessfulRequest : undefined
    });
  }

  if (props.lastCollectionRun && props.lastCollectionRun.failedSteps > 0) {
    tasks.push({
      id: 'rerun-failed-collection',
      title: '处理最近 Collection 失败',
      detail: `${props.lastCollectionRun.collectionName} 有 ${props.lastCollectionRun.failedSteps} 个失败步骤。`,
      tone: 'warning',
      statusLabel: `${props.lastCollectionRun.failedSteps} failed`,
      primaryLabel: '再跑一次',
      primaryAction: props.onRunLastCollection,
      secondaryLabel: 'Collections',
      secondaryAction: props.onOpenCollections
    });
  } else if (counts.collections > 0 && !props.lastCollectionRun) {
    tasks.push({
      id: 'run-first-collection',
      title: '运行第一个 Collection',
      detail: `当前已有 ${counts.collections} 个 Collection，但还没有运行记录。`,
      tone: 'neutral',
      statusLabel: '未运行',
      primaryLabel: '打开 Collections',
      primaryAction: props.onOpenCollections
    });
  }

  if (props.gitStatus?.isRepo && (props.gitStatus.dirty || props.gitStatus.ahead > 0 || props.gitStatus.behind > 0 || props.gitRisks.length > 0)) {
    tasks.push({
      id: 'check-sync',
      title: '确认同步前状态',
      detail:
        props.gitRisks.length > 0
          ? props.gitRisks[0].title
          : `当前分支 ${props.gitStatus.branch || 'detached'}，先确认工作树再同步。`,
      tone: props.gitRisks.length > 0 || props.gitStatus.behind > 0 ? 'warning' : 'success',
      statusLabel: props.gitRisks.length > 0 ? `${props.gitRisks.length} risks` : '可检查',
      primaryLabel: '刷新 Git 状态',
      primaryAction: props.onRefreshGit,
      secondaryLabel: '复制 commit',
      secondaryAction: props.onCopySuggestedCommitMessage
    });
  }

  if (tasks.length === 0) {
    if (props.lastCollectionRun) {
      tasks.push({
        id: 'rerun-collection',
        title: '继续最近 Collection',
        detail: `${props.lastCollectionRun.collectionName} 最近运行于 ${displayLabel(props.lastCollectionRun.finishedAt)}。`,
        tone: 'success',
        statusLabel: props.lastCollectionRun.status,
        primaryLabel: '再跑一次',
        primaryAction: props.onRunLastCollection,
        secondaryLabel: 'Collections',
        secondaryAction: props.onOpenCollections
      });
    } else if (props.recentSuccess) {
      tasks.push({
        id: 'continue-request',
        title: '继续最近成功请求',
        detail: `${props.recentSuccess.requestName} 最近成功发送于 ${displayLabel(props.recentSuccess.timestamp)}。`,
        tone: 'success',
        statusLabel: `${props.recentSuccess.status}`,
        primaryLabel: '打开请求',
        primaryAction: props.onOpenLastSuccessfulRequest,
        secondaryLabel: 'History',
        secondaryAction: props.onOpenHistory
      });
    } else {
      tasks.push({
        id: 'open-repair',
        title: '检查可运行请求',
        detail: '当前没有明显阻塞，但还没有最近成功记录。',
        tone: 'neutral',
        statusLabel: '待确认',
        primaryLabel: runnableCount > 0 ? '打开可运行请求' : '打开 Import Tasks',
        primaryAction: runnableCount > 0 ? props.onOpenFirstRunnable : props.onOpenRepair,
        secondaryLabel: '环境中心',
        secondaryAction: props.onOpenEnvironmentCenter
      });
    }
  }

  const nextTask = tasks[0];
  const remainingTasks = tasks.slice(1, 5);
  const showRecentRequest = Boolean(props.recentSuccess || runnableCount > 0);
  const showCollections = Boolean(props.lastCollectionRun || counts.collections > 0 || counts.cases > 0);
  const showResumePanel = showRecentRequest || showCollections;
  const showSync = Boolean(
    props.gitStatus?.isRepo && (props.gitStatus.dirty || props.gitStatus.ahead > 0 || props.gitStatus.behind > 0 || props.gitRisks.length > 0)
  );
  const workspacePulse = workspacePulseCopy(counts);
  const importPulse = props.importSession
    ? `最近导入 ${props.importSession.importedRequestCount} 个请求${blockingCount > 0 ? `，还有 ${blockingCount} 个阻塞项` : warningCount > 0 ? `，还有 ${warningCount} 个提醒` : ''}。`
    : counts.requests > 0
      ? '继续从工作区里已有的请求、Case 和 Collection 往前推进。'
      : '先把第一个工作区资产导进来，再开始调试。';

  return (
    <section className="workspace-main workspace-home">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">{props.workspace.project.name}</span>
          <span className="breadcrumb-chip">Workbench</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" leftSection={<IconUpload size={14} />} onClick={props.onOpenImport}>
            导入 API
          </Button>
          <Button size="xs" variant="default" leftSection={<IconLifebuoy size={14} />} onClick={props.onOpenRepair}>
            Import Tasks
          </Button>
        </div>
      </div>

      <div className="workspace-home-scroll">
        {!hasWorkspaceContent ? (
          <div className="workspace-home-empty">
            <div>
              <Text className="section-kicker">Workbench</Text>
              <h2 className="workspace-home-empty-title">当前工作区还没有请求资产</h2>
              <Text size="sm" c="dimmed">
                先导入 API 规范，再开始调试。
              </Text>
            </div>
            <div className="workspace-home-empty-actions">
              <Button leftSection={<IconUpload size={16} />} onClick={props.onOpenImport}>
                导入 API
              </Button>
              <Button variant="default" leftSection={<IconPlugConnected size={16} />} onClick={props.onOpenEnvironmentCenter}>
                打开环境中心
              </Button>
            </div>
          </div>
        ) : (
          <div className="workspace-home-shell">
            <div className="workspace-home-context-strip">
              <div className="workspace-home-context-copy">
                <Text className="section-kicker">当前节奏</Text>
                <Text size="sm" c="dimmed">
                  {importPulse}
                </Text>
              </div>
              <div className="workspace-home-context-tags">
                <span className="workspace-home-context-tag">{workspacePulse}</span>
                {props.gitStatus?.isRepo ? (
                  <span className={`workspace-home-context-tag is-${gitStatusTone(props.gitStatus)}`}>
                    {props.gitStatus.branch || 'detached'}
                    {props.gitStatus.dirty ? ` · ${props.gitStatus.changedFiles.length} 改动` : ''}
                    {props.gitStatus.behind > 0 ? ` · 落后 ${props.gitStatus.behind}` : ''}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="workspace-home-next-card">
              <div className="workspace-home-next-head">
                <Text className="section-kicker">当前下一步</Text>
                <span className={`workspace-home-task-status is-${nextTask.tone}`}>{nextTask.statusLabel}</span>
              </div>
              <h2 className="workspace-home-next-title">{nextTask.title}</h2>
              <Text size="sm" c="dimmed">
                {nextTask.detail}
              </Text>
              <div className="workspace-home-next-actions">
                <Button
                  leftSection={
                    nextTask.id === 'import-api' ? <IconUpload size={16} /> : nextTask.id === 'check-sync' ? <IconGitBranch size={16} /> : nextTask.id.includes('collection') ? (
                      <IconFolders size={16} />
                    ) : nextTask.id === 'repair-import' ? (
                      <IconAlertTriangle size={16} />
                    ) : (
                      <IconPlayerPlay size={16} />
                    )
                  }
                  onClick={nextTask.primaryAction}
                >
                  {nextTask.primaryLabel}
                </Button>
                {nextTask.secondaryLabel && nextTask.secondaryAction ? (
                  <Button variant="default" onClick={nextTask.secondaryAction}>
                    {nextTask.secondaryLabel}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="workspace-home-layout is-single">
              {remainingTasks.length > 0 ? (
                <div className="workspace-home-panel">
                  <div className="workspace-home-panel-head">
                    <div>
                      <Text className="section-kicker">待处理</Text>
                      <h3 className="section-title">接下来要做的事</h3>
                    </div>
                  </div>
                  <div className="workspace-home-task-list">
                    {remainingTasks.map(task => (
                      <div key={task.id} className="workspace-home-task-row">
                        <div className="workspace-home-task-main">
                          <div className="workspace-home-task-line">
                            <Text fw={700} size="sm">
                              {task.title}
                            </Text>
                            <span className={`workspace-home-task-status is-${task.tone}`}>{task.statusLabel}</span>
                          </div>
                          <Text size="sm" c="dimmed">
                            {task.detail}
                          </Text>
                        </div>
                        <div className="workspace-home-task-actions">
                          <Button size="xs" variant="default" onClick={task.primaryAction}>
                            {task.primaryLabel}
                          </Button>
                          {task.secondaryLabel && task.secondaryAction ? (
                            <Button size="xs" variant="subtle" onClick={task.secondaryAction}>
                              {task.secondaryLabel}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {showResumePanel ? (
                <div className="workspace-home-panel">
                  <div className="workspace-home-panel-head">
                    <div>
                      <Text className="section-kicker">继续工作</Text>
                      <h3 className="section-title">从最近的有效结果继续</h3>
                    </div>
                  </div>
                  <div className="workspace-home-continue-grid">
                    {showRecentRequest ? (
                      <div className="workspace-home-side-card">
                        <div className="workspace-home-mini-head">
                          <Text className="workspace-home-mini-title">最近请求</Text>
                          <Button size="xs" variant="subtle" rightSection={<IconArrowRight size={12} />} onClick={props.onOpenHistory}>
                            History
                          </Button>
                        </div>
                        {props.recentSuccess ? (
                          <>
                            <Group gap="xs">
                              <Badge color="teal" variant="light">
                                {props.recentSuccess.status}
                              </Badge>
                              <Badge color="gray" variant="light">
                                {props.recentSuccess.durationMs} ms
                              </Badge>
                            </Group>
                            <Text fw={700}>{props.recentSuccess.requestName}</Text>
                            <Text size="sm" c="dimmed">
                              {displayLabel(props.recentSuccess.timestamp)}
                            </Text>
                            <Button size="xs" variant="default" onClick={props.onOpenLastSuccessfulRequest}>
                              打开请求
                            </Button>
                          </>
                        ) : (
                          <>
                            <Text size="sm" c="dimmed">
                              还没有成功请求记录。
                            </Text>
                            <Button size="xs" variant="default" onClick={props.onOpenFirstRunnable}>
                              打开可运行请求
                            </Button>
                          </>
                        )}
                      </div>
                    ) : null}

                    {showCollections ? (
                      <div className="workspace-home-side-card">
                        <div className="workspace-home-mini-head">
                          <Text className="workspace-home-mini-title">最近 Collection</Text>
                          <Button size="xs" variant="subtle" rightSection={<IconArrowRight size={12} />} onClick={props.onOpenCollections}>
                            Collections
                          </Button>
                        </div>
                        {props.lastCollectionRun ? (
                          <>
                            <Group gap="xs">
                              <Badge color={props.lastCollectionRun.failedSteps > 0 ? 'orange' : 'teal'} variant="light">
                                {props.lastCollectionRun.status}
                              </Badge>
                              <Badge color="gray" variant="light">
                                {props.lastCollectionRun.failedSteps} failed
                              </Badge>
                            </Group>
                            <Text fw={700}>{props.lastCollectionRun.collectionName}</Text>
                            <Text size="sm" c="dimmed">
                              {displayLabel(props.lastCollectionRun.finishedAt)}
                            </Text>
                            <Button size="xs" variant="default" onClick={props.onRunLastCollection}>
                              再跑一次
                            </Button>
                          </>
                        ) : (
                          <>
                            <Text size="sm" c="dimmed">
                              {counts.collections > 0
                                ? `已有 ${counts.collections} 个 Collection，尚未运行。`
                                : `已有 ${counts.cases} 个 Case，尚未组成 Collection。`}
                            </Text>
                            <Button size="xs" variant="default" onClick={props.onOpenCollections}>
                              打开 Collections
                            </Button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {showSync ? (
                <div className="workspace-home-panel">
                  <div className="workspace-home-panel-head">
                    <div>
                      <Text className="section-kicker">同步前检查</Text>
                      <h3 className="section-title">只保留真正影响下一步的 Git 信息</h3>
                    </div>
                    <Badge color={gitStatusTone(props.gitStatus)} variant="light">
                      {props.gitStatus?.branch || 'detached'}
                    </Badge>
                  </div>
                  <div className="workspace-home-sync-strip">
                    <div className="summary-chip">
                      <span>Dirty</span>
                      <strong>{props.gitStatus?.dirty ? props.gitStatus.changedFiles.length : 0}</strong>
                    </div>
                    <div className="summary-chip">
                      <span>Ahead / Behind</span>
                      <strong>{`${props.gitStatus?.ahead || 0} / ${props.gitStatus?.behind || 0}`}</strong>
                    </div>
                  </div>
                  {props.gitRisks.length > 0 ? (
                    <div className="workspace-home-risk-stack">
                      {props.gitRisks.slice(0, 2).map(risk => (
                        <div key={risk.id} className="workspace-home-risk-row">
                          <Text fw={700} size="sm">
                            {risk.title}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {risk.description}
                          </Text>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="workspace-home-task-actions">
                    <Button size="xs" variant="default" onClick={props.onRefreshGit}>
                      刷新状态
                    </Button>
                    <Button size="xs" variant="subtle" onClick={props.onCopySuggestedCommitMessage}>
                      复制 commit
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
