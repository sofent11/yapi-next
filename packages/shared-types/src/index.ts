export interface ApiResult<T = unknown> {
  errcode: number;
  errmsg: string;
  data: T;
}

export const JSON_SCHEMA_DRAFT4_URI = 'http://json-schema.org/draft-04/schema#';

export type SchemaPrimitiveType = 'string' | 'number' | 'integer' | 'boolean' | 'null';
export type SchemaContainerType = 'object' | 'array';
export type SchemaFieldType = SchemaPrimitiveType | SchemaContainerType | 'ref';

export type SchemaNode = Record<string, unknown>;
export type SchemaDefinition = Record<string, SchemaNode>;

export interface SchemaRefNode extends Record<string, unknown> {
  $ref: string;
}

export interface SchemaObjectNode extends Record<string, unknown> {
  type: 'object';
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean | SchemaNode;
  required?: string[];
}

export interface SchemaArrayNode extends Record<string, unknown> {
  type: 'array';
  items?: SchemaNode;
}

export interface SchemaDocument extends Record<string, unknown> {
  $schema?: string;
  definitions?: Record<string, SchemaNode>;
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

export function isSchemaObject(input: unknown): input is Record<string, unknown> {
  return isPlainObject(input);
}

export function toSchemaObject(input: unknown): Record<string, unknown> {
  return isPlainObject(input) ? input : {};
}

export function sanitizeSchemaDefinitionName(input: string): string {
  const source = String(input || '').trim();
  const normalized = source.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'Definition';
}

export function getSchemaRefName(ref: unknown): string {
  const source = typeof ref === 'string' ? ref : '';
  if (!source) {
    return '';
  }
  const segment = source.split('/').filter(Boolean).pop() || '';
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function createSchemaDefinitionRef(name: string): string {
  return `#/definitions/${sanitizeSchemaDefinitionName(name)}`;
}

export function normalizeSchemaNode(input: unknown): Record<string, unknown> {
  const source = toSchemaObject(input);
  if (Object.keys(source).length === 0) {
    return {};
  }

  const next: Record<string, unknown> = { ...source };
  if (!next.type) {
    if (typeof next.$ref === 'string' && next.$ref.trim()) {
      next.type = 'ref';
    } else if (isPlainObject(next.properties)) {
      next.type = 'object';
    } else if (isPlainObject(next.items)) {
      next.type = 'array';
    }
  }

  if (isPlainObject(next.$defs)) {
    next.definitions = {
      ...toSchemaObject(next.definitions),
      ...toSchemaObject(next.$defs)
    };
    delete next.$defs;
  }

  return next;
}

export function normalizeSchemaDocument(input: unknown): SchemaDocument {
  const node = normalizeSchemaNode(input);
  const definitions = toSchemaObject(node.definitions);
  if (Object.keys(definitions).length > 0) {
    node.definitions = definitions;
  } else {
    delete node.definitions;
  }
  if (!node.$schema) {
    node.$schema = JSON_SCHEMA_DRAFT4_URI;
  }
  return node;
}

export function resolveSchemaPrimaryType(input: unknown): string {
  const node = normalizeSchemaNode(input);
  const rawType = node.type;

  if (typeof rawType === 'string' && rawType.trim()) {
    return rawType.trim().toLowerCase();
  }

  if (Array.isArray(rawType)) {
    const normalized = rawType.map(item => String(item || '').trim().toLowerCase()).filter(Boolean);
    const primary = normalized.find(item => item !== 'null');
    if (primary) {
      return primary;
    }
    if (normalized.length > 0) {
      return normalized[0];
    }
  }

  if (typeof node.$ref === 'string' && node.$ref.trim()) {
    return 'ref';
  }
  if (isPlainObject(node.properties) || Object.prototype.hasOwnProperty.call(node, 'additionalProperties')) {
    return 'object';
  }
  if (isPlainObject(node.items)) {
    return 'array';
  }
  if (Array.isArray(node.enum) && node.enum.length > 0) {
    const sample = node.enum[0];
    if (typeof sample === 'number') {
      return Number.isInteger(sample) ? 'integer' : 'number';
    }
    if (typeof sample === 'boolean') {
      return 'boolean';
    }
    if (sample === null) {
      return 'null';
    }
    return 'string';
  }
  return 'string';
}

export function findUnsupportedVisualSchemaKeywords(input: unknown): string[] {
  const unsupported = new Set<string>();

  function visit(nodeInput: unknown) {
    const node = toSchemaObject(nodeInput);
    if (Object.keys(node).length === 0) {
      return;
    }

    ['allOf', 'anyOf', 'oneOf', 'not', 'patternProperties', 'prefixItems'].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        unsupported.add(key);
      }
    });

