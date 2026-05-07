import type { BaseQueryFn, FetchArgs, FetchBaseQueryError, FetchBaseQueryMeta } from '@reduxjs/toolkit/query';
import type { EndpointBuilder } from '@reduxjs/toolkit/query/react';
import type {
  ApiResult,
  DocAddRequest,
  DocDeleteRequest,
  DocMoveRequest,
  DocNode,
  DocScopeQuery,
  DocTreeNode,
  DocTreeResult,
  DocUpdateRequest,
  FollowItem,
  GroupListItem,
  ProjectCopyRequest,
  InterfaceTreeNode,
  InterfaceTreeNodeResult,
  InterfaceTreePageResult,
  ProjectEnvItem,
  ProjectListItem,
  ProjectListResult,
  ProjectTagItem,
  ProjectUpdateRequest,
  SpecExportQuery,
  SpecImportRequest,
  SpecImportResult,
  SpecImportTaskDTO,
  UserAvatarUploadRequest,
  UserChangePasswordRequest,
  UserDeleteRequest,
  UserFindQuery,
  UserListQuery,
  UserLoginByTokenRequest,
  UserLoginRequest,
  UserProfile,
  UserProjectContextQuery,
  UserRegisterRequest,
  UserSearchItem,
  UserStatusResult
} from '@yapi-next/shared-types';
import type { InterfaceDTO } from '../../types/interface-dto';

export type SharedApiResult<T = unknown> = ApiResult<T>;
export type SharedDocAddRequest = DocAddRequest;
export type SharedDocDeleteRequest = DocDeleteRequest;
export type SharedDocMoveRequest = DocMoveRequest;
export type SharedDocNode = DocNode;
export type SharedDocScopeQuery = DocScopeQuery;
export type SharedDocTreeNode = DocTreeNode;
export type SharedDocTreeResult = DocTreeResult;
export type SharedDocUpdateRequest = DocUpdateRequest;
export type SharedInterfaceDTO = InterfaceDTO;
export type SharedFollowItem = FollowItem;
export type SharedGroupListItem = GroupListItem;
export type SharedProjectCopyRequest = ProjectCopyRequest;
export type SharedInterfaceTreeNode = InterfaceTreeNode;
export type SharedInterfaceTreeNodeResult = InterfaceTreeNodeResult;
export type SharedInterfaceTreePageResult = InterfaceTreePageResult;
export type SharedProjectEnvItem = ProjectEnvItem;
export type SharedProjectListItem = ProjectListItem;
export type SharedProjectListResult = ProjectListResult;
export type SharedProjectTagItem = ProjectTagItem;
export type SharedProjectUpdateRequest = ProjectUpdateRequest;
export type SharedSpecExportQuery = SpecExportQuery;
export type SharedSpecImportRequest = SpecImportRequest;
export type SharedSpecImportResult = SpecImportResult;
export type SharedSpecImportTaskDTO = SpecImportTaskDTO;
export type SharedUserAvatarUploadRequest = UserAvatarUploadRequest;
export type SharedUserChangePasswordRequest = UserChangePasswordRequest;
export type SharedUserDeleteRequest = UserDeleteRequest;
export type SharedUserFindQuery = UserFindQuery;
export type SharedUserListQuery = UserListQuery;
export type SharedUserLoginByTokenRequest = UserLoginByTokenRequest;
export type SharedUserLoginRequest = UserLoginRequest;
export type SharedUserProfile = UserProfile;
export type SharedUserProjectContextQuery = UserProjectContextQuery;
export type SharedUserRegisterRequest = UserRegisterRequest;
export type SharedUserSearchItem = UserSearchItem;
export type SharedUserStatusResult = UserStatusResult;

export type ImportTaskListResult = {
  count: number;
  list: SpecImportTaskDTO[];
};

export type ImportSpecResponse = ApiResult<
  SpecImportResult | Pick<SpecImportTaskDTO, 'task_id' | 'status' | 'progress' | 'stage' | 'message'>
>;

export type UserStatusResponse = ApiResult<UserProfile | null> & UserStatusResult;

export type UserListResult = {
  count: number;
  total: number;
  list: UserProfile[];
};

export type MemberRole = 'owner' | 'dev' | 'guest';

export type MemberItem = {
  uid: number;
  role: MemberRole;
  username?: string;
  email?: string;
  email_notice?: boolean;
};

export type InterfaceCatItem = {
  _id: number;
  project_id: number;
  uid: number;
  name: string;
  desc?: string;
  index?: number;
  add_time?: number;
  up_time?: number;
};

export type UserProjectContextResult = {
  interface?: Record<string, unknown>;
  project?: Record<string, unknown>;
  group?: Record<string, unknown>;
};

export type FollowListResult = {
  list: FollowItem[];
};

export type LogListResult = {
  total: number;
  list: Array<Record<string, unknown>>;
};

