import {
  buildWorkspaceIndex,
  createProjectSeed,
  evaluateChecks,
  materializeEnvironmentDocument,
  materializeProjectDocument,
  materializeRequestDocuments,
  resolveRequest
} from '@yapi-debugger/core';
import {
  createDefaultEnvironment,
  createId,
  createEmptyCase,
  createEmptyRequest,
  emptyParameterRow,
  importAuthSchema,
  slugify,
  type CaseDocument,
  type CheckResult,
  type EnvironmentDocument,
  type ImportAuth,
  type ImportResult,
  type ProjectDocument,
  type RequestDocument,
  type ResolvedRequestPreview,
  type RunHistoryEntry,
  type WorkspaceIndex
} from '@yapi-debugger/schema';
import { importSourceText } from '@yapi-debugger/importers';
import {
  appendHistory,
  clearHistory,
  deleteEntry,
  fetchImportUrl,
  loadHistory,
  readImportFile,
  scanWorkspace,
  sendRequest,
  writeDocument,
  type ImportSourcePayload,
  type WorkspaceScanPayload
} from './desktop';

function scanPayloadToIndex(payload: WorkspaceScanPayload) {
  const map: Record<string, string> = {};
  payload.files.forEach(file => {
    map[file.path] = file.content;
  });
  const projectContent = map[`${payload.root}/project.yaml`] || '';
  return buildWorkspaceIndex({
    root: payload.root,
    projectContent,
    fileContents: map
  });
}

export async function openWorkspace(root: string) {
  const payload = await scanWorkspace(root);
  return scanPayloadToIndex(payload);
}

function requestKey(record: { request: RequestDocument; folderSegments: string[] }) {
  const folderPath = record.folderSegments.join('/');
  const methodPathKey = `${record.request.method}:${record.request.path || record.request.url || record.request.name}`;
  const folderNameKey = `${folderPath}:${slugify(record.request.name)}`;
  return { folderPath, methodPathKey, folderNameKey };
}

function conflictsWithRecord(
  left: { request: RequestDocument; folderSegments: string[] },
  right: { request: RequestDocument; folderSegments: string[] }
) {
  const leftKey = requestKey(left);
  const rightKey = requestKey(right);
  return leftKey.methodPathKey === rightKey.methodPathKey || leftKey.folderNameKey === rightKey.folderNameKey;
}

function ensureUniqueRequestName(
  request: RequestDocument,
  folderSegments: string[],
  existingRecords: Array<{ request: RequestDocument; folderSegments: string[] }>
) {
  const siblingNames = existingRecords
    .filter(record => record.folderSegments.join('/') === folderSegments.join('/'))
    .map(record => record.request.name);
  const nextName = uniqueCopyName(request.name, siblingNames);
  return nextName === request.name ? request : { ...request, name: nextName };
}

export type ImportConflictStrategy = 'append' | 'replace';

export type ImportApplySummary = {
  added: number;
  updated: number;
  skipped: number;
  failed: number;
};

export type ImportPreviewSummary = {
  source: ImportResult;
  conflicts: Array<{
    importedRequestId: string;
    importedName: string;
    targetName: string;
    folderPath: string;
  }>;
};

export async function createWorkspace(root: string, projectName: string) {
  const seed = createProjectSeed({ projectName, includeSampleRequest: true });
  await Promise.all(
    seed.writes.map(item => writeDocument(`${root}/${item.path}`, item.content))
  );
  return openWorkspace(root);
}

export async function saveEnvironment(root: string, environment: EnvironmentDocument) {
  const file = materializeEnvironmentDocument(environment, root);
  await writeDocument(file.path, file.content);
}

export async function saveProject(root: string, project: ProjectDocument) {
  const file = materializeProjectDocument(project, root);
  await writeDocument(file.path, file.content);
}

