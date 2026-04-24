import YAML from 'yaml';
import { buildImportJourneyState, evaluateSyncGuard } from './beta';
import {
  BODY_SIDECAR_THRESHOLD,
  CASE_SUFFIX,
  COLLECTION_SUFFIX,
  DEFAULT_GITIGNORE,
  LOCAL_ENV_SUFFIX,
  REQUEST_SUFFIX,
  SCHEMA_VERSION,
  collectionRunReportSchema,
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
  retryPolicySchema,
  resolvedAuthPreviewItemSchema,
  resolvedFieldValueSchema,
  resolvedRequestInsightSchema,
  resolvedRequestPreviewSchema,
  runtimeSettingsSchema,
  sendRequestInputSchema,
  requestBodySchema,
  requestDocumentSchema,
  slugify,
  type AuthConfig,
  type CaseCheck,
  type CaseDocument,
  type CheckResult,
  type CollectionDocument,
  type CollectionRunReport,
  type CollectionStep,
  type CollectionStepRun,
  type EnvironmentDocument,
  type ParameterRow,
  type ProjectDocument,
  type RequestBody,
  type RequestDocument,
  type ResolvedAuthPreviewItem,
  type ResolvedFieldValue,
  type ResolvedRequestInsight,
  type ResolvedRequestPreview,
  type RetryPolicy,
  type ResponseExample,
  type ScriptLog,
  type SendRequestInput,
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

const VARIABLE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;
const UNSUPPORTED_SCRIPT_PATTERNS = [
  {
    token: 'pm.sendRequest',
    code: 'script-unsupported-send-request',
    level: 'warning' as const,
    message: 'pm.sendRequest is only supported in lite pre-request mode. Complex or post-response usage still needs review.'
  },
  {
    token: 'pm.vault',
    code: 'script-unsupported-vault',
    level: 'warning' as const,
    message: 'pm.vault is not supported by the local debugger runtime yet.'
  },
  {
    token: 'postman.',
    code: 'script-legacy-postman-api',
    level: 'warning' as const,
    message: 'Legacy postman.* APIs may not execute correctly in the local debugger runtime.'
  }
];

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

function environmentStem(filePath: string) {
  const fileName = filePath.split('/').pop() || '';
  if (fileName.endsWith(LOCAL_ENV_SUFFIX)) {
    return fileName.slice(0, -LOCAL_ENV_SUFFIX.length);
  }
  if (fileName.endsWith('.yaml')) {
    return fileName.slice(0, -'.yaml'.length);
  }
  if (fileName.endsWith('.yml')) {
    return fileName.slice(0, -'.yml'.length);
  }
  return fileName;
}

function mergeHeaderRowsByName(sharedRows: ParameterRow[], localRows: ParameterRow[]) {
  const output = [...cleanRows(sharedRows)];
  const indexByName = new Map(output.map((row, index) => [row.name.trim().toLowerCase(), index]));
  cleanRows(localRows).forEach(row => {
    const key = row.name.trim().toLowerCase();
    const existingIndex = indexByName.get(key);
    if (existingIndex == null) {
      indexByName.set(key, output.length);
      output.push(row);
      return;
    }
    output[existingIndex] = row;
  });
  return output;
}

function mergeEnvironmentDocuments(
  sharedDocument: EnvironmentDocument,
  sharedFilePath: string,
  localDocument?: EnvironmentDocument,
  localFilePath?: string
) {
  const sharedVars = { ...(sharedDocument.vars || {}) };
  const localVars = { ...(localDocument?.vars || {}) };
  return environmentDocumentSchema.parse({
    ...sharedDocument,
    name: sharedDocument.name || localDocument?.name || environmentStem(sharedFilePath),
    vars: {
      ...sharedVars,
      ...localVars
    },
    headers: mergeHeaderRowsByName(sharedDocument.headers || [], localDocument?.headers || []),
    authProfiles: sharedDocument.authProfiles || [],
    sharedVars,
    sharedHeaders: cleanRows(sharedDocument.headers || []),
    localVars,
    localHeaders: cleanRows(localDocument?.headers || []),
    sharedFilePath,
    localFilePath,
    overlayMode: localDocument ? 'overlay' : 'standalone'
  });
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
  const sharedEnvironmentFiles = new Map<string, { filePath: string; document: EnvironmentDocument }>();
  const localEnvironmentFiles = new Map<string, { filePath: string; document: EnvironmentDocument }>();

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
      const document = parseEnvironmentFile(filePath, content);
      const stem = environmentStem(filePath);
      if (filePath.endsWith(LOCAL_ENV_SUFFIX)) {
        localEnvironmentFiles.set(stem, { filePath, document });
      } else {
        sharedEnvironmentFiles.set(stem, { filePath, document });
      }
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

  const environmentKeys = new Set<string>([
    ...sharedEnvironmentFiles.keys(),
    ...localEnvironmentFiles.keys()
  ]);

  environmentKeys.forEach(key => {
    const sharedFile = sharedEnvironmentFiles.get(key);
    const localFile = localEnvironmentFiles.get(key);
    if (sharedFile) {
      environmentRecords.push({
        document: mergeEnvironmentDocuments(
          sharedFile.document,
          sharedFile.filePath,
          localFile?.document,
          localFile?.filePath
        ),
        filePath: sharedFile.filePath,
        localFilePath: localFile?.filePath
      });
      return;
    }

    if (localFile) {
      const standalone = environmentDocumentSchema.parse({
        ...localFile.document,
        name: localFile.document.name || key,
        vars: { ...(localFile.document.vars || {}) },
        headers: cleanRows(localFile.document.headers || []),
        authProfiles: localFile.document.authProfiles || [],
        sharedVars: {},
        sharedHeaders: [],
        localVars: { ...(localFile.document.vars || {}) },
        localHeaders: cleanRows(localFile.document.headers || []),
        sharedFilePath: undefined,
        localFilePath: localFile.filePath,
        overlayMode: 'standalone'
      });
      environmentRecords.push({
        document: standalone,
        filePath: localFile.filePath,
        localFilePath: localFile.filePath
      });
    }
  });

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
    gitignorePath: `${input.root}/.gitignore`,
    gitignoreContent: input.fileContents[`${input.root}/.gitignore`] || ''
  };
}

export function createProjectSeed(input: ProjectSeed) {
  const project = createDefaultProject(input.projectName);
  const sharedEnvironment = createDefaultEnvironment('shared');
  const localEnvironment = environmentDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
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

function splitUrlAndQueryRows(rawUrl: string) {
  const hashIndex = rawUrl.indexOf('#');
  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex === -1 || (hashIndex !== -1 && hashIndex < queryIndex)) {
    return {
      url: rawUrl,
      query: [] as ParameterRow[]
    };
  }

  const base = rawUrl.slice(0, queryIndex);
  const hash = hashIndex === -1 ? '' : rawUrl.slice(hashIndex);
  const search = rawUrl.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex);
  const query = [...new URLSearchParams(search).entries()].map(([name, value]) => ({
    ...emptyParameterRow(),
    name,
    value,
    enabled: true
  }));

  return {
    url: `${base}${hash}`,
    query
  };
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
  return materializeEnvironmentDocuments(environment, rootPath)[0];
}

