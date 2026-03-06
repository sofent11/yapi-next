export interface ApiResult<T = unknown> {
  errcode: number;
  errmsg: string;
  data: T;
}

export type SpecFormat = 'auto' | 'swagger2' | 'openapi3';
export type SpecSource = 'json' | 'url';
export type SyncMode = 'normal' | 'good' | 'merge';
export type SpecExportFormat = 'openapi3' | 'swagger2';
export type InterfacePublishStatus = 'all' | 'open';
export type InterfaceStatus = 'undone' | 'done';
export type TaskStatus = 'queued' | 'running' | 'success' | 'failed';

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