export async function saveRequestRecord(
  root: string,
  folderSegments: string[],
  request: RequestDocument,
  cases: CaseDocument[],
  previousResourceDirPath?: string,
  previousRequestFilePath?: string
) {
  if (previousResourceDirPath) {
    await deleteEntry(previousResourceDirPath, true).catch(() => undefined);
  }
  if (previousRequestFilePath) {
    await deleteEntry(previousRequestFilePath, false).catch(() => undefined);
  }

  const writes = materializeRequestDocuments([{ folderSegments, request, cases }], root);
  await Promise.all(writes.map(item => writeDocument(item.path, item.content)));
}

export async function createRequestInWorkspace(root: string, folderSegments: string[]) {
  const request = createEmptyRequest('New Request');
  request.headers = [
    {
      ...emptyParameterRow(),
      name: 'Accept',
      value: 'application/json'
    }
  ];
  await saveRequestRecord(root, folderSegments, request, []);
  return request.id;
}

export async function createCaseForRequest(
  root: string,
  folderSegments: string[],
  request: RequestDocument,
  cases: CaseDocument[]
) {
  const nextCase = createEmptyCase(request.id, `Case ${cases.length + 1}`);
  await saveRequestRecord(root, folderSegments, request, [...cases, nextCase]);
  return nextCase.id;
}

function uniqueCopyName(baseName: string, existingNames: string[]) {
  const existing = new Set(existingNames.map(name => slugify(name)));
  if (!existing.has(slugify(baseName))) {
    return baseName;
  }

  let index = 2;
  while (existing.has(slugify(`${baseName} ${index}`))) {
    index += 1;
  }
  return `${baseName} ${index}`;
}

export async function renameRequestInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  nextName: string
) {
  await saveRequestRecord(
    root,
    record.folderSegments,
    {
      ...record.request,
      name: nextName
    },
    record.cases,
    record.resourceDirPath,
    record.requestFilePath
  );
}

export async function duplicateRequestInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  siblingNames: string[]
) {
  const nextRequest = structuredClone(record.request);
  nextRequest.id = createId('req');
  nextRequest.name = uniqueCopyName(`${record.request.name} 副本`, siblingNames);

  const nextCases = record.cases.map(caseItem => {
    const nextCase = structuredClone(caseItem);
    nextCase.id = createId('case');
    nextCase.extendsRequest = nextRequest.id;
    return nextCase;
  });

  await saveRequestRecord(root, record.folderSegments, nextRequest, nextCases);
  return nextRequest.id;
}

export async function deleteRequestInWorkspace(record: WorkspaceIndex['requests'][number]) {
  await Promise.all([
    deleteEntry(record.resourceDirPath, true).catch(() => undefined),
    deleteEntry(record.requestFilePath, false).catch(() => undefined)
  ]);
}

export async function renameCaseInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  caseId: string,
  nextName: string
) {
  await saveRequestRecord(
    root,
    record.folderSegments,
    record.request,
    record.cases.map(caseItem =>
      caseItem.id === caseId
        ? {
            ...caseItem,
            name: nextName
          }
        : caseItem
    ),
    record.resourceDirPath,
    record.requestFilePath
  );
}

export async function duplicateCaseInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  caseId: string
) {
  const sourceCase = record.cases.find(caseItem => caseItem.id === caseId);
  if (!sourceCase) {
    throw new Error('用例不存在');
  }

  const nextCase = structuredClone(sourceCase);
  nextCase.id = createId('case');
  nextCase.name = uniqueCopyName(
    `${sourceCase.name} 副本`,
    record.cases.map(caseItem => caseItem.name)
  );

  await saveRequestRecord(
    root,
    record.folderSegments,
    record.request,
    [...record.cases, nextCase],
    record.resourceDirPath,
    record.requestFilePath
  );
  return nextCase.id;
}

export async function deleteCaseInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  caseId: string
) {
  await saveRequestRecord(
    root,
    record.folderSegments,
    record.request,
    record.cases.filter(caseItem => caseItem.id !== caseId),
    record.resourceDirPath,
    record.requestFilePath
  );
}

