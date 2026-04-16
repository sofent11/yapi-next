import { z } from 'zod';

export const SCHEMA_VERSION = 1;
export const REQUEST_SUFFIX = '.request.yaml';
export const CASE_SUFFIX = '.case.yaml';
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

export const authTypeSchema = z.enum(['inherit', 'none', 'bearer', 'basic', 'apikey', 'profile']);
export type AuthType = z.infer<typeof authTypeSchema>;

export const authConfigSchema = z.object({
  type: authTypeSchema.default('inherit'),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  key: z.string().optional(),
  value: z.string().optional(),
  addTo: z.enum(['header', 'query']).optional(),
  profileName: z.string().optional()
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
  })).default([])
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
  'header-includes',
  'json-exists',
  'json-equals'
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

export const caseDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  extendsRequest: z.string().min(1),
  environment: z.string().optional(),
  notes: z.string().default(''),
  overrides: caseOverridesSchema.default({}),
  checks: z.array(caseCheckSchema).default([])
});
export type CaseDocument = z.infer<typeof caseDocumentSchema>;

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
  filePath: z.string()
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
  tree: z.array(workspaceTreeNodeSchema).default([]),
  gitignorePath: z.string().optional()
});
export type WorkspaceIndex = z.infer<typeof workspaceIndexSchema>;

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
  })).default([])
});
export type ImportResult = z.infer<typeof importResultSchema>;

export const sendRequestInputSchema = z.object({
  method: httpMethodSchema.default('GET'),
  url: z.string().min(1),
  headers: z.array(parameterRowSchema).default([]),
  query: z.array(parameterRowSchema).default([]),
  body: requestBodySchema.default({ mode: 'none', text: '', fields: [] }),
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

export const resolvedRequestPreviewSchema = sendRequestInputSchema.extend({
  name: z.string(),
  environmentName: z.string().optional(),
  authSource: z.string().default('none'),
  requestPath: z.string().default('/')
});
export type ResolvedRequestPreview = z.infer<typeof resolvedRequestPreviewSchema>;

export const checkResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  ok: z.boolean(),
  message: z.string(),
  expected: z.string().optional(),
  actual: z.string().optional()
});
export type CheckResult = z.infer<typeof checkResultSchema>;

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
  checkResults: z.array(checkResultSchema).default([])
});
export type RunHistoryEntry = z.infer<typeof runHistoryEntrySchema>;

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
    checks: []
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
