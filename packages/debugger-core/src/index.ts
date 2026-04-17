import YAML from 'yaml';
import {
  BODY_SIDECAR_THRESHOLD,
  CASE_SUFFIX,
  COLLECTION_SUFFIX,
  DEFAULT_GITIGNORE,
  LOCAL_ENV_SUFFIX,
  REQUEST_SUFFIX,
  collectionDocumentSchema,
  collectionStepSchema,
  authConfigSchema,
  caseCheckSchema,
  caseDocumentSchema,
  createDefaultEnvironment,
  createEmptyCollection,
  createDefaultProject,
  createId,
  emptyParameterRow,
  environmentDocumentSchema,
  projectDocumentSchema,
  resolvedRequestPreviewSchema,
  runtimeSettingsSchema,
  requestBodySchema,
  requestDocumentSchema,
  slugify,
  type AuthConfig,
  type CaseCheck,
  type CaseDocument,
  type CollectionDocument,
  type EnvironmentDocument,
  type ParameterRow,
  type ProjectDocument,
  type RequestBody,
  type RequestDocument,
  type ResolvedRequestPreview,
  type ResponseExample,
  type ScriptLog,
  type SendRequestResult,
  type WorkspaceCollectionRecord,
  type WorkspaceEnvironmentRecord,
  type WorkspaceIndex,
  type WorkspaceRequestRecord,
  type WorkspaceTreeNode
} from '@yapi-debugger/schema';
import {
  applyCollectionRules,
  buildCurlCommand,
  evaluateChecks,
  executeRequestScript,
  interpolateResolvedRequest,
  interpolateString,
  mergeTemplateSources,
  readPathValue
} from './runtime';

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

export type ResolvedRequest = ResolvedRequestPreview;

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