export type ColItem = {
  _id: number;
  name: string;
  uid: number;
  project_id: number;
  desc?: string;
  index?: number;
  caseList?: ColCaseItem[];
  add_time?: number;
  up_time?: number;
};

export type ColCaseItem = {
  _id: string;
  casename: string;
  project_id: number;
  col_id: number;
  interface_id: number;
  case_env?: string;
  req_params?: Array<Record<string, unknown>>;
  req_headers?: Array<Record<string, unknown>>;
  req_query?: Array<Record<string, unknown>>;
  req_body_form?: Array<Record<string, unknown>>;
  req_body_other?: string;
  req_body_type?: string;
  test_script?: string;
  enable_script?: boolean;
  path?: string;
  method?: string;
  title?: string;
  add_time?: number;
  up_time?: number;
};

export type ProjectApiMarkdownMatchedItem = {
  id: number;
  title: string;
  method: string;
  path: string;
  fullPath: string;
  catName: string;
};

export type ProjectApiMarkdownIgnoredItem = {
  input: string;
  reason: string;
  interfaceId?: number;
  inputProjectId?: number;
};

export type ProjectApiMarkdownResult = {
  projectId: number;
  projectName: string;
  basepath: string;
  totalInputs: number;
  matchedCount: number;
  ignoredCount: number;
  matched: ProjectApiMarkdownMatchedItem[];
  ignored: ProjectApiMarkdownIgnoredItem[];
  markdown: string;
};

export function encodeQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'undefined') return;
    search.set(key, String(value));
  });
  return search.toString();
}

export const USER_LIST_TAG = { type: 'User' as const, id: 'LIST' };
export const GROUP_LIST_TAG = { type: 'Group' as const, id: 'LIST' };
export const PROJECT_LIST_TAG = { type: 'Project' as const, id: 'LIST' };
export const FOLLOW_LIST_TAG = { type: 'Project' as const, id: 'FOLLOW-LIST' };
export const DOC_LIST_TAG = { type: 'Doc' as const, id: 'LIST' };

export function toPositiveNumber(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function userTag(uid: number) {
  return { type: 'User' as const, id: uid };
}

export function groupTag(groupId: number) {
  return { type: 'Group' as const, id: groupId };
}

export function projectTag(projectId: number) {
  return { type: 'Project' as const, id: projectId };
}

export function docScopeTag(scope: DocScopeQuery) {
  const id =
    scope.scope_type === 'group'
      ? `GROUP-${Number(scope.group_id || 0)}`
      : `PROJECT-${Number(scope.project_id || 0)}`;
  return { type: 'Doc' as const, id };
}

export function interfaceProjectTag(projectId: number) {
  return { type: 'InterfaceTree' as const, id: `PROJECT-${projectId}` };
}

export function interfaceCategoryTag(catid: number) {
  return { type: 'InterfaceTree' as const, id: `CAT-${catid}` };
}

export function interfaceEntityTag(interfaceId: number) {
  return { type: 'InterfaceTree' as const, id: `INTERFACE-${interfaceId}` };
}

export function collectInterfaceEntityTags(rows: Array<Record<string, unknown>> | undefined) {
  return (rows || [])
    .map(item => interfaceEntityTag(toPositiveNumber(item._id)))
    .filter(item => item.id !== 'INTERFACE-0');
}

export function collectInterfaceCategoryTags(rows: Array<Record<string, unknown>> | undefined) {
  return (rows || [])
    .map(item => interfaceCategoryTag(toPositiveNumber(item._id)))
    .filter(item => item.id !== 'CAT-0');
}

export function collectInterfaceCategoryTagsFromList(rows: Array<Record<string, unknown>> | undefined) {
  return (rows || [])
    .map(item => interfaceCategoryTag(toPositiveNumber(item.catid)))
    .filter(item => item.id !== 'CAT-0');
}

export function colProjectTag(projectId: number) {
  return { type: 'Col' as const, id: `PROJECT-${projectId}` };
}

export function colEntityTag(colId: number) {
  return { type: 'Col' as const, id: `COL-${colId}` };
}

export function colCaseCollectionTag(colId: number) {
  return { type: 'ColCase' as const, id: `COL-${colId}` };
}

export function colCaseEntityTag(caseId: string) {
  return { type: 'ColCase' as const, id: `CASE-${caseId}` };
}

export const apiBaseUrl = `${import.meta.env.BASE_URL}api`;

export const tagTypes = [
  'ImportTask',
  'ImportTaskList',
  'InterfaceTree',
  'User',
  'Group',
  'Project',
  'Doc',
  'Col',
  'ColCase'
] as const;

export type YapiEndpointBuilder = EndpointBuilder<
  BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError, {}, FetchBaseQueryMeta>,
  (typeof tagTypes)[number],
  'yapiApi'
>;
