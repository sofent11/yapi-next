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
  type SendRequestResult,
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

export type ImportPreviewSummary = {
  format: string;
  endpoints: number;
  folders: number;
  environments: number;
  conflicts: number;
};

export function buildImportPreviewSummary(
  workspace: WorkspaceIndex,
  result: ImportResult
): ImportPreviewSummary {
  let conflicts = 0;
  result.requests.forEach(imported => {
    const existing = workspace.requests.find(record =>
      conflictsWithRecord(record, imported)
    );
    if (existing) conflicts += 1;
  });

  return {
    format: result.detectedFormat,
    endpoints: result.requests.length,
    folders: result.requests.reduce((set, req) => {
      set.add(req.folderSegments.join('/'));
      return set;
    }, new Set<string>()).size,
    environments: result.environments.length,
    conflicts
  };
}

function conflictsWithRecord(
  existing: WorkspaceIndex['requests'][number],
  imported: ImportResult['requests'][number]
) {
  return (
    existing.request.name === imported.request.name &&
    existing.folderSegments.join('/') === imported.folderSegments.join('/')
  );
}

export async function importIntoWorkspace(
  workspace: WorkspaceIndex,
  result: ImportResult,
  strategy: 'append' | 'replace'
) {
  const root = workspace.root;
  const nextRecords: ImportResult['requests'] = [];
  const deleteTargets: WorkspaceIndex['requests'][number][] = [];

  for (const imported of result.requests) {
    const target = workspace.requests.find(record => conflictsWithRecord(record, imported));
    if (!target) {
      nextRecords.push(imported);
      continue;
    }

    if (strategy === 'replace') {
      deleteTargets.push(target);
      nextRecords.push(imported);
    } else {
      nextRecords.push(imported);
    }
  }

  await Promise.all(deleteTargets.map(record => deleteRequestInWorkspace(record)));
  const writes = materializeRequestDocuments(nextRecords, root);
  await Promise.all(writes.map(item => writeDocument(item.path, item.content)));
}

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
  request: RequestDocument,
  cases: CaseDocument[],
  previousResourceDirPath?: string,
  previousRequestFilePath?: string,
  folderSegments: string[] = []
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

export async function createRequestInWorkspace(root: string, folderPath: string | null) {
  const folderSegments = folderPath ? folderPath.split('/').filter(Boolean) : [];
  const request = createEmptyRequest('New Request');
  request.headers = [
    {
      ...emptyParameterRow(),
      name: 'Accept',
      value: 'application/json',
      enabled: true,
      kind: 'text'
    }
  ];
  await saveRequestRecord(root, request, [], undefined, undefined, folderSegments);
  return request.id;
}

export async function createCaseForRequest(
  root: string,
  workspace: WorkspaceIndex,
  requestId: string
) {
  const record = workspace.requests.find(r => r.request.id === requestId);
  if (!record) throw new Error('Request not found');
  const nextCase = createEmptyCase(requestId, `Case ${record.cases.length + 1}`);
  await saveRequestRecord(
    root,
    record.request,
    [...record.cases, nextCase],
    record.resourceDirPath,
    record.requestFilePath,
    record.folderSegments
  );
  return { requestId, caseId: nextCase.id };
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
    {
      ...record.request,
      name: nextName
    },
    record.cases,
    record.resourceDirPath,
    record.requestFilePath,
    record.folderSegments
  );
}

export async function duplicateRequestInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  siblingNames: string[]
) {
  const nextRequest = structuredClone(record.request);
  nextRequest.id = createId('req');
  nextRequest.name = uniqueCopyName(`${record.request.name} Copy`, siblingNames);

  const nextCases = record.cases.map(caseItem => {
    const nextCase = structuredClone(caseItem);
    nextCase.id = createId('case');
    nextCase.extendsRequest = nextRequest.id;
    return nextCase;
  });

  await saveRequestRecord(root, nextRequest, nextCases, undefined, undefined, record.folderSegments);
  return nextRequest.id;
}