export function materializeEnvironmentDocuments(environment: EnvironmentDocument, rootPath: string) {
  const overlayMode = environment.overlayMode || 'standalone';
  const primaryName = slugify(environment.name);
  const sharedDocument = environmentDocumentSchema.parse({
    schemaVersion: environment.schemaVersion,
    name: environment.name,
    vars: environment.sharedVars ?? environment.vars,
    headers: environment.sharedHeaders ?? environment.headers,
    authProfiles: environment.authProfiles || []
  });
  const localDocument = environmentDocumentSchema.parse({
    schemaVersion: environment.schemaVersion,
    name: environment.name,
    vars: environment.localVars ?? {},
    headers: environment.localHeaders ?? [],
    authProfiles: overlayMode === 'standalone' && !environment.sharedFilePath ? environment.authProfiles || [] : []
  });
  const writes: WorkspaceFileWrite[] = [];

  const sharedPath =
    environment.sharedFilePath ||
    `${rootPath ? `${rootPath}/` : ''}environments/${primaryName}.yaml`;
  const localPath =
    environment.localFilePath ||
    `${rootPath ? `${rootPath}/` : ''}environments/${primaryName}${LOCAL_ENV_SUFFIX}`;

  if (overlayMode === 'overlay') {
    writes.push({
      path: sharedPath,
      content: stringifyYamlDocument(sharedDocument)
    });
    const hasLocalOverlay =
      Object.keys(localDocument.vars || {}).length > 0 || (localDocument.headers || []).length > 0;
    if (hasLocalOverlay) {
      writes.push({
        path: localPath,
        content: stringifyYamlDocument(localDocument)
      });
    }
    return writes;
  }

  const standalonePath =
    environment.localFilePath && !environment.sharedFilePath
      ? environment.localFilePath
      : `${rootPath ? `${rootPath}/` : ''}environments/${primaryName}${environment.name === 'local' ? LOCAL_ENV_SUFFIX : '.yaml'}`;
  const standaloneDocument =
    environment.localFilePath && !environment.sharedFilePath ? localDocument : sharedDocument;
  writes.push({
    path: standalonePath,
    content: stringifyYamlDocument(standaloneDocument)
  });
  return writes;
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

function extraSourceMeta(source: Record<string, unknown>) {
  const meta = source.__debugSource;
  if (!meta || typeof meta !== 'object') return null;
  const label = typeof (meta as Record<string, unknown>).label === 'string' ? String((meta as Record<string, unknown>).label) : '';
  const kind = typeof (meta as Record<string, unknown>).kind === 'string' ? String((meta as Record<string, unknown>).kind) : 'runtime';
  return label ? { label, kind } : null;
}

export function createNamedTemplateSource(
  label: string,
  data: Record<string, unknown>,
  kind: 'runtime' | 'collection' | 'data-row' | 'step-output' | 'script' = 'runtime'
) {
  return {
    ...data,
    __debugSource: {
      label,
      kind
    }
  };
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

function templateTokens(input: string) {
  const output = new Set<string>();
  if (!input.includes('{{')) return [] as string[];
  input.replace(VARIABLE_PATTERN, (_match, token: string) => {
    const normalized = token.trim();
    if (normalized) output.add(normalized);
    return '';
  });
  return [...output];
}

function describeVariableSource(
  token: string,
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>> = []
) {
  const variables = mergeVariableSources(project, environment, extraSources);
  for (let index = 0; index < variables.length; index += 1) {
    const value = readPathValue(variables[index], token);
    if (value === undefined) continue;
    if (index < extraSources.length) {
      const meta = extraSourceMeta(extraSources[index]);
      return {
        source: 'extra' as const,
        sourceLabel: meta?.label || `runtime source ${index + 1}`,
        value: String(value ?? '')
      };
    }
    if (environment && index === extraSources.length) {
      const localVars = environment.localVars || {};
      const sharedVars = environment.sharedVars || environment.vars || {};
      const hasLocal = Object.prototype.hasOwnProperty.call(localVars, token.split('.')[0] || token);
      const hasShared = Object.prototype.hasOwnProperty.call(sharedVars, token.split('.')[0] || token);
      return {
        source: 'environment' as const,
        sourceLabel: hasLocal
          ? `environment local: ${environment.name}`
          : hasShared
            ? `environment shared: ${environment.name}`
            : `environment: ${environment.name}`,
        value: String(value ?? '')
      };
    }
    if (index === variables.length - 1) {
      return {
        source: 'builtin' as const,
        sourceLabel: 'builtin: baseUrl',
        value: String(value ?? '')
      };
    }
    return {
      source: 'project' as const,
      sourceLabel: 'project runtime',
      value: String(value ?? '')
    };
  }

  return {
    source: 'missing' as const,
    sourceLabel: 'missing',
    value: ''
  };
}

function collectResolvedField(
  input: {
    location: ResolvedFieldValue['location'];
    label: string;
    rawValue: string;
    resolvedValue: string;
  },
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>>,
  bucket: Map<
    string,
    {
      token: string;
      source: ResolvedRequestInsight['variables'][number]['source'];
      sourceLabel: string;
      value: string;
      missing: boolean;
      locations: Set<string>;
    }
  >
) {
  const tokens = templateTokens(input.rawValue);
  tokens.forEach(token => {
    const lookup = describeVariableSource(token, project, environment, extraSources);
    const existing = bucket.get(token);
    if (existing) {
      existing.locations.add(`${input.location}:${input.label}`);
      if (existing.source === 'missing' && lookup.source !== 'missing') {
        existing.source = lookup.source;
        existing.sourceLabel = lookup.sourceLabel;
        existing.value = lookup.value;
        existing.missing = false;
      }
      return;
    }
    bucket.set(token, {
      token,
      source: lookup.source,
      sourceLabel: lookup.sourceLabel,
      value: lookup.value,
      missing: lookup.source === 'missing',
      locations: new Set([`${input.location}:${input.label}`])
    });
  });

  return resolvedFieldValueSchema.parse({
    ...input,
    tokens
  });
}

function mergeRows(baseRows: ParameterRow[], overrideRows?: ParameterRow[]) {
  const output: ParameterRow[] = [];
  const indexByName = new Map<string, number>();

  const applyRows = (rows?: ParameterRow[]) => {
    cleanRows(rows || []).forEach(row => {
      const key = row.name.trim().toLowerCase();
      const existingIndex = indexByName.get(key);
      if (existingIndex == null) {
        indexByName.set(key, output.length);
        output.push(row);
        return;
      }
      output[existingIndex] = row;
    });
  };

  applyRows(baseRows);
  applyRows(overrideRows);
  return output;
}

function mergeAuth(baseAuth: AuthConfig, overrideAuth?: AuthConfig, environment?: EnvironmentDocument) {
  const next = !overrideAuth || overrideAuth.type === 'inherit' ? authConfigSchema.parse(baseAuth) : authConfigSchema.parse(overrideAuth);
  if (next.type !== 'profile') {
    return {
      auth: next,
      authSource: next.type === 'inherit' ? 'inherit' : next.type,
      profileName: undefined as string | undefined
    };
  }

  const profile = environment?.authProfiles.find(item => item.name === next.profileName);
  if (!profile) {
    return {
      auth: authConfigSchema.parse({ type: 'none' }),
      authSource: `missing profile: ${next.profileName || 'unknown'}`,
      profileName: next.profileName
    };
  }

  return {
    auth: authConfigSchema.parse(profile.auth),
    authSource: `environment profile: ${profile.name}`,
    profileName: profile.name
  };
}

function resolveAuthValue(
  directValue: string | undefined,
  variableRef: string | undefined,
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>>
) {
  if (variableRef?.trim()) {
    const token = variableRef.trim();
    const lookup = describeVariableSource(token, project, environment, extraSources);
    return {
      value: applyProjectVariables(`{{${token}}}`, project, environment, extraSources),
      sourceLabel: lookup.source === 'missing' ? `missing variable: ${token}` : `variable: ${token} (${lookup.sourceLabel})`
    };
  }

  return {
    value: applyProjectVariables(directValue || '', project, environment, extraSources),
    sourceLabel: directValue?.includes('{{') ? 'template expression' : 'inline value'
  };
}

function resolveOauthAccessTokenTarget(auth: AuthConfig) {
  const target = auth.tokenPlacement === 'query' ? 'query' : 'header';
  const name = auth.tokenName || (target === 'query' ? 'access_token' : 'Authorization');
  return { target, name };
}

function oauthCacheStatus(auth: AuthConfig) {
  if (!auth.accessToken) {
    return 'none' as const;
  }
  if (!auth.expiresAt) {
    return 'fresh' as const;
  }
  const expiresAt = Date.parse(auth.expiresAt);
  if (Number.isNaN(expiresAt)) {
    return 'fresh' as const;
  }
  return expiresAt > Date.now() ? 'fresh' as const : 'expired' as const;
}

function buildResolvedAuthState(
  auth: AuthConfig,
  authSource: string,
  profileName: string | undefined,
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>>
) {
  const state = {
    type: auth.type,
    source: authSource,
    profileName,
    tokenInjected: false,
    cacheStatus: 'none' as 'none' | 'fresh' | 'expired' | 'pending',
    expiresAt: auth.expiresAt,
    resolvedTokenUrl: undefined as string | undefined,
    missing: [] as string[],
    notes: [] as string[]
  };

  if (auth.type !== 'oauth2') {
    return state;
  }

  const tokenUrl = applyProjectVariables(auth.tokenUrl || '', project, environment, extraSources);
  const clientId = resolveAuthValue(auth.clientId || '', auth.clientIdFromVar, project, environment, extraSources).value;
  const clientSecret = resolveAuthValue(auth.clientSecret || '', auth.clientSecretFromVar, project, environment, extraSources).value;
  const cacheStatus = oauthCacheStatus(auth);

  state.cacheStatus = cacheStatus;
  state.resolvedTokenUrl = tokenUrl || undefined;
  if (!tokenUrl.trim()) state.missing.push('tokenUrl');
  if (!clientId.trim()) state.missing.push(auth.clientIdFromVar?.trim() || 'clientId');
  if (!clientSecret.trim()) state.missing.push(auth.clientSecretFromVar?.trim() || 'clientSecret');

  if (cacheStatus === 'fresh' && auth.accessToken) {
    state.tokenInjected = true;
    state.notes.push(profileName ? `Using cached OAuth token from profile "${profileName}".` : 'Using cached OAuth token.');
  } else if (cacheStatus === 'expired') {
    state.notes.push('Cached OAuth token has expired and will refresh on send.');
  } else if (state.missing.length === 0) {
    state.cacheStatus = 'pending';
    state.notes.push('OAuth token will be fetched automatically on send.');
  }

  return state;
}

function buildAuthPreview(
  auth: AuthConfig,
  authSource: string,
  profileName: string | undefined,
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>>
) {
  const preview: ResolvedAuthPreviewItem[] = [];

  if (auth.type === 'bearer' && (auth.token || auth.tokenFromVar)) {
    const resolved = resolveAuthValue(auth.token, auth.tokenFromVar, project, environment, extraSources);
    preview.push(
      resolvedAuthPreviewItemSchema.parse({
        target: 'header',
        name: 'Authorization',
        value: `Bearer ${resolved.value}`,
        sourceLabel: resolved.sourceLabel,
        status: 'ready'
      })
    );
  }

  if (auth.type === 'basic' && (auth.username || auth.usernameFromVar)) {
    const username = resolveAuthValue(auth.username, auth.usernameFromVar, project, environment, extraSources);
    const password = resolveAuthValue(auth.password || '', auth.passwordFromVar, project, environment, extraSources);
    preview.push(
      resolvedAuthPreviewItemSchema.parse({
        target: 'header',
        name: 'Authorization',
        value: `Basic ${encodeBasicAuth(username.value, password.value)}`,
        sourceLabel: `${username.sourceLabel}; ${password.sourceLabel}`,
        status: 'ready'
      })
    );
  }

  if (auth.type === 'apikey' && auth.key) {
    const resolved = resolveAuthValue(auth.value || '', auth.valueFromVar, project, environment, extraSources);
    preview.push(
      resolvedAuthPreviewItemSchema.parse({
        target: auth.addTo || 'header',
        name: auth.key,
        value: resolved.value,
        sourceLabel: resolved.sourceLabel,
        status: 'ready'
      })
    );
  }

  if (auth.type === 'oauth2') {
    const authState = buildResolvedAuthState(auth, authSource, profileName, project, environment, extraSources);
    const target = resolveOauthAccessTokenTarget(auth);
    if (authState.cacheStatus === 'fresh' && auth.accessToken) {
      const tokenPrefix = auth.tokenType || auth.tokenPrefix || 'Bearer';
      preview.push(
        resolvedAuthPreviewItemSchema.parse({
          target: target.target,
          name: target.name,
          value: target.target === 'header' ? `${tokenPrefix} ${auth.accessToken}` : auth.accessToken,
          sourceLabel: profileName ? `environment profile: ${profileName}` : authSource,
          status: 'cached',
          detail: auth.expiresAt ? `expires ${auth.expiresAt}` : 'cached token'
        })
      );
    } else {
      preview.push(
        resolvedAuthPreviewItemSchema.parse({
          target: target.target,
          name: target.name,
          value: '',
          sourceLabel: profileName ? `environment profile: ${profileName}` : authSource,
          status: authState.cacheStatus === 'expired' ? 'expired' : 'missing',
          detail: authState.notes[0] || 'OAuth token is not cached yet.'
        })
      );
    }
  }

  return preview;
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

function buildPreflightDiagnostics(
  preview: ResolvedRequestPreview,
  auth: AuthConfig,
  authSource: string,
  body: RequestBody,
  variables: Map<
    string,
    {
      token: string;
      source: ResolvedRequestInsight['variables'][number]['source'];
      sourceLabel: string;
      value: string;
      missing: boolean;
      locations: Set<string>;
    }
  >
) {
  const diagnostics: ResolvedRequestInsight['diagnostics'] = [];
  const missingVariables = [...variables.values()].filter(item => item.missing);
  if (missingVariables.length > 0) {
    diagnostics.push({
      code: 'missing-variable',
      level: 'error',
      blocking: true,
      message: `Missing variables: ${missingVariables.map(item => item.token).join(', ')}`,
      field: 'variables'
    });
  }

  if (!preview.url.trim()) {
    diagnostics.push({
      code: 'missing-url',
      level: 'error',
      blocking: true,
      message: 'Request URL is empty after resolution.',
      field: 'url'
    });
  } else if (!preview.url.includes('://')) {
    diagnostics.push({
      code: 'missing-base-url',
      level: 'error',
      blocking: true,
      message: 'Resolved URL is missing protocol/baseUrl. Configure the environment baseUrl before sending.',
      field: 'url'
    });
  }

  if (authSource.startsWith('missing profile')) {
    diagnostics.push({
      code: 'missing-auth-profile',
      level: 'error',
      blocking: true,
      message: authSource,
      field: 'auth'
    });
  }

  if (auth.type === 'bearer' && !preview.headers.some(item => item.enabled && item.name.toLowerCase() === 'authorization')) {
    diagnostics.push({
      code: 'incomplete-bearer-auth',
      level: 'error',
      blocking: true,
      message: 'Bearer auth is selected but no Authorization header could be produced.',
      field: 'auth'
    });
  }

  if (auth.type === 'basic' && !preview.headers.some(item => item.enabled && item.name.toLowerCase() === 'authorization')) {
    diagnostics.push({
      code: 'incomplete-basic-auth',
      level: 'error',
      blocking: true,
      message: 'Basic auth is selected but username/password are incomplete.',
      field: 'auth'
    });
  }

  if (auth.type === 'apikey' && (!auth.key || !preview.headers.concat(preview.query).some(item => item.enabled && item.name === auth.key))) {
    diagnostics.push({
      code: 'incomplete-api-key-auth',
      level: 'error',
      blocking: true,
      message: 'API key auth is incomplete. Set both the key and its value source.',
      field: 'auth'
    });
  }

  if (auth.type === 'oauth2') {
    const authState = preview.authState;
    if (authState?.missing.length) {
      diagnostics.push({
        code: 'incomplete-oauth2-auth',
        level: 'error',
        blocking: true,
        message: `OAuth2 client credentials setup is incomplete: ${authState.missing.join(', ')}`,
        field: 'auth'
      });
    }
    if (!authState?.resolvedTokenUrl && !auth.tokenUrl) {
      diagnostics.push({
        code: 'missing-oauth-token-url',
        level: 'error',
        blocking: true,
        message: 'OAuth2 auth is selected but no token URL could be resolved.',
        field: 'auth'
      });
    }
  }

  if (body.mode === 'multipart') {
    const missingFiles = (preview.body.fields || []).filter(
      row => row.enabled && row.kind === 'file' && !String(row.filePath || row.value || '').trim()
    );
    if (missingFiles.length > 0) {
      diagnostics.push({
        code: 'missing-multipart-file',
        level: 'error',
        blocking: true,
        message: `Multipart fields are missing file paths: ${missingFiles.map(item => item.name).join(', ')}`,
        field: 'body'
      });
    }
  }

  return diagnostics;
}

export function inspectResolvedRequest(
  project: ProjectDocument,
  request: RequestDocument,
  caseDocument: CaseDocument | undefined,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>> = []
) {
  const preview = resolveRequest(project, request, caseDocument, environment, extraSources);
  const body = caseDocument?.overrides.body ?? request.body;
  const authInput = caseDocument?.overrides.auth || request.auth;
  const scriptSource = [caseDocument?.scripts?.preRequest || '', caseDocument?.scripts?.postResponse || ''].join('\n').trim();
  const { auth, authSource, profileName } = mergeAuth(request.auth, caseDocument?.overrides.auth, environment);
  const queryRows = caseDocument?.overrides.query ?? request.query;
  const pathRows = caseDocument?.overrides.pathParams ?? request.pathParams;
  const headerRows = mergeRows(
    [...project.runtime.headers, ...(environment?.headers || []), ...request.headers],
    caseDocument?.overrides.headers
  );
  const fields: ResolvedFieldValue[] = [];
  const variables = new Map<
    string,
    {
      token: string;
      source: ResolvedRequestInsight['variables'][number]['source'];
      sourceLabel: string;
      value: string;
      missing: boolean;
      locations: Set<string>;
    }
  >();

  fields.push(
    collectResolvedField(
      {
        location: 'url',
        label: 'Request URL',
        rawValue: caseDocument?.overrides.url || request.url,
        resolvedValue: preview.url
      },
      project,
      environment,
      extraSources,
      variables
    )
  );
  fields.push(
    collectResolvedField(
      {
        location: 'path',
        label: 'Request Path',
        rawValue: caseDocument?.overrides.path || request.path || '',
        resolvedValue: preview.requestPath
      },
      project,
      environment,
      extraSources,
      variables
    )
  );

  headerRows.forEach((row, index) => {
    fields.push(
      collectResolvedField(
        {
          location: 'header',
          label: row.name || `Header ${index + 1}`,
          rawValue: row.value || '',
          resolvedValue:
            preview.headers.find(item => item.name === row.name)?.value || preview.headers[index]?.value || ''
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  });

  queryRows.forEach((row, index) => {
    fields.push(
      collectResolvedField(
        {
          location: 'query',
          label: row.name || `Query ${index + 1}`,
          rawValue: row.value || '',
          resolvedValue: preview.query.find(item => item.name === row.name)?.value || preview.query[index]?.value || ''
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  });

  pathRows.forEach((row, index) => {
    fields.push(
      collectResolvedField(
        {
          location: 'path',
          label: row.name || `Path Variable ${index + 1}`,
          rawValue: row.value || '',
          resolvedValue: row.value ? applyProjectVariables(row.value, project, environment, extraSources) : ''
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  });

  if (body.text) {
    fields.push(
      collectResolvedField(
        {
          location: 'body',
          label: 'Body Text',
          rawValue: body.text,
          resolvedValue: preview.body.text
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  }

  body.fields.forEach((row, index) => {
    fields.push(
      collectResolvedField(
        {
          location: 'body',
          label: row.name || `Body Field ${index + 1}`,
          rawValue: row.kind === 'file' ? row.filePath || row.value || '' : row.value || '',
          resolvedValue:
            preview.body.fields.find(field => field.name === row.name)?.filePath ||
            preview.body.fields.find(field => field.name === row.name)?.value ||
            ''
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  });

  const authPreview = buildAuthPreview(auth, authSource, profileName, project, environment, extraSources);
  const authState = buildResolvedAuthState(auth, authSource, profileName, project, environment, extraSources);
  authPreview.forEach(item => {
    const rawValue =
      authInput.type === 'bearer'
        ? authInput.tokenFromVar
          ? `{{${authInput.tokenFromVar}}}`
          : authInput.token || ''
        : authInput.type === 'basic'
          ? `${authInput.usernameFromVar ? `{{${authInput.usernameFromVar}}}` : authInput.username || ''}:${authInput.passwordFromVar ? `{{${authInput.passwordFromVar}}}` : authInput.password || ''}`
            : authInput.type === 'apikey'
              ? authInput.valueFromVar
                ? `{{${authInput.valueFromVar}}}`
                : authInput.value || ''
            : authInput.type === 'oauth2'
              ? [
                  authInput.tokenUrl || '',
                  authInput.clientIdFromVar ? `{{${authInput.clientIdFromVar}}}` : authInput.clientId || '',
                  authInput.clientSecretFromVar ? `{{${authInput.clientSecretFromVar}}}` : authInput.clientSecret || '',
                  authInput.scope || ''
                ].filter(Boolean).join(' | ')
            : '';
    fields.push(
      collectResolvedField(
        {
          location: 'auth',
          label: item.name,
          rawValue,
          resolvedValue: item.value
        },
        project,
        environment,
        extraSources,
        variables
      )
    );
  });

  const warnings: ResolvedRequestInsight['warnings'] = [];
  const missingVariables = [...variables.values()].filter(item => item.missing);
  if (missingVariables.length > 0) {
    warnings.push({
      code: 'missing-variable',
      level: 'warning',
      message: `Unresolved variables: ${missingVariables.map(item => item.token).join(', ')}`
    });
  }
  if (preview.url.includes('{{')) {
    warnings.push({
      code: 'url-template-leftover',
      level: 'warning',
      message: 'The resolved URL still contains unresolved template variables.'
    });
  }
  if (authSource.startsWith('missing profile')) {
    warnings.push({
      code: 'missing-auth-profile',
      level: 'warning',
      message: `Auth profile "${authInput.profileName || 'unknown'}" was not found in the active environment.`
    });
  }
  if (
    (auth.type === 'bearer' && !auth.token && !auth.tokenFromVar) ||
    (auth.type === 'basic' && !auth.username && !auth.usernameFromVar) ||
    (auth.type === 'apikey' && !auth.key)
  ) {
    warnings.push({
      code: 'incomplete-auth',
      level: 'warning',
      message: `The configured ${auth.type} auth is incomplete and will not be fully applied.`
    });
  }

  const diagnostics = buildPreflightDiagnostics(preview, auth, authSource, body, variables);
  const scriptSignals = inspectScriptSource(scriptSource);
  scriptSignals.forEach(signal => {
    warnings.push({
      code: signal.code,
      level: signal.level === 'error' ? 'warning' : signal.level,
      message: signal.message
    });
    diagnostics.push({
      code: signal.code,
      level: signal.level,
      blocking: false,
      message: signal.message,
      field: 'scripts'
    });
  });

  return resolvedRequestInsightSchema.parse({
    preview: {
      ...preview,
      authState
    },
    variables: [...variables.values()].map(item => ({
      ...item,
      locations: [...item.locations]
    })),
    fieldValues: fields,
    warnings,
    diagnostics,
    authPreview
  });
}

export function resolveRequest(
  project: ProjectDocument,
  request: RequestDocument,
  caseDocument: CaseDocument | undefined,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>> = []
): ResolvedRequest {
  const body = caseDocument?.overrides.body ?? request.body;
  const { auth, authSource, profileName } = mergeAuth(request.auth, caseDocument?.overrides.auth, environment);
  const runtime = mergeRuntime(request, caseDocument);
  const rawUrl = caseDocument?.overrides.url || request.url;
  const resolvedUrl = applyProjectVariables(rawUrl, project, environment, extraSources);
  const urlParts = splitUrlAndQueryRows(resolvedUrl);
  const path = applyProjectVariables(caseDocument?.overrides.path || request.path || '', project, environment, extraSources);
  const baseHeaders = [
    ...project.runtime.headers,
    ...(environment?.headers || []),
    ...request.headers
  ];
  const explicitQueryRows =
    caseDocument && caseDocument.overrides.query !== undefined
      ? caseDocument.overrides.query
      : request.query;
  const headers = mergeRows(baseHeaders, caseDocument?.overrides.headers).map((row: ParameterRow) => ({
    ...row,
    value: applyProjectVariables(row.value, project, environment, extraSources),
    filePath: row.filePath ? applyProjectVariables(row.filePath, project, environment, extraSources) : row.filePath
  }));
  const query = mergeRows(
    explicitQueryRows.length > 0 ? explicitQueryRows : urlParts.query,
    undefined
  ).map((row: ParameterRow) => ({
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
  if (auth.type === 'bearer' && (auth.token || auth.tokenFromVar)) {
    const resolved = resolveAuthValue(auth.token, auth.tokenFromVar, project, environment, extraSources);
    authHeaders.push({
      name: 'Authorization',
      value: `Bearer ${resolved.value}`,
      enabled: true,
      kind: 'text',
      filePath: undefined
    });
  }
  if (auth.type === 'apikey' && auth.key) {
    const target = auth.addTo || 'header';
    const resolved = resolveAuthValue(auth.value || '', auth.valueFromVar, project, environment, extraSources);
    const row = {
      name: auth.key,
      value: resolved.value,
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
  if (auth.type === 'basic' && (auth.username || auth.usernameFromVar)) {
    const username = resolveAuthValue(auth.username, auth.usernameFromVar, project, environment, extraSources);
    const password = resolveAuthValue(auth.password || '', auth.passwordFromVar, project, environment, extraSources);
    const value = encodeBasicAuth(username.value, password.value);
    authHeaders.push({
      name: 'Authorization',
      value: `Basic ${value}`,
      enabled: true,
      kind: 'text',
      filePath: undefined
    });
  }
  if (auth.type === 'oauth2') {
    const cacheStatus = oauthCacheStatus(auth);
    if (cacheStatus === 'fresh' && auth.accessToken) {
      const target = resolveOauthAccessTokenTarget(auth);
      const tokenPrefix = auth.tokenType || auth.tokenPrefix || 'Bearer';
      const row = {
        name: target.name,
        value: target.target === 'header' ? `${tokenPrefix} ${auth.accessToken}` : auth.accessToken,
        enabled: true,
        kind: 'text' as const,
        filePath: undefined
      };
      if (target.target === 'query') {
        authQuery.push(row);
      } else {
        authHeaders.push(row);
      }
    }
  }

  const mergedVariables = mergeVariableSources(project, environment, extraSources);
  let candidateUrl = urlParts.url;
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
    followRedirects: runtime.followRedirects,
    authState: buildResolvedAuthState(auth, authSource, profileName, project, environment, extraSources)
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
        : type.startsWith('json-') || type.startsWith('number-')
          ? '$.data'
          : '',
    expected:
      type === 'status-equals'
        ? '200'
        : type === 'response-time-lt'
          ? '1000'
          : type === 'json-type'
            ? 'string'
            : type === 'json-length'
              ? '1'
              : type === 'number-between'
                ? '0,1'
          : ''
  });
}

export type RuntimeSendRequest = (request: SendRequestInput | ResolvedRequestPreview) => Promise<SendRequestResult>;

export type RequestRunContext = {
  extraSources?: Array<Record<string, unknown>>;
  state?: {
    variables: Record<string, string>;
    environment: EnvironmentDocument;
  };
  collectionRules?: {
    requireSuccessStatus: boolean;
    maxDurationMs?: number;
    requiredJsonPaths?: string[];
  };
  sourceCollection?: {
    id: string;
    name: string;
    stepKey: string;
  };
};

export type PreparedRequestRunInput = {
  workspace: WorkspaceIndex;
  request: RequestDocument;
  caseDocument?: CaseDocument;
  sendRequest: RuntimeSendRequest;
  sessionId?: string;
  context?: RequestRunContext;
};

export type PreparedRequestRunResult = {
  preview: ResolvedRequestPreview;
  response: SendRequestResult;
  checkResults: CheckResult[];
  scriptLogs: ScriptLog[];
  state: {
    variables: Record<string, string>;
    environment: EnvironmentDocument;
  };
};

export type CollectionRunFilters = {
  tags?: string[];
  stepKeys?: string[];
  requestIds?: string[];
  caseIds?: string[];
};

export type CollectionRunOptions = {
  environmentName?: string;
  stepKeys?: string[];
  seedReport?: CollectionRunReport | null;
  filters?: CollectionRunFilters;
  failFast?: boolean;
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildStepOutput(preview: ResolvedRequestPreview, response: SendRequestResult) {
  const headerMap = Object.fromEntries(response.headers.map(item => [item.name.toLowerCase(), item.value]));
  let parsedBody: unknown = response.bodyText;
  try {
    parsedBody = JSON.parse(response.bodyText);
  } catch (_error) {
    parsedBody = response.bodyText;
  }

  return {
    request: {
      method: preview.method,
      url: preview.url,
      query: Object.fromEntries(preview.query.filter(item => item.enabled && item.name.trim()).map(item => [item.name, item.value])),
      headers: Object.fromEntries(preview.headers.filter(item => item.enabled && item.name.trim()).map(item => [item.name.toLowerCase(), item.value])),
      body: preview.body.text
    },
    response: {
      status: response.status,
      durationMs: response.durationMs,
      headers: headerMap,
      body: parsedBody,
      rawBody: response.bodyText
    }
  };
}

function seededStepOutputsFromReport(report: CollectionRunReport | null) {
  if (!report) return {} as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  report.iterations[0]?.stepRuns.forEach(stepRun => {
    if (stepRun.request && stepRun.response) {
      output[stepRun.stepKey] = buildStepOutput(stepRun.request, stepRun.response);
    }
  });
  return output;
}

function resolveCollectionEnvironments(workspace: WorkspaceIndex, collection: CollectionDocument, environmentName?: string) {
  if (environmentName) return [environmentName];
  if (collection.envMatrix.length > 0) return collection.envMatrix;
  return [collection.defaultEnvironment || workspace.project.defaultEnvironment];
}

function shouldRunCollectionStep(input: {
  step: CollectionStep;
  requestRecord: WorkspaceRequestRecord | undefined;
  filters?: CollectionRunFilters;
  explicitStepKeys?: string[];
}) {
  const { step, requestRecord, filters, explicitStepKeys } = input;
  if (!step.enabled) return false;
  if (explicitStepKeys && explicitStepKeys.length > 0 && !explicitStepKeys.includes(step.key)) return false;
  if (!filters) return true;
  if (filters.stepKeys && filters.stepKeys.length > 0 && !filters.stepKeys.includes(step.key)) return false;
  if (filters.requestIds && filters.requestIds.length > 0 && !filters.requestIds.includes(step.requestId)) return false;
  if (filters.caseIds && filters.caseIds.length > 0 && (!step.caseId || !filters.caseIds.includes(step.caseId))) return false;
  if (filters.tags && filters.tags.length > 0) {
    const caseDocument = requestRecord?.cases.find(item => item.id === step.caseId);
    const tags = new Set([...(step.tags || []), ...(caseDocument?.tags || [])]);
    if (!filters.tags.some(tag => tags.has(tag))) return false;
  }
  return true;
}

function shouldRetryAttempt(
  policy: RetryPolicy | undefined,
  failureType: 'network-error' | 'assertion-failed' | 'blocking-diagnostic',
  response?: SendRequestResult
) {
  if (!policy || policy.count <= 0) return false;
  if (response?.status && response.status >= 500 && policy.when.includes('5xx')) return true;
  if (failureType === 'blocking-diagnostic') return false;
  return policy.when.includes(failureType);
}

function normalizeStepRetry(step: CollectionStep, collection: CollectionDocument, caseDocument?: CaseDocument) {
  const fallback = {
    count: 0,
    delayMs: 0,
    when: ['network-error', '5xx', 'assertion-failed']
  } satisfies RetryPolicy;
  const candidates = [step.retry, caseDocument?.retry, collection.defaultRetry].filter(Boolean) as RetryPolicy[];
  const enabled = candidates.find(policy => policy.count > 0);
  return retryPolicySchema.parse(enabled || step.retry || caseDocument?.retry || collection.defaultRetry || fallback);
}

function applyStepOverrides(request: RequestDocument, caseDocument: CaseDocument | undefined, step: CollectionStep) {
  if (!step.timeoutMs) return { request, caseDocument };
  if (caseDocument) {
    return {
      request,
      caseDocument: caseDocumentSchema.parse({
        ...caseDocument,
        overrides: {
          ...caseDocument.overrides,
          runtime: {
            ...caseDocument.overrides.runtime,
            timeoutMs: step.timeoutMs
          }
        }
      })
    };
  }
  return {
    request: requestDocumentSchema.parse({
      ...request,
      runtime: {
        ...request.runtime,
        timeoutMs: step.timeoutMs
      }
    }),
    caseDocument
  };
}

export async function runPreparedRequest(input: PreparedRequestRunInput): Promise<PreparedRequestRunResult> {
  const context = input.context || {};
  const envName =
    input.caseDocument?.environment || context.state?.environment.name || input.workspace.project.defaultEnvironment;
  const sourceEnvironment =
    input.workspace.environments.find(item => item.document.name === envName)?.document || createDefaultEnvironment(envName);
  const initialEnvironment =
    context.state?.environment && context.state.environment.name === envName
      ? context.state.environment
      : structuredClone(sourceEnvironment);
  const state = context.state || {
    variables: {},
    environment: initialEnvironment
  };
  state.environment = initialEnvironment;

  const beforeSources = [
    createNamedTemplateSource('runtime variables', state.variables, 'runtime'),
    ...(context.extraSources || [])
  ];
  const previewBeforeScripts = resolveRequest(
    input.workspace.project,
    input.request,
    input.caseDocument,
    state.environment,
    beforeSources
  );
  const preScript = await executeRequestScript({
    phase: 'pre-request',
    script: input.caseDocument?.scripts?.preRequest || '',
    state,
    request: previewBeforeScripts,
    sendRequest: request => input.sendRequest(sendRequestInputSchema.parse({
      ...request,
      sessionId: input.sessionId || previewBeforeScripts.sessionId
    }))
  });
  const runtimeSources = [
    createNamedTemplateSource('runtime variables', preScript.state.variables, 'script'),
    ...(context.extraSources || [])
  ];
  const insight = inspectResolvedRequest(
    input.workspace.project,
    input.request,
    input.caseDocument,
    preScript.state.environment || initialEnvironment,
    runtimeSources
  );
  const blockingDiagnostics = insight.diagnostics.filter(item => item.blocking);
  if (blockingDiagnostics.length > 0) {
    throw Object.assign(new Error(blockingDiagnostics.map(item => item.message).join(' ')), {
      failureType: 'blocking-diagnostic' as const
    });
  }

  const preview = resolvedRequestPreviewSchema.parse({
    ...insight.preview,
    sessionId: input.sessionId || input.workspace.root
  });
  const response = await input.sendRequest(preview);
  const builtinChecks = input.caseDocument ? evaluateChecks(response, input.caseDocument.checks || [], { examples: input.request.examples }) : [];
  const collectionChecks = context.collectionRules
    ? applyCollectionRules({
        ...context.collectionRules,
        response
      })
    : [];
  const postScript = await executeRequestScript({
    phase: 'post-response',
    script: input.caseDocument?.scripts?.postResponse || '',
    state: preScript.state,
    request: preview,
    response
  });
  const baselineChecks =
    input.caseDocument?.baselineRef
      ? evaluateChecks(response, [
          caseCheckSchema.parse({
            id: createId('check'),
            type: 'snapshot-match',
            label: `Snapshot ${input.caseDocument.baselineRef}`,
            enabled: true,
            path: '',
            expected: input.caseDocument.baselineRef
          })
        ], { examples: input.request.examples })
      : [];

  return {
    preview,
    response,
    checkResults: [...builtinChecks, ...collectionChecks, ...baselineChecks, ...postScript.testResults],
    scriptLogs: [...preScript.logs, ...postScript.logs],
    state: {
      variables: { ...postScript.state.variables },
      environment: structuredClone(postScript.state.environment || initialEnvironment)
    }
  };
}

async function runCollectionStepWithRetry(input: {
  workspace: WorkspaceIndex;
  collection: CollectionDocument;
  step: CollectionStep;
  requestRecord: WorkspaceRequestRecord;
  runtimeState: { variables: Record<string, string>; environment: EnvironmentDocument };
  dataVars: Record<string, unknown>;
  seeded: Record<string, unknown>;
  sendRequest: RuntimeSendRequest;
}) {
  const caseDocument = input.requestRecord.cases.find(item => item.id === input.step.caseId);
  const retry = normalizeStepRetry(input.step, input.collection, caseDocument);
  const attempts: CollectionStepRun['attempts'] = [];
  const extraSources = [
    createNamedTemplateSource('collection vars', input.collection.vars, 'collection'),
    createNamedTemplateSource('step outputs', { steps: input.seeded }, 'step-output'),
    createNamedTemplateSource('data row', input.dataVars, 'data-row')
  ];

  const skipExpression = interpolateString(input.step.skipIf || caseDocument?.skip.when || '', [
    input.runtimeState.variables,
    input.dataVars as Record<string, unknown>,
    { steps: input.seeded },
    input.runtimeState.environment.vars
  ]);
  if (caseDocument?.skip.enabled || ['true', '1', 'yes'].includes(skipExpression.trim().toLowerCase())) {
    return {
      stepRun: {
        stepKey: input.step.key,
        stepName: input.step.name || input.step.key,
        requestId: input.step.requestId,
        caseId: input.step.caseId,
        ok: false,
        skipped: true,
        checkResults: [],
        scriptLogs: [],
        error: caseDocument?.skip.reason || 'Skipped by condition',
        failureType: 'skipped',
        attempts: []
      } satisfies CollectionStepRun,
      nextState: input.runtimeState
    };
  }

  for (let attempt = 1; attempt <= retry.count + 1; attempt += 1) {
    try {
      const overridden = applyStepOverrides(input.requestRecord.request, caseDocument, input.step);
      const result = await runPreparedRequest({
        workspace: input.workspace,
        request: overridden.request,
        caseDocument: overridden.caseDocument,
        sendRequest: input.sendRequest,
        sessionId: input.workspace.root,
        context: {
          extraSources,
          state: input.runtimeState,
          collectionRules: input.collection.rules,
          sourceCollection: {
            id: input.collection.id,
            name: input.collection.name,
            stepKey: input.step.key
          }
        }
      });
      const ok = result.checkResults.every(check => check.ok);
      attempts.push({
        attempt,
        ok,
        response: result.response,
        checkResults: result.checkResults,
        failureType: ok ? undefined : 'assertion-failed'
      });
      if (ok || attempt > retry.count || !shouldRetryAttempt(retry, 'assertion-failed', result.response)) {
        return {
          stepRun: {
            stepKey: input.step.key,
            stepName: input.step.name || input.step.key,
            requestId: input.step.requestId,
            caseId: input.step.caseId,
            ok,
            skipped: false,
            request: result.preview,
            response: result.response,
            checkResults: result.checkResults,
            scriptLogs: result.scriptLogs,
            failureType: ok ? undefined : 'assertion-failed',
            baselineName: caseDocument?.baselineRef || undefined,
            attempts
          } satisfies CollectionStepRun,
          nextState: result.state,
          output: buildStepOutput(result.preview, result.response)
        };
      }
    } catch (error) {
      const failureType = ((error as { failureType?: 'network-error' | 'blocking-diagnostic' }).failureType || 'network-error');
      attempts.push({
        attempt,
        ok: false,
        checkResults: [],
        error: (error as Error).message || 'Collection step failed',
        failureType
      });
      if (attempt > retry.count || !shouldRetryAttempt(retry, failureType)) {
        return {
          stepRun: {
            stepKey: input.step.key,
            stepName: input.step.name || input.step.key,
            requestId: input.step.requestId,
            caseId: input.step.caseId,
            ok: false,
            skipped: false,
            checkResults: [],
            scriptLogs: [],
            error: (error as Error).message || 'Collection step failed',
            failureType,
            baselineName: caseDocument?.baselineRef || undefined,
            attempts
          } satisfies CollectionStepRun,
          nextState: input.runtimeState
        };
      }
    }

    if (retry.delayMs > 0) {
      await delay(retry.delayMs);
    }
  }

  return {
    stepRun: {
      stepKey: input.step.key,
      stepName: input.step.name || input.step.key,
      requestId: input.step.requestId,
      caseId: input.step.caseId,
      ok: false,
      skipped: false,
      checkResults: [],
      scriptLogs: [],
      error: 'Collection step failed',
      failureType: 'network-error',
      attempts
    } satisfies CollectionStepRun,
    nextState: input.runtimeState
  };
}

export async function runCollection(input: {
  workspace: WorkspaceIndex;
  collectionId: string;
  sendRequest: RuntimeSendRequest;
  options?: CollectionRunOptions;
}) {
  const record = input.workspace.collections.find(item => item.document.id === input.collectionId);
  if (!record) throw new Error('Collection not found');
  const collection = record.document;
  const matrixEnvironments = resolveCollectionEnvironments(input.workspace, collection, input.options?.environmentName);
  const parsedDataRows = parseCollectionDataText(record.dataText || '');
  const baseRows =
    parsedDataRows.length > 0
      ? parsedDataRows
      : Array.from({ length: Math.max(collection.iterationCount || 1, 1) }, () => ({} as Record<string, unknown>));

  const reportIterations: CollectionRunReport['iterations'] = [];
  let passedSteps = 0;
  let failedSteps = 0;
  let skippedSteps = 0;

  for (const matrixEnvironment of matrixEnvironments) {
    const sourceEnvironment =
      input.workspace.environments.find(item => item.document.name === matrixEnvironment)?.document || createDefaultEnvironment(matrixEnvironment);
    for (let index = 0; index < baseRows.length; index += 1) {
      const dataVars = baseRows[index] || {};
      let runtimeState = {
        variables: { ...collection.vars },
        environment: structuredClone(sourceEnvironment)
      };
      const seeded = seededStepOutputsFromReport(input.options?.seedReport || null);
      const stepRuns: CollectionStepRun[] = [];
      const phases = [
        ...(collection.setupSteps || []).map(step => ({ ...step, key: `setup:${step.key}`, name: step.name || step.key })),
        ...collection.steps,
        ...(collection.teardownSteps || []).map(step => ({ ...step, key: `teardown:${step.key}`, name: step.name || step.key }))
      ];
      let stop = false;

      for (const step of phases) {
        const requestRecord = input.workspace.requests.find(item => item.request.id === step.requestId);
        if (!requestRecord || !shouldRunCollectionStep({
          step,
          requestRecord,
          filters: input.options?.filters,
          explicitStepKeys: input.options?.stepKeys
        })) {
          continue;
        }
        if (stop) {
          stepRuns.push({
            stepKey: step.key,
            stepName: step.name || step.key,
            requestId: step.requestId,
            caseId: step.caseId,
            ok: false,
            skipped: true,
            checkResults: [],
            scriptLogs: [],
            error: 'Skipped after previous failure',
            failureType: 'skipped',
            attempts: []
          });
          skippedSteps += 1;
          continue;
        }

        const executed = await runCollectionStepWithRetry({
          workspace: input.workspace,
          collection,
          step,
          requestRecord,
          runtimeState,
          dataVars,
          seeded,
          sendRequest: input.sendRequest
        });
        runtimeState = executed.nextState;
        if (executed.output) {
          seeded[step.key.replace(/^(setup:|teardown:)/, '')] = executed.output;
        }
        stepRuns.push(executed.stepRun);
        if (executed.stepRun.ok) {
          passedSteps += 1;
        } else if (executed.stepRun.skipped) {
          skippedSteps += 1;
        } else {
          failedSteps += 1;
          if (input.options?.failFast || (!step.continueOnFailure && !collection.continueOnFailure && collection.stopOnFailure)) {
            stop = true;
          }
        }
      }

      reportIterations.push({
        index,
        dataLabel: baseRows.length > 0 ? `Row ${index + 1}` : undefined,
        dataVars: Object.fromEntries(Object.entries(dataVars).map(([key, value]) => [key, String(value ?? '')])),
        stepRuns,
        environmentName: matrixEnvironment,
        matrixLabel: matrixEnvironment
      });
    }
  }

  return collectionRunReportSchema.parse({
    id: createId('colrun'),
    workspaceRoot: input.workspace.root,
    collectionId: collection.id,
    collectionName: collection.name,
    environmentName: input.options?.environmentName || collection.defaultEnvironment || input.workspace.project.defaultEnvironment,
    status: failedSteps === 0 ? 'passed' : passedSteps > 0 ? 'partial' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    iterationCount: reportIterations.length || 1,
    passedSteps,
    failedSteps,
    skippedSteps,
    iterations: reportIterations,
    matrixEnvironments,
    filters: {
      tags: input.options?.filters?.tags || [],
      stepKeys: input.options?.filters?.stepKeys || input.options?.stepKeys || [],
      requestIds: input.options?.filters?.requestIds || [],
      caseIds: input.options?.filters?.caseIds || []
    }
  });
}

export function rerunFailedStepKeys(report: CollectionRunReport) {
  return [...new Set(
    report.iterations
      .flatMap(iteration => iteration.stepRuns)
      .filter(step => !step.ok && !step.skipped && !step.stepKey.startsWith('teardown:'))
      .map(step => step.stepKey.replace(/^(setup:|teardown:)/, ''))
  )];
}

export function renderCollectionRunReportJunit(report: CollectionRunReport) {
  const testcases = report.iterations.flatMap(iteration =>
    iteration.stepRuns.map(step => {
      const name = `${iteration.matrixLabel || iteration.environmentName || report.environmentName || 'default'} / ${iteration.dataLabel || `Iteration ${iteration.index + 1}`} / ${step.stepName}`;
      const failure = step.ok || step.skipped
        ? ''
        : `<failure message="${escapeHtml(step.error || step.checkResults.find(check => !check.ok)?.message || 'Step failed')}">${escapeHtml(JSON.stringify({
            failureType: step.failureType,
            attempts: step.attempts,
            checks: step.checkResults
          }, null, 2))}</failure>`;
      const skipped = step.skipped ? `<skipped message="${escapeHtml(step.error || 'Skipped')}" />` : '';
      return `<testcase classname="${escapeHtml(report.collectionName)}" name="${escapeHtml(name)}" time="${((step.response?.durationMs || 0) / 1000).toFixed(3)}">${failure}${skipped}</testcase>`;
    })
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${escapeHtml(report.collectionName)}" tests="${report.iterations.flatMap(item => item.stepRuns).length}" failures="${report.failedSteps}" skipped="${report.skippedSteps}">
${testcases}
</testsuite>`;
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

function parseCsvDataText(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) {
    throw new Error('Collection CSV data must include a header row and at least one data row');
  }

  const headers = rows[0].map((header, index) => header || `column_${index + 1}`);
  return rows.slice(1).map((row, index) => {
    const output: Record<string, unknown> = {};
    headers.forEach((header, columnIndex) => {
      output[header] = row[columnIndex] ?? '';
    });
    if (Object.keys(output).length === 0) {
      throw new Error(`Collection data row ${index + 2} is empty`);
    }
    return output;
  });
}

export function inspectCollectionDataText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      format: 'empty' as const,
      rows: [] as Array<Record<string, unknown>>,
      columns: [] as string[]
    };
  }

  let format: 'json' | 'yaml' | 'csv' = 'json';
  let parsed: unknown;
  try {
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      parsed = JSON.parse(trimmed);
      format = 'json';
    } else {
      parsed = parseYamlDocument<unknown>(trimmed);
      format = 'yaml';
    }
  } catch (_error) {
    parsed = parseCsvDataText(trimmed);
    format = 'csv';
  }

  if (!Array.isArray(parsed)) {
    if (trimmed.includes(',') || trimmed.includes('\n')) {
      parsed = parseCsvDataText(trimmed);
      format = 'csv';
    } else {
      throw new Error('Collection data file must contain a JSON/YAML array of objects or a CSV table');
    }
  }

  const parsedRows = parsed as unknown[];
  const rows = parsedRows.map((row: unknown, index: number) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Collection data row ${index + 1} must be an object`);
    }
    return row as Record<string, unknown>;
  });

  const columns = [...rows.reduce((set: Set<string>, row: Record<string, unknown>) => {
    Object.keys(row).forEach(key => set.add(key));
    return set;
  }, new Set<string>())];

  return { format, rows, columns };
}

export function parseCollectionDataText(text: string) {
  return inspectCollectionDataText(text).rows;
}

function inspectScriptSource(script: string) {
  const trimmed = script.trim();
  if (!trimmed) return [] as Array<{ code: string; level: 'warning' | 'error'; message: string }>;

  const signals: Array<{ code: string; level: 'warning' | 'error'; message: string }> = UNSUPPORTED_SCRIPT_PATTERNS
    .filter(pattern => trimmed.includes(pattern.token))
    .map(pattern => ({
    code: pattern.code,
    level: pattern.level,
    message: pattern.message
  }));

  try {
    // Validate syntax early so the UI can warn before the user sends the request.
    // eslint-disable-next-line no-new-func
    new Function('pm', 'console', trimmed);
  } catch (error) {
    signals.push({
      code: 'script-parse-error',
      level: 'error',
      message: `Script parsing failed: ${(error as Error).message || 'Unknown parser error'}`
    });
  }

  return signals;
}

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderCollectionRunReportHtml(report: CollectionRunReport) {
  const failureRows = report.iterations
    .flatMap(iteration =>
      iteration.stepRuns
        .filter(step => !step.ok || step.skipped)
        .map(step => ({
          iteration: iteration.dataLabel || `Iteration ${iteration.index + 1}`,
          step: step.stepName,
          status: step.skipped ? 'SKIPPED' : 'FAILED',
          detail: step.error || step.checkResults.find(check => !check.ok)?.message || 'No detail available'
        }))
    )
    .slice(0, 50);

  const iterationSections = report.iterations
    .map(iteration => {
      const stepRows = iteration.stepRuns
        .map(step => {
          const attemptCount = step.attempts?.length || 1;
          const summary =
            step.error ||
            step.checkResults.find(check => !check.ok)?.message ||
            `${step.checkResults.length} checks / ${attemptCount} attempt(s)`;
          return `
            <tr>
              <td>${escapeHtml(step.stepName)}</td>
              <td>${escapeHtml(step.stepKey)}</td>
              <td>${escapeHtml(step.skipped ? 'SKIPPED' : step.ok ? 'PASS' : 'FAIL')}</td>
              <td>${escapeHtml(iteration.environmentName || report.environmentName || 'shared')}</td>
              <td>${escapeHtml(String(attemptCount))}</td>
              <td>${escapeHtml(summary)}</td>
            </tr>
          `;
        })
        .join('');

      return `
        <section class="iteration">
          <h2>${escapeHtml(iteration.matrixLabel || iteration.environmentName || report.environmentName || 'shared')} · ${escapeHtml(iteration.dataLabel || `Iteration ${iteration.index + 1}`)}</h2>
          <table>
            <thead>
              <tr><th>Step</th><th>Key</th><th>Status</th><th>Env</th><th>Attempts</th><th>Summary</th></tr>
            </thead>
            <tbody>${stepRows}</tbody>
          </table>
        </section>
      `;
    })
    .join('');

  const failureList = failureRows.length
    ? `
      <section class="summary">
        <h2>Failure Summary</h2>
        <table>
          <thead>
            <tr><th>Iteration</th><th>Step</th><th>Status</th><th>Detail</th></tr>
          </thead>
          <tbody>
            ${failureRows
              .map(
                row => `
                  <tr>
                    <td>${escapeHtml(row.iteration)}</td>
                    <td>${escapeHtml(row.step)}</td>
                    <td>${escapeHtml(row.status)}</td>
                    <td>${escapeHtml(row.detail)}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </section>
    `
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(report.collectionName)} report</title>
    <style>
      :root { color-scheme: light; font-family: "Segoe UI", "PingFang SC", sans-serif; }
      body { margin: 0; padding: 32px; background: #f6f8fb; color: #16212b; }
      h1, h2 { margin: 0 0 12px; }
      h1 { font-size: 28px; }
      h2 { font-size: 18px; margin-top: 28px; }
      .hero, .summary, .iteration { background: #ffffff; border: 1px solid #d7dde6; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
      .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 16px; }
      .meta div { background: #f1f5f9; border-radius: 10px; padding: 12px; }
      .meta span { display: block; font-size: 12px; color: #52606d; margin-bottom: 6px; }
      .meta strong { font-size: 18px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e6ebf2; vertical-align: top; }
      th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #5b6772; }
      td { font-size: 14px; }
    </style>
  </head>
  <body>
    <section class="hero">
      <h1>${escapeHtml(report.collectionName)}</h1>
      <p>Environment: ${escapeHtml(report.environmentName || 'shared')} · Matrix: ${escapeHtml(report.matrixEnvironments?.join(', ') || 'single')} · Status: ${escapeHtml(report.status)}</p>
      <div class="meta">
        <div><span>Iterations</span><strong>${report.iterationCount}</strong></div>
        <div><span>Passed Steps</span><strong>${report.passedSteps}</strong></div>
        <div><span>Failed Steps</span><strong>${report.failedSteps}</strong></div>
        <div><span>Skipped Steps</span><strong>${report.skippedSteps}</strong></div>
      </div>
    </section>
    ${failureList}
    ${iterationSections}
  </body>
</html>`;
}

export {
  applyCollectionRules,
  buildImportJourneyState,
  buildCurlCommand,
  evaluateChecks,
  evaluateSyncGuard,
  executeRequestScript,
  interpolateString,
  mergeTemplateSources
};