export async function renameCategoryInWorkspace(
  root: string,
  workspace: WorkspaceIndex,
  currentPath: string,
  nextPath: string
) {
  const currentSegments = currentPath.split('/').filter(Boolean);
  const nextSegments = nextPath.split('/').filter(Boolean);
  const targets = workspace.requests.filter(record => {
    const path = record.folderSegments.join('/');
    return path === currentPath || path.startsWith(`${currentPath}/`);
  });

  await Promise.all(
    targets.map(record =>
      saveRequestRecord(
        root,
        [...nextSegments, ...record.folderSegments.slice(currentSegments.length)],
        record.request,
        record.cases,
        record.resourceDirPath,
        record.requestFilePath
      )
    )
  );
}

export async function deleteCategoryInWorkspace(workspace: WorkspaceIndex, currentPath: string) {
  const targets = workspace.requests.filter(record => {
    const path = record.folderSegments.join('/');
    return path === currentPath || path.startsWith(`${currentPath}/`);
  });

  await Promise.all(targets.map(record => deleteRequestInWorkspace(record)));
}

export function buildImportPreviewSummary(workspace: WorkspaceIndex, preview: ImportResult): ImportPreviewSummary {
  const conflicts = preview.requests.flatMap(imported => {
    const target = workspace.requests.find(record => conflictsWithRecord(record, imported));
    return target
      ? [
          {
            importedRequestId: imported.request.id,
            importedName: imported.request.name,
            targetName: target.request.name,
            folderPath: imported.folderSegments.join('/')
          }
        ]
      : [];
  });

  return {
    source: preview,
    conflicts
  };
}

export async function importIntoWorkspace(
  root: string,
  source: ImportSourcePayload,
  workspace: WorkspaceIndex,
  strategy: ImportConflictStrategy = 'append'
) {
  const result = importSourceText(source.content);
  const summary: ImportApplySummary = {
    added: 0,
    updated: 0,
    skipped: 0,
    failed: 0
  };

  const nextProject = {
    ...workspace.project,
    runtime: {
      ...workspace.project.runtime,
      baseUrl: result.project.runtime.baseUrl || workspace.project.runtime.baseUrl
    }
  };
  const projectFile = materializeProjectDocument(nextProject, root);
  await writeDocument(projectFile.path, projectFile.content);

  const nextEnvironments = new Map<string, EnvironmentDocument>();
  workspace.environments.forEach(item => {
    nextEnvironments.set(item.document.name, item.document);
  });
  result.environments.forEach(environment => {
    const current = nextEnvironments.get(environment.name);
    nextEnvironments.set(
      environment.name,
      current
        ? {
            ...current,
            vars: strategy === 'replace' ? environment.vars : { ...current.vars, ...environment.vars },
            headers: strategy === 'replace' ? environment.headers : [...current.headers, ...environment.headers],
            authProfiles:
              strategy === 'replace'
                ? environment.authProfiles
                : [...current.authProfiles, ...environment.authProfiles.filter(profile => !current.authProfiles.some(item => item.name === profile.name))]
          }
        : environment
    );
  });
  if (!nextEnvironments.has('shared')) {
    nextEnvironments.set('shared', createDefaultEnvironment('shared'));
  }

  await Promise.all(
    [...nextEnvironments.values()].map(environment => {
      const file = materializeEnvironmentDocument(environment, root);
      return writeDocument(file.path, file.content);
    })
  );

  const incomingRecords = result.requests.map(record => ({
    ...record,
    request: {
      ...record.request,
      name: record.request.name.trim() || 'Imported Request'
    }
  }));
  const nextRecords: typeof incomingRecords = [];
  const deleteTargets: WorkspaceIndex['requests'] = [];
  for (const imported of incomingRecords) {
    const target = workspace.requests.find(record => conflictsWithRecord(record, imported));
    if (!target) {
      summary.added += 1;
      nextRecords.push({
        ...imported,
        request: ensureUniqueRequestName(imported.request, imported.folderSegments, [...workspace.requests, ...nextRecords])
      });
      continue;
    }

    if (strategy === 'replace') {
      summary.updated += 1;
      deleteTargets.push(target);
      nextRecords.push(imported);
      continue;
    }

    summary.added += 1;
    nextRecords.push({
      ...imported,
      request: ensureUniqueRequestName(imported.request, imported.folderSegments, [...workspace.requests, ...nextRecords])
    });
  }

  await Promise.all(deleteTargets.map(record => deleteRequestInWorkspace(record)));
  const writes = materializeRequestDocuments(nextRecords, root);
  await Promise.all(writes.map(item => writeDocument(item.path, item.content)));
  return { result, summary };
}

