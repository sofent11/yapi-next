import { z } from 'zod';

export const SCHEMA_VERSION = 1;
export const REQUEST_SUFFIX = '.request.yaml';
export const CASE_SUFFIX = '.case.yaml';
export const COLLECTION_SUFFIX = '.collection.yaml';
export const LOCAL_ENV_SUFFIX = '.local.yaml';
export const DEFAULT_GITIGNORE = ['.DS_Store', 'environments/*.local.yaml', '.yapi-debugger-cache/'].join('\n') + '\n';
export const BODY_SIDECAR_THRESHOLD = 1800;

export const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
export type HttpMethod = z.infer<typeof httpMethodSchema>;

export const parameterRowSchema = z.object({
  name: z.string().default(''),
  value: z.string().default(''),
  enabled: z.boolean().default(true),
  description: z.string().optional(),
  kind: z.enum(['text', 'file']).default('text'),
  filePath: z.string().optional()
});
export type ParameterRow = z.infer<typeof parameterRowSchema>;

export const authTypeSchema = z.enum(['inherit', 'none', 'bearer', 'basic', 'apikey', 'profile', 'oauth2']);
export type AuthType = z.infer<typeof authTypeSchema>;

export const authConfigSchema = z.object({
  type: authTypeSchema.default('inherit'),
  token: z.string().optional(),
  tokenFromVar: z.string().optional(),
  username: z.string().optional(),
  usernameFromVar: z.string().optional(),
  password: z.string().optional(),
  passwordFromVar: z.string().optional(),
  key: z.string().optional(),
  value: z.string().optional(),
  valueFromVar: z.string().optional(),
  addTo: z.enum(['header', 'query']).optional(),
  profileName: z.string().optional(),
  oauthFlow: z.enum(['client_credentials']).optional(),
  tokenUrl: z.string().optional(),
  clientId: z.string().optional(),
  clientIdFromVar: z.string().optional(),
  clientSecret: z.string().optional(),
  clientSecretFromVar: z.string().optional(),
  scope: z.string().optional(),
  tokenPlacement: z.enum(['header', 'query']).optional(),
  tokenName: z.string().optional(),
  tokenPrefix: z.string().optional(),
  tokenType: z.string().optional(),
  accessToken: z.string().optional(),
  expiresAt: z.string().optional()
});
export type AuthConfig = z.infer<typeof authConfigSchema>;

export const runtimeSettingsSchema = z.object({
  timeoutMs: z.number().int().positive().default(30000),
  followRedirects: z.boolean().default(true)
});
export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;

export const requestBodySchema = z.object({
  mode: z.enum(['none', 'json', 'text', 'form-urlencoded', 'multipart']).default('none'),
  mimeType: z.string().optional(),
  text: z.string().default(''),
  file: z.string().optional(),
  fields: z.array(parameterRowSchema).default([])
});
export type RequestBody = z.infer<typeof requestBodySchema>;

export const responseExampleSchema = z.object({
  name: z.string(),
  role: z.enum(['example', 'baseline']).default('example'),
  status: z.number().int().min(100).max(599).optional(),
  mimeType: z.string().optional(),
  text: z.string().default(''),
  file: z.string().optional()
});
export type ResponseExample = z.infer<typeof responseExampleSchema>;

export const projectRuntimeConfigSchema = z.object({
  baseUrl: z.string().default('https://api.example.com'),
  vars: z.record(z.string(), z.string()).default({}),
  headers: z.array(parameterRowSchema).default([]),
  description: z.string().default('')
});
export type ProjectRuntimeConfig = z.infer<typeof projectRuntimeConfigSchema>;

export const projectDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  name: z.string().min(1),
  defaultEnvironment: z.string().default('shared'),
  labels: z.array(z.string()).default([]),
  runtime: projectRuntimeConfigSchema.default({
    baseUrl: 'https://api.example.com',
    vars: {},
    headers: [],
    description: ''
  })
});
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;

export const environmentDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  name: z.string().min(1),
  vars: z.record(z.string(), z.string()).default({}),
  headers: z.array(parameterRowSchema).default([]),
  authProfiles: z.array(z.object({
    name: z.string(),
    auth: authConfigSchema
  })).default([]),
  sharedVars: z.record(z.string(), z.string()).optional(),
  sharedHeaders: z.array(parameterRowSchema).optional(),
  localVars: z.record(z.string(), z.string()).optional(),
  localHeaders: z.array(parameterRowSchema).optional(),
  sharedFilePath: z.string().optional(),
  localFilePath: z.string().optional(),
  overlayMode: z.enum(['standalone', 'overlay']).optional()
});
export type EnvironmentDocument = z.infer<typeof environmentDocumentSchema>;

