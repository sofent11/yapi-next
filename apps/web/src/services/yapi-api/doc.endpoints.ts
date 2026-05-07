import {
  DOC_LIST_TAG,
  docScopeTag,
  encodeQuery,
  type SharedApiResult,
  type SharedDocAddRequest,
  type SharedDocDeleteRequest,
  type SharedDocMoveRequest,
  type SharedDocNode,
  type SharedDocScopeQuery,
  type SharedDocTreeResult,
  type SharedDocUpdateRequest,
  type YapiEndpointBuilder
} from './shared';

export function buildDocEndpoints(builder: YapiEndpointBuilder) {
  return {
    getDocTree: builder.query<SharedApiResult<SharedDocTreeResult>, SharedDocScopeQuery>({
      query: args => ({
        url: `/doc/tree?${encodeQuery({
          scope_type: args.scope_type,
          group_id: args.group_id,
          project_id: args.project_id,
          token: args.token
        })}`
      }),
      providesTags: (_result, _error, args) => [DOC_LIST_TAG, docScopeTag(args)]
    }),
    addDocNode: builder.mutation<SharedApiResult<SharedDocNode>, SharedDocAddRequest>({
      query: payload => ({
        url: '/doc/add',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [DOC_LIST_TAG, docScopeTag(args)]
    }),
    updateDocNode: builder.mutation<SharedApiResult<SharedDocNode>, SharedDocUpdateRequest>({
      query: payload => ({
        url: '/doc/up',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [DOC_LIST_TAG]
    }),
    moveDocNode: builder.mutation<SharedApiResult<SharedDocNode>, SharedDocMoveRequest>({
      query: payload => ({
        url: '/doc/move',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [DOC_LIST_TAG]
    }),
    deleteDocNode: builder.mutation<SharedApiResult<{ acknowledged?: boolean; deletedCount?: number }>, SharedDocDeleteRequest>({
      query: payload => ({
        url: '/doc/del',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: [DOC_LIST_TAG]
    })
  };
}