export async function importFromFile(path: string) {
  const source = await readImportFile(path);
  return {
    source,
    result: importSourceText(source.content)
  };
}

export async function importFromUrl(url: string, auth: ImportAuth) {
  const parsedAuth = importAuthSchema.parse(auth);
  const source = await fetchImportUrl(url, parsedAuth);
  return {
    source,
    result: importSourceText(source.content)
  };
}

function resolveRunContext(workspace: WorkspaceIndex, requestId: string, caseId?: string) {
  const record = workspace.requests.find((item: WorkspaceIndex['requests'][number]) => item.request.id === requestId);
  if (!record) {
    throw new Error('请求不存在');
  }
  const caseDocument = record.cases.find((item: CaseDocument) => item.id === caseId);
  const environmentName = caseDocument?.environment || workspace.project.defaultEnvironment;
  const environment = workspace.environments.find(
    (item: WorkspaceIndex['environments'][number]) => item.document.name === environmentName
  )?.document;
  const preview = resolveRequest(workspace.project, record.request, caseDocument, environment);
  return { record, caseDocument, preview };
}

export async function runResolvedRequest(workspace: WorkspaceIndex, requestId: string, caseId?: string) {
  const { record, caseDocument, preview } = resolveRunContext(workspace, requestId, caseId);
  const response = await sendRequest(preview);
  const checkResults = caseDocument ? evaluateChecks(response, caseDocument.checks || []) : [];
  return {
    preview,
    response,
    checkResults,
    caseDocument,
    record
  };
}

export function previewResolvedRequest(workspace: WorkspaceIndex, requestId: string, caseId?: string): ResolvedRequestPreview {
  return resolveRunContext(workspace, requestId, caseId).preview;
}

export async function saveRunHistory(
  workspace: WorkspaceIndex,
  requestId: string,
  caseId: string | undefined,
  preview: ResolvedRequestPreview,
  response: Awaited<ReturnType<typeof sendRequest>>,
  checkResults: CheckResult[]
) {
  const record = workspace.requests.find(item => item.request.id === requestId);
  const caseDocument = record?.cases.find(item => item.id === caseId);
  if (!record) return;

  const entry: RunHistoryEntry = {
    id: createId('run'),
    workspaceRoot: workspace.root,
    requestId,
    requestName: record.request.name,
    caseId,
    caseName: caseDocument?.name,
    environmentName: preview.environmentName,
    request: preview,
    response,
    checkResults
  };
  await appendHistory(entry);
}

export async function loadRunHistory(workspaceRoot?: string) {
  return loadHistory(workspaceRoot);
}

export async function clearRunHistory(workspaceRoot?: string) {
  return clearHistory(workspaceRoot);
}

export function createImportAuth(mode: ImportAuth['mode'] = 'none'): ImportAuth {
  return {
    mode,
    token: '',
    key: '',
    value: ''
  };
}

export function emptyImportResult(): ImportResult {
  return {
    detectedFormat: 'unknown',
    summary: {
      requests: 0,
      folders: 0,
      environments: 0
    },
    project: {
      schemaVersion: 1,
      name: 'Untitled',
      defaultEnvironment: 'shared',
      labels: [],
      runtime: {
        baseUrl: 'https://api.example.com',
        vars: {},
        headers: [],
        description: ''
      }
    },
    environments: [],
    requests: []
  };
}