function parseCollectionFile(_filePath: string, content: string): CollectionDocument {
  const input = parseYamlDocument<unknown>(content);
  return collectionDocumentSchema.parse(input);
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
  const collectionRecords: WorkspaceCollectionRecord[] = [];
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
      continue;
    }

    if (filePath.includes('/collections/') && filePath.endsWith(COLLECTION_SUFFIX)) {
      const document = parseCollectionFile(filePath, content);
      const dataFilePath = document.dataFile;
      collectionRecords.push({
        document,
        filePath,
        dataFilePath,
        dataText: dataFilePath && input.fileContents[dataFilePath] ? input.fileContents[dataFilePath] : ''
      });
    }
  }

  const projectNode: WorkspaceTreeNode = {
    id: 'project:root',
    name: project.name,
    kind: 'project',
    children: []
  };
  const treeMap = new Map<string, Extract<WorkspaceTreeNode, { kind: 'category' }>>();

  for (const record of [...requestRecords].sort((left, right) =>
    left.requestFilePath.localeCompare(right.requestFilePath, 'zh-CN')
  )) {
    let parentChildren = projectNode.children;
    let currentPath = '';
    record.folderSegments.forEach((segment: string) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let categoryNode = treeMap.get(currentPath);
      if (!categoryNode) {
        categoryNode = {
          id: `folder:${currentPath}`,
          name: segment,
          kind: 'category',
          path: currentPath,
          children: []
        };
        treeMap.set(currentPath, categoryNode);
        parentChildren.push(categoryNode);
      }
      parentChildren = categoryNode.children;
    });

    parentChildren.push({
      id: `request:${record.request.id}`,
      name: record.request.name,
      kind: 'request',
      path: record.requestFilePath,
      requestId: record.request.id,
      method: record.request.method,
      requestPath: record.request.path || record.request.url || '/',
      caseCount: record.cases.length,
      children: record.cases
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
        .map(caseItem => ({
          id: `case:${record.request.id}:${caseItem.id}`,
          name: caseItem.name,
          kind: 'case',
          requestId: record.request.id,
          caseId: caseItem.id
        }))
    });
  }

  return {
    root: input.root,
    project,
    environments: sortRecords(environmentRecords.map(item => ({ ...item, name: item.document.name }))) as WorkspaceEnvironmentRecord[],
    requests: requestRecords,
    collections: sortRecords(collectionRecords.map(item => ({ ...item, name: item.document.name }))) as WorkspaceCollectionRecord[],
    tree: [projectNode],
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
  if (next.mode === 'form-urlencoded' || next.mode === 'multipart') {
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

function collectionDataFilePath(collection: CollectionDocument) {
  return collection.dataFile || `collections/${slugify(collection.name)}.data.json`;
}

export function materializeCollectionDocument(
  collection: CollectionDocument,
  rootPath: string,
  dataText = ''
) {
  const nextCollection = collectionDocumentSchema.parse(collection);
  const fileBase = `collections/${slugify(nextCollection.name)}`;
  const filePath = `${fileBase}${COLLECTION_SUFFIX}`;
  const shouldWriteData = dataText.trim().length > 0;
  const dataFile = shouldWriteData ? collectionDataFilePath({ ...nextCollection, dataFile: `${fileBase}.data.json` }) : undefined;
  const writes: WorkspaceFileWrite[] = [
    {
      path: rootPath ? `${rootPath}/${filePath}` : filePath,
      content: stringifyYamlDocument({
        ...nextCollection,
        dataFile
      })
    }
  ];

  if (shouldWriteData && dataFile) {
    writes.push({
      path: rootPath ? `${rootPath}/${dataFile}` : dataFile,
      content: dataText.trim()
    });
  }

  return writes;
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
  return interpolateString(input, [environment.vars]);
}

function mergeVariableSources(
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>> = []
) {
  const sources = mergeTemplateSources({
    project,
    environment,
    extraSources
  });
  return sources;
}

export function applyProjectVariables(
  input: string,
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>> = []
) {
  const variables = mergeVariableSources(project, environment, extraSources);
  return interpolateString(input, variables);
}

function mergeRows(baseRows: ParameterRow[], overrideRows?: ParameterRow[]) {
  if (!overrideRows || overrideRows.length === 0) return baseRows;
  return cleanRows(overrideRows);
}

function mergeAuth(baseAuth: AuthConfig, overrideAuth?: AuthConfig, environment?: EnvironmentDocument) {
  const next = !overrideAuth || overrideAuth.type === 'inherit' ? authConfigSchema.parse(baseAuth) : authConfigSchema.parse(overrideAuth);
  if (next.type !== 'profile') {
    return {
      auth: next,
      authSource: next.type === 'inherit' ? 'inherit' : next.type
    };
  }

  const profile = environment?.authProfiles.find(item => item.name === next.profileName);
  if (!profile) {
    return {
      auth: authConfigSchema.parse({ type: 'none' }),
      authSource: `missing profile: ${next.profileName || 'unknown'}`
    };
  }

  return {
    auth: authConfigSchema.parse(profile.auth),
    authSource: `environment profile: ${profile.name}`
  };
}

function mergeRuntime(request: RequestDocument, caseDocument: CaseDocument | undefined) {
  return runtimeSettingsSchema.parse({
    ...request.runtime,
    ...(caseDocument?.overrides.runtime || {})
  });
}

function encodeBasicAuth(username: string, password: string) {
  if (typeof btoa === 'function') {
    return btoa(`${username}:${password}`);
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const source = `${username}:${password}`;
  let output = '';
  let index = 0;
  while (index < source.length) {
    const first = source.charCodeAt(index++);
    const second = source.charCodeAt(index++);
    const third = source.charCodeAt(index++);
    const missingSecond = Number.isNaN(second);
    const missingThird = Number.isNaN(third);
    const firstBlock = first >> 2;
    const secondBlock = ((first & 3) << 4) | ((second || 0) >> 4);
    const thirdBlock = missingSecond
      ? 64
      : ((second & 15) << 2) | ((third || 0) >> 6);
    const fourthBlock = missingSecond || missingThird ? 64 : third & 63;
    output +=
      alphabet.charAt(firstBlock) +
      alphabet.charAt(secondBlock) +
      alphabet.charAt(thirdBlock) +
      alphabet.charAt(fourthBlock);
  }
  return output;
}

export function resolveRequest(
  project: ProjectDocument,
  request: RequestDocument,
  caseDocument: CaseDocument | undefined,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>> = []
): ResolvedRequest {
  const body = caseDocument?.overrides.body ?? request.body;
  const { auth, authSource } = mergeAuth(request.auth, caseDocument?.overrides.auth, environment);
  const runtime = mergeRuntime(request, caseDocument);
  const rawUrl = caseDocument?.overrides.url || request.url;
  const url = applyProjectVariables(rawUrl, project, environment, extraSources);
  const path = applyProjectVariables(caseDocument?.overrides.path || request.path || '', project, environment, extraSources);
  const baseHeaders = [
    ...project.runtime.headers,
    ...(environment?.headers || []),
    ...request.headers
  ];
  const headers = mergeRows(baseHeaders, caseDocument?.overrides.headers).map((row: ParameterRow) => ({
    ...row,
    value: applyProjectVariables(row.value, project, environment, extraSources),
    filePath: row.filePath ? applyProjectVariables(row.filePath, project, environment, extraSources) : row.filePath
  }));
  const query = mergeRows(request.query, caseDocument?.overrides.query).map((row: ParameterRow) => ({
    ...row,
    value: applyProjectVariables(row.value, project, environment, extraSources)
  }));

  const resolvedBody = normalizeBody(body);
  const mergedBody = {
    ...resolvedBody,
    text: applyProjectVariables(resolvedBody.text, project, environment, extraSources),
    fields: resolvedBody.fields.map((row: ParameterRow) => ({
      ...row,
      value: applyProjectVariables(row.value, project, environment, extraSources),
      filePath: row.filePath ? applyProjectVariables(row.filePath, project, environment, extraSources) : row.filePath
    }))
  };

  const authHeaders = [...headers];
  const authQuery = [...query];
  if (auth.type === 'bearer' && auth.token) {
    authHeaders.push({
      name: 'Authorization',
      value: `Bearer ${applyProjectVariables(auth.token, project, environment, extraSources)}`,
      enabled: true,
      kind: 'text',
      filePath: undefined
    });
  }
  if (auth.type === 'apikey' && auth.key) {
    const target = auth.addTo || 'header';
    const row = {
      name: auth.key,
      value: applyProjectVariables(auth.value || '', project, environment, extraSources),
      enabled: true,
      kind: 'text' as const,
      filePath: undefined
    };
    if (target === 'query') {
      authQuery.push(row);
    } else {
      authHeaders.push(row);
    }
  }
  if (auth.type === 'basic' && auth.username) {
    const username = applyProjectVariables(auth.username, project, environment, extraSources);
    const password = applyProjectVariables(auth.password || '', project, environment, extraSources);
    const value = encodeBasicAuth(username, password);
    authHeaders.push({
      name: 'Authorization',
      value: `Basic ${value}`,
      enabled: true,
      kind: 'text',
      filePath: undefined
    });
  }

  const mergedVariables = mergeVariableSources(project, environment, extraSources);
  let candidateUrl = url;
  if (!candidateUrl || (!candidateUrl.includes('://') && !rawUrl.startsWith('{{'))) {
    const baseUrl = String(readPathValue(mergedVariables[mergedVariables.length - 1], 'baseUrl') || '');
    candidateUrl = `${baseUrl}${candidateUrl || path || ''}`;
  }

  return interpolateResolvedRequest(resolvedRequestPreviewSchema.parse({
    name: caseDocument ? `${request.name} / ${caseDocument.name}` : request.name,
    environmentName: caseDocument?.environment || environment?.name,
    authSource,
    requestPath: path || request.path || '/',
    method: caseDocument?.overrides.method || request.method,
    url: candidateUrl,
    headers: authHeaders,
    query: authQuery,
    body: mergedBody,
    timeoutMs: runtime.timeoutMs,
    followRedirects: runtime.followRedirects
  }), extraSources);
}

export function createEmptyCheck(type: CaseCheck['type'] = 'status-equals'): CaseCheck {
  return caseCheckSchema.parse({
    id: createId('check'),
    type,
    label: '',
    enabled: true,
    path:
      type === 'header-includes' || type === 'header-equals'
        ? 'content-type'
        : type.startsWith('json-')
          ? '$.data'
          : '',
    expected:
      type === 'status-equals'
        ? '200'
        : type === 'response-time-lt'
          ? '1000'
          : ''
  });
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

export function parseCollectionDataText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return [] as Array<Record<string, unknown>>;
  const parsed = trimmed.startsWith('[') || trimmed.startsWith('{')
    ? JSON.parse(trimmed)
    : parseYamlDocument<unknown>(trimmed);

  if (!Array.isArray(parsed)) {
    throw new Error('Collection data file must contain a JSON/YAML array of objects');
  }

  return parsed.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Collection data row ${index + 1} must be an object`);
    }
    return row as Record<string, unknown>;
  });
}

export {
  applyCollectionRules,
  buildCurlCommand,
  evaluateChecks,
  executeRequestScript
};
