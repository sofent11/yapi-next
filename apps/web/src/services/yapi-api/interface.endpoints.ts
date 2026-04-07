import {
  colCaseCollectionTag,
  colCaseEntityTag,
  colEntityTag,
  colProjectTag,
  collectInterfaceCategoryTags,
  collectInterfaceCategoryTagsFromList,
  collectInterfaceEntityTags,
  encodeQuery,
  interfaceCategoryTag,
  interfaceEntityTag,
  interfaceProjectTag,
  toPositiveNumber,
  type ColCaseItem,
  type ColItem,
  type InterfaceCatItem,
  type LogListResult,
  type SharedApiResult,
  type SharedInterfaceDTO,
  type SharedInterfaceTreeNode,
  type SharedInterfaceTreeNodeResult,
  type SharedInterfaceTreePageResult,
  type YapiEndpointBuilder
} from './shared';

export function buildInterfaceEndpoints(builder: YapiEndpointBuilder) {
  return {
    getInterfaceTree: builder.query<
      SharedApiResult<SharedInterfaceTreePageResult>,
      { projectId: number; token?: string; page?: number; limit?: number; includeList?: boolean; detail?: 'full' | 'summary' }
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
      providesTags: (result: SharedApiResult<SharedInterfaceTreePageResult> | undefined, _error, args) => {
        const treeRows = (result?.data?.list || []) as unknown as Array<Record<string, unknown>>;
        const categoryTags = collectInterfaceCategoryTags(treeRows);
        const interfaceTags = collectInterfaceEntityTags(
          treeRows.flatMap(item => (Array.isArray(item.list) ? (item.list as unknown as Array<Record<string, unknown>>) : []))
        );
        return [interfaceProjectTag(args.projectId), ...categoryTags, ...interfaceTags];
      }
    }),
    getInterfaceTreeNode: builder.query<
      SharedApiResult<SharedInterfaceTreeNodeResult>,
      { catid: number; token?: string; page?: number; limit?: number; detail?: 'full' | 'summary' }
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
      providesTags: (result: SharedApiResult<SharedInterfaceTreeNodeResult> | undefined, _error, args) => {
        const rows = (result?.data?.list || []) as unknown as Array<Record<string, unknown>>;
        return [interfaceCategoryTag(args.catid), ...collectInterfaceEntityTags(rows)];
      }
    }),
    getListMenu: builder.query<
      SharedApiResult<SharedInterfaceTreeNode[]>,
      { projectId: number; token?: string; detail?: 'full' | 'summary' }
    >({
      query: args => ({
        url: `/interface/list_menu?${encodeQuery({
          project_id: args.projectId,
          token: args.token,
          detail: args.detail || 'summary'
        })}`
      }),
      providesTags: (result: SharedApiResult<SharedInterfaceTreeNode[]> | undefined, _error, args) => {
        const treeRows = (result?.data || []) as unknown as Array<Record<string, unknown>>;
        const categoryTags = collectInterfaceCategoryTags(treeRows);
        const interfaceTags = collectInterfaceEntityTags(
          treeRows.flatMap(item => (Array.isArray(item.list) ? (item.list as unknown as Array<Record<string, unknown>>) : []))
        );
        return [interfaceProjectTag(args.projectId), ...categoryTags, ...interfaceTags];
      }
    }),
    getInterfaceList: builder.query<
      SharedApiResult<{ count: number; total: number; list: SharedInterfaceDTO[] }>,
      { projectId: number; token?: string; page?: number; limit?: number | 'all'; status?: string; tag?: string }
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
      providesTags: (result: SharedApiResult<{ count: number; total: number; list: SharedInterfaceDTO[] }> | undefined, _error, args) => {
        const rows = (result?.data?.list || []) as unknown as Array<Record<string, unknown>>;
        return [
          interfaceProjectTag(args.projectId),
          ...collectInterfaceEntityTags(rows),
          ...collectInterfaceCategoryTagsFromList(rows)
        ];
      }
    }),
    getInterface: builder.query<
      SharedApiResult<SharedInterfaceDTO & { username?: string }>,
      { id: number; projectId?: number; token?: string }
    >({
      query: args => ({
        url: `/interface/get?${encodeQuery({ id: args.id, project_id: args.projectId, token: args.token })}`
      }),
      providesTags: (result, _error, args) => {
        const tags = [interfaceEntityTag(args.id)];
        if (args.projectId) tags.push(interfaceProjectTag(args.projectId));
        const catid = toPositiveNumber((result?.data as Record<string, unknown> | undefined)?.catid);
        if (catid > 0) tags.push(interfaceCategoryTag(catid));
        return tags;
      }
    }),
    addInterface: builder.mutation<
      SharedApiResult<SharedInterfaceDTO>,
      Partial<SharedInterfaceDTO> & { project_id: number; catid: number; title: string; path: string; method: string; token?: string }
    >({
      query: payload => ({
        url: '/interface/add',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [interfaceProjectTag(args.project_id), interfaceCategoryTag(args.catid)]
    }),
    saveInterface: builder.mutation<
      SharedApiResult<Record<string, unknown>>,
      Partial<SharedInterfaceDTO> & { project_id: number; catid: number; title: string; path: string; method: string; token?: string; dataSync?: string }
    >({
      query: payload => ({
        url: '/interface/save',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [interfaceProjectTag(args.project_id), interfaceCategoryTag(args.catid)]
    }),
    updateInterface: builder.mutation<
      SharedApiResult<Record<string, unknown>>,
      Partial<SharedInterfaceDTO> & { id: number; token?: string }
    >({
      query: payload => ({
        url: '/interface/up',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = [interfaceEntityTag(args.id)];
        if (typeof args.project_id === 'number') tags.push(interfaceProjectTag(args.project_id));
        if (typeof args.catid === 'number') tags.push(interfaceCategoryTag(args.catid));
        return tags;
      }
    }),
    delInterface: builder.mutation<
      SharedApiResult<Record<string, unknown>>,
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
        if (projectId > 0) tags.push(interfaceProjectTag(projectId));
        const catid = toPositiveNumber(args.catid);
        if (catid > 0) tags.push(interfaceCategoryTag(catid));
        return tags;
      }
    }),
    getCatMenu: builder.query<SharedApiResult<InterfaceCatItem[]>, { projectId: number; token?: string }>({
      query: args => ({
        url: `/interface/getCatMenu?${encodeQuery({ project_id: args.projectId, token: args.token })}`
      }),
      providesTags: (result, _error, args) => [
        interfaceProjectTag(args.projectId),
        ...collectInterfaceCategoryTags((result?.data || []) as unknown as Array<Record<string, unknown>>)
      ]
    }),
    addInterfaceCat: builder.mutation<
      SharedApiResult<InterfaceCatItem>,
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
      SharedApiResult<Record<string, unknown>>,
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
        if (projectId > 0) tags.push(interfaceProjectTag(projectId));
        return tags;
      }
    }),
    delInterfaceCat: builder.mutation<
      SharedApiResult<Record<string, unknown>>,
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
        if (projectId > 0) tags.push(interfaceProjectTag(projectId));
        return tags;
      }
    }),
    upInterfaceIndex: builder.mutation<SharedApiResult<string>, Array<{ id: number; index?: number }>>({
      query: payload => ({
        url: '/interface/up_index',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) =>
        args.map(item => interfaceEntityTag(toPositiveNumber(item.id))).filter(item => item.id !== 'INTERFACE-0')
    }),
    upInterfaceCatIndex: builder.mutation<SharedApiResult<string>, Array<{ id: number; index?: number }>>({
      query: payload => ({
        url: '/interface/up_cat_index',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) =>
        args.map(item => interfaceCategoryTag(toPositiveNumber(item.id))).filter(item => item.id !== 'CAT-0')
    }),
    getColList: builder.query<SharedApiResult<ColItem[]>, { project_id: number; token?: string }>({
      query: args => ({
        url: `/col/list?${encodeQuery({ project_id: args.project_id, token: args.token })}`
      }),
      providesTags: (result, _error, args) => [
        colProjectTag(args.project_id),
        ...((result?.data || []).map(item => colEntityTag(toPositiveNumber(item._id))).filter(item => item.id !== 'COL-0'))
      ]
    }),
    addCol: builder.mutation<
      SharedApiResult<ColItem>,
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
      SharedApiResult<Record<string, unknown>>,
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
      SharedApiResult<Record<string, unknown>>,
      { col_id: number; token?: string; project_id?: number }
    >({
      query: args => ({
        url: `/col/del_col?${encodeQuery({ col_id: args.col_id, token: args.token })}`,
        method: 'GET'
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = [colEntityTag(args.col_id), colCaseCollectionTag(args.col_id)];
        const projectId = toPositiveNumber(args.project_id);
        if (projectId > 0) tags.push(colProjectTag(projectId));
        return tags;
      }
    }),
    getColCaseList: builder.query<SharedApiResult<ColCaseItem[]>, { col_id: number; token?: string }>({
      query: args => ({
        url: `/col/case_list?${encodeQuery({ col_id: args.col_id, token: args.token })}`
      }),
      providesTags: (result, _error, args) => [
        colCaseCollectionTag(args.col_id),
        ...((result?.data || []).map(item => colCaseEntityTag(String(item._id || ''))).filter(item => item.id !== 'CASE-'))
      ]
    }),
    getColCaseEnvList: builder.query<SharedApiResult<Array<Record<string, unknown>>>, { col_id: number; token?: string }>({
      query: args => ({
        url: `/col/case_env_list?${encodeQuery({ col_id: args.col_id, token: args.token })}`
      }),
      providesTags: (_result, _error, args) => [colCaseCollectionTag(args.col_id)]
    }),
    getColCaseListByVarParams: builder.query<SharedApiResult<Array<Record<string, unknown>>>, { col_id: number; token?: string }>({
      query: args => ({
        url: `/col/case_list_by_var_params?${encodeQuery({ col_id: args.col_id, token: args.token })}`
      }),
      providesTags: (_result, _error, args) => [colCaseCollectionTag(args.col_id)]
    }),
    addColCase: builder.mutation<
      SharedApiResult<ColCaseItem>,
      { casename: string; project_id: number; col_id: number; interface_id: number; case_env?: string; req_params?: Array<Record<string, unknown>>; req_headers?: Array<Record<string, unknown>>; req_query?: Array<Record<string, unknown>>; req_body_form?: Array<Record<string, unknown>>; req_body_other?: string; req_body_type?: string; test_script?: string; enable_script?: boolean; token?: string }
    >({
      query: payload => ({
        url: '/col/add_case',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [colCaseCollectionTag(args.col_id)]
    }),
    addColCaseList: builder.mutation<
      SharedApiResult<string>,
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
      SharedApiResult<string>,
      { project_id: number; col_id: number; new_col_id: number; token?: string }
    >({
      query: payload => ({
        url: '/col/clone_case_list',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => [colCaseCollectionTag(args.col_id), colCaseCollectionTag(args.new_col_id)]
    }),
    upColCase: builder.mutation<
      SharedApiResult<Record<string, unknown>>,
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
        if (colId > 0) tags.push(colCaseCollectionTag(colId));
        return tags;
      }
    }),
    getColCase: builder.query<SharedApiResult<Record<string, unknown>>, { caseid: string; token?: string }>({
      query: args => ({
        url: `/col/case?${encodeQuery({ caseid: args.caseid, token: args.token })}`
      }),
      providesTags: (result, _error, args) => {
        const tags = [colCaseEntityTag(args.caseid)];
        const colId = toPositiveNumber((result?.data as Record<string, unknown> | undefined)?.col_id);
        if (colId > 0) tags.push(colCaseCollectionTag(colId));
        return tags;
      }
    }),
    delColCase: builder.mutation<
      SharedApiResult<Record<string, unknown>>,
      { caseid: string; token?: string; col_id?: number }
    >({
      query: args => ({
        url: `/col/del_case?${encodeQuery({ caseid: args.caseid, token: args.token })}`,
        method: 'GET'
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = [colCaseEntityTag(args.caseid)];
        const colId = toPositiveNumber(args.col_id);
        if (colId > 0) tags.push(colCaseCollectionTag(colId));
        return tags;
      }
    }),
    upColCaseIndex: builder.mutation<
      SharedApiResult<string>,
      Array<{ id: string; index?: number; col_id?: number }>
    >({
      query: payload => ({
        url: '/col/up_case_index',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) => {
        const tags = args.map(item => colCaseEntityTag(String(item.id || ''))).filter(item => item.id !== 'CASE-');
        const colIds = new Set(args.map(item => toPositiveNumber(item.col_id)).filter(item => item > 0));
        colIds.forEach(colId => tags.push(colCaseCollectionTag(colId)));
        return tags;
      }
    }),
    upColIndex: builder.mutation<SharedApiResult<string>, Array<{ id: number; index?: number }>>({
      query: payload => ({
        url: '/col/up_col_index',
        method: 'POST',
        body: payload
      }),
      invalidatesTags: (_result, _error, args) =>
        args.map(item => colEntityTag(toPositiveNumber(item.id))).filter(item => item.id !== 'COL-0')
    }),
    runColCaseScript: builder.mutation<
      SharedApiResult<Record<string, unknown>>,
      { col_id: number; interface_id: number; response: { status: number; body: unknown; header?: Record<string, unknown> }; records?: Record<string, unknown>; params?: Record<string, unknown>; script?: string; token?: string }
    >({
      query: payload => ({
        url: '/col/run_script',
        method: 'POST',
        body: payload
      })
    }),
    getLogList: builder.query<
      SharedApiResult<LogListResult>,
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
      SharedApiResult<Record<string, unknown>>,
      { project_id?: number; token?: string; type?: string; source?: 'json' | 'url'; format?: 'auto' | 'swagger2' | 'openapi3'; merge?: 'normal' | 'good' | 'merge'; dataSync?: 'normal' | 'good' | 'merge'; interfaceData?: string; json?: string; content?: string; url?: string }
    >({
      query: payload => ({
        url: '/interface/interUpload',
        method: 'POST',
        body: payload
      })
    })
  };
}