export async function deleteRequestInWorkspace(record: WorkspaceIndex['requests'][number]) {
  if (record.resourceDirPath) {
    await deleteEntry(record.resourceDirPath, true);
  }
  if (record.requestFilePath) {
    await deleteEntry(record.requestFilePath, false);
  }
}

export async function renameCategoryInWorkspace(
  root: string,
  workspace: WorkspaceIndex,
  oldPath: string,
  nextPath: string
) {
  const affected = workspace.requests.filter(r => r.folderSegments.join('/').startsWith(oldPath));
  const newSegments = nextPath.split('/').filter(Boolean);
  const oldSegmentsCount = oldPath.split('/').filter(Boolean).length;

  for (const record of affected) {
    const relativeSegments = record.folderSegments.slice(oldSegmentsCount);
    const targetSegments = [...newSegments, ...relativeSegments];
    await saveRequestRecord(
      root,
      record.request,
      record.cases,
      record.resourceDirPath,
      record.requestFilePath,
      targetSegments
    );
  }
}

export async function deleteCategoryInWorkspace(workspace: WorkspaceIndex, path: string) {
  const affected = workspace.requests.filter(r => r.folderSegments.join('/').startsWith(path));
  for (const record of affected) {
    await deleteRequestInWorkspace(record);
  }
}

export async function renameCaseInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  caseId: string,
  nextName: string
) {
  const nextCases = record.cases.map(c => (c.id === caseId ? { ...c, name: nextName } : c));
  await saveRequestRecord(
    root,
    record.request,
    nextCases,
    record.resourceDirPath,
    record.requestFilePath,
    record.folderSegments
  );
}

export async function duplicateCaseInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  caseId: string
) {
  const sourceCase = record.cases.find(c => c.id === caseId);
  if (!sourceCase) throw new Error('Case not found');
  const nextCase = structuredClone(sourceCase);
  nextCase.id = createId('case');
  nextCase.name = uniqueCopyName(`${sourceCase.name} Copy`, record.cases.map(c => c.name));
  await saveRequestRecord(
    root,
    record.request,
    [...record.cases, nextCase],
    record.resourceDirPath,
    record.requestFilePath,
    record.folderSegments
  );
  return nextCase.id;
}

export async function deleteCaseInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  caseId: string
) {
  const nextCases = record.cases.filter(c => c.id !== caseId);
  await saveRequestRecord(
    root,
    record.request,
    nextCases,
    record.resourceDirPath,
    record.requestFilePath,
    record.folderSegments
  );
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

export async function runResolvedRequest(workspace: WorkspaceIndex, requestId: string, caseId?: string) {
  const record = workspace.requests.find(r => r.request.id === requestId);
  if (!record) throw new Error('Request not found');
  const caseDocument = record.cases.find(c => c.id === caseId);
  const envName = caseDocument?.environment || workspace.project.defaultEnvironment;
  const env = workspace.environments.find(e => e.document.name === envName)?.document;
  const preview = resolveRequest(workspace.project, record.request, caseDocument, env);
  const response = await sendRequest(preview);
  const checkResults = caseDocument ? evaluateChecks(response, caseDocument.checks || []) : [];
  return { preview, response, checkResults };
}

export async function saveRunHistory(
  workspace: WorkspaceIndex,
  requestId: string,
  caseId: string | undefined,
  preview: ResolvedRequestPreview,
  response: SendRequestResult,
  checkResults: CheckResult[]
) {
  const record = workspace.requests.find(r => r.request.id === requestId);
  if (!record) return;
  const caseDoc = record.cases.find(c => c.id === caseId);
  const entry: RunHistoryEntry = {
    id: createId('run'),
    workspaceRoot: workspace.root,
    requestId,
    requestName: record.request.name,
    caseId,
    caseName: caseDoc?.name,
    environmentName: preview.environmentName,
    request: preview,
    response,
    checkResults
  };
  await appendHistory(entry);
}

export async function clearRunHistory(root: string) {
  await clearHistory(root);
}

export async function loadRunHistory(root: string): Promise<RunHistoryEntry[]> {
  return loadHistory(root);
}
