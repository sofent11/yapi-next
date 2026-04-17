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
  resolvedAuthPreviewItemSchema,
  resolvedFieldValueSchema,
  resolvedRequestInsightSchema,
  resolvedRequestPreviewSchema,
  runtimeSettingsSchema,
  requestBodySchema,
  requestDocumentSchema,
  slugify,
  type AuthConfig,
  type CaseCheck,
  type CaseDocument,
  type CollectionDocument,
  type CollectionRunReport,
  type EnvironmentDocument,
  type ParameterRow,
  type ProjectDocument,
  type RequestBody,
  type RequestDocument,
  type ResolvedAuthPreviewItem,
  type ResolvedFieldValue,
  type ResolvedRequestInsight,
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

const VARIABLE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;
const UNSUPPORTED_SCRIPT_PATTERNS = [
  {
    token: 'pm.sendRequest',
    code: 'script-unsupported-send-request',
    level: 'warning' as const,
    message: 'pm.sendRequest is not supported by the local debugger runtime yet.'
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

function buildAuthPreview(
  auth: AuthConfig,
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
        sourceLabel: resolved.sourceLabel
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
        sourceLabel: `${username.sourceLabel}; ${password.sourceLabel}`
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
        sourceLabel: resolved.sourceLabel
      })
    );
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
  const { auth, authSource } = mergeAuth(request.auth, caseDocument?.overrides.auth, environment);
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

  const authPreview = buildAuthPreview(auth, project, environment, extraSources);
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
    preview,
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
          const summary = step.error || step.checkResults.find(check => !check.ok)?.message || `${step.checkResults.length} checks`;
          return `
            <tr>
              <td>${escapeHtml(step.stepName)}</td>
              <td>${escapeHtml(step.stepKey)}</td>
              <td>${escapeHtml(step.skipped ? 'SKIPPED' : step.ok ? 'PASS' : 'FAIL')}</td>
              <td>${escapeHtml(summary)}</td>
            </tr>
          `;
        })
        .join('');

      return `
        <section class="iteration">
          <h2>${escapeHtml(iteration.dataLabel || `Iteration ${iteration.index + 1}`)}</h2>
          <table>
            <thead>
              <tr><th>Step</th><th>Key</th><th>Status</th><th>Summary</th></tr>
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
      <p>Environment: ${escapeHtml(report.environmentName || 'shared')} · Status: ${escapeHtml(report.status)}</p>
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
  buildCurlCommand,
  evaluateChecks,
  executeRequestScript
};
