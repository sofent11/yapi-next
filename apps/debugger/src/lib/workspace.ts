import {
  buildWorkspaceIndex,
  createProjectSeed,
  materializeEnvironmentDocument,
  materializeProjectDocument,
  materializeRequestDocuments,
  resolveRequest
} from '@yapi-debugger/core';
import {
  createEmptyCase,
  createEmptyRequest,
  emptyParameterRow,
  importAuthSchema,
  type CaseDocument,
  type EnvironmentDocument,
  type ImportAuth,
  type ImportResult,
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
  const input = resolveRequest(record.request, caseDocument, environment);
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
      labels: []
    },
    environments: [],
    requests: []
  };
}