export const requestDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  method: httpMethodSchema.default('GET'),
  url: z.string().default(''),
  path: z.string().default(''),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  headers: z.array(parameterRowSchema).default([]),
  query: z.array(parameterRowSchema).default([]),
  pathParams: z.array(parameterRowSchema).default([]),
  body: requestBodySchema.default({ mode: 'none', text: '', fields: [] }),
  auth: authConfigSchema.default({ type: 'inherit' }),
  runtime: runtimeSettingsSchema.default({ timeoutMs: 30000, followRedirects: true }),
  examples: z.array(responseExampleSchema).default([]),
  order: z.number().int().default(0)
});
export type RequestDocument = z.infer<typeof requestDocumentSchema>;

export const caseOverridesSchema = z.object({
  method: httpMethodSchema.optional(),
  url: z.string().optional(),
  path: z.string().optional(),
  headers: z.array(parameterRowSchema).optional(),
  query: z.array(parameterRowSchema).optional(),
  pathParams: z.array(parameterRowSchema).optional(),
  body: requestBodySchema.optional(),
  auth: authConfigSchema.optional(),
  runtime: runtimeSettingsSchema.partial().optional()
});
export type CaseOverrides = z.infer<typeof caseOverridesSchema>;

export const caseCheckTypeSchema = z.enum([
  'status-equals',
  'header-equals',
  'header-includes',
  'json-exists',
  'json-equals',
  'body-contains',
  'body-regex',
  'response-time-lt'
]);
export type CaseCheckType = z.infer<typeof caseCheckTypeSchema>;

export const caseCheckSchema = z.object({
  id: z.string().min(1),
  type: caseCheckTypeSchema,
  label: z.string().default(''),
  enabled: z.boolean().default(true),
  path: z.string().default(''),
  expected: z.string().default('')
});
export type CaseCheck = z.infer<typeof caseCheckSchema>;

export const caseScriptsSchema = z.object({
  preRequest: z.string().default(''),
  postResponse: z.string().default('')
});
export type CaseScripts = z.infer<typeof caseScriptsSchema>;

export const caseOriginSchema = z.object({
  type: z.enum(['history', 'collection-run']),
  runId: z.string().min(1),
  collectionId: z.string().optional(),
  stepKey: z.string().optional()
});
export type CaseOrigin = z.infer<typeof caseOriginSchema>;

export const caseDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  extendsRequest: z.string().min(1),
  environment: z.string().optional(),
  notes: z.string().default(''),
  overrides: caseOverridesSchema.default({}),
  checks: z.array(caseCheckSchema).default([]),
  scripts: caseScriptsSchema.optional(),
  origin: caseOriginSchema.optional()
});
export type CaseDocument = z.infer<typeof caseDocumentSchema>;

export const collectionStepSchema = z.object({
  key: z.string().min(1),
  requestId: z.string().min(1),
  caseId: z.string().optional(),
  enabled: z.boolean().default(true),
  name: z.string().optional()
});
export type CollectionStep = z.infer<typeof collectionStepSchema>;

export const collectionRulesSchema = z.object({
  requireSuccessStatus: z.boolean().default(false),
  maxDurationMs: z.number().int().positive().optional(),
  requiredJsonPaths: z.array(z.string()).default([])
});
export type CollectionRules = z.infer<typeof collectionRulesSchema>;

export const collectionDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  defaultEnvironment: z.string().default('shared'),
  stopOnFailure: z.boolean().default(true),
  iterationCount: z.number().int().positive().default(1),
  vars: z.record(z.string(), z.string()).default({}),
  dataFile: z.string().optional(),
  rules: collectionRulesSchema.default({
    requireSuccessStatus: false,
    requiredJsonPaths: []
  }),
  steps: z.array(collectionStepSchema).default([])
});
export type CollectionDocument = z.infer<typeof collectionDocumentSchema>;

export const workspaceCollectionRecordSchema = z.object({
  document: collectionDocumentSchema,
  filePath: z.string(),
  dataFilePath: z.string().optional(),
  dataText: z.string().default('')
});
export type WorkspaceCollectionRecord = z.infer<typeof workspaceCollectionRecordSchema>;

export const workspaceRequestRecordSchema = z.object({
  request: requestDocumentSchema,
  cases: z.array(caseDocumentSchema).default([]),
  folderSegments: z.array(z.string()).default([]),
  requestFilePath: z.string(),
  resourceDirPath: z.string()
});
export type WorkspaceRequestRecord = z.infer<typeof workspaceRequestRecordSchema>;