    Object.values(toSchemaObject(node.properties)).forEach(visit);
    Object.values(toSchemaObject(node.definitions)).forEach(visit);

    if (isPlainObject(node.items)) {
      visit(node.items);
    }
    if (isPlainObject(node.additionalProperties)) {
      visit(node.additionalProperties);
    }
  }

  visit(normalizeSchemaDocument(input));
  return Array.from(unsupported);
}

export type SpecFormat = 'auto' | 'swagger2' | 'openapi3';
export type SpecSource = 'json' | 'url';
export type SyncMode = 'normal' | 'good' | 'merge' | 'sync';
export type SpecExportFormat = 'openapi3' | 'swagger2';
export type InterfacePublishStatus = 'all' | 'open';
export type InterfaceStatus = 'undone' | 'done';
export type TaskStatus = 'queued' | 'running' | 'success' | 'failed';
export type DocScopeType = 'group' | 'project';
export type DocNodeType = 'folder' | 'page';

export interface OpenApiOperationNormalized {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  xYapiMeta?: Record<string, unknown>;
}

export interface SpecImportRequest {
  project_id: number;
  format?: SpecFormat;
  source?: SpecSource;
  json?: string;
  url?: string;
  syncMode?: SyncMode;
  dryRun?: boolean;
  async?: boolean;
  token?: string;
}

export interface SpecImportPreviewSample {
  method: string;
  path: string;
  title: string;
}

export interface SpecImportErrorItem {
  operationId?: string;
  path?: string;
  method?: string;
  message: string;
}

export interface SpecImportResult {
  project_id?: number;
  total?: number;
  normalized?: number;
  categories?: number;
  interfaces?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  mode?: SyncMode;
  dryRun?: boolean;
  basePath?: string;
  detectedFormat?: Exclude<SpecFormat, 'auto'> | 'unknown';
  sample?: SpecImportPreviewSample[];
  errors?: SpecImportErrorItem[];
}

export interface SpecExportQuery {
  project_id: number;
  format?: SpecExportFormat;
  status?: InterfacePublishStatus;
  withWiki?: boolean;
  cat_id?: number;
  interface_id?: number;
  token?: string;
}

export interface SpecImportTaskProgress {
  stage: string;
  percent: number;
  message?: string;
}

export interface SpecImportTaskDTO {
  task_id: string;
  project_id: number;
  uid: number;
  status: TaskStatus;
  source?: SpecSource;
  format?: SpecFormat;
  syncMode?: SyncMode;
  dryRun?: boolean;
  url?: string;
  progress: number;
  stage: string;
  message: string;
  progress_detail?: SpecImportTaskProgress;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  add_time: number;
  up_time: number;
  start_time?: number;
  end_time?: number;
}

export interface DocNode {
  _id: number;
  scope_type: DocScopeType;
  group_id?: number;
  project_id?: number;
  parent_id: number;
  node_type: DocNodeType;
  title: string;
  markdown: string;
  index: number;
  uid: number;
  edit_uid?: number;
  add_time?: number;
  up_time?: number;
}

export interface DocTreeNode extends DocNode {
  children: DocTreeNode[];
}

export interface DocScopeQuery {
  scope_type: DocScopeType;
  group_id?: number;
  project_id?: number;
  token?: string;
}

export interface DocTreeResult {
  list: DocTreeNode[];
  can_write: boolean;
}

export interface DocAddRequest extends DocScopeQuery {
  parent_id?: number;
  node_type: DocNodeType;
  title: string;
  markdown?: string;
}

export interface DocUpdateRequest {
  id: number;
  title?: string;
  markdown?: string;
  parent_id?: number;
  index?: number;
}

export interface DocDeleteRequest {
  id: number;
}

export interface DocMoveRequest {
  id: number;
  parent_id: number;
  index?: number;
}

export interface InterfaceDTO {
  _id?: number;
  uid?: number;
  username?: string;
  title: string;
  path: string;
  method: string;
  project_id: number;
  catid: number;
  status?: InterfaceStatus;
  desc?: string;
  req_query?: any[];
  req_headers?: any[];
  req_params?: any[];
  req_body_type?: 'form' | 'json' | 'text' | 'file' | 'raw';
  req_body_form?: any[];
  req_body_other?: string;
  req_body_is_json_schema?: boolean;
  res_body_type?: 'json' | 'text' | 'xml' | 'raw' | 'json-schema';
  res_body?: string;
  res_body_is_json_schema?: boolean;
  tag?: string[];
  api_opened?: boolean;
  custom_field_value?: string;
  add_time?: number;
  up_time?: number;
  operation_oas3?: string;
  import_meta?: string;
}

