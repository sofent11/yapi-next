import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  ApiResult,
  FollowItem,
  GroupListItem,
  ProjectCopyRequest,
  LegacyInterfaceDTO,
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

export const yapiApi = createApi({
  reducerPath: 'yapiApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    credentials: 'include'
  }),
  tagTypes: ['ImportTask', 'ImportTaskList', 'InterfaceTree', 'ProjectInfo'],
  endpoints: builder => ({
    login: builder.mutation<ApiResult<UserProfile>, UserLoginRequest>({
      query: payload => ({
        url: '/user/login',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['ProjectInfo']
    }),
    registerUser: builder.mutation<ApiResult<UserProfile>, UserRegisterRequest>({
      query: payload => ({
        url: '/user/reg',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['ProjectInfo']
    }),
    loginByToken: builder.mutation<ApiResult<UserProfile>, UserLoginByTokenRequest>({
      query: payload => ({
        url: '/user/login_by_token',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['ProjectInfo']
    }),
    getUserStatus: builder.query<UserStatusResponse, void>({
      query: () => ({ url: '/user/status' }),
      providesTags: ['ProjectInfo']
    }),
    getUserList: builder.query<ApiResult<UserListResult>, UserListQuery | void>({
      query: args => ({
        url: `/user/list?${encodeQuery({
          page: args?.page || 1,
          limit: args?.limit || 20
        })}`
      }),
      providesTags: ['ProjectInfo']
    }),
    findUser: builder.query<ApiResult<UserProfile>, UserFindQuery>({
      query: args => ({
        url: `/user/find?${encodeQuery({ id: args.id })}`
      }),
      providesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
    }),
    updateStudy: builder.query<
      ApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      void
    >({
      query: () => ({
        url: '/user/up_study'
      }),
      providesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
    }),
    searchUsers: builder.query<ApiResult<UserSearchItem[]>, { q: string }>({
      query: args => ({
        url: `/user/search?${encodeQuery({ q: args.q })}`
      }),
      providesTags: ['ProjectInfo']
    }),
    getUserProjectContext: builder.query<ApiResult<UserProjectContextResult>, UserProjectContextQuery>({
      query: args => ({
        url: `/user/project?${encodeQuery({ type: args.type, id: args.id })}`
      }),
      providesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
    }),
    logout: builder.mutation<ApiResult<string>, void>({
      query: () => ({
        url: '/user/logout',
        method: 'GET'
      }),
      invalidatesTags: ['ProjectInfo']
    }),
    getGroupList: builder.query<ApiResult<GroupListItem[]>, void>({
      query: () => ({ url: '/group/list' }),
      providesTags: ['ProjectInfo']
    }),
    getMyGroup: builder.query<ApiResult<GroupListItem>, void>({
      query: () => ({ url: '/group/get_mygroup' }),
      providesTags: ['ProjectInfo']
    }),
    getGroup: builder.query<ApiResult<GroupListItem>, { id: number }>({
      query: args => ({
        url: `/group/get?${encodeQuery({ id: args.id })}`
      }),
      providesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
    }),
    delGroup: builder.mutation<ApiResult<Record<string, unknown>>, { id: number }>({
      query: payload => ({
        url: '/group/del',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['ProjectInfo']
    }),
    getGroupMemberList: builder.query<
      ApiResult<Array<{ uid: number; role?: string; username?: string; email?: string }>>,
      { id: number }
    >({
      query: args => ({
        url: `/group/get_member_list?${encodeQuery({ id: args.id })}`
      }),
      providesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
    }),
    getProjectList: builder.query<ApiResult<ProjectListResult>, { groupId: number }>({
      query: args => ({
        url: `/project/list?${encodeQuery({
          group_id: args.groupId
        })}`
      }),
      providesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
    }),
    copyProject: builder.mutation<ApiResult<ProjectListItem>, ProjectCopyRequest>({
      query: payload => ({
        url: '/project/copy',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['ProjectInfo', 'InterfaceTree']
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
      invalidatesTags: ['ProjectInfo', 'InterfaceTree']
    }),
    getFollowList: builder.query<ApiResult<FollowListResult>, void>({
      query: () => ({
        url: '/follow/list'
      }),
      providesTags: ['ProjectInfo']
    }),
    addFollow: builder.mutation<ApiResult<FollowItem>, { projectid: number }>({
      query: payload => ({
        url: '/follow/add',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
    }),
    getProjectEnv: builder.query<ApiResult<{ _id?: number; env?: ProjectEnvItem[] }>, { projectId: number }>({
      query: args => ({
        url: `/project/get_env?${encodeQuery({
          project_id: args.projectId
        })}`
      }),
      providesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
    }),
    getProjectMemberList: builder.query<ApiResult<MemberItem[]>, { id: number }>({
      query: args => ({
        url: `/project/get_member_list?${encodeQuery({ id: args.id })}`
      }),
      providesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      providesTags: ['ProjectInfo']
    }),
    getProjectToken: builder.query<ApiResult<string>, { projectId: number }>({
      query: args => ({
        url: `/project/token?${encodeQuery({
          project_id: args.projectId
        })}`
      }),
      providesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      })
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
      invalidatesTags: ['ImportTaskList', 'InterfaceTree']
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
      providesTags: ['ImportTaskList']
    }),
    exportSpec: builder.mutation<ApiResult<Record<string, unknown>>, SpecExportQuery>({
      query: payload => ({
        url: `/spec/export?${encodeQuery({
          project_id: payload.project_id,
          token: payload.token,
          format: payload.format,
          status: payload.status,
          withWiki: payload.withWiki
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
      providesTags: ['InterfaceTree']
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
      })
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
      providesTags: ['InterfaceTree']
    }),
    getInterfaceList: builder.query<
      ApiResult<{ count: number; total: number; list: LegacyInterfaceDTO[] }>,
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
      providesTags: ['InterfaceTree']
    }),
    getInterface: builder.query<
      ApiResult<LegacyInterfaceDTO & { username?: string }>,
      { id: number; projectId?: number; token?: string }
    >({
      query: args => ({
        url: `/interface/get?${encodeQuery({
          id: args.id,
          project_id: args.projectId,
          token: args.token
        })}`
      }),
      providesTags: ['InterfaceTree']
    }),
    addInterface: builder.mutation<
      ApiResult<LegacyInterfaceDTO>,
      Partial<LegacyInterfaceDTO> & { project_id: number; catid: number; title: string; path: string; method: string; token?: string }
    >({
      query: payload => ({
        url: '/interface/add',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['InterfaceTree']
    }),
    saveInterface: builder.mutation<
      ApiResult<Record<string, unknown>>,
      Partial<LegacyInterfaceDTO> & { project_id: number; catid: number; title: string; path: string; method: string; token?: string; dataSync?: string }
    >({
      query: payload => ({
        url: '/interface/save',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['InterfaceTree']
    }),
    updateInterface: builder.mutation<
      ApiResult<Record<string, unknown>>,
      Partial<LegacyInterfaceDTO> & { id: number; token?: string }
    >({
      query: payload => ({
        url: '/interface/up',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['InterfaceTree']
    }),
    delInterface: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { id: number; token?: string }
    >({
      query: payload => ({
        url: '/interface/del',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['InterfaceTree']
    }),
    getCatMenu: builder.query<ApiResult<InterfaceCatItem[]>, { projectId: number; token?: string }>({
      query: args => ({
        url: `/interface/getCatMenu?${encodeQuery({
          project_id: args.projectId,
          token: args.token
        })}`
      }),
      providesTags: ['InterfaceTree']
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
      invalidatesTags: ['InterfaceTree']
    }),
    updateInterfaceCat: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { catid: number; name?: string; desc?: string; token?: string }
    >({
      query: payload => ({
        url: '/interface/up_cat',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['InterfaceTree']
    }),
    delInterfaceCat: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { catid: number; token?: string }
    >({
      query: payload => ({
        url: '/interface/del_cat',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: ['InterfaceTree']
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
      invalidatesTags: ['InterfaceTree']
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
      invalidatesTags: ['InterfaceTree']
    }),
    getColList: builder.query<ApiResult<ColItem[]>, { project_id: number; token?: string }>({
      query: args => ({
        url: `/col/list?${encodeQuery({
          project_id: args.project_id,
          token: args.token
        })}`
      }),
      providesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
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
      invalidatesTags: ['ProjectInfo']
    }),
    delCol: builder.query<ApiResult<Record<string, unknown>>, { col_id: number; token?: string }>({
      query: args => ({
        url: `/col/del_col?${encodeQuery({
          col_id: args.col_id,
          token: args.token
        })}`
      }),
      providesTags: ['ProjectInfo']
    }),
    getColCaseList: builder.query<ApiResult<ColCaseItem[]>, { col_id: number; token?: string }>({
      query: args => ({
        url: `/col/case_list?${encodeQuery({
          col_id: args.col_id,
          token: args.token
        })}`
      })
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
      })
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
      })
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
      })
    }),
    addColCaseList: builder.mutation<
      ApiResult<string>,
      { project_id: number; col_id: number; interface_list: number[]; token?: string }
    >({
      query: payload => ({
        url: '/col/add_case_list',
        method: 'POST',
        body: payload
      })
    }),
    cloneColCaseList: builder.mutation<
      ApiResult<string>,
      { project_id: number; col_id: number; new_col_id: number; token?: string }
    >({
      query: payload => ({
        url: '/col/clone_case_list',
        method: 'POST',
        body: payload
      })
    }),
    upColCase: builder.mutation<
      ApiResult<Record<string, unknown>>,
      { id: string; token?: string; [key: string]: unknown }
    >({
      query: payload => ({
        url: '/col/up_case',
        method: 'POST',
        body: payload
      })
    }),
    getColCase: builder.query<ApiResult<Record<string, unknown>>, { caseid: string; token?: string }>({
      query: args => ({
        url: `/col/case?${encodeQuery({
          caseid: args.caseid,
          token: args.token
        })}`
      })
    }),
    delColCase: builder.query<ApiResult<Record<string, unknown>>, { caseid: string; token?: string }>({
      query: args => ({
        url: `/col/del_case?${encodeQuery({
          caseid: args.caseid,
          token: args.token
        })}`
      })
    }),
    upColCaseIndex: builder.mutation<ApiResult<string>, Array<{ id: string; index?: number }>>({
      query: payload => ({
        url: '/col/up_case_index',
        method: 'POST',
        body: payload
      })
    }),
    upColIndex: builder.mutation<ApiResult<string>, Array<{ id: number; index?: number }>>({
      query: payload => ({
        url: '/col/up_col_index',
        method: 'POST',
        body: payload
      })
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
    getOpenProjectInterfaceData: builder.query<
      ApiResult<{
        project: Record<string, unknown> | null;
        stats: { categories: number; interfaces: number };
        categories: Array<Record<string, unknown>>;
        interfaces: Array<Record<string, unknown>>;
      }>,
      { projectId?: number; token?: string } | void
    >({
      query: args => ({
        url: `/open/project_interface_data?${encodeQuery({
          project_id: args?.projectId,
          token: args?.token
        })}`
      })
    }),
    runOpenAutoTest: builder.query<
      Record<string, unknown>,
      { id: number; token: string; mode?: 'json' | 'html'; projectId?: number; download?: boolean }
    >({
      query: args => ({
        url: `/open/run_auto_test?${encodeQuery({
          id: args.id,
          token: args.token,
          mode: args.mode || 'json',
          project_id: args.projectId,
          download: args.download
        })}`
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
    getLogListByUpdate: builder.mutation<
      ApiResult<Array<Record<string, unknown>>>,
      { type: 'project' | 'group'; typeid: number; apis: Array<{ method: string; path: string }> }
    >({
      query: payload => ({
        url: '/log/list_by_update',
        method: 'POST',
        body: payload
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
    }),
    testPostCompat: builder.mutation<ApiResult<Record<string, unknown>>, Record<string, unknown>>({
      query: payload => ({
        url: '/test/post',
        method: 'POST',
        body: payload
      })
    }),
    testPutCompat: builder.mutation<ApiResult<Record<string, unknown>>, Record<string, unknown>>({
      query: payload => ({
        url: '/test/put',
        method: 'PUT',
        body: payload
      })
    }),
    testPatchCompat: builder.mutation<ApiResult<Record<string, unknown>>, Record<string, unknown>>({
      query: payload => ({
        url: '/test/patch',
        method: 'PATCH',
        body: payload
      })
    }),
    testDeleteCompat: builder.mutation<ApiResult<Record<string, unknown>>, Record<string, unknown>>({
      query: payload => ({
        url: '/test/delete',
        method: 'DELETE',
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
  useUpdateStudyQuery,
  useLazyUpdateStudyQuery,
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
  useDelColQuery,
  useLazyDelColQuery,
  useGetColCaseListQuery,
  useGetColCaseEnvListQuery,
  useGetColCaseListByVarParamsQuery,
  useAddColCaseMutation,
  useAddColCaseListMutation,
  useCloneColCaseListMutation,
  useUpColCaseMutation,
  useGetColCaseQuery,
  useLazyGetColCaseQuery,
  useDelColCaseQuery,
  useLazyDelColCaseQuery,
  useUpColCaseIndexMutation,
  useUpColIndexMutation,
  useRunColCaseScriptMutation,
  useGetOpenProjectInterfaceDataQuery,
  useRunOpenAutoTestQuery,
  useLazyRunOpenAutoTestQuery,
  useGetLogListQuery,
  useLazyGetLogListQuery,
  useGetLogListByUpdateMutation,
  useInterUploadMutation,
  useTestPostCompatMutation,
  useTestPutCompatMutation,
  useTestPatchCompatMutation,
  useTestDeleteCompatMutation
} = yapiApi;
