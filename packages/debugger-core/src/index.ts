import YAML from 'yaml';
import {
  BODY_SIDECAR_THRESHOLD,
  CASE_SUFFIX,
  DEFAULT_GITIGNORE,
  LOCAL_ENV_SUFFIX,
  REQUEST_SUFFIX,
  authConfigSchema,
  caseDocumentSchema,
  createDefaultEnvironment,
  createDefaultProject,
  emptyParameterRow,
  environmentDocumentSchema,
  projectDocumentSchema,
  requestBodySchema,
  requestDocumentSchema,
  slugify,
  type AuthConfig,
  type CaseDocument,
  type EnvironmentDocument,
  type ParameterRow,
  type ProjectDocument,
  type RequestBody,
  type RequestDocument,
  type ResponseExample,
  type SendRequestInput,
  type WorkspaceEnvironmentRecord,
  type WorkspaceIndex,
  type WorkspaceRequestRecord
} from '@yapi-debugger/schema';

export type FileEntry = {
  path: string;
  name: string;
  kind: 'file' | 'dir';
  children?: FileEntry[];
};

export type WorkspaceFileWrite = {
  path: string;
  content: string;
};

export type ProjectSeed = {
  projectName: string;
  includeSampleRequest?: boolean;
};

export type ResolvedRequest = SendRequestInput & {
  name: string;
  environmentName?: string;
};

export function parseYamlDocument<T>(content: string): T {
  return YAML.parse(content) as T;
}

export function stringifyYamlDocument(input: unknown) {
  return YAML.stringify(input, {
    defaultKeyType: 'PLAIN',
    lineWidth: 100
  });
}

function parseRequestFile(_filePath: string, content: string): RequestDocument {
  const input = parseYamlDocument<unknown>(content);
  return requestDocumentSchema.parse(input);
}

function parseCaseFile(_filePath: string, content: string): CaseDocument {
  const input = parseYamlDocument<unknown>(content);
  return caseDocumentSchema.parse(input);
}

function parseEnvironmentFile(filePath: string, content: string): EnvironmentDocument {
  const input = parseYamlDocument<unknown>(content);
  const parsed = environmentDocumentSchema.parse(input);
  if (filePath.endsWith(LOCAL_ENV_SUFFIX)) {
    return environmentDocumentSchema.parse({
      ...parsed,
      name: parsed.name || filePath.split('/').pop()?.replace(LOCAL_ENV_SUFFIX, '') || 'local'
    });
  }
  return parsed;
}

