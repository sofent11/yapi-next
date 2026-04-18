export type GitSyncStatus = {
  isRepo: boolean;
  dirty: boolean;
  ahead: number;
  behind: number;
  changedFiles: string[];
};

export type SyncGuardState = {
  canPull: boolean;
  canPush: boolean;
  pullReason: string | null;
  pushReason: string | null;
  level: 'ready' | 'warning' | 'danger';
};

export type ImportJourneyInput = {
  hasImportSession: boolean;
  blockingCount: number;
  runnableCount: number;
  savedCaseCount: number;
  collectionCount: number;
};

export type ImportJourneyStep = {
  key: 'import' | 'repair' | 'send' | 'case' | 'collection';
  label: string;
  done: boolean;
};

export type ImportJourneyState = {
  steps: ImportJourneyStep[];
  nextStep: ImportJourneyStep['key'];
  progress: number;
};

export function evaluateSyncGuard(status: GitSyncStatus | null | undefined): SyncGuardState {
  if (!status?.isRepo) {
    return {
      canPull: false,
      canPush: false,
      pullReason: '当前工作区不是 Git 仓库，无法执行同步。',
      pushReason: '当前工作区不是 Git 仓库，无法执行同步。',
      level: 'warning'
    };
  }

  if (status.dirty) {
    return {
      canPull: false,
      canPush: status.behind === 0,
      pullReason: '本地存在未提交改动，先处理工作区变更再执行 Pull。',
      pushReason: status.behind > 0 ? '远端有新提交，先同步再执行 Push。' : null,
      level: 'danger'
    };
  }

  if (status.behind > 0) {
    return {
      canPull: true,
      canPush: false,
      pullReason: null,
      pushReason: '当前分支落后远端，先执行 Pull 再执行 Push。',
      level: 'warning'
    };
  }

  return {
    canPull: true,
    canPush: true,
    pullReason: null,
    pushReason: null,
    level: status.ahead > 0 ? 'warning' : 'ready'
  };
}

export function buildImportJourneyState(input: ImportJourneyInput): ImportJourneyState {
  const steps: ImportJourneyStep[] = [
    {
      key: 'import',
      label: '导入规范',
      done: input.hasImportSession
    },
    {
      key: 'repair',
      label: '修复阻塞项',
      done: input.hasImportSession && input.blockingCount === 0
    },
    {
      key: 'send',
      label: '首次发送成功',
      done: input.runnableCount > 0
    },
    {
      key: 'case',
      label: '沉淀为 Case',
      done: input.savedCaseCount > 0
    },
    {
      key: 'collection',
      label: '加入 Collection',
      done: input.collectionCount > 0
    }
  ];

  const nextStep = steps.find(step => !step.done)?.key || 'collection';
  const progress = Math.round((steps.filter(step => step.done).length / steps.length) * 100);

  return {
    steps,
    nextStep,
    progress
  };
}
