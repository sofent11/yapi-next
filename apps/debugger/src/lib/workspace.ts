import {
  buildWorkspaceIndex,
  createProjectSeed,
  materializeEnvironmentDocument,
  materializeProjectDocument,
  materializeRequestDocuments,
  resolveRequest
} from '@yapi-debugger/core';
import {
  createId,
  createEmptyCase,
  createEmptyRequest,
  emptyParameterRow,
  importAuthSchema,
  slugify,
  type CaseDocument,
  type EnvironmentDocument,
  type ImportAuth,
  type ImportResult,
  type ProjectDocument,
  type RequestDocument,
  type WorkspaceIndex
} from '@yapi-debugger/schema';
import { importSourceText } from '@yapi-debugger/importers';
import {
  deleteEntry,
  fetchImportUrl,
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

export async function importIntoWorkspace(
  root: string,
  source: ImportSourcePayload
) {
  const result = importSourceText(source.content);
  const projectFile = materializeProjectDocument(result.project, root);
  await writeDocument(projectFile.path, projectFile.content);
  await Promise.all(result.environments.map((environment: EnvironmentDocument) => {
    const file = materializeEnvironmentDocument(environment, root);
    return writeDocument(file.path, file.content);
  }));
  const writes = materializeRequestDocuments(result.requests, root);
  await Promise.all(writes.map(item => writeDocument(item.path, item.content)));
  return result;
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
  const record = workspace.requests.find((item: WorkspaceIndex['requests'][number]) => item.request.id === requestId);
  if (!record) {
    throw new Error('请求不存在');
  }
  const caseDocument = record.cases.find((item: CaseDocument) => item.id === caseId);
  const environmentName = caseDocument?.environment || workspace.project.defaultEnvironment;
  const environment = workspace.environments.find(
    (item: WorkspaceIndex['environments'][number]) => item.document.name === environmentName
  )?.document;
  const input = resolveRequest(workspace.project, record.request, caseDocument, environment);
  return sendRequest(input);
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