function pathSegmentsBetween(root: string, target: string) {
  return target
    .replace(root, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
}

function sortRecords<T extends { path?: string; name?: string }>(items: T[]) {
  return [...items].sort((left: T, right: T) => {
    const leftKey = left.path || left.name || '';
    const rightKey = right.path || right.name || '';
    return leftKey.localeCompare(rightKey, 'zh-CN');
  });
}

type ScanFilesInput = {
  root: string;
  projectContent: string;
  fileContents: Record<string, string>;
};

export function buildWorkspaceIndex(input: ScanFilesInput): WorkspaceIndex {
  const project = projectDocumentSchema.parse(parseYamlDocument<unknown>(input.projectContent));
  const environmentRecords: WorkspaceEnvironmentRecord[] = [];
  const requestRecords: WorkspaceRequestRecord[] = [];
  const requestsByPath = new Map<string, WorkspaceRequestRecord>();

  const filePaths = Object.keys(input.fileContents).sort((a: string, b: string) => a.localeCompare(b, 'zh-CN'));
  for (const filePath of filePaths) {
    const content = input.fileContents[filePath];
    if (filePath.endsWith(REQUEST_SUFFIX)) {
      const request = parseRequestFile(filePath, content);
      const relativeSegments = pathSegmentsBetween(`${input.root}/requests`, filePath);
      const lastSegment = relativeSegments.at(-1) || '';
      const folderSegments = relativeSegments.slice(0, -1);
      const resourceDirPath = filePath.slice(0, -REQUEST_SUFFIX.length);
      if (request.body.file && input.fileContents[request.body.file]) {
        request.body.text = input.fileContents[request.body.file];
      }
      request.examples = request.examples.map((example: ResponseExample) =>
        example.file && input.fileContents[example.file]
          ? {
              ...example,
              text: input.fileContents[example.file]
            }
          : example
      );
      const record: WorkspaceRequestRecord = {
        request,
        cases: [],
        folderSegments,
        requestFilePath: filePath,
        resourceDirPath
      };
      requestRecords.push(record);
      requestsByPath.set(resourceDirPath, record);
      requestsByPath.set(lastSegment.replace(REQUEST_SUFFIX, ''), record);
      continue;
    }

    if (filePath.endsWith(CASE_SUFFIX)) {
      const requestDir = filePath.split('/cases/')[0];
      const record = requestsByPath.get(requestDir);
      if (!record) continue;
      record.cases.push(parseCaseFile(filePath, content));
      continue;
    }

    if (filePath.includes('/environments/') && filePath.endsWith('.yaml')) {
      environmentRecords.push({
        document: parseEnvironmentFile(filePath, content),
        filePath
      });
    }
  }

  const treeMap = new Map<string, { id: string; name: string; kind: 'folder'; path: string; children: any[] }>();
  const tree: any[] = [];

  for (const record of [...requestRecords].sort((left, right) =>
    left.requestFilePath.localeCompare(right.requestFilePath, 'zh-CN')
  )) {
    let parentChildren = tree;
    let currentPath = '';
    record.folderSegments.forEach((segment: string) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let folderNode = treeMap.get(currentPath);
      if (!folderNode) {
        folderNode = {
          id: `folder:${currentPath}`,
          name: segment,
          kind: 'folder',
          path: currentPath,
          children: []
        };
        treeMap.set(currentPath, folderNode);
        parentChildren.push(folderNode);
      }
      parentChildren = folderNode.children;
    });

    parentChildren.push({
      id: `request:${record.request.id}`,
      name: record.request.name,
      kind: 'request',
      path: record.requestFilePath,
      requestId: record.request.id,
      caseCount: record.cases.length
    });
  }

  return {
    root: input.root,
    project,
    environments: sortRecords(environmentRecords.map(item => ({ ...item, name: item.document.name }))) as WorkspaceEnvironmentRecord[],
    requests: requestRecords,
    tree,
    gitignorePath: `${input.root}/.gitignore`
  };
}

export function createProjectSeed(input: ProjectSeed) {
  const project = createDefaultProject(input.projectName);
  const sharedEnvironment = createDefaultEnvironment('shared');
  const localEnvironment = environmentDocumentSchema.parse({
    schemaVersion: 1,
    name: 'local',
    vars: {
      token: ''
    },
    headers: [],
    authProfiles: []
  });

  const request = requestDocumentSchema.parse({
    id: 'req_bootstrap',
    name: 'Health Check',
    method: 'GET',
    url: '{{baseUrl}}/health',
    path: '/health',
    description: 'Quick request to validate the current environment endpoint.',
    tags: ['bootstrap'],
    headers: [],
    query: [],
    pathParams: [],
    body: { mode: 'none', text: '', fields: [] },
    auth: { type: 'none' },
    examples: [],
    order: 0
  });

  const requestWrites = input.includeSampleRequest === false ? [] : materializeRequestDocuments(
    [
      {
        folderSegments: ['bootstrap'],
        request,
        cases: []
      }
    ],
    ''
  );

  const writes: WorkspaceFileWrite[] = [
    { path: 'project.yaml', content: stringifyYamlDocument(project) },
    { path: 'environments/shared.yaml', content: stringifyYamlDocument(sharedEnvironment) },
    { path: 'environments/local.local.yaml', content: stringifyYamlDocument(localEnvironment) },
    { path: '.gitignore', content: DEFAULT_GITIGNORE },
    ...requestWrites
  ];

  return { project, writes };
}

