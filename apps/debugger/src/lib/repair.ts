import { inspectResolvedRequest } from '@yapi-debugger/core';
import type {
  CaseDocument,
  EnvironmentDocument,
  ImportWarning,
  ProjectDocument,
  RequestDocument
} from '@yapi-debugger/schema';

export type RepairRequestRecord = {
  request: RequestDocument;
  cases: CaseDocument[];
};

export type ImportRepairTask = {
  id: string;
  severity: 'blocking' | 'warning' | 'info';
  category: 'variables' | 'auth' | 'script' | 'baseUrl' | 'conflict' | 'request';
  title: string;
  description: string;
  requestId?: string;
  requestName?: string;
};

export type ImportRepairChecklist = {
  tasks: ImportRepairTask[];
  missingVariables: string[];
  runnableRequestIds: string[];
  blockedRequestIds: string[];
  requestIds: string[];
  blockingCount: number;
  warningCount: number;
  hasAuthWork: boolean;
  hasScriptWarnings: boolean;
  firstBlockedRequestId: string | null;
  firstRunnableRequestId: string | null;
};

function upsertTask(tasks: ImportRepairTask[], task: ImportRepairTask) {
  if (tasks.some(item => item.id === task.id)) return;
  tasks.push(task);
}

export function buildImportRepairChecklist(input: {
  project: ProjectDocument;
  environment?: EnvironmentDocument | null;
  requests: RepairRequestRecord[];
  warnings?: ImportWarning[];
  conflictCount?: number;
}) {
  const tasks: ImportRepairTask[] = [];
  const missingVariables = new Set<string>();
  const runnableRequestIds: string[] = [];
  const blockedRequestIds: string[] = [];

  if (!input.project.runtime.baseUrl || input.project.runtime.baseUrl === 'https://api.example.com') {
    upsertTask(tasks, {
      id: 'repair:base-url',
      severity: 'warning',
      category: 'baseUrl',
      title: 'Review the workspace baseUrl',
      description: 'The imported workspace still points at a placeholder or empty baseUrl. Update it before relying on saved requests.'
    });
  }

  if ((input.conflictCount || 0) > 0) {
    upsertTask(tasks, {
      id: 'repair:conflicts',
      severity: 'warning',
      category: 'conflict',
      title: 'Review import conflicts',
      description: `${input.conflictCount} imported requests matched an existing name in the same folder. Confirm append vs replace behavior before cleaning up duplicates.`
    });
  }

  input.requests.forEach(record => {
    const insight = inspectResolvedRequest(
      input.project,
      record.request,
      undefined,
      input.environment || undefined
    );
    const blockingDiagnostics = insight.diagnostics.filter(item => item.blocking);
    const authDiagnostics = insight.diagnostics.filter(item => item.field === 'auth');
    const scriptDiagnostics = insight.diagnostics.filter(item => item.field === 'scripts');

    if (blockingDiagnostics.length === 0) {
      runnableRequestIds.push(record.request.id);
    } else {
      blockedRequestIds.push(record.request.id);
      upsertTask(tasks, {
        id: `repair:blocking:${record.request.id}`,
        severity: 'blocking',
        category: 'request',
        requestId: record.request.id,
        requestName: record.request.name,
        title: `Fix blockers in ${record.request.name}`,
        description: blockingDiagnostics.map(item => item.message).join(' ')
      });
    }

    insight.variables
      .filter(variable => variable.missing)
      .forEach(variable => {
        missingVariables.add(variable.token);
      });

    if (authDiagnostics.length > 0) {
      upsertTask(tasks, {
        id: `repair:auth:${record.request.id}`,
        severity: 'warning',
        category: 'auth',
        requestId: record.request.id,
        requestName: record.request.name,
        title: `Review auth for ${record.request.name}`,
        description: authDiagnostics.map(item => item.message).join(' ')
      });
    }

    if (scriptDiagnostics.length > 0) {
      upsertTask(tasks, {
        id: `repair:scripts:${record.request.id}`,
        severity: 'warning',
        category: 'script',
        requestId: record.request.id,
        requestName: record.request.name,
        title: `Review scripts for ${record.request.name}`,
        description: scriptDiagnostics.map(item => item.message).join(' ')
      });
    }
  });

  (input.warnings || []).forEach((warning, index) => {
    const category =
      warning.code?.includes('auth')
        ? 'auth'
        : warning.code?.includes('script') || warning.code?.includes('postman')
          ? 'script'
          : warning.code?.includes('base')
            ? 'baseUrl'
            : 'request';
    upsertTask(tasks, {
      id: `repair:warning:${warning.code || index}:${warning.requestName || 'workspace'}`,
      severity: warning.status === 'unsupported' ? 'warning' : warning.level === 'info' ? 'info' : 'warning',
      category,
      title: warning.requestName ? `${warning.requestName}` : 'Imported warning',
      description: warning.message,
      requestName: warning.requestName
    });
  });

  const severityWeight: Record<ImportRepairTask['severity'], number> = {
    blocking: 0,
    warning: 1,
    info: 2
  };
  const sortedTasks = [...tasks].sort((left: ImportRepairTask, right: ImportRepairTask) => {
    return severityWeight[left.severity] - severityWeight[right.severity] || left.title.localeCompare(right.title, 'zh-CN');
  });

  return {
    tasks: sortedTasks,
    missingVariables: [...missingVariables].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    runnableRequestIds,
    blockedRequestIds,
    requestIds: input.requests.map(item => item.request.id),
    blockingCount: sortedTasks.filter((task: ImportRepairTask) => task.severity === 'blocking').length,
    warningCount: sortedTasks.filter((task: ImportRepairTask) => task.severity === 'warning').length,
    hasAuthWork: sortedTasks.some((task: ImportRepairTask) => task.category === 'auth'),
    hasScriptWarnings: sortedTasks.some((task: ImportRepairTask) => task.category === 'script'),
    firstBlockedRequestId: blockedRequestIds[0] || null,
    firstRunnableRequestId: runnableRequestIds[0] || null
  } satisfies ImportRepairChecklist;
}
