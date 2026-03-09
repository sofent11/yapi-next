import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  ApiResult,
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
import type { InterfaceDTO } from '../types/interface-dto';

type ImportTaskListResult = {
  count: number;
  list: SpecImportTaskDTO[];
};

type ImportSpecResponse = ApiResult<
  SpecImportResult | Pick<SpecImportTaskDTO, 'task_id' | 'status' | 'progress' | 'stage' | 'message'>
>;
type UserStatusResponse = ApiResult<UserProfile | null> & UserStatusResult;
type UserListResult = {
  count: number;
  total: number;
  list: UserProfile[];
};
type MemberRole = 'owner' | 'dev' | 'guest';
type MemberItem = {
  uid: number;
  role: MemberRole;
  username?: string;
  email?: string;
  email_notice?: boolean;
};
type InterfaceCatItem = {
  _id: number;
  project_id: number;
  uid: number;
  name: string;
  desc?: string;
  index?: number;
  add_time?: number;
  up_time?: number;
};

type UserProjectContextResult = {
  interface?: Record<string, unknown>;
  project?: Record<string, unknown>;
  group?: Record<string, unknown>;
};

type FollowListResult = {
  list: FollowItem[];
};

type LogListResult = {
  total: number;
  list: Array<Record<string, unknown>>;
};

type ColItem = {
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

type ColCaseItem = {
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

function encodeQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'undefined') return;
    search.set(key, String(value));
  });
  return search.toString();
}

const USER_LIST_TAG = { type: 'User' as const, id: 'LIST' };
const GROUP_LIST_TAG = { type: 'Group' as const, id: 'LIST' };
const PROJECT_LIST_TAG = { type: 'Project' as const, id: 'LIST' };
const FOLLOW_LIST_TAG = { type: 'Project' as const, id: 'FOLLOW-LIST' };