export const workspaceEnvironmentRecordSchema = z.object({
  document: environmentDocumentSchema,
  filePath: z.string(),
  localFilePath: z.string().optional()
});
export type WorkspaceEnvironmentRecord = z.infer<typeof workspaceEnvironmentRecordSchema>;

export type WorkspaceTreeNode =
  | {
      id: string;
      name: string;
      kind: 'project';
      children: WorkspaceTreeNode[];
    }
  | {
      id: string;
      name: string;
      kind: 'category';
      path: string;
      children: WorkspaceTreeNode[];
    }
  | {
      id: string;
      name: string;
      kind: 'request';
      path: string;
      requestId: string;
      method: HttpMethod;
      requestPath: string;
      caseCount: number;
      children: WorkspaceTreeNode[];
    }
  | {
      id: string;
      name: string;
      kind: 'case';
      requestId: string;
      caseId: string;
    };

const workspaceTreeNodeLazySchema: z.ZodType<WorkspaceTreeNode> = z.lazy(() =>
  z.union([
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.literal('project'),
      children: z.array(workspaceTreeNodeLazySchema).default([])
    }),
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.literal('category'),
      path: z.string(),
      children: z.array(workspaceTreeNodeLazySchema).default([])
    }),
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.literal('request'),
      path: z.string(),
      requestId: z.string(),
      method: httpMethodSchema.default('GET'),
      requestPath: z.string().default('/'),
      caseCount: z.number().int().default(0),
      children: z.array(workspaceTreeNodeLazySchema).default([])
    }),
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.literal('case'),
      requestId: z.string(),
      caseId: z.string()
    })
  ])
);

export const workspaceTreeNodeSchema = workspaceTreeNodeLazySchema;
export const treeNodeSchema = workspaceTreeNodeSchema;
export type TreeNode = WorkspaceTreeNode;

export const workspaceIndexSchema = z.object({
  root: z.string(),
  project: projectDocumentSchema,
  environments: z.array(workspaceEnvironmentRecordSchema).default([]),
  requests: z.array(workspaceRequestRecordSchema).default([]),
  collections: z.array(workspaceCollectionRecordSchema).default([]),
  tree: z.array(workspaceTreeNodeSchema).default([]),
  gitignorePath: z.string().optional(),
  gitignoreContent: z.string().optional()
});
export type WorkspaceIndex = z.infer<typeof workspaceIndexSchema>;

export const importWarningSchema = z.object({
  level: z.enum(['info', 'warning']).default('warning'),
  scope: z.enum(['project', 'request', 'case']).default('request'),
  requestName: z.string().optional(),
  code: z.string().optional(),
  status: z.enum(['compatible', 'degraded', 'unsupported']).default('degraded'),
  message: z.string().min(1)
});
export type ImportWarning = z.infer<typeof importWarningSchema>;

export const importAuthSchema = z.object({
  mode: z.enum(['none', 'bearer', 'header', 'query']).default('none'),
  token: z.string().optional(),
  key: z.string().optional(),
  value: z.string().optional()
});
export type ImportAuth = z.infer<typeof importAuthSchema>;

export const importSourceSchema = z.object({
  name: z.string(),
  content: z.string(),
  sourceType: z.enum(['file', 'url'])
});
export type ImportSource = z.infer<typeof importSourceSchema>;

export const importResultSchema = z.object({
  detectedFormat: z.enum(['openapi3', 'swagger2', 'postman', 'har', 'unknown']),
  summary: z.object({
    requests: z.number().int().default(0),
    folders: z.number().int().default(0),
    environments: z.number().int().default(0)
  }),
  project: projectDocumentSchema,
  environments: z.array(environmentDocumentSchema).default([]),
  requests: z.array(z.object({
    folderSegments: z.array(z.string()).default([]),
    request: requestDocumentSchema,
    cases: z.array(caseDocumentSchema).default([])
  })).default([]),
  warnings: z.array(importWarningSchema).default([])
});
export type ImportResult = z.infer<typeof importResultSchema>;

export const sendRequestInputSchema = z.object({
  method: httpMethodSchema.default('GET'),
  url: z.string().min(1),
  headers: z.array(parameterRowSchema).default([]),
  query: z.array(parameterRowSchema).default([]),
  body: requestBodySchema.default({ mode: 'none', text: '', fields: [] }),
  sessionId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  followRedirects: z.boolean().optional()
});
export type SendRequestInput = z.infer<typeof sendRequestInputSchema>;

