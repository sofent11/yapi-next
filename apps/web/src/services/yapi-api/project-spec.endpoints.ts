import {
  encodeQuery,
  FOLLOW_LIST_TAG,
  GROUP_LIST_TAG,
  interfaceProjectTag,
  PROJECT_LIST_TAG,
  projectTag,
  type FollowListResult,
  type ImportSpecResponse,
  type ImportTaskListResult,
  type MemberItem,
  type MemberRole,
  type ProjectApiMarkdownResult,
  type SharedApiResult,
  type SharedFollowItem,
  type SharedInterfaceTreeNode,
  type SharedProjectCopyRequest,
  type SharedProjectEnvItem,
  type SharedProjectListItem,
  type SharedProjectListResult,
  type SharedProjectTagItem,
  type SharedProjectUpdateRequest,
  type SharedSpecExportQuery,
  type SharedSpecImportRequest,
  type SharedSpecImportTaskDTO,
  type YapiEndpointBuilder
} from './shared';

export function buildProjectSpecEndpoints(builder: YapiEndpointBuilder) {
  return {
    getProjectList: builder.query<SharedApiResult<SharedProjectListResult>, { groupId: number }>({
      query: args => ({
        url: `/project/list?${encodeQuery({ group_id: args.groupId })}`
      }),
      providesTags: (result: SharedApiResult<SharedProjectListResult> | undefined) => [
        PROJECT_LIST_TAG,
        ...((result?.data?.list || [])
          .map(item => projectTag(Number(item._id || 0)))
          .filter(item => typeof item.id === 'number' && item.id > 0))
      ]
    }),
    checkProjectName: builder.query<SharedApiResult<Record<string, unknown>>, { name: string; groupId: number }>({
      query: args => ({
        url: `/project/check_project_name?${encodeQuery({ name: args.name, group_id: args.groupId })}`
      })
    }),
    addProject: builder.mutation<
      SharedApiResult<SharedProjectListItem>,
      { name: string; group_id: number; basepath?: string; desc?: string; color?: string; icon?: string; project_type?: 'public' | 'private' }
    >({
      query: payload => ({
        url: '/project/add',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, GROUP_LIST_TAG, { type: 'Group' as const, id: args.group_id }]
    }),
    copyProject: builder.mutation<SharedApiResult<SharedProjectListItem>, SharedProjectCopyRequest>({
      query: (payload: SharedProjectCopyRequest) => ({
        url: '/project/copy',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [
        PROJECT_LIST_TAG,
        projectTag(args._id),
        { type: 'InterfaceTree' as const, id: `PROJECT-${args._id}` }
      ]
    }),
    delProject: builder.mutation<SharedApiResult<Record<string, unknown>>, { id: number }>({
      query: payload => ({
        url: '/project/del',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [
        PROJECT_LIST_TAG,
        FOLLOW_LIST_TAG,
        projectTag(args.id),
        { type: 'InterfaceTree' as const, id: `PROJECT-${args.id}` }
      ]
    }),
    getFollowList: builder.query<SharedApiResult<FollowListResult>, void>({
      query: () => ({ url: '/follow/list' }),
      providesTags: (result: SharedApiResult<FollowListResult> | undefined) => [
        FOLLOW_LIST_TAG,
        ...((result?.data?.list || [])
          .map(item => projectTag(Number(item.projectid || item._id || 0)))
          .filter(item => typeof item.id === 'number' && item.id > 0))
      ]
    }),
    addFollow: builder.mutation<SharedApiResult<SharedFollowItem>, { projectid: number }>({
      query: payload => ({
        url: '/follow/add',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [FOLLOW_LIST_TAG, projectTag(args.projectid)]
    }),
    delFollow: builder.mutation<
      SharedApiResult<{ acknowledged?: boolean; deletedCount?: number }>,
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
      SharedApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      SharedProjectUpdateRequest
    >({
      query: (payload: SharedProjectUpdateRequest) => ({
        url: '/project/up',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    getProjectEnv: builder.query<SharedApiResult<{ _id?: number; env?: SharedProjectEnvItem[] }>, { projectId: number }>({
      query: args => ({
        url: `/project/get_env?${encodeQuery({ project_id: args.projectId })}`
      }),
      providesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.projectId)]
    }),
    updateProjectEnv: builder.mutation<
      SharedApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      { id: number; env: SharedProjectEnvItem[] }
    >({
      query: payload => ({
        url: '/project/up_env',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    updateProjectTag: builder.mutation<
      SharedApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      { id: number; tag: SharedProjectTagItem[] }
    >({
      query: payload => ({
        url: '/project/up_tag',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    generateProjectApiMarkdown: builder.mutation<
      SharedApiResult<ProjectApiMarkdownResult>,
      { project_id: number; source: string; token?: string }
    >({
      query: payload => ({
        url: '/project/api_markdown',
        method: 'POST',
        body: payload
      })
    }),
    addProjectMember: builder.mutation<
      SharedApiResult<{ result: { acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }; add_members: MemberItem[]; exist_members: MemberItem[]; no_members: number[] }>,
      { id: number; member_uids: number[]; role?: MemberRole }
    >({
      query: payload => ({
        url: '/project/add_member',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    getProjectMemberList: builder.query<SharedApiResult<MemberItem[]>, { id: number }>({
      query: args => ({
        url: `/project/get_member_list?${encodeQuery({ id: args.id })}`
      }),
      providesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.id)]
    }),
    delProjectMember: builder.mutation<
      SharedApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
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
      SharedApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
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
      SharedApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
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
      SharedApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
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
      SharedApiResult<SharedProjectListItem & { cat?: SharedInterfaceTreeNode[] }>,
      { projectId: number; token?: string }
    >({
      query: args => ({
        url: `/project/get?${encodeQuery({ project_id: args.projectId, token: args.token })}`
      }),
      providesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.projectId)]
    }),
    getProjectToken: builder.query<SharedApiResult<string>, { projectId: number }>({
      query: args => ({
        url: `/project/token?${encodeQuery({ project_id: args.projectId })}`
      }),
      providesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.projectId)]
    }),
    updateProjectToken: builder.mutation<
      SharedApiResult<{ token: string; matchedCount?: number; modifiedCount?: number; acknowledged?: boolean }>,
      { projectId: number }
    >({
      query: args => ({
        url: `/project/update_token?${encodeQuery({ project_id: args.projectId })}`,
        method: 'GET'
      }),
      invalidatesTags: (_result, _error, args) => [PROJECT_LIST_TAG, projectTag(args.projectId)]
    }),
    searchProject: builder.query<
      SharedApiResult<{ project: Array<Record<string, unknown>>; group: Array<Record<string, unknown>>; interface: Array<Record<string, unknown>> }>,
      { q: string }
    >({
      query: args => ({
        url: `/project/search?${encodeQuery({ q: args.q })}`
      }),
      providesTags: [PROJECT_LIST_TAG, GROUP_LIST_TAG]
    }),
    fetchSwaggerByUrl: builder.query<SharedApiResult<Record<string, unknown>>, { url: string }>({
      query: args => ({
        url: `/project/swagger_url?${encodeQuery({ url: args.url })}`
      })
    }),
    importSpec: builder.mutation<ImportSpecResponse, SharedSpecImportRequest>({
      query: (payload: SharedSpecImportRequest) => ({
        url: '/spec/import',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [
        { type: 'ImportTaskList' as const, id: `PROJECT-${args.project_id}` },
        interfaceProjectTag(args.project_id)
      ]
    }),
    getImportTask: builder.query<
      SharedApiResult<SharedSpecImportTaskDTO>,
      { taskId: string; projectId?: number; token?: string }
    >({
      query: args => ({
        url: `/spec/import/task?${encodeQuery({ task_id: args.taskId, project_id: args.projectId, token: args.token })}`
      }),
      providesTags: (_result, _error, args) => [{ type: 'ImportTask' as const, id: args.taskId }]
    }),
    listImportTasks: builder.query<
      SharedApiResult<ImportTaskListResult>,
      { projectId: number; token?: string; limit?: number }
    >({
      query: args => ({
        url: `/spec/import/tasks?${encodeQuery({ project_id: args.projectId, token: args.token, limit: args.limit || 20 })}`
      }),
      providesTags: (_result, _error, args) => [{ type: 'ImportTaskList' as const, id: `PROJECT-${args.projectId}` }]
    }),
    exportSpec: builder.mutation<SharedApiResult<Record<string, unknown>>, SharedSpecExportQuery>({
      query: (payload: SharedSpecExportQuery) => ({
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
    })
  };
}