function toPositiveNumber(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function userTag(uid: number) {
  return { type: 'User' as const, id: uid };
}

function groupTag(groupId: number) {
  return { type: 'Group' as const, id: groupId };
}

function projectTag(projectId: number) {
  return { type: 'Project' as const, id: projectId };
}

function interfaceProjectTag(projectId: number) {
  return { type: 'InterfaceTree' as const, id: `PROJECT-${projectId}` };
}

function interfaceCategoryTag(catid: number) {
  return { type: 'InterfaceTree' as const, id: `CAT-${catid}` };
}

function interfaceEntityTag(interfaceId: number) {
  return { type: 'InterfaceTree' as const, id: `INTERFACE-${interfaceId}` };
}

function collectInterfaceEntityTags(rows: Array<Record<string, unknown>> | undefined) {
  return (rows || [])
    .map(item => interfaceEntityTag(toPositiveNumber(item._id)))
    .filter(item => item.id !== 'INTERFACE-0');
}

function collectInterfaceCategoryTags(rows: Array<Record<string, unknown>> | undefined) {
  return (rows || [])
    .map(item => interfaceCategoryTag(toPositiveNumber(item._id)))
    .filter(item => item.id !== 'CAT-0');
}

function collectInterfaceCategoryTagsFromList(rows: Array<Record<string, unknown>> | undefined) {
  return (rows || [])
    .map(item => interfaceCategoryTag(toPositiveNumber(item.catid)))
    .filter(item => item.id !== 'CAT-0');
}

function colProjectTag(projectId: number) {
  return { type: 'Col' as const, id: `PROJECT-${projectId}` };
}

function colEntityTag(colId: number) {
  return { type: 'Col' as const, id: `COL-${colId}` };
}

function colCaseCollectionTag(colId: number) {
  return { type: 'ColCase' as const, id: `COL-${colId}` };
}

function colCaseEntityTag(caseId: string) {
  return { type: 'ColCase' as const, id: `CASE-${caseId}` };
}

const apiBaseUrl = `${import.meta.env.BASE_URL}api`;

export const yapiApi = createApi({
  reducerPath: 'yapiApi',
  baseQuery: fetchBaseQuery({
    baseUrl: apiBaseUrl,
    credentials: 'include'
  }),
  tagTypes: [
    'ImportTask',
    'ImportTaskList',
    'InterfaceTree',
    'User',
    'Group',
    'Project',
    'Col',
    'ColCase'
  ],
  endpoints: builder => ({
    login: builder.mutation<ApiResult<UserProfile>, UserLoginRequest>({
      query: payload => ({
        url: '/user/login',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [USER_LIST_TAG, GROUP_LIST_TAG, PROJECT_LIST_TAG, FOLLOW_LIST_TAG]
    }),
    registerUser: builder.mutation<ApiResult<UserProfile>, UserRegisterRequest>({
      query: payload => ({
        url: '/user/reg',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [USER_LIST_TAG, GROUP_LIST_TAG, PROJECT_LIST_TAG, FOLLOW_LIST_TAG]
    }),
    loginByToken: builder.mutation<ApiResult<UserProfile>, UserLoginByTokenRequest>({
      query: payload => ({
        url: '/user/login_by_token',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [USER_LIST_TAG, GROUP_LIST_TAG, PROJECT_LIST_TAG, FOLLOW_LIST_TAG]
    }),
    getUserStatus: builder.query<UserStatusResponse, void>({
      query: () => ({ url: '/user/status' }),
      providesTags: result => {
        const uid = toPositiveNumber(result?.data?._id || result?.data?.uid);
        return uid > 0 ? [USER_LIST_TAG, userTag(uid)] : [USER_LIST_TAG];
      }
    }),
    getUserList: builder.query<ApiResult<UserListResult>, UserListQuery | void>({
      query: args => ({
        url: `/user/list?${encodeQuery({
          page: args?.page || 1,
          limit: args?.limit || 20
        })}`
      }),
      providesTags: result => [
        USER_LIST_TAG,
        ...((result?.data?.list || [])
          .map(item => userTag(toPositiveNumber(item._id || item.uid)))
          .filter(item => typeof item.id === 'number' && item.id > 0))
      ]
    }),
    findUser: builder.query<ApiResult<UserProfile>, UserFindQuery>({
      query: args => ({
        url: `/user/find?${encodeQuery({ id: args.id })}`
      }),
      providesTags: (_result, _error, args) => [USER_LIST_TAG, userTag(args.id)]
    }),
    updateUser: builder.mutation<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      { uid: number; username?: string; email?: string; role?: 'admin' | 'member' }
    >({
      query: payload => ({
        url: '/user/update',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [USER_LIST_TAG, userTag(args.uid)]
    }),
    deleteUser: builder.mutation<
      ApiResult<{ acknowledged?: boolean; deletedCount?: number }>,
      UserDeleteRequest
    >({
      query: payload => ({
        url: '/user/del',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [USER_LIST_TAG, userTag(args.id)]
    }),
    updateStudy: builder.mutation<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      void
    >({
      query: () => ({
        url: '/user/up_study',
        method: 'GET'
      }),
      invalidatesTags: [USER_LIST_TAG]
    }),
    changePassword: builder.mutation<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      UserChangePasswordRequest
    >({
      query: payload => ({
        url: '/user/change_password',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [USER_LIST_TAG]
    }),
    searchUsers: builder.query<ApiResult<UserSearchItem[]>, { q: string }>({
      query: args => ({
        url: `/user/search?${encodeQuery({ q: args.q })}`
      }),
      providesTags: [USER_LIST_TAG]
    }),
    getUserProjectContext: builder.query<ApiResult<UserProjectContextResult>, UserProjectContextQuery>({
      query: args => ({
        url: `/user/project?${encodeQuery({ type: args.type, id: args.id })}`
      }),
      providesTags: [USER_LIST_TAG]
    }),
    uploadAvatar: builder.mutation<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number; upsertedId?: unknown }>,
      UserAvatarUploadRequest
    >({
      query: payload => ({
        url: '/user/upload_avatar',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [USER_LIST_TAG]
    }),
    logout: builder.mutation<ApiResult<string>, void>({
      query: () => ({
        url: '/user/logout',
        method: 'GET'
      }),
      invalidatesTags: [USER_LIST_TAG, GROUP_LIST_TAG, PROJECT_LIST_TAG, FOLLOW_LIST_TAG]
    }),
    getGroupList: builder.query<ApiResult<GroupListItem[]>, void>({
      query: () => ({ url: '/group/list' }),
      providesTags: result => [
        GROUP_LIST_TAG,
        ...((result?.data || [])
          .map(item => groupTag(toPositiveNumber(item._id)))
          .filter(item => typeof item.id === 'number' && item.id > 0))
      ]
    }),
    getMyGroup: builder.query<ApiResult<GroupListItem>, void>({
      query: () => ({ url: '/group/get_mygroup' }),
      providesTags: result => {
        const id = toPositiveNumber(result?.data?._id);
        return id > 0 ? [GROUP_LIST_TAG, groupTag(id)] : [GROUP_LIST_TAG];
      }
    }),
    getGroup: builder.query<ApiResult<GroupListItem>, { id: number }>({
      query: args => ({
        url: `/group/get?${encodeQuery({ id: args.id })}`
      }),
      providesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id)]
    }),
    addGroup: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { group_name: string; group_desc?: string; owner_uids?: number[] }
    >({
      query: payload => ({
        url: '/group/add',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [GROUP_LIST_TAG, PROJECT_LIST_TAG]
    }),
    updateGroup: builder.mutation<
      ApiResult<Record<string, unknown>>,
      {
        id: number;
        group_name?: string;
        group_desc?: string;
        custom_field1?: {
          name?: string;
          enable?: boolean;
        };
      }
    >({
      query: payload => ({
        url: '/group/up',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id), PROJECT_LIST_TAG]
    }),
    delGroup: builder.mutation<ApiResult<Record<string, unknown>>, { id: number }>({
      query: payload => ({
        url: '/group/del',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id), PROJECT_LIST_TAG]
    }),
    getGroupMemberList: builder.query<
      ApiResult<Array<{ uid: number; role?: string; username?: string; email?: string }>>,
      { id: number }
    >({
      query: args => ({
        url: `/group/get_member_list?${encodeQuery({ id: args.id })}`
      }),
      providesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id)]
    }),
    addGroupMember: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { id: number; member_uids: number[]; role?: 'owner' | 'dev' | 'guest' }
    >({
      query: payload => ({
        url: '/group/add_member',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id)]
    }),
    delGroupMember: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { id: number; member_uid: number }
    >({
      query: payload => ({
        url: '/group/del_member',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id)]
    }),
    changeGroupMemberRole: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { id: number; member_uid: number; role: 'owner' | 'dev' | 'guest' }
    >({
      query: payload => ({
        url: '/group/change_member_role',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id)]
    }),
    getProjectList: builder.query<ApiResult<ProjectListResult>, { groupId: number }>({
      query: args => ({
        url: `/project/list?${encodeQuery({
          group_id: args.groupId
        })}`
      }),
      providesTags: result => [
        PROJECT_LIST_TAG,
        ...((result?.data?.list || [])
          .map(item => projectTag(toPositiveNumber(item._id)))
          .filter(item => typeof item.id === 'number' && item.id > 0))
      ]
    }),
    checkProjectName: builder.query<ApiResult<Record<string, unknown>>, { name: string; groupId: number }>({
      query: args => ({
        url: `/project/check_project_name?${encodeQuery({
          name: args.name,
          group_id: args.groupId
        })}`
      })
    }),
    addProject: builder.mutation<
      ApiResult<ProjectListItem>,
      {
        name: string;
        group_id: number;
        basepath?: string;
        desc?: string;
        color?: string;
        icon?: string;
        project_type?: 'public' | 'private';
      }
    >({
      query: payload => ({
        url: '/project/add',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, GROUP_LIST_TAG, groupTag(args.group_id)]
    }),
    copyProject: builder.mutation<ApiResult<ProjectListItem>, ProjectCopyRequest>({
      query: payload => ({
        url: '/project/copy',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [
        PROJECT_LIST_TAG,
        projectTag(args._id),
        { type: 'InterfaceTree', id: `PROJECT-${args._id}` }
      ]
    }),
    delProject: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { id: number }
    >({
      query: payload => ({
        url: '/project/del',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [
        PROJECT_LIST_TAG,
        FOLLOW_LIST_TAG,
        projectTag(args.id),
        { type: 'InterfaceTree', id: `PROJECT-${args.id}` }
      ]
    }),
    getFollowList: builder.query<ApiResult<FollowListResult>, void>({
      query: () => ({
        url: '/follow/list'
      }),
      providesTags: result => [
        FOLLOW_LIST_TAG,
        ...((result?.data?.list || [])
          .map(item => projectTag(toPositiveNumber(item.projectid || item._id)))
          .filter(item => typeof item.id === 'number' && item.id > 0))
      ]
    }),
    addFollow: builder.mutation<ApiResult<FollowItem>, { projectid: number }>({
      query: payload => ({
        url: '/follow/add',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [FOLLOW_LIST_TAG, projectTag(args.projectid)]
    }),
    delFollow: builder.mutation<
      ApiResult<{ acknowledged?: boolean; deletedCount?: number }>,
      { projectid: number }
    >({
      query: payload => ({
        url: '/follow/del',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [FOLLOW_LIST_TAG, projectTag(args.projectid)]
    }),
    updateProject: builder.mutation<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      ProjectUpdateRequest
    >({
      query: payload => ({
        url: '/project/up',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    getProjectEnv: builder.query<ApiResult<{ _id?: number; env?: ProjectEnvItem[] }>, { projectId: number }>({
      query: args => ({
        url: `/project/get_env?${encodeQuery({
          project_id: args.projectId
        })}`
      }),
      providesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.projectId)]
    }),
    updateProjectEnv: builder.mutation<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      { id: number; env: ProjectEnvItem[] }
    >({
      query: payload => ({
        url: '/project/up_env',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    updateProjectTag: builder.mutation<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      { id: number; tag: ProjectTagItem[] }
    >({
      query: payload => ({
        url: '/project/up_tag',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    addProjectMember: builder.mutation<
      ApiResult<{
        result: { acknowledged?: boolean; matchedCount?: number; modifiedCount?: number };
        add_members: MemberItem[];
        exist_members: MemberItem[];
        no_members: number[];
      }>,
      { id: number; member_uids: number[]; role?: MemberRole }
    >({
      query: payload => ({
        url: '/project/add_member',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    getProjectMemberList: builder.query<ApiResult<MemberItem[]>, { id: number }>({
      query: args => ({
        url: `/project/get_member_list?${encodeQuery({ id: args.id })}`
      }),
      providesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    delProjectMember: builder.mutation<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      { id: number; member_uid: number }
    >({
      query: payload => ({
        url: '/project/del_member',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    changeProjectMemberRole: builder.mutation<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      { id: number; member_uid: number; role: MemberRole }
    >({
      query: payload => ({
        url: '/project/change_member_role',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    changeProjectMemberEmailNotice: builder.mutation<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      { id: number; member_uid: number; notice: boolean }
    >({
      query: payload => ({
        url: '/project/change_member_email_notice',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    upsetProject: builder.mutation<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      { id: number; icon?: string; color?: string }
    >({
      query: payload => ({
        url: '/project/upset',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    getProject: builder.query<
      ApiResult<ProjectListItem & { cat?: InterfaceTreeNode[] }>,
      { projectId: number; token?: string }
    >({
      query: args => ({
        url: `/project/get?${encodeQuery({
          project_id: args.projectId,
          token: args.token
        })}`
      }),
      providesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.projectId)]
    }),
    getProjectToken: builder.query<ApiResult<string>, { projectId: number }>({
      query: args => ({
        url: `/project/token?${encodeQuery({
          project_id: args.projectId
        })}`
      }),
      providesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.projectId)]
    }),
    updateProjectToken: builder.mutation<
      ApiResult<{ token: string; matchedCount?: number; modifiedCount?: number; acknowledged?: boolean }>,
      { projectId: number }
    >({
      query: args => ({
        url: `/project/update_token?${encodeQuery({
          project_id: args.projectId
        })}`,
        method: 'GET'
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.projectId)]
    }),
    searchProject: builder.query<
      ApiResult<{
        project: Array<Record<string, unknown>>;
        group: Array<Record<string, unknown>>;
        interface: Array<Record<string, unknown>>;
      }>,
      { q: string }
    >({
      query: args => ({
        url: `/project/search?${encodeQuery({ q: args.q })}`
      }),
      providesTags: [PROJECT_LIST_TAG, GROUP_LIST_TAG]
    }),
    fetchSwaggerByUrl: builder.query<ApiResult<Record<string, unknown>>, { url: string }>({
      query: args => ({
        url: `/project/swagger_url?${encodeQuery({ url: args.url })}`
      })
    }),
    importSpec: builder.mutation<ImportSpecResponse, SpecImportRequest>({
      query: payload => ({
        url: '/spec/import',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [
        { type: 'ImportTaskList', id: `PROJECT-${args.project_id}` },
        { type: 'InterfaceTree', id: `PROJECT-${args.project_id}` }
      ]
    }),
    getImportTask: builder.query<
      ApiResult<SpecImportTaskDTO>,
      { taskId: string; projectId?: number; token?: string }
    >({
      query: args => ({
        url: `/spec/import/task?${encodeQuery({
          task_id: args.taskId,
          project_id: args.projectId,
          token: args.token
        })}`
      }),
      providesTags: (_result, _error, args) => [{ type: 'ImportTask', id: args.taskId }]
    }),
    listImportTasks: builder.query<
      ApiResult<ImportTaskListResult>,
      { projectId: number; token?: string; limit?: number }
    >({
      query: args => ({
        url: `/spec/import/tasks?${encodeQuery({
          project_id: args.projectId,
          token: args.token,
          limit: args.limit || 20
        })}`
      }),
      providesTags: (_result, _error, args) => [{ type: 'ImportTaskList', id: `PROJECT-${args.projectId}` }]
    }),
    exportSpec: builder.mutation<ApiResult<Record<string, unknown>>, SpecExportQuery>({
      query: payload => ({
        url: `/spec/export?${encodeQuery({
          project_id: payload.project_id,
          token: payload.token,
          format: payload.format,
          status: payload.status,
          withWiki: payload.withWiki,
          cat_id: payload.cat_id,
          interface_id: payload.interface_id
        })}`,
        method: 'GET'
      })
    }),
    getInterfaceTree: builder.query<
      ApiResult<InterfaceTreePageResult>,
      {
        projectId: number;
        token?: string;
        page?: number;
        limit?: number;
        includeList?: boolean;
        detail?: 'full' | 'summary';
      }
    >({
      query: args => ({
        url: `/interface/tree?${encodeQuery({
          project_id: args.projectId,
          token: args.token,
          page: args.page || 1,
          limit: args.limit || 20,
          include_list: args.includeList || false,
          detail: args.detail || 'summary'
        })}`
      }),
      providesTags: (result, _error, args) => {
        const treeRows = ((result?.data?.list || []) as unknown as Array<Record<string, unknown>>);
        const categoryTags = collectInterfaceCategoryTags(treeRows);
        const interfaceTags = collectInterfaceEntityTags(
          treeRows.flatMap(item => (Array.isArray(item.list) ? (item.list as unknown as Array<Record<string, unknown>>) : []))
        );
        return [interfaceProjectTag(args.projectId), ...categoryTags, ...interfaceTags];
      }
    }),
    getInterfaceTreeNode: builder.query<
      ApiResult<InterfaceTreeNodeResult>,
      {
        catid: number;
        token?: string;
        page?: number;
        limit?: number;
        detail?: 'full' | 'summary';
      }
    >({
      query: args => ({
        url: `/interface/tree/node?${encodeQuery({
          catid: args.catid,
          token: args.token,
          page: args.page || 1,
          limit: args.limit || 50,
          detail: args.detail || 'summary'
        })}`
      }),
      providesTags: (result, _error, args) => {
        const rows = (result?.data?.list || []) as unknown as Array<Record<string, unknown>>;
        return [interfaceCategoryTag(args.catid), ...collectInterfaceEntityTags(rows)];
      }
    }),
    getListMenu: builder.query<
      ApiResult<InterfaceTreeNode[]>,
      { projectId: number; token?: string; detail?: 'full' | 'summary' }
    >({
      query: args => ({
        url: `/interface/list_menu?${encodeQuery({
          project_id: args.projectId,
          token: args.token,
          detail: args.detail || 'summary'
        })}`
      }),
      providesTags: (result, _error, args) => {
        const treeRows = ((result?.data || []) as unknown as Array<Record<string, unknown>>);
        const categoryTags = collectInterfaceCategoryTags(treeRows);
        const interfaceTags = collectInterfaceEntityTags(
          treeRows.flatMap(item => (Array.isArray(item.list) ? (item.list as unknown as Array<Record<string, unknown>>) : []))
        );
        return [interfaceProjectTag(args.projectId), ...categoryTags, ...interfaceTags];
      }
    }),
    getInterfaceList: builder.query<
      ApiResult<{ count: number; total: number; list: InterfaceDTO[] }>,
      {
        projectId: number;
        token?: string;
        page?: number;
        limit?: number | 'all';
        status?: string;
        tag?: string;
      }
    >({
      query: args => ({
        url: `/interface/list?${encodeQuery({
          project_id: args.projectId,
          token: args.token,
          page: args.page || 1,
          limit: args.limit || 10,
          status: args.status,
          tag: args.tag
        })}`
      }),
      providesTags: (result, _error, args) => {
        const rows = (result?.data?.list || []) as unknown as Array<Record<string, unknown>>;
        return [
          interfaceProjectTag(args.projectId),
          ...collectInterfaceEntityTags(rows),
          ...collectInterfaceCategoryTagsFromList(rows)
        ];
      }
    }),
    getInterface: builder.query<
      ApiResult<InterfaceDTO & { username?: string }>,
      { id: number; projectId?: number; token?: string }
    >({
      query: args => ({
        url: `/interface/get?${encodeQuery({
          id: args.id,
          project_id: args.projectId,
          token: args.token
        })}`
      }),
      providesTags: (result, _error, args) => {
        const tags = [interfaceEntityTag(args.id)];
        if (args.projectId) {
          tags.push(interfaceProjectTag(args.projectId));
        }
        const catid = toPositiveNumber((result?.data as Record<string, unknown> | undefined)?.catid);
        if (catid > 0) {
          tags.push(interfaceCategoryTag(catid));
        }
        return tags;
      }
    }),
    addInterface: builder.mutation<
      ApiResult<InterfaceDTO>,
      Partial<InterfaceDTO> & { project_id: number; catid: number; title: string; path: string; method: string; token?: string }
    >({
      query: payload => ({
        url: '/interface/add',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [interfaceProjectTag(args.project_id), interfaceCategoryTag(args.catid)]
    }),
    saveInterface: builder.mutation<
      ApiResult<Record<string, unknown>>,
      Partial<InterfaceDTO> & { project_id: number; catid: number; title: string; path: string; method: string; token?: string; dataSync?: string }
    >({
      query: payload => ({
        url: '/interface/save',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [interfaceProjectTag(args.project_id), interfaceCategoryTag(args.catid)]
    }),
    updateInterface: builder.mutation<
      ApiResult<Record<string, unknown>>,
      Partial<InterfaceDTO> & { id: number; token?: string }
    >({
      query: payload => ({
        url: '/interface/up',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = [interfaceEntityTag(args.id)];
        if (typeof args.project_id === 'number') {
          tags.push(interfaceProjectTag(args.project_id));
        }
        if (typeof args.catid === 'number') {
          tags.push(interfaceCategoryTag(args.catid));
        }
        return tags;
      }
    }),
    delInterface: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { id: number; token?: string; project_id?: number; catid?: number }
    >({
      query: payload => ({
        url: '/interface/del',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = [interfaceEntityTag(args.id)];
        const projectId = toPositiveNumber(args.project_id);
        if (projectId > 0) {
          tags.push(interfaceProjectTag(projectId));
        }
        const catid = toPositiveNumber(args.catid);
        if (catid > 0) {
          tags.push(interfaceCategoryTag(catid));
        }
        return tags;
      }
    }),
    getCatMenu: builder.query<ApiResult<InterfaceCatItem[]>, { projectId: number; token?: string }>({
      query: args => ({
        url: `/interface/getCatMenu?${encodeQuery({
          project_id: args.projectId,
          token: args.token
        })}`
      }),
      providesTags: (result, _error, args) => [
        interfaceProjectTag(args.projectId),
        ...collectInterfaceCategoryTags((result?.data || []) as unknown as Array<Record<string, unknown>>)
      ]
    }),
    addInterfaceCat: builder.mutation<
      ApiResult<InterfaceCatItem>,
      { project_id: number; name: string; desc?: string; token?: string }
    >({
      query: payload => ({
        url: '/interface/add_cat',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [interfaceProjectTag(args.project_id)]
    }),
    updateInterfaceCat: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { catid: number; name?: string; desc?: string; token?: string; project_id?: number }
    >({
      query: payload => ({
        url: '/interface/up_cat',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = [interfaceCategoryTag(args.catid)];
        const projectId = toPositiveNumber(args.project_id);
        if (projectId > 0) {
          tags.push(interfaceProjectTag(projectId));
        }
        return tags;
      }
    }),
    delInterfaceCat: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { catid: number; token?: string; project_id?: number }
    >({
      query: payload => ({
        url: '/interface/del_cat',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = [interfaceCategoryTag(args.catid)];
        const projectId = toPositiveNumber(args.project_id);
        if (projectId > 0) {
          tags.push(interfaceProjectTag(projectId));
        }
        return tags;
      }
    }),
    upInterfaceIndex: builder.mutation<
      ApiResult<string>,
      Array<{ id: number; index?: number }>
    >({
      query: payload => ({
        url: '/interface/up_index',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) =>
        args
          .map(item => interfaceEntityTag(toPositiveNumber(item.id)))
          .filter(item => item.id !== 'INTERFACE-0')
    }),
    upInterfaceCatIndex: builder.mutation<
      ApiResult<string>,
      Array<{ id: number; index?: number }>
    >({
      query: payload => ({
        url: '/interface/up_cat_index',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) =>
        args
          .map(item => interfaceCategoryTag(toPositiveNumber(item.id)))
          .filter(item => item.id !== 'CAT-0')
    }),
    getColList: builder.query<ApiResult<ColItem[]>, { project_id: number; token?: string }>({
      query: args => ({
        url: `/col/list?${encodeQuery({
          project_id: args.project_id,
          token: args.token
        })}`
      }),
      providesTags: (result, _error, args) => [
        colProjectTag(args.project_id),
        ...((result?.data || [])
          .map(item => colEntityTag(toPositiveNumber(item._id)))
          .filter(item => item.id !== 'COL-0'))
      ]
    }),
    addCol: builder.mutation<
      ApiResult<ColItem>,
      { project_id: number; name: string; desc?: string; token?: string }
    >({
      query: payload => ({
        url: '/col/add_col',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [colProjectTag(args.project_id)]
    }),
    upColCompat: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { col_id: number; token?: string; [key: string]: unknown }
    >({
      query: payload => ({
        url: '/col/up_col',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [colEntityTag(args.col_id)]
    }),
    delCol: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { col_id: number; token?: string; project_id?: number }
    >({
      query: args => ({
        url: `/col/del_col?${encodeQuery({
          col_id: args.col_id,
          token: args.token
        })}`,
        method: 'GET'
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = [colEntityTag(args.col_id), colCaseCollectionTag(args.col_id)];
        const projectId = toPositiveNumber(args.project_id);
        if (projectId > 0) {
          tags.push(colProjectTag(projectId));
        }
        return tags;
      }
    }),
    getColCaseList: builder.query<ApiResult<ColCaseItem[]>, { col_id: number; token?: string }>({
      query: args => ({
        url: `/col/case_list?${encodeQuery({
          col_id: args.col_id,
          token: args.token
        })}`
      }),
      providesTags: (result, _error, args) => [
        colCaseCollectionTag(args.col_id),
        ...((result?.data || [])
          .map(item => colCaseEntityTag(String(item._id || '')))
          .filter(item => item.id !== 'CASE-'))
      ]
    }),
    getColCaseEnvList: builder.query<
      ApiResult<Array<Record<string, unknown>>>,
      { col_id: number; token?: string }
    >({
      query: args => ({
        url: `/col/case_env_list?${encodeQuery({
          col_id: args.col_id,
          token: args.token
        })}`
      }),
      providesTags: (_result, _error, args) => [colCaseCollectionTag(args.col_id)]
    }),
    getColCaseListByVarParams: builder.query<
      ApiResult<Array<Record<string, unknown>>>,
      { col_id: number; token?: string }
    >({
      query: args => ({
        url: `/col/case_list_by_var_params?${encodeQuery({
          col_id: args.col_id,
          token: args.token
        })}`
      }),
      providesTags: (_result, _error, args) => [colCaseCollectionTag(args.col_id)]
    }),
    addColCase: builder.mutation<
      ApiResult<ColCaseItem>,
      {
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
        token?: string;
      }
    >({
      query: payload => ({
        url: '/col/add_case',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [colCaseCollectionTag(args.col_id)]
    }),
    addColCaseList: builder.mutation<
      ApiResult<string>,
      { project_id: number; col_id: number; interface_list: number[]; token?: string }
    >({
      query: payload => ({
        url: '/col/add_case_list',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [colCaseCollectionTag(args.col_id)]
    }),
    cloneColCaseList: builder.mutation<
      ApiResult<string>,
      { project_id: number; col_id: number; new_col_id: number; token?: string }
    >({
      query: payload => ({
        url: '/col/clone_case_list',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [
        colCaseCollectionTag(args.col_id),
        colCaseCollectionTag(args.new_col_id)
      ]
    }),
    upColCase: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { id: string; token?: string; col_id?: number; [key: string]: unknown }
    >({
      query: payload => ({
        url: '/col/up_case',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = [colCaseEntityTag(args.id)];
        const colId = toPositiveNumber(args.col_id);
        if (colId > 0) {
          tags.push(colCaseCollectionTag(colId));
        }
        return tags;
      }
    }),
    getColCase: builder.query<ApiResult<Record<string, unknown>>, { caseid: string; token?: string }>({
      query: args => ({
        url: `/col/case?${encodeQuery({
          caseid: args.caseid,
          token: args.token
        })}`
      }),
      providesTags: (result, _error, args) => {
        const tags = [colCaseEntityTag(args.caseid)];
        const colId = toPositiveNumber((result?.data as Record<string, unknown> | undefined)?.col_id);
        if (colId > 0) {
          tags.push(colCaseCollectionTag(colId));
        }
        return tags;
      }
    }),
    delColCase: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { caseid: string; token?: string; col_id?: number }
    >({
      query: args => ({
        url: `/col/del_case?${encodeQuery({
          caseid: args.caseid,
          token: args.token
        })}`,
        method: 'GET'
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = [colCaseEntityTag(args.caseid)];
        const colId = toPositiveNumber(args.col_id);
        if (colId > 0) {
          tags.push(colCaseCollectionTag(colId));
        }
        return tags;
      }
    }),
    upColCaseIndex: builder.mutation<
      ApiResult<string>,
      Array<{ id: string; index?: number; col_id?: number }>
    >({
      query: payload => ({
        url: '/col/up_case_index',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = args
          .map(item => colCaseEntityTag(String(item.id || '')))
          .filter(item => item.id !== 'CASE-');
        const colIds = new Set(
          args
            .map(item => toPositiveNumber(item.col_id))
            .filter(item => item > 0)
        );
        colIds.forEach(colId => {
          tags.push(colCaseCollectionTag(colId));
        });
        return tags;
      }
    }),
    upColIndex: builder.mutation<ApiResult<string>, Array<{ id: number; index?: number }>>({
      query: payload => ({
        url: '/col/up_col_index',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) =>
        args
          .map(item => colEntityTag(toPositiveNumber(item.id)))
          .filter(item => item.id !== 'COL-0')
    }),
    runColCaseScript: builder.mutation<
      ApiResult<Record<string, unknown>>,
      {
        col_id: number;
        interface_id: number;
        response: { status: number; body: unknown; header?: Record<string, unknown> };
        records?: Record<string, unknown>;
        params?: Record<string, unknown>;
        script?: string;
        token?: string;
      }
    >({
      query: payload => ({
        url: '/col/run_script',
        method: 'POST',
        body: payload
      })
    }),
    getLogList: builder.query<
      ApiResult<LogListResult>,
      { type: 'project' | 'group'; typeid: number; page?: number; limit?: number; selectValue?: string }
    >({
      query: args => ({
        url: `/log/list?${encodeQuery({
          type: args.type,
          typeid: args.typeid,
          page: args.page || 1,
          limit: args.limit || 20,
          selectValue: args.selectValue
        })}`
      })
    }),
    interUpload: builder.mutation<
      ApiResult<Record<string, unknown>>,
      {
        project_id?: number;
        token?: string;
        type?: string;
        source?: 'json' | 'url';
        format?: 'auto' | 'swagger2' | 'openapi3';
        merge?: 'normal' | 'good' | 'merge';
        dataSync?: 'normal' | 'good' | 'merge';
        interfaceData?: string;
        json?: string;
        content?: string;
        url?: string;
      }
    >({
      query: payload => ({
        url: '/interface/interUpload',
        method: 'POST',
        body: payload
      })
    })
  })
});

export const {
  useLoginMutation,
  useRegisterUserMutation,
  useLoginByTokenMutation,
  useGetUserStatusQuery,
  useGetUserListQuery,
  useFindUserQuery,
  useLazyFindUserQuery,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useUpdateStudyMutation,
  useChangePasswordMutation,
  useSearchUsersQuery,
  useLazySearchUsersQuery,
  useGetUserProjectContextQuery,
  useLazyGetUserProjectContextQuery,
  useUploadAvatarMutation,
  useLogoutMutation,
  useGetGroupListQuery,
  useGetMyGroupQuery,
  useGetGroupQuery,
  useAddGroupMutation,
  useUpdateGroupMutation,
  useDelGroupMutation,
  useGetGroupMemberListQuery,
  useAddGroupMemberMutation,
  useDelGroupMemberMutation,
  useChangeGroupMemberRoleMutation,
  useGetProjectListQuery,
  useCheckProjectNameQuery,
  useLazyCheckProjectNameQuery,
  useAddProjectMutation,
  useCopyProjectMutation,
  useDelProjectMutation,
  useGetFollowListQuery,
  useAddFollowMutation,
  useDelFollowMutation,
  useUpdateProjectMutation,
  useGetProjectEnvQuery,
  useUpdateProjectEnvMutation,
  useUpdateProjectTagMutation,
  useAddProjectMemberMutation,
  useGetProjectMemberListQuery,
  useLazyGetProjectMemberListQuery,
  useDelProjectMemberMutation,
  useChangeProjectMemberRoleMutation,
  useChangeProjectMemberEmailNoticeMutation,
  useUpsetProjectMutation,
  useGetProjectQuery,
  useGetProjectTokenQuery,
  useUpdateProjectTokenMutation,
  useSearchProjectQuery,
  useLazySearchProjectQuery,
  useFetchSwaggerByUrlQuery,
  useLazyFetchSwaggerByUrlQuery,
  useImportSpecMutation,
  useGetImportTaskQuery,
  useListImportTasksQuery,
  useExportSpecMutation,
  useGetInterfaceTreeQuery,
  useLazyGetInterfaceTreeQuery,
  useGetInterfaceTreeNodeQuery,
  useLazyGetInterfaceTreeNodeQuery,
  useGetListMenuQuery,
  useGetInterfaceListQuery,
  useGetInterfaceQuery,
  useLazyGetInterfaceQuery,
  useAddInterfaceMutation,
  useSaveInterfaceMutation,
  useUpdateInterfaceMutation,
  useDelInterfaceMutation,
  useGetCatMenuQuery,
  useAddInterfaceCatMutation,
  useUpdateInterfaceCatMutation,
  useDelInterfaceCatMutation,
  useUpInterfaceIndexMutation,
  useUpInterfaceCatIndexMutation,
  useGetColListQuery,
  useAddColMutation,
  useUpColCompatMutation,
  useDelColMutation,
  useGetColCaseListQuery,
  useGetColCaseEnvListQuery,
  useGetColCaseListByVarParamsQuery,
  useAddColCaseMutation,
  useAddColCaseListMutation,
  useCloneColCaseListMutation,
  useUpColCaseMutation,
  useGetColCaseQuery,
  useLazyGetColCaseQuery,
  useDelColCaseMutation,
  useUpColCaseIndexMutation,
  useUpColIndexMutation,
  useRunColCaseScriptMutation,
  useGetLogListQuery,
  useInterUploadMutation,
} = yapiApi;