export const responseHeaderSchema = z.object({
  name: z.string(),
  value: z.string()
});
export type ResponseHeader = z.infer<typeof responseHeaderSchema>;

export const sendRequestResultSchema = z.object({
  ok: z.boolean(),
  status: z.number().int(),
  statusText: z.string(),
  url: z.string(),
  durationMs: z.number().int(),
  sizeBytes: z.number().int(),
  headers: z.array(responseHeaderSchema).default([]),
  bodyText: z.string(),
  timestamp: z.string()
});
export type SendRequestResult = z.infer<typeof sendRequestResultSchema>;

export const sessionCookieSchema = z.object({
  name: z.string(),
  value: z.string()
});
export type SessionCookie = z.infer<typeof sessionCookieSchema>;

export const sessionSnapshotSchema = z.object({
  sessionId: z.string(),
  url: z.string().optional(),
  cookieHeader: z.string().default(''),
  cookies: z.array(sessionCookieSchema).default([])
});
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;

export const resolvedRequestPreviewSchema = sendRequestInputSchema.extend({
  name: z.string(),
  environmentName: z.string().optional(),
  authSource: z.string().default('none'),
  requestPath: z.string().default('/'),
  authState: z.object({
    type: authTypeSchema.default('none'),
    source: z.string().default('none'),
    profileName: z.string().optional(),
    tokenInjected: z.boolean().default(false),
    cacheStatus: z.enum(['none', 'fresh', 'expired', 'pending']).default('none'),
    expiresAt: z.string().optional(),
    resolvedTokenUrl: z.string().optional(),
    missing: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([])
  }).optional()
});
export type ResolvedRequestPreview = z.infer<typeof resolvedRequestPreviewSchema>;

export const resolvedVariableSourceSchema = z.enum(['extra', 'environment', 'project', 'builtin', 'missing']);
export type ResolvedVariableSource = z.infer<typeof resolvedVariableSourceSchema>;

export const resolvedVariableSchema = z.object({
  token: z.string().min(1),
  source: resolvedVariableSourceSchema.default('missing'),
  sourceLabel: z.string(),
  value: z.string().default(''),
  missing: z.boolean().default(false),
  locations: z.array(z.string()).default([])
});
export type ResolvedVariable = z.infer<typeof resolvedVariableSchema>;

export const resolvedFieldValueSchema = z.object({
  location: z.enum(['url', 'path', 'header', 'query', 'body', 'auth']),
  label: z.string(),
  rawValue: z.string(),
  resolvedValue: z.string(),
  tokens: z.array(z.string()).default([])
});
export type ResolvedFieldValue = z.infer<typeof resolvedFieldValueSchema>;

export const resolvedAuthPreviewItemSchema = z.object({
  target: z.enum(['header', 'query']),
  name: z.string(),
  value: z.string(),
  sourceLabel: z.string().optional(),
  status: z.enum(['ready', 'cached', 'missing', 'expired']).optional(),
  detail: z.string().optional()
});
export type ResolvedAuthPreviewItem = z.infer<typeof resolvedAuthPreviewItemSchema>;

export const resolvedRequestWarningSchema = z.object({
  code: z.string(),
  level: z.enum(['info', 'warning']).default('warning'),
  message: z.string()
});
export type ResolvedRequestWarning = z.infer<typeof resolvedRequestWarningSchema>;

export const resolvedRequestDiagnosticSchema = z.object({
  code: z.string(),
  level: z.enum(['info', 'warning', 'error']).default('warning'),
  message: z.string(),
  blocking: z.boolean().default(false),
  field: z.string().optional()
});
export type ResolvedRequestDiagnostic = z.infer<typeof resolvedRequestDiagnosticSchema>;

export const resolvedRequestInsightSchema = z.object({
  preview: resolvedRequestPreviewSchema,
  variables: z.array(resolvedVariableSchema).default([]),
  fieldValues: z.array(resolvedFieldValueSchema).default([]),
  warnings: z.array(resolvedRequestWarningSchema).default([]),
  diagnostics: z.array(resolvedRequestDiagnosticSchema).default([]),
  authPreview: z.array(resolvedAuthPreviewItemSchema).default([])
});
export type ResolvedRequestInsight = z.infer<typeof resolvedRequestInsightSchema>;

export const checkResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  ok: z.boolean(),
  message: z.string(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  source: z.enum(['builtin', 'script', 'collection-rule']).default('builtin')
});
export type CheckResult = z.infer<typeof checkResultSchema>;