function cleanRows(rows: ParameterRow[]) {
  return rows.filter(row => row.name.trim()).map(row => ({
    ...emptyParameterRow(),
    ...row,
    name: row.name.trim(),
    value: row.value ?? ''
  }));
}

function normalizeBody(body: RequestBody): RequestBody {
  const next = requestBodySchema.parse(body);
  if (next.mode === 'form') {
    return {
      ...next,
      fields: cleanRows(next.fields)
    };
  }
  return next;
}

function resolveSidecarPath(basePath: string, kind: 'body' | 'example', name: string, mimeType?: string) {
  const ext = mimeType?.includes('json') ? 'json' : mimeType?.includes('html') ? 'html' : 'txt';
  if (kind === 'body') {
    return `${basePath}/bodies/${slugify(name || 'body')}.${ext}`;
  }
  return `${basePath}/examples/${slugify(name || 'response')}.${ext}`;
}

function serializeRequestDocument(record: {
  folderSegments: string[];
  request: RequestDocument;
  cases: CaseDocument[];
}): WorkspaceFileWrite[] {
  const request = requestDocumentSchema.parse({
    ...record.request,
    headers: cleanRows(record.request.headers),
    query: cleanRows(record.request.query),
    pathParams: cleanRows(record.request.pathParams),
    body: normalizeBody(record.request.body)
  });
  const requestSlug = slugify(request.name);
  const relativeBase = ['requests', ...record.folderSegments, requestSlug].join('/');
  const requestFilePath = `${relativeBase}${REQUEST_SUFFIX}`;
  const resourceDirPath = relativeBase;

  const mainFile: Record<string, unknown> = {
    ...request,
        examples: request.examples.map((example: ResponseExample) => {
      if (example.text.length > BODY_SIDECAR_THRESHOLD) {
        const file = resolveSidecarPath(resourceDirPath, 'example', example.name, example.mimeType);
        return {
          ...example,
          text: '',
          file
        };
      }
      return example;
    })
  };

  const writes: WorkspaceFileWrite[] = [{ path: requestFilePath, content: stringifyYamlDocument(mainFile) }];

  if (request.body.text.length > BODY_SIDECAR_THRESHOLD && request.body.mode !== 'none') {
    const bodyPath = resolveSidecarPath(resourceDirPath, 'body', request.name, request.body.mimeType);
    mainFile.body = {
      ...request.body,
      text: '',
      file: bodyPath
    };
    writes[0] = { path: requestFilePath, content: stringifyYamlDocument(mainFile) };
    writes.push({ path: bodyPath, content: request.body.text });
  }

  request.examples.forEach((example: ResponseExample) => {
    if (example.text.length > BODY_SIDECAR_THRESHOLD) {
      const file = resolveSidecarPath(resourceDirPath, 'example', example.name, example.mimeType);
      writes.push({ path: file, content: example.text });
    }
  });

  record.cases.forEach(caseItem => {
    const caseSlug = slugify(caseItem.name);
    writes.push({
      path: `${resourceDirPath}/cases/${caseSlug}${CASE_SUFFIX}`,
      content: stringifyYamlDocument(caseDocumentSchema.parse(caseItem))
    });
  });

  return writes;
}

export function materializeRequestDocuments(
  records: Array<{
    folderSegments: string[];
    request: RequestDocument;
    cases: CaseDocument[];
  }>,
  rootPath: string
) {
  return records.flatMap(record =>
    serializeRequestDocument(record).map(item => ({
      path: rootPath ? `${rootPath}/${item.path}` : item.path,
      content: item.content
    }))
  );
}

export function materializeEnvironmentDocument(environment: EnvironmentDocument, rootPath: string) {
  const name = slugify(environment.name);
  const suffix = environment.name === 'local' ? LOCAL_ENV_SUFFIX : '.yaml';
  return {
    path: `${rootPath ? `${rootPath}/` : ''}environments/${name}${suffix}`,
    content: stringifyYamlDocument(environmentDocumentSchema.parse(environment))
  };
}

