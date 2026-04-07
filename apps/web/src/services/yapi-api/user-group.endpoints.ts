import type { SharedApiResult } from './shared';
import {
  encodeQuery,
  GROUP_LIST_TAG,
  groupTag,
  PROJECT_LIST_TAG,
  FOLLOW_LIST_TAG,
  USER_LIST_TAG,
  userTag,
  type SharedGroupListItem,
  type SharedUserAvatarUploadRequest,
  type SharedUserChangePasswordRequest,
  type SharedUserDeleteRequest,
  type SharedUserFindQuery,
  type SharedUserListQuery,
  type SharedUserLoginByTokenRequest,
  type SharedUserLoginRequest,
  type SharedUserProfile,
  type SharedUserProjectContextQuery,
  type SharedUserRegisterRequest,
  type SharedUserSearchItem,
  type UserListResult,
  type UserProjectContextResult,
  type UserStatusResponse,
  type YapiEndpointBuilder
} from './shared';

export function buildUserGroupEndpoints(builder: YapiEndpointBuilder) {
  return {
    login: builder.mutation<SharedApiResult<SharedUserProfile>, SharedUserLoginRequest>({
      query: (payload: SharedUserLoginRequest) => ({
        url: '/user/login',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [USER_LIST_TAG, GROUP_LIST_TAG, PROJECT_LIST_TAG, FOLLOW_LIST_TAG]
    }),
    registerUser: builder.mutation<SharedApiResult<SharedUserProfile>, SharedUserRegisterRequest>({
      query: (payload: SharedUserRegisterRequest) => ({
        url: '/user/reg',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [USER_LIST_TAG, GROUP_LIST_TAG, PROJECT_LIST_TAG, FOLLOW_LIST_TAG]
    }),
    loginByToken: builder.mutation<SharedApiResult<SharedUserProfile>, SharedUserLoginByTokenRequest>({
      query: (payload: SharedUserLoginByTokenRequest) => ({
        url: '/user/login_by_token',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [USER_LIST_TAG, GROUP_LIST_TAG, PROJECT_LIST_TAG, FOLLOW_LIST_TAG]
    }),
    getUserStatus: builder.query<UserStatusResponse, void>({
      query: () => ({ url: '/user/status' }),
      providesTags: (result: UserStatusResponse | undefined) => {
        const uid = Number(result?.data?._id || result?.data?.uid || 0);
        return uid > 0 ? [USER_LIST_TAG, userTag(uid)] : [USER_LIST_TAG];
      }
    }),
    getUserList: builder.query<SharedApiResult<UserListResult>, SharedUserListQuery | void>({
      query: (args: SharedUserListQuery | void) => ({
        url: `/user/list?${encodeQuery({
          page: args?.page || 1,
          limit: args?.limit || 20
        })}`
      }),
      providesTags: (result: SharedApiResult<UserListResult> | undefined) => [
        USER_LIST_TAG,
        ...((result?.data?.list || [])
          .map(item => userTag(Number(item._id || item.uid || 0)))
          .filter(item => typeof item.id === 'number' && item.id > 0))
      ]
    }),
    findUser: builder.query<SharedApiResult<SharedUserProfile>, SharedUserFindQuery>({
      query: (args: SharedUserFindQuery) => ({
        url: `/user/find?${encodeQuery({ id: args.id })}`
      }),
      providesTags: (_result: unknown, _error: unknown, args: SharedUserFindQuery) => [
        USER_LIST_TAG,
        userTag(args.id)
      ]
    }),
    updateUser: builder.mutation<
      SharedApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
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
      SharedApiResult<{ acknowledged?: boolean; deletedCount?: number }>,
      SharedUserDeleteRequest
    >({
      query: (payload: SharedUserDeleteRequest) => ({
        url: '/user/del',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [USER_LIST_TAG, userTag(args.id)]
    }),
    updateStudy: builder.mutation<
      SharedApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      void
    >({
      query: () => ({
        url: '/user/up_study',
        method: 'GET'
      }),
      invalidatesTags: [USER_LIST_TAG]
    }),
    changePassword: builder.mutation<
      SharedApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number }>,
      SharedUserChangePasswordRequest
    >({
      query: (payload: SharedUserChangePasswordRequest) => ({
        url: '/user/change_password',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [USER_LIST_TAG]
    }),
    searchUsers: builder.query<SharedApiResult<SharedUserSearchItem[]>, { q: string }>({
      query: args => ({
        url: `/user/search?${encodeQuery({ q: args.q })}`
      }),
      providesTags: [USER_LIST_TAG]
    }),
    getUserProjectContext: builder.query<
      SharedApiResult<UserProjectContextResult>,
      SharedUserProjectContextQuery
    >({
      query: (args: SharedUserProjectContextQuery) => ({
        url: `/user/project?${encodeQuery({ type: args.type, id: args.id })}`
      }),
      providesTags: [USER_LIST_TAG]
    }),
    uploadAvatar: builder.mutation<
      SharedApiResult<{ acknowledged?: boolean; matchedCount?: number; modifiedCount?: number; upsertedId?: unknown }>,
      SharedUserAvatarUploadRequest
    >({
      query: (payload: SharedUserAvatarUploadRequest) => ({
        url: '/user/upload_avatar',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [USER_LIST_TAG]
    }),
    logout: builder.mutation<SharedApiResult<string>, void>({
      query: () => ({
        url: '/user/logout',
        method: 'GET'
      }),
      invalidatesTags: [USER_LIST_TAG, GROUP_LIST_TAG, PROJECT_LIST_TAG, FOLLOW_LIST_TAG]
    }),
    getGroupList: builder.query<SharedApiResult<SharedGroupListItem[]>, void>({
      query: () => ({ url: '/group/list' }),
      providesTags: (result: SharedApiResult<SharedGroupListItem[]> | undefined) => [
        GROUP_LIST_TAG,
        ...((result?.data || [])
          .map(item => groupTag(Number(item._id || 0)))
          .filter(item => typeof item.id === 'number' && item.id > 0))
      ]
    }),
    getMyGroup: builder.query<SharedApiResult<SharedGroupListItem>, void>({
      query: () => ({ url: '/group/get_mygroup' }),
      providesTags: (result: SharedApiResult<SharedGroupListItem> | undefined) => {
        const id = Number(result?.data?._id || 0);
        return id > 0 ? [GROUP_LIST_TAG, groupTag(id)] : [GROUP_LIST_TAG];
      }
    }),
    getGroup: builder.query<SharedApiResult<SharedGroupListItem>, { id: number }>({
      query: args => ({
        url: `/group/get?${encodeQuery({ id: args.id })}`
      }),
      providesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id)]
    }),
    addGroup: builder.mutation<
      SharedApiResult<Record<string, unknown>>,
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
      SharedApiResult<Record<string, unknown>>,
      { id: number; group_name?: string; group_desc?: string; custom_field1?: { name?: string; enable?: boolean } }
    >({
      query: payload => ({
        url: '/group/up',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id), PROJECT_LIST_TAG]
    }),
    delGroup: builder.mutation<SharedApiResult<Record<string, unknown>>, { id: number }>({
      query: payload => ({
        url: '/group/del',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id), PROJECT_LIST_TAG]
    }),
    getGroupMemberList: builder.query<
      SharedApiResult<Array<{ uid: number; role?: string; username?: string; email?: string }>>,
      { id: number }
    >({
      query: args => ({
        url: `/group/get_member_list?${encodeQuery({ id: args.id })}`
      }),
      providesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id)]
    }),
    addGroupMember: builder.mutation<
      SharedApiResult<Record<string, unknown>>,
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
      SharedApiResult<Record<string, unknown>>,
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
      SharedApiResult<Record<string, unknown>>,
      { id: number; member_uid: number; role: 'owner' | 'dev' | 'guest' }
    >({
      query: payload => ({
        url: '/group/change_member_role',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [GROUP_LIST_TAG, groupTag(args.id)]
    })
  };
}