export type LegacyInterfaceDTO = InterfaceDTO;

export interface InterfaceTreeNode {
  _id: number;
  name: string;
  desc?: string;
  index?: number;
  project_id?: number;
  interface_count?: number;
  list?: InterfaceDTO[];
}

export interface InterfaceTreeQuery {
  project_id: number;
  page?: number;
  limit?: number;
  status?: string | string[];
  tag?: string | string[];
  include_list?: boolean;
  detail?: 'full' | 'summary';
  token?: string;
}

export interface InterfaceTreePageResult {
  count: number;
  total: number;
  page: number;
  limit: number;
  list: InterfaceTreeNode[];
}

export interface InterfaceTreeNodeResult {
  count: number;
  total: number;
  page: number;
  limit: number;
  list: InterfaceDTO[];
}

export interface UserLoginRequest {
  email: string;
  password: string;
}

export interface UserRegisterRequest extends UserLoginRequest {
  username?: string;
}

export interface UserLoginByTokenRequest {
  email: string;
  username?: string;
}

export interface UserUpdateRequest {
  uid: number;
  username?: string;
  email?: string;
}

export interface UserDeleteRequest {
  id: number;
}

export interface UserFindQuery {
  id: number;
}

export interface UserListQuery {
  page?: number;
  limit?: number;
}

export interface UserSearchItem {
  uid: number;
  username: string;
  email: string;
  role: string;
  addTime?: number;
  upTime?: number;
}

export interface UserChangePasswordRequest {
  uid: number;
  password: string;
  old_password?: string;
}

export interface UserProjectContextQuery {
  type: 'interface' | 'project' | 'group';
  id: number;
}

export interface UserAvatarUploadRequest {
  basecode: string;
}

export interface UserProfile {
  _id?: number;
  uid?: number;
  username: string;
  email: string;
  role: string;
  type?: string;
  study?: boolean;
  add_time?: number;
  up_time?: number;
}

export interface UserStatusResult {
  ladp?: boolean;
  canRegister?: boolean;
}

export interface ProjectListItem {
  _id: number;
  uid: number;
  group_id?: number;
  name: string;
  color?: string;
  icon?: string;
  basepath?: string;
  desc?: string;
  project_type?: 'public' | 'private';
  members?: Array<{
    uid: number;
    role: 'owner' | 'dev' | 'guest';
    username?: string;
    email?: string;
  }>;
  env?: Array<Record<string, unknown>>;
  tag?: Array<{ name: string; desc: string }>;
  follow?: boolean;
  role?: string;
  pre_script?: string;
  after_script?: string;
  project_mock_script?: string;
  openapi3_sync_url?: string;
  is_mock_open?: boolean;
  switch_notice?: boolean;
  strice?: boolean;
  is_json5?: boolean;
  add_time?: number;
  up_time?: number;
}

export interface ProjectListResult {
  list: ProjectListItem[];
}

export interface GroupListItem {
  _id: number;
  uid: number;
  group_name: string;
  group_desc?: string;
  custom_field1?: {
    name?: string;
    enable?: boolean;
  };
  type?: 'public' | 'private';
  role?: string;
  add_time?: number;
  up_time?: number;
}

export interface ProjectEnvItem {
  name: string;
  domain?: string;
  header?: Array<Record<string, unknown>>;
  global?: Array<Record<string, unknown>>;
}

export interface ProjectTagItem {
  name: string;
  desc?: string;
}

export interface FollowItem {
  _id?: number;
  uid: number;
  projectid: number;
  projectname: string;
  icon?: string;
  color?: string;
  add_time?: number;
  up_time?: number;
}

export interface ProjectUpdateRequest {
  id: number;
  group_id?: number;
  name?: string;
  basepath?: string;
  desc?: string;
  pre_script?: string;
  after_script?: string;
  project_mock_script?: string;
  openapi3_sync_url?: string;
  is_mock_open?: boolean;
  switch_notice?: boolean;
  strice?: boolean;
  is_json5?: boolean;
  color?: string;
  icon?: string;
  project_type?: 'public' | 'private';
}

export interface ProjectCopyRequest {
  _id: number;
  name: string;
  group_id: number;
  basepath?: string;
  desc?: string;
  color?: string;
  icon?: string;
  project_type?: 'public' | 'private';
  pre_script?: string;
  after_script?: string;
  project_mock_script?: string;
  env?: Array<Record<string, unknown>>;
  tag?: Array<{ name: string; desc?: string }>;
}