export function materializeProjectDocument(project: ProjectDocument, rootPath: string) {
  return {
    path: `${rootPath ? `${rootPath}/` : ''}project.yaml`,
    content: stringifyYamlDocument(projectDocumentSchema.parse(project))
  };
}

export function applyEnvironmentVariables(input: string, environment: EnvironmentDocument | undefined) {
  if (!environment) return input;
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => environment.vars[key] ?? '');
}

function mergeRows(baseRows: ParameterRow[], overrideRows?: ParameterRow[]) {
  if (!overrideRows || overrideRows.length === 0) return baseRows;
  return cleanRows(overrideRows);
}

function mergeAuth(baseAuth: AuthConfig, overrideAuth?: AuthConfig): AuthConfig {
  if (!overrideAuth) return authConfigSchema.parse(baseAuth);
  if (overrideAuth.type === 'inherit') return authConfigSchema.parse(baseAuth);
  return authConfigSchema.parse(overrideAuth);
}

export function resolveRequest(
  request: RequestDocument,
  caseDocument: CaseDocument | undefined,
  environment: EnvironmentDocument | undefined
): ResolvedRequest {
  const body = caseDocument?.overrides.body ?? request.body;
  const auth = mergeAuth(request.auth, caseDocument?.overrides.auth);
  const url = applyEnvironmentVariables(caseDocument?.overrides.url || request.url, environment);
  const path = applyEnvironmentVariables(caseDocument?.overrides.path || request.path || '', environment);
  const headers = mergeRows(request.headers, caseDocument?.overrides.headers).map((row: ParameterRow) => ({
    ...row,
    value: applyEnvironmentVariables(row.value, environment)
  }));
  const query = mergeRows(request.query, caseDocument?.overrides.query).map((row: ParameterRow) => ({
    ...row,
    value: applyEnvironmentVariables(row.value, environment)
  }));

  const resolvedBody = normalizeBody(body);
  const mergedBody = {
    ...resolvedBody,
    text: applyEnvironmentVariables(resolvedBody.text, environment),
    fields: resolvedBody.fields.map((row: ParameterRow) => ({
      ...row,
      value: applyEnvironmentVariables(row.value, environment)
    }))
  };

  const authHeaders = [...headers];
  const authQuery = [...query];
  if (auth.type === 'bearer' && auth.token) {
    authHeaders.push({
      name: 'Authorization',
      value: `Bearer ${applyEnvironmentVariables(auth.token, environment)}`,
      enabled: true
    });
  }
  if (auth.type === 'apikey' && auth.key) {
    const target = auth.addTo || 'header';
    const row = {
      name: auth.key,
      value: applyEnvironmentVariables(auth.value || '', environment),
      enabled: true
    };
    if (target === 'query') {
      authQuery.push(row);
    } else {
      authHeaders.push(row);
    }
  }
  if (auth.type === 'basic' && auth.username) {
    const value = btoa(`${applyEnvironmentVariables(auth.username, environment)}:${applyEnvironmentVariables(auth.password || '', environment)}`);
    authHeaders.push({
      name: 'Authorization',
      value: `Basic ${value}`,
      enabled: true
    });
  }

  const candidateUrl = url || `${environment?.vars.baseUrl || ''}${path || ''}`;
  return {
    name: caseDocument ? `${request.name} / ${caseDocument.name}` : request.name,
    environmentName: caseDocument?.environment || environment?.name,
    method: caseDocument?.overrides.method || request.method,
    url: candidateUrl,
    headers: authHeaders,
    query: authQuery,
    body: mergedBody,
    timeoutMs: 30000
  };
}

export function inferFolderSegmentsFromPath(filePath: string, root: string) {
  const relative = pathSegmentsBetween(`${root}/requests`, filePath);
  return relative.slice(0, -1);
}

export function buildFileContentMap(entries: FileEntry[]) {
  const output: Record<string, string> = {};
  const walk = (items: FileEntry[]) => {
    items.forEach(item => {
      if (item.kind === 'file') {
        output[item.path] = '';
        return;
      }
      if (item.children) {
        walk(item.children);
      }
    });
  };
  walk(entries);
  return output;
}