export const scriptLogSchema = z.object({
  phase: z.enum(['pre-request', 'post-response']),
  level: z.enum(['log', 'error']).default('log'),
  message: z.string()
});
export type ScriptLog = z.infer<typeof scriptLogSchema>;

export const runHistoryEntrySchema = z.object({
  id: z.string().min(1),
  workspaceRoot: z.string(),
  requestId: z.string(),
  requestName: z.string(),
  caseId: z.string().optional(),
  caseName: z.string().optional(),
  environmentName: z.string().optional(),
  request: resolvedRequestPreviewSchema,
  response: sendRequestResultSchema,
  checkResults: z.array(checkResultSchema).default([]),
  scriptLogs: z.array(scriptLogSchema).default([]),
  sourceCollectionId: z.string().optional(),
  sourceCollectionName: z.string().optional(),
  sourceStepKey: z.string().optional()
});
export type RunHistoryEntry = z.infer<typeof runHistoryEntrySchema>;

export const collectionStepRunSchema = z.object({
  stepKey: z.string().min(1),
  stepName: z.string(),
  requestId: z.string(),
  caseId: z.string().optional(),
  ok: z.boolean(),
  skipped: z.boolean().default(false),
  request: resolvedRequestPreviewSchema.optional(),
  response: sendRequestResultSchema.optional(),
  checkResults: z.array(checkResultSchema).default([]),
  scriptLogs: z.array(scriptLogSchema).default([]),
  error: z.string().optional()
});
export type CollectionStepRun = z.infer<typeof collectionStepRunSchema>;

export const collectionIterationReportSchema = z.object({
  index: z.number().int().nonnegative(),
  dataLabel: z.string().optional(),
  dataVars: z.record(z.string(), z.string()).default({}),
  stepRuns: z.array(collectionStepRunSchema).default([])
});
export type CollectionIterationReport = z.infer<typeof collectionIterationReportSchema>;

export const collectionRunReportSchema = z.object({
  id: z.string().min(1),
  workspaceRoot: z.string(),
  collectionId: z.string().min(1),
  collectionName: z.string().min(1),
  environmentName: z.string().optional(),
  status: z.enum(['passed', 'failed', 'partial']).default('passed'),
  startedAt: z.string(),
  finishedAt: z.string(),
  iterationCount: z.number().int().positive().default(1),
  passedSteps: z.number().int().nonnegative().default(0),
  failedSteps: z.number().int().nonnegative().default(0),
  skippedSteps: z.number().int().nonnegative().default(0),
  iterations: z.array(collectionIterationReportSchema).default([])
});
export type CollectionRunReport = z.infer<typeof collectionRunReportSchema>;

export function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

export function createId(prefix: string) {
  const seed = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${seed}`;
}

export function emptyParameterRow(): ParameterRow {
  return { name: '', value: '', enabled: true, kind: 'text' };
}

export function createEmptyRequest(name = 'New Request'): RequestDocument {
  return requestDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: createId('req'),
    name,
    method: 'GET',
    url: '',
    path: '',
    description: '',
    tags: [],
    headers: [],
    query: [],
    pathParams: [],
    body: { mode: 'none', text: '', fields: [] },
    auth: { type: 'inherit' },
    runtime: { timeoutMs: 30000, followRedirects: true },
    examples: [],
    order: 0
  });
}

export function createEmptyCase(requestId: string, name = 'Smoke'): CaseDocument {
  return caseDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: createId('case'),
    name,
    extendsRequest: requestId,
    notes: '',
    overrides: {},
    checks: [],
    scripts: {
      preRequest: '',
      postResponse: ''
    }
  });
}

export function createEmptyCollection(name = 'New Collection'): CollectionDocument {
  return collectionDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: createId('col'),
    name,
    defaultEnvironment: 'shared',
    stopOnFailure: true,
    iterationCount: 1,
    vars: {},
    rules: {
      requireSuccessStatus: false,
      requiredJsonPaths: []
    },
    steps: []
  });
}

export function createDefaultProject(name: string): ProjectDocument {
  return projectDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    name,
    defaultEnvironment: 'shared',
    labels: [],
    runtime: {
      baseUrl: 'https://api.example.com',
      vars: {},
      headers: [],
      description: ''
    }
  });
}

export function createDefaultEnvironment(name = 'shared'): EnvironmentDocument {
  return environmentDocumentSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    name,
    vars: {},
    headers: [],
    authProfiles: []
  });
}
