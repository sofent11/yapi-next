import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form, Modal, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import json5 from 'json5';
import type { InterfaceTreeNode, LegacyInterfaceDTO } from '@yapi-next/shared-types';
import {
  useAddInterfaceCatMutation,
  useAddColCaseListMutation,
  useAddColCaseMutation,
  useAddColMutation,
  useAddInterfaceMutation,
  useCloneColCaseListMutation,
  useDelInterfaceCatMutation,
  useDelInterfaceMutation,
  useGetProjectListQuery,
  useGetColCaseEnvListQuery,
  useGetColCaseListQuery,
  useGetColCaseQuery,
  useGetColListQuery,
  useGetCatMenuQuery,
  useGetInterfaceListQuery,
  useGetInterfaceTreeQuery,
  useGetInterfaceQuery,
  useGetProjectTokenQuery,
  useDelColCaseMutation,
  useDelColMutation,
  useLazyGetColCaseQuery,
  useLazyGetInterfaceQuery,
  useLazyGetInterfaceTreeNodeQuery,
  useUpColCaseIndexMutation,
  useUpColCaseMutation,
  useUpColCompatMutation,
  useUpColIndexMutation,
  useUpInterfaceCatIndexMutation,
  useUpInterfaceIndexMutation,
  useUpdateProjectTagMutation,
  useUpdateInterfaceCatMutation,
  useUpdateInterfaceMutation
} from '../../services/yapi-api';
import { webPlugins, type InterfaceTabItem } from '../../plugins';
import { safeApiRequest } from '../../utils/safe-request';
import { generateMockStringFromJsonSchema } from '../../utils/schema-mock';
import { useProjectInterfaceNavigationGuard } from './ProjectInterfacePage.navigation';
import {
  parseJsonText,
  stringifyPretty,
  useProjectInterfaceRequestRunner
} from './ProjectInterfacePage.request-runner';
import {
  buildProjectInterfaceApiWorkspace,
  buildProjectInterfaceCollectionWorkspace
} from './ProjectInterfacePage.workspace';
import {
  buildProjectInterfaceAutoTestModalsProps,
  buildProjectInterfaceCollectionModalsProps,
  buildProjectInterfaceCoreModalsProps
} from './ProjectInterfacePage.modals';
import { useProjectInterfaceApiActions } from './ProjectInterfacePage.api-actions';

import type {
  ProjectInterfacePageProps,
  EditFormParam,
  EditFormHeaderParam,
  EditFormBodyParam,
  EditForm,
  AddInterfaceForm,
  AddCatForm,
  EditCatForm,
  ColForm,
  AddCaseForm,
  CaseEditForm,
  AutoTestResultItem,
  AutoTestReport,
  CaseEnvProjectItem,
  CommonSettingForm,
  MenuDragItem,
  ColDragItem,
  EditConflictState
} from './ProjectInterfacePage.types';
import {
  STABLE_EMPTY_ARRAY,
  TREE_CATEGORY_LIMIT,
  TREE_NODE_PAGE_LIMIT,
  INTERFACE_LIST_PAGE_LIMIT,
  CAT_MENU_LOAD_CONCURRENCY,
  RUN_METHODS,
  HTTP_REQUEST_HEADER,
  statusLabel,
  formatUnixTime,
  supportsRequestBody,
  safeStringArray,
  sanitizeReqParams,
  sanitizeReqQuery,
  sanitizeReqHeaders,
  sanitizeReqBodyForm,
  normalizeCaseParamMap,
  normalizeCaseHeaderMap,
  buildReqParamsByPath,
  normalizePathInput,
  parseLooseJson,
  normalizeJsonText,
  checkIsJsonSchema,
  reorderById,
  buildIndexPayload,
  reorderByCaseId,
  buildCaseIndexPayload,
  parseInterfaceId,
  parseColId,
  toRecord,
  normalizeParamRows,
  buildSchemaRows,
  mockFlagText,
  fetchAllCatInterfaces
} from './ProjectInterfacePage.utils';
import {
  useProjectInterfaceApiSection,
  useProjectInterfaceCollectionSection
} from './ProjectInterfacePage.section-hooks';

export function useProjectInterfaceLogic(props: ProjectInterfacePageProps) {
  const params = useParams<{ action?: string; actionId?: string }>();
  const action = params.action || 'api';
  const actionId = params.actionId;
  const navigate = useNavigate();

  const [tab, setTab] = useState<string>('view');
  const interfaceRequestRunner = useProjectInterfaceRequestRunner();
  const caseRequestRunner = useProjectInterfaceRequestRunner();
  const resetInterfaceRequestRunner = interfaceRequestRunner.reset;
  const resetCaseRequestRunner = caseRequestRunner.reset;
  const [listKeyword, setListKeyword] = useState('');
  const [listPage, setListPage] = useState(1);
  const [menuKeyword, setMenuKeyword] = useState('');
  const [expandedCatIds, setExpandedCatIds] = useState<number[]>([]);
  const [catInterfaceMap, setCatInterfaceMap] = useState<Record<number, LegacyInterfaceDTO[]>>({});
  const [catLoadingMap, setCatLoadingMap] = useState<Record<number, boolean>>({});
  const catLoadingRef = useRef<Record<number, boolean>>({});
  const catLoadedRef = useRef<Record<number, boolean>>({});
  const [draggingMenuItem, setDraggingMenuItem] = useState<MenuDragItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'undone'>('all');
  const [colKeyword, setColKeyword] = useState('');
  const [expandedColIds, setExpandedColIds] = useState<number[]>([]);
  const [draggingColItem, setDraggingColItem] = useState<ColDragItem | null>(null);
  const [addInterfaceOpen, setAddInterfaceOpen] = useState(false);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [editCatOpen, setEditCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<{ _id: number; name: string; desc?: string } | null>(null);
  const [colModalOpen, setColModalOpen] = useState(false);
  const [colModalType, setColModalType] = useState<'add' | 'edit'>('add');
  const [editingCol, setEditingCol] = useState<{ _id: number; name: string; desc?: string } | null>(null);
  const [addCaseOpen, setAddCaseOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importColId, setImportColId] = useState(0);
  const [importProjectId, setImportProjectId] = useState(0);
  const [importSelectedRowKeys, setImportSelectedRowKeys] = useState<Array<string | number>>([]);
  const [importCatInterfaceMap, setImportCatInterfaceMap] = useState<Record<number, LegacyInterfaceDTO[]>>({});
  const [importCatLoadingMap, setImportCatLoadingMap] = useState<Record<number, boolean>>({});
  const importCatLoadingRef = useRef<Record<number, boolean>>({});
  const importCatLoadedRef = useRef<Record<number, boolean>>({});
  const [autoTestRunning, setAutoTestRunning] = useState(false);
  const [autoTestModalOpen, setAutoTestModalOpen] = useState(false);
  const [autoTestReport, setAutoTestReport] = useState<AutoTestReport | null>(null);
  const [autoTestDetailItem, setAutoTestDetailItem] = useState<AutoTestResultItem | null>(null);
  const [selectedRunEnvByProject, setSelectedRunEnvByProject] = useState<Record<number, string>>({});
  const [commonSettingOpen, setCommonSettingOpen] = useState(false);
  const [reqRadioType, setReqRadioType] = useState<'req-body' | 'req-query' | 'req-headers'>('req-query');
  const [editBaseline, setEditBaseline] = useState('');
  const [tagSettingOpen, setTagSettingOpen] = useState(false);
  const [tagSettingInput, setTagSettingInput] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFieldName, setBulkFieldName] = useState<'req_query' | 'req_body_form' | null>(null);
  const [bulkValue, setBulkValue] = useState('');
  const [resEditorTab, setResEditorTab] = useState<'tpl' | 'preview'>('tpl');
  const [resPreviewText, setResPreviewText] = useState('');
  const [reqSchemaEditorMode, setReqSchemaEditorMode] = useState<'text' | 'visual'>('visual');
  const [resSchemaEditorMode, setResSchemaEditorMode] = useState<'text' | 'visual'>('visual');
  const [editConflictState, setEditConflictState] = useState<EditConflictState>({ status: 'idle' });

  const [form] = Form.useForm<EditForm>();
  const [addInterfaceForm] = Form.useForm<AddInterfaceForm>();
  const [addCatForm] = Form.useForm<AddCatForm>();
  const [editCatForm] = Form.useForm<EditCatForm>();
  const [colForm] = Form.useForm<ColForm>();
  const [addCaseForm] = Form.useForm<AddCaseForm>();
  const [caseForm] = Form.useForm<CaseEditForm>();
  const [commonSettingForm] = Form.useForm<CommonSettingForm>();

  const watchedValues = Form.useWatch([], form);
  const watchedReqBodyOther = Form.useWatch('req_body_other', form);
  const watchedResBody = Form.useWatch('res_body', form);

  const interfaceId = action === 'api' ? parseInterfaceId(actionId) : 0;
  const catId = action === 'api' && actionId?.startsWith('cat_') ? Number(actionId.slice(4)) : 0;
  const colIdFromRoute = action === 'col' ? parseColId(actionId) : 0;
  const caseId = action === 'case' ? actionId || '' : '';
  const shouldFetchGlobalInterfaceList =
    action === 'api' && (menuKeyword.trim().length > 0 || (catId <= 0 && interfaceId <= 0));

  const treeQuery = useGetInterfaceTreeQuery(
    {
      projectId: props.projectId,
      token: props.token,
      page: 1,
      limit: TREE_CATEGORY_LIMIT,
      includeList: false,
      detail: 'summary'
    },
    { skip: props.projectId <= 0 || action !== 'api' }
  );
  const [fetchInterfaceTreeNode] = useLazyGetInterfaceTreeNodeQuery();
  const listQuery = useGetInterfaceListQuery(
    {
      projectId: props.projectId,
      token: props.token,
      page: 1,
      limit: INTERFACE_LIST_PAGE_LIMIT
    },
    { skip: props.projectId <= 0 || (!addCaseOpen && !shouldFetchGlobalInterfaceList) }
  );
  const detailQuery = useGetInterfaceQuery(
    {
      id: interfaceId,
      projectId: props.projectId,
      token: props.token
    },
    {
      skip: interfaceId <= 0 || action !== 'api'
    }
  );
  const catMenuQuery = useGetCatMenuQuery(
    { projectId: props.projectId, token: props.token },
    { skip: props.projectId <= 0 || action !== 'api' }
  );
  const [updateInterface, updateState] = useUpdateInterfaceMutation();
  const [addInterface, addInterfaceState] = useAddInterfaceMutation();
  const [fetchInterfaceDetail] = useLazyGetInterfaceQuery();
  const [upInterfaceIndex] = useUpInterfaceIndexMutation();
  const [upInterfaceCatIndex] = useUpInterfaceCatIndexMutation();
  const [updateProjectTag, updateProjectTagState] = useUpdateProjectTagMutation();
  const [addInterfaceCat, addInterfaceCatState] = useAddInterfaceCatMutation();
  const [updateInterfaceCat, updateInterfaceCatState] = useUpdateInterfaceCatMutation();
  const [delInterface, delInterfaceState] = useDelInterfaceMutation();
  const [delInterfaceCat, delInterfaceCatState] = useDelInterfaceCatMutation();
  const [addCol, addColState] = useAddColMutation();
  const [updateCol, updateColState] = useUpColCompatMutation();
  const [triggerDelCol] = useDelColMutation();
  const [triggerDelCase] = useDelColCaseMutation();
  const [addColCaseList, addColCaseListState] = useAddColCaseListMutation();
  const [cloneColCaseList] = useCloneColCaseListMutation();
  const [addColCase, addColCaseState] = useAddColCaseMutation();
  const [upColCase, upColCaseState] = useUpColCaseMutation();
  const [upColCaseIndex] = useUpColCaseIndexMutation();
  const [upColIndex] = useUpColIndexMutation();
  const [fetchColCaseDetail] = useLazyGetColCaseQuery();

  const colListQuery = useGetColListQuery(
    { project_id: props.projectId, token: props.token },
    { skip: props.projectId <= 0 || action === 'api' }
  );

  const caseDetailQuery = useGetColCaseQuery(
    { caseid: caseId, token: props.token },
    { skip: action !== 'case' || !caseId }
  );

  const selectedColId = useMemo(() => {
    if (action === 'col' && colIdFromRoute > 0) return colIdFromRoute;
    if (action === 'case') {
      const maybeColId = Number((caseDetailQuery.data?.data as Record<string, unknown> | undefined)?.col_id || 0);
      if (maybeColId > 0) return maybeColId;
    }
    return 0;
  }, [action, colIdFromRoute, caseDetailQuery.data]);

  const caseListQuery = useGetColCaseListQuery(
    { col_id: selectedColId, token: props.token },
    { skip: selectedColId <= 0 || action === 'api' }
  );
  const caseEnvListQuery = useGetColCaseEnvListQuery(
    { col_id: selectedColId, token: props.token },
    { skip: selectedColId <= 0 || action === 'api' }
  );
  const projectTokenQuery = useGetProjectTokenQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 || action === 'api' }
  );
  const projectListQuery = useGetProjectListQuery(
    { groupId: Number(props.projectGroupId || 0) },
    { skip: Number(props.projectGroupId || 0) <= 0 || !importModalOpen }
  );
  const importTreeQuery = useGetInterfaceTreeQuery(
    {
      projectId: importProjectId,
      token: props.token,
      page: 1,
      limit: TREE_CATEGORY_LIMIT,
      includeList: false,
      detail: 'summary'
    },
    { skip: importProjectId <= 0 || !importModalOpen }
  );
  const [fetchImportTreeNode] = useLazyGetInterfaceTreeNodeQuery();

  const allInterfaces = (listQuery.data?.data?.list || STABLE_EMPTY_ARRAY) as LegacyInterfaceDTO[];
  const treeRows = (treeQuery.data?.data?.list || STABLE_EMPTY_ARRAY) as InterfaceTreeNode[];
  const catRows = (catMenuQuery.data?.data || STABLE_EMPTY_ARRAY) as Array<{ _id: number; name: string; desc?: string }>;
  const currentInterface = (detailQuery.data?.data || null) as LegacyInterfaceDTO | null;
  const colRows = (colListQuery.data?.data || STABLE_EMPTY_ARRAY) as any[];
  const caseRows = (caseListQuery.data?.data || STABLE_EMPTY_ARRAY) as any[];
  const canEdit = /(admin|owner|dev)/.test(String(props.projectRole || ''));
  const importProjectRows = (projectListQuery.data?.data?.list || STABLE_EMPTY_ARRAY).filter(
    (item: any) => Number(item._id || 0) !== props.projectId
  );
  const importTreeRows = (importTreeQuery.data?.data?.list || STABLE_EMPTY_ARRAY) as InterfaceTreeNode[];
  const caseInterfaceTotal = Number(listQuery.data?.data?.total || 0);
  const caseEnvProjects = (caseEnvListQuery.data?.data || STABLE_EMPTY_ARRAY) as CaseEnvProjectItem[];
  const caseDetailProjectId = Number(
    (caseDetailQuery.data?.data as Record<string, unknown> | undefined)?.project_id || 0
  );

  const {
    menuRows,
    filteredList,
    currentListLoading,
    currentCatName,
    currentCat,
    catSelectOptions,
    menuDragEnabled,
    menuDisplayRows
  } = useProjectInterfaceApiSection({
    allInterfaces,
    treeRows,
    catInterfaceMap,
    catRows,
    catId,
    catLoadingMap,
    listKeyword,
    statusFilter,
    menuKeyword,
    canEdit,
    listLoading: listQuery.isLoading,
    listFetching: listQuery.isFetching
  });

  const {
    colDragEnabled,
    colDisplayRows,
    importTableRows,
    importLoading,
    selectedImportInterfaceIds,
    importProjectOptions,
    caseInterfaceOptions,
    caseInterfaceTruncated,
    autoTestRows,
    autoTestResultMap,
    caseEnvOptions
  } = useProjectInterfaceCollectionSection({
    colRows,
    caseRows,
    selectedColId,
    colKeyword,
    canEdit,
    importProjectRows,
    projectId: props.projectId,
    importTreeRows,
    importCatInterfaceMap,
    importCatLoadingMap,
    importSelectedRowKeys,
    allInterfaces,
    caseInterfaceTotal,
    autoTestReport,
    caseEnvProjects,
    caseDetailProjectId
  });

  const callApi = useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => message.error(msg) }),
    []
  );

  const loadCatInterfaces = useCallback(
    async (catid: number, force = false) => {
      const catIdNum = Number(catid || 0);
      if (catIdNum <= 0) return;
      if (!force && catLoadedRef.current[catIdNum]) return;
      if (catLoadingRef.current[catIdNum]) return;

      catLoadingRef.current[catIdNum] = true;
      setCatLoadingMap(prev => ({ ...prev, [catIdNum]: true }));
      try {
        const merged = await fetchAllCatInterfaces(
          page =>
            fetchInterfaceTreeNode(
              {
                catid: catIdNum,
                token: props.token,
                page,
                limit: TREE_NODE_PAGE_LIMIT,
                detail: 'full'
              },
              true
            ).unwrap(),
          '加载分类接口失败'
        );
        setCatInterfaceMap(prev => ({ ...prev, [catIdNum]: merged }));
        catLoadedRef.current[catIdNum] = true;
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载分类接口失败');
      } finally {
        catLoadingRef.current[catIdNum] = false;
        setCatLoadingMap(prev => ({ ...prev, [catIdNum]: false }));
      }
    },
    [fetchInterfaceTreeNode, props.token]
  );

  const refreshInterfaceMenu = useCallback(async () => {
    catLoadingRef.current = {};
    catLoadedRef.current = {};
    setCatInterfaceMap({});
    setCatLoadingMap({});
    await Promise.all([treeQuery.refetch(), catMenuQuery.refetch()]);
  }, [catMenuQuery, treeQuery]);

  const refetchInterfaceListSafe = useCallback(async () => {
    if (addCaseOpen || shouldFetchGlobalInterfaceList) {
      await listQuery.refetch();
    }
  }, [addCaseOpen, listQuery, shouldFetchGlobalInterfaceList]);

  const {
    handleSave,
    handleSaveProjectTag: saveProjectTagAction,
    handleAddNewInterface,
    openAddInterfaceModal,
    handleAddNewCat,
    handleUpdateCat,
    openEditCatModal,
    confirmDeleteCat,
    confirmDeleteInterface,
    copyInterfaceRow,
    openAddCatModal,
    openTagSettingModal,
    handleInterfaceListStatusChange,
    handleInterfaceListCatChange,
    openBulkImport,
    applyBulkImport: applyBulkImportAction,
    handleResponseEditorTabChange
  } = useProjectInterfaceApiActions({
    projectId: props.projectId,
    token: props.token,
    projectTag: props.projectTag,
    currentInterface,
    interfaceId,
    catId,
    catRows,
    editingCat,
    form,
    addInterfaceForm,
    addCatForm,
    editCatForm,
    setAddInterfaceOpen,
    setAddCatOpen,
    setEditCatOpen,
    setEditingCat,
    setTagSettingOpen,
    setTagSettingInput,
    setBulkFieldName,
    setBulkValue,
    setBulkOpen,
    setEditBaseline,
    serializeEditValues,
    setTab,
    setResPreviewText,
    setResEditorTab,
    navigate,
    callApi,
    refetchDetail: detailQuery.refetch,
    refetchInterfaceListSafe,
    refreshInterfaceMenu,
    updateInterface,
    addInterface,
    updateProjectTag,
    addInterfaceCat,
    updateInterfaceCat,
    delInterface,
    delInterfaceCat,
    fetchInterfaceDetail
  });

  const handleSaveProjectTag = useCallback(() => {
    void saveProjectTagAction(tagSettingInput);
  }, [saveProjectTagAction, tagSettingInput]);

  const applyBulkImport = useCallback(() => {
    applyBulkImportAction(bulkFieldName, bulkValue);
  }, [applyBulkImportAction, bulkFieldName, bulkValue]);

  const loadImportCatInterfaces = useCallback(
    async (catid: number, options?: { force?: boolean; notifyError?: boolean }) => {
      const catIdNum = Number(catid || 0);
      if (catIdNum <= 0) return;
      const force = options?.force === true;
      if (!force && (importCatLoadedRef.current[catIdNum] || importCatLoadingRef.current[catIdNum])) return;
      importCatLoadingRef.current[catIdNum] = true;
      setImportCatLoadingMap(prev => ({ ...prev, [catIdNum]: true }));
      try {
        const merged = await fetchAllCatInterfaces(
          page =>
            fetchImportTreeNode(
              {
                catid: catIdNum,
                token: props.token,
                page,
                limit: TREE_NODE_PAGE_LIMIT,
                detail: 'full'
              },
              true
            ).unwrap(),
          '加载导入接口失败'
        );
        setImportCatInterfaceMap(prev => ({ ...prev, [catIdNum]: merged }));
        importCatLoadedRef.current[catIdNum] = true;
      } catch (err) {
        if (options?.notifyError !== false) {
          message.error(err instanceof Error ? err.message : '加载导入接口失败');
        }
      } finally {
        importCatLoadingRef.current[catIdNum] = false;
        setImportCatLoadingMap(prev => ({ ...prev, [catIdNum]: false }));
      }
    },
    [fetchImportTreeNode, props.token]
  );

  const interfaceTabs = useMemo<Record<string, InterfaceTabItem>>(() => {
    const tabs: Record<string, InterfaceTabItem> = {
      view: { name: '预览' },
      edit: { name: '编辑' },
      run: { name: '运行' }
    };
    webPlugins.applyInterfaceTabs(tabs, {
      projectId: props.projectId,
      interfaceData: toRecord(currentInterface)
    });
    return tabs;
  }, [currentInterface, props.projectId]);

  const projectTagOptions = useMemo(
    () =>
      (props.projectTag || [])
        .map(item => String(item.name || '').trim())
        .filter(Boolean)
        .map(item => ({ label: item, value: item })),
    [props.projectTag]
  );

  function serializeEditValues(values: EditForm | undefined): string {
    const v = values || ({} as EditForm);
    const data = {
      catid: Number(v.catid || 0),
      title: String(v.title || ''),
      path: String(v.path || ''),
      method: String(v.method || '').toUpperCase(),
      status: String(v.status || 'undone'),
      tag: safeStringArray(v.tag),
      custom_field_value: String(v.custom_field_value || ''),
      req_query: sanitizeReqQuery(v.req_query),
      req_headers: sanitizeReqHeaders(v.req_headers),
      req_params: sanitizeReqParams(v.req_params),
      req_body_type: String(v.req_body_type || 'form'),
      req_body_form: sanitizeReqBodyForm(v.req_body_form),
      req_body_other: String(v.req_body_other || ''),
      req_body_is_json_schema: v.req_body_is_json_schema === true,
      res_body_type: String(v.res_body_type || 'json'),
      res_body: String(v.res_body || ''),
      res_body_is_json_schema: v.res_body_is_json_schema === true,
      desc: String(v.desc || ''),
      switch_notice: v.switch_notice === true,
      api_opened: v.api_opened === true
    };
    return JSON.stringify(data);
  }

  function buildEditFormValues(source: LegacyInterfaceDTO | null): EditForm {
    if (!source) {
      return {
        catid: Number(catRows[0]?._id || 0),
        title: '',
        path: '',
        method: 'GET',
        status: 'undone',
        tag: [],
        custom_field_value: '',
        req_query: [],
        req_headers: [],
        req_params: [],
        req_body_type: 'form',
        req_body_form: [],
        req_body_other: '',
        req_body_is_json_schema: !props.projectIsJson5,
        res_body_type: 'json',
        res_body: '',
        res_body_is_json_schema: !props.projectIsJson5,
        desc: '',
        switch_notice: props.projectSwitchNotice === true,
        api_opened: false
      };
    }

    const method = String(source.method || 'GET').toUpperCase();
    const path = String(source.path || '');
    const reqParams = sanitizeReqParams(source.req_params);
    const mergedReqParams = buildReqParamsByPath(path, reqParams);

    return {
      catid: Number(source.catid || catRows[0]?._id || 0),
      title: String(source.title || ''),
      path,
      method,
      status: String(source.status || 'undone') === 'done' ? 'done' : 'undone',
      tag: safeStringArray(source.tag),
      custom_field_value: String(source.custom_field_value || ''),
      req_query: sanitizeReqQuery(source.req_query),
      req_headers: sanitizeReqHeaders(source.req_headers),
      req_params: mergedReqParams,
      req_body_type: (['form', 'json', 'file', 'raw'].includes(String(source.req_body_type || ''))
        ? String(source.req_body_type || 'form')
        : 'form') as 'form' | 'json' | 'file' | 'raw',
      req_body_form: sanitizeReqBodyForm(source.req_body_form),
      req_body_other: String(source.req_body_other || ''),
      req_body_is_json_schema:
        source.req_body_is_json_schema === true || (props.projectIsJson5 ? false : true),
      res_body_type:
        String(source.res_body_type || 'json').toLowerCase() === 'raw' ? 'raw' : 'json',
      res_body: String(source.res_body || ''),
      res_body_is_json_schema:
        source.res_body_is_json_schema === true || (props.projectIsJson5 ? false : true),
      desc: String(source.desc || ''),
      switch_notice: props.projectSwitchNotice === true,
      api_opened: source.api_opened === true
    };
  }

  const projectTokenValue = String(projectTokenQuery.data?.data || '');

  useEffect(() => {
    if (menuRows.length === 0) {
      setExpandedCatIds([]);
      return;
    }
    setExpandedCatIds(prev => {
      const validCatIds = new Set(
        menuRows.map(cat => Number(cat._id || 0)).filter(id => Number.isFinite(id) && id > 0)
      );
      const kept = prev.filter(id => validCatIds.has(id));
      if (catId > 0 && validCatIds.has(catId) && !kept.includes(catId)) {
        kept.push(catId);
      }
      return kept;
    });
  }, [catId, menuRows]);

  useEffect(() => {
    if (action !== 'api') return;
    const targets = new Set<number>();
    if (catId > 0) {
      targets.add(catId);
    }
    expandedCatIds.forEach(id => {
      if (id > 0) targets.add(id);
    });
    const queue = Array.from(targets);
    if (queue.length === 0) return;
    let cancelled = false;
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (!cancelled) {
        const nextId = queue.shift();
        if (!nextId) return;
        await loadCatInterfaces(nextId);
      }
    });
    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
  }, [action, catId, expandedCatIds, loadCatInterfaces]);

  useEffect(() => {
    catLoadingRef.current = {};
    catLoadedRef.current = {};
    setCatInterfaceMap({});
    setCatLoadingMap({});
  }, [props.projectId]);

  useEffect(() => {
    if (colRows.length === 0) {
      setExpandedColIds([]);
      return;
    }
    setExpandedColIds(prev => {
      const next = new Set(prev);
      colRows.forEach(col => {
        const id = Number(col._id || 0);
        if (id > 0 && !next.has(id)) next.add(id);
      });
      if (selectedColId > 0) next.add(selectedColId);
      return Array.from(next);
    });
  }, [colRows, selectedColId]);

  useEffect(() => {
    if (!colKeyword.trim()) return;
    setExpandedColIds(colRows.map(item => Number(item._id || 0)).filter(id => id > 0));
  }, [colKeyword, colRows]);

  useEffect(() => {
    if (!importModalOpen) return;
    if (importProjectId > 0) return;
    setImportProjectId(props.projectId);
  }, [importModalOpen, importProjectId, props.projectId]);

  useEffect(() => {
    if (!importModalOpen) {
      importCatLoadingRef.current = {};
      importCatLoadedRef.current = {};
      setImportCatInterfaceMap({});
      setImportCatLoadingMap({});
      return;
    }
    importCatLoadingRef.current = {};
    importCatLoadedRef.current = {};
    setImportCatInterfaceMap({});
    setImportCatLoadingMap({});
  }, [importModalOpen, importProjectId]);

  useEffect(() => {
    if (!importModalOpen || importProjectId <= 0 || importTreeRows.length === 0) return;
    let cancelled = false;
    const run = async () => {
      const catIds = importTreeRows
        .map(cat => Number(cat._id || 0))
        .filter(catIdNum => catIdNum > 0);
      const queue = [...catIds];
      const concurrency = Math.min(4, queue.length);
      const workers = Array.from({ length: concurrency }, async () => {
        while (!cancelled) {
          const nextCatId = queue.shift();
          if (!nextCatId) return;
          await loadImportCatInterfaces(nextCatId, { notifyError: false });
        }
      });
      await Promise.all(workers);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [importModalOpen, importProjectId, importTreeRows, loadImportCatInterfaces]);

  useEffect(() => {
    if (!addCaseOpen) return;
    const firstInterfaceId = Number(caseInterfaceOptions[0]?.value || 0);
    addCaseForm.setFieldsValue({
      interface_id: firstInterfaceId > 0 ? firstInterfaceId : undefined,
      casename: '',
      case_env: ''
    });
  }, [addCaseForm, addCaseOpen, caseInterfaceOptions]);

  useEffect(() => {
    if (!Array.isArray(caseEnvProjects) || caseEnvProjects.length === 0) return;
    setSelectedRunEnvByProject(prev => {
      const next = { ...prev };
      caseEnvProjects.forEach(item => {
        const projectId = Number(item._id || 0);
        if (projectId <= 0) return;
        if (typeof next[projectId] === 'string') return;
        const firstEnvName = String(item.env?.[0]?.name || '');
        next[projectId] = firstEnvName;
      });
      return next;
    });
  }, [caseEnvProjects]);

  const dirty = useMemo(() => {
    if (!currentInterface || tab !== 'edit') return false;
    return serializeEditValues((watchedValues || {}) as EditForm) !== editBaseline;
  }, [currentInterface, editBaseline, tab, watchedValues]);

  const {
    cancelNavigation,
    confirmNavigation,
    confirmOpen,
    handleSwitch,
    navigateWithGuard
  } = useProjectInterfaceNavigationGuard({
    dirty,
    navigate,
    setTab,
    tab
  });

  useEffect(() => {
    if (action !== 'api' && action !== 'col' && action !== 'case') {
      navigate(`/project/${props.projectId}/interface/api`, { replace: true });
    }
  }, [action, navigate, props.projectId]);

  useEffect(() => {
    setListPage(1);
  }, [action, catId, listKeyword, statusFilter]);

  useEffect(() => {
    const shouldWatchConflict = action === 'api' && interfaceId > 0 && tab === 'edit';
    if (!shouldWatchConflict) {
      setEditConflictState({ status: 'idle' });
      return;
    }

    setEditConflictState({ status: 'loading' });
    let destroyed = false;
    let pollTimer: number | null = null;

    const applyPayload = (payload: Record<string, unknown>) => {
      const errno = Number(payload.errno || 0);
      if (errno === 0) {
        setEditConflictState({ status: 'ready' });
        return;
      }
      const data = (payload.data || {}) as Record<string, unknown>;
      setEditConflictState({
        status: 'locked',
        uid: Number(data.uid || errno || 0),
        username: String(data.username || '未知用户')
      });
    };

    const runCheck = async () => {
      try {
        const response = await fetch(`/api/interface/solve_conflict?id=${interfaceId}`, {
          credentials: 'include'
        });
        const payload = (await response.json()) as Record<string, unknown>;
        if (destroyed) return;
        if (payload && typeof payload === 'object' && typeof payload.errno !== 'undefined') {
          applyPayload(payload);
        } else if (Number(payload.errcode || 0) === 0) {
          applyPayload({ errno: 0, data: payload.data });
        } else {
          setEditConflictState({ status: 'error' });
        }
      } catch (_err) {
        if (!destroyed) {
          setEditConflictState({ status: 'error' });
        }
      } finally {
        if (!destroyed) {
          pollTimer = window.setTimeout(() => {
            void runCheck();
          }, 4000);
        }
      }
    };

    void runCheck();

    return () => {
      destroyed = true;
      if (pollTimer != null) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [action, interfaceId, tab]);

  useEffect(() => {
    const method = String(((watchedValues || {}) as EditForm).method || 'GET').toUpperCase();
    if (!supportsRequestBody(method) && reqRadioType === 'req-body') {
      setReqRadioType('req-query');
    }
  }, [reqRadioType, watchedValues]);

  useEffect(() => {
    if (tab !== 'edit') return;
    const values = (watchedValues || {}) as EditForm;
    const pathValue = String(values.path || '');
    const reqParams = sanitizeReqParams(values.req_params);
    const nextReqParams = buildReqParamsByPath(pathValue, reqParams);
    if (JSON.stringify(reqParams) !== JSON.stringify(nextReqParams)) {
      form.setFieldValue('req_params', nextReqParams);
    }
  }, [form, tab, watchedValues]);

  useEffect(() => {
    if (!currentInterface) return;
    const values = buildEditFormValues(currentInterface);
    form.setFieldsValue(values);
    setEditBaseline(serializeEditValues(values));
    setReqRadioType(supportsRequestBody(values.method) ? 'req-body' : 'req-query');
    setResEditorTab('tpl');
    setResPreviewText('');
    setReqSchemaEditorMode('visual');
    setResSchemaEditorMode('visual');
  }, [catRows, currentInterface, form, props.projectIsJson5, props.projectSwitchNotice]);

  useEffect(() => {
    if (!currentInterface) return;
    const queryText = JSON.stringify(
      Array.isArray(currentInterface.req_query) ? currentInterface.req_query : [],
      null,
      2
    );
    const headersText = JSON.stringify(
      Array.isArray(currentInterface.req_headers) ? currentInterface.req_headers : [],
      null,
      2
    );
    let bodyText = '{}';
    if (currentInterface.req_body_type === 'form') {
      bodyText = JSON.stringify(currentInterface.req_body_form || [], null, 2);
    } else if (currentInterface.req_body_is_json_schema && typeof currentInterface.req_body_other === 'string') {
      bodyText = generateMockStringFromJsonSchema(currentInterface.req_body_other);
    } else {
      const other = currentInterface.req_body_other;
      bodyText = typeof other === 'string' ? other : JSON.stringify(other || {}, null, 2);
    }
    resetInterfaceRequestRunner({
      method: String(currentInterface.method || 'GET').toUpperCase(),
      path: `${props.basepath || ''}${currentInterface.path || ''}`,
      query: queryText,
      headers: headersText,
      body: bodyText
    });
  }, [currentInterface, props.basepath, resetInterfaceRequestRunner]);

  useEffect(() => {
    if (action !== 'case') return;
    const detail = (caseDetailQuery.data?.data || null) as Record<string, unknown> | null;
    if (!detail) return;
    const method = String(detail.method || 'GET').toUpperCase();
    const path = `${props.basepath || ''}${String(detail.path || '')}`;
    const reqQuery = normalizeCaseParamMap(detail.req_query);
    const reqHeaders = normalizeCaseHeaderMap(detail.req_headers);
    const reqBodyType = String(detail.req_body_type || 'form').toLowerCase();
    let reqBody: unknown;
    if (reqBodyType === 'form') {
      reqBody = normalizeCaseParamMap(detail.req_body_form);
    } else if (reqBodyType === 'json') {
      const raw = String(detail.req_body_other || '').trim();
      if (!raw) {
        reqBody = {};
      } else {
        try {
          reqBody = json5.parse(raw);
        } catch (_err) {
          reqBody = raw;
        }
      }
    } else {
      reqBody = String(detail.req_body_other || '');
    }
    caseForm.setFieldsValue({
      casename: String(detail.casename || ''),
      case_env: String(detail.case_env || ''),
      enable_script: detail.enable_script === true,
      test_script: String(detail.test_script || ''),
      req_params_text: JSON.stringify(Array.isArray(detail.req_params) ? detail.req_params : [], null, 2),
      req_headers_text: JSON.stringify(Array.isArray(detail.req_headers) ? detail.req_headers : [], null, 2),
      req_query_text: JSON.stringify(Array.isArray(detail.req_query) ? detail.req_query : [], null, 2),
      req_body_form_text: JSON.stringify(Array.isArray(detail.req_body_form) ? detail.req_body_form : [], null, 2),
      req_body_type: String(detail.req_body_type || 'form'),
      req_body_other: String(detail.req_body_other || '')
    });
    resetCaseRequestRunner({
      method,
      path,
      query: JSON.stringify(reqQuery, null, 2),
      headers: JSON.stringify(reqHeaders, null, 2),
      body: typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody ?? {}, null, 2)
    });
  }, [action, caseDetailQuery.data, caseForm, props.basepath, resetCaseRequestRunner]);

  useEffect(() => {
    if (action !== 'case') {
      setAutoTestDetailItem(null);
      return;
    }
    setAutoTestDetailItem(prev => {
      if (!prev) return null;
      return String(prev.id || '') === String(caseId || '') ? prev : null;
    });
  }, [action, caseId]);

  useEffect(() => {
    if (action !== 'col') return;
    if (colIdFromRoute > 0) return;
    if (!Array.isArray(colRows) || colRows.length === 0) return;
    const first = Number(colRows[0]?._id || 0);
    if (first > 0) {
      navigate(`/project/${props.projectId}/interface/col/${first}`, { replace: true });
    }
  }, [action, colIdFromRoute, colRows, navigate, props.projectId]);

  useEffect(() => {
    const baseTitle = 'YApi';
    if (action === 'api' && interfaceId > 0 && currentInterface) {
      const title = String(currentInterface.title || currentInterface.path || interfaceId);
      document.title = `${title} - ${baseTitle}`;
      return;
    }
    if (action === 'col') {
      const currentCol = colRows.find((item: any) => Number(item._id || 0) === selectedColId);
      const name = String(currentCol?.name || `测试集合 ${selectedColId || ''}` || '').trim();
      document.title = `${name || '测试集合'} - ${baseTitle}`;
      return;
    }
    if (action === 'case') {
      const caseName = String(
        (caseDetailQuery.data?.data as Record<string, unknown> | undefined)?.casename || '测试用例'
      );
      document.title = `${caseName} - ${baseTitle}`;
      return;
    }
    document.title = baseTitle;
  }, [action, caseDetailQuery.data, colRows, currentInterface, interfaceId, selectedColId]);

  const toggleExpandedCol = useCallback((colId: number) => {
    setExpandedColIds(prev => {
      if (prev.includes(colId)) {
        return prev.filter(item => item !== colId);
      }
      return [...prev, colId];
    });
  }, []);

  const handleCollectionDragStartCol = useCallback((colId: number) => {
    setDraggingColItem({ type: 'col', colId });
  }, []);

  const handleCollectionDragStartCase = useCallback((colId: number, nextCaseId: string) => {
    setDraggingColItem({ type: 'case', colId, caseId: nextCaseId });
  }, []);

  const handleCollectionDragEnd = useCallback(() => {
    setDraggingColItem(null);
  }, []);

  async function copyText(text: string, successText: string) {
    try {
      await navigator.clipboard.writeText(text);
      message.success(successText);
    } catch (_err) {
      message.error('复制失败，请手动复制');
    }
  }

  async function handleRun() {
    if (!currentInterface) {
      message.error('请先选择接口');
      return;
    }
    const currentInterfaceId = Number(currentInterface._id || 0);
    await interfaceRequestRunner.run({
      interfaceId: currentInterfaceId,
      requestMeta: {
        type: 'inter',
        projectId: props.projectId,
        interfaceId: currentInterfaceId
      }
    });
  }

  async function handleDropOnCat(targetCatId: number) {
    const drag = draggingMenuItem;
    setDraggingMenuItem(null);
    if (!menuDragEnabled || !drag || targetCatId <= 0) return;

    if (drag.type === 'cat') {
      if (drag.id === targetCatId) return;
      const reordered = reorderById(menuRows, drag.id, targetCatId);
      const payload = buildIndexPayload(reordered);
      if (payload.length === 0) return;
      const response = await callApi(upInterfaceCatIndex(payload).unwrap(), '分类排序失败');
      if (!response) return;
      await refreshInterfaceMenu();
      return;
    }

    if (drag.type === 'interface' && drag.catid !== targetCatId) {
      const response = await callApi(
        updateInterface({
          id: drag.id,
          project_id: props.projectId,
          catid: targetCatId,
          token: props.token
        }).unwrap(),
        '移动接口失败'
      );
      if (!response) return;
      await Promise.all([refreshInterfaceMenu(), refetchInterfaceListSafe()]);
    }
  }

  async function handleDropOnInterface(targetCatId: number, targetInterfaceId: number) {
    const drag = draggingMenuItem;
    setDraggingMenuItem(null);
    if (!menuDragEnabled || !drag || drag.type !== 'interface') return;
    if (targetCatId <= 0 || targetInterfaceId <= 0 || drag.id <= 0) return;
    if (drag.id === targetInterfaceId) return;

    if (drag.catid !== targetCatId) {
      const response = await callApi(
        updateInterface({
          id: drag.id,
          project_id: props.projectId,
          catid: targetCatId,
          token: props.token
        }).unwrap(),
        '移动接口失败'
      );
      if (!response) return;
      await Promise.all([refreshInterfaceMenu(), refetchInterfaceListSafe()]);
      return;
    }

    const cat = menuRows.find(item => Number(item._id || 0) === targetCatId);
    const list = (cat?.list || []) as LegacyInterfaceDTO[];
    if (list.length === 0) return;
    const reordered = reorderById(list, drag.id, targetInterfaceId);
    const payload = buildIndexPayload(reordered);
    if (payload.length === 0) return;
    const response = await callApi(upInterfaceIndex(payload).unwrap(), '接口排序失败');
    if (!response) return;
    await Promise.all([refreshInterfaceMenu(), refetchInterfaceListSafe()]);
  }

  function openColModal(type: 'add' | 'edit', col?: { _id?: number; name?: string; desc?: string }) {
    setColModalType(type);
    if (type === 'edit' && col?._id) {
      setEditingCol({
        _id: Number(col._id || 0),
        name: String(col.name || ''),
        desc: String(col.desc || '')
      });
      colForm.setFieldsValue({
        name: String(col.name || ''),
        desc: String(col.desc || '')
      });
    } else {
      setEditingCol(null);
      colForm.setFieldsValue({ name: '', desc: '' });
    }
    setColModalOpen(true);
  }

  async function handleSubmitCol(values: ColForm) {
    const name = values.name.trim();
    const desc = values.desc?.trim() || '';
    if (!name) {
      message.error('请输入集合名');
      return;
    }
    if (colModalType === 'add') {
      const response = await callApi(
        addCol({
          project_id: props.projectId,
          name,
          desc,
          token: props.token
        }).unwrap(),
        '添加集合失败'
      );
      if (!response) return;
      message.success('添加集合成功');
      const newColId = Number(response.data?._id || 0);
      setColModalOpen(false);
      setEditingCol(null);
      colForm.resetFields();
      await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
      if (newColId > 0) {
        navigate(`/project/${props.projectId}/interface/col/${newColId}`);
      }
      return;
    }
    if (!editingCol?._id) {
      message.error('集合不存在');
      return;
    }
    const response = await callApi(
      updateCol({
        col_id: Number(editingCol._id),
        name,
        desc,
        token: props.token
      }).unwrap(),
      '修改集合失败'
    );
    if (!response) return;
    message.success('修改集合成功');
    setColModalOpen(false);
    setEditingCol(null);
    colForm.resetFields();
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
  }

  function confirmDeleteCol(colId: number) {
    if (colRows.length <= 1) {
      Modal.confirm({
        title: '此测试集合为最后一个集合',
        content: '温馨提示：建议不要删除',
        okText: '确认',
        cancelButtonProps: { style: { display: 'none' } }
      });
      return;
    }
    Modal.confirm({
      title: '您确认删除此测试集合',
      content: '温馨提示：该操作会删除该集合下所有测试用例，用例删除后无法恢复',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const response = await callApi(
          triggerDelCol({
            col_id: colId,
            project_id: props.projectId,
            token: props.token
          }).unwrap(),
          '删除集合失败'
        );
        if (!response) return;
        message.success('删除集合成功');
        const refreshed = await colListQuery.refetch();
        const nextRows = (refreshed.data?.data || []) as any[];
        const nextColId = Number(nextRows[0]?._id || 0);
        if (selectedColId === colId || action === 'case') {
          if (nextColId > 0) {
            navigate(`/project/${props.projectId}/interface/col/${nextColId}`);
          } else {
            navigate(`/project/${props.projectId}/interface/col`);
          }
        }
      }
    });
  }

  async function handleCopyCol(col: { _id?: number; name?: string; desc?: string }) {
    const sourceColId = Number(col._id || 0);
    if (sourceColId <= 0) {
      message.error('集合数据不完整');
      return;
    }
    const addResponse = await callApi(
      addCol({
        project_id: props.projectId,
        name: `${String(col.name || 'collection')} copy`,
        desc: String(col.desc || ''),
        token: props.token
      }).unwrap(),
      '克隆集合失败'
    );
    if (!addResponse) return;
    const newColId = Number(addResponse.data?._id || 0);
    if (newColId <= 0) {
      message.error('克隆集合失败');
      return;
    }
    const cloneResponse = await callApi(
      cloneColCaseList({
        project_id: props.projectId,
        col_id: sourceColId,
        new_col_id: newColId,
        token: props.token
      }).unwrap(),
      '克隆集合失败'
    );
    if (!cloneResponse) return;
    message.success('克隆测试集成功');
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
    navigate(`/project/${props.projectId}/interface/col/${newColId}`);
  }

  function openImportInterfaceModal(colId: number) {
    setImportColId(colId);
    setImportProjectId(props.projectId);
    setImportSelectedRowKeys([]);
    setImportModalOpen(true);
  }

  async function handleImportInterfaces() {
    if (importColId <= 0) {
      message.error('请选择测试集合');
      return;
    }
    if (selectedImportInterfaceIds.length === 0) {
      message.error('请选择要导入的接口');
      return;
    }
    if (importProjectId <= 0) {
      message.error('请选择项目');
      return;
    }
    const response = await callApi(
      addColCaseList({
        project_id: importProjectId,
        col_id: importColId,
        interface_list: selectedImportInterfaceIds,
        token: props.token
      }).unwrap(),
      '导入集合失败'
    );
    if (!response) return;
    message.success('导入集合成功');
    setImportModalOpen(false);
    setImportSelectedRowKeys([]);
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
  }

  function confirmDeleteCase(caseItemId: string) {
    Modal.confirm({
      title: '您确认删除此测试用例',
      content: '温馨提示：用例删除后无法恢复',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const response = await callApi(
          triggerDelCase({
            caseid: caseItemId,
            col_id: selectedColId > 0 ? selectedColId : undefined,
            token: props.token
          }).unwrap(),
          '删除用例失败'
        );
        if (!response) return;
        message.success('删除用例成功');
        await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
        if (action === 'case' && caseId === caseItemId) {
          navigate(`/project/${props.projectId}/interface/col/${selectedColId || ''}`);
        }
      }
    });
  }

  async function handleCopyCase(caseItemId: string) {
    const detailResponse = await callApi(
      fetchColCaseDetail({
        caseid: caseItemId,
        token: props.token
      }).unwrap(),
      '获取用例详情失败'
    );
    if (!detailResponse?.data) return;
    const data = detailResponse.data as Record<string, unknown>;
    const addResponse = await callApi(
      addColCase({
        casename: `${String(data.casename || 'case')}_copy`,
        project_id: Number(data.project_id || props.projectId),
        col_id: Number(data.col_id || selectedColId || 0),
        interface_id: Number(data.interface_id || 0),
        case_env: String(data.case_env || ''),
        req_params: Array.isArray(data.req_params) ? data.req_params : [],
        req_headers: Array.isArray(data.req_headers) ? data.req_headers : [],
        req_query: Array.isArray(data.req_query) ? data.req_query : [],
        req_body_form: Array.isArray(data.req_body_form) ? data.req_body_form : [],
        req_body_other: String(data.req_body_other || ''),
        req_body_type: String(data.req_body_type || ''),
        test_script: String(data.test_script || ''),
        enable_script: data.enable_script === true,
        token: props.token
      }).unwrap(),
      '克隆用例失败'
    );
    if (!addResponse) return;
    message.success('克隆用例成功');
    const nextColId = Number(addResponse.data?.col_id || data.col_id || selectedColId || 0);
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
    if (nextColId > 0) {
      navigate(`/project/${props.projectId}/interface/col/${nextColId}`);
    }
  }

  async function handleSaveCase() {
    if (!caseId) {
      message.error('测试用例不存在');
      return;
    }
    const values = await caseForm.validateFields();
    let reqParams: unknown;
    let reqHeaders: unknown;
    let reqQuery: unknown;
    let reqBodyForm: unknown;
    try {
      reqParams = parseJsonText(values.req_params_text || '[]', 'req_params');
      reqHeaders = parseJsonText(values.req_headers_text || '[]', 'req_headers');
      reqQuery = parseJsonText(values.req_query_text || '[]', 'req_query');
      reqBodyForm = parseJsonText(values.req_body_form_text || '[]', 'req_body_form');
    } catch (err) {
      message.error((err as Error).message || '请求参数 JSON 格式错误');
      return;
    }
    const response = await callApi(
      upColCase({
        id: caseId,
        col_id: selectedColId > 0 ? selectedColId : undefined,
        casename: values.casename.trim(),
        case_env: values.case_env?.trim() || '',
        enable_script: values.enable_script === true,
        test_script: values.test_script || '',
        req_params: Array.isArray(reqParams) ? reqParams : [],
        req_headers: Array.isArray(reqHeaders) ? reqHeaders : [],
        req_query: Array.isArray(reqQuery) ? reqQuery : [],
        req_body_form: Array.isArray(reqBodyForm) ? reqBodyForm : [],
        req_body_type: values.req_body_type || 'form',
        req_body_other: values.req_body_other || '',
        token: props.token
      }).unwrap(),
      '保存用例失败'
    );
    if (!response) return;
    message.success('用例已保存');
    await Promise.all([caseDetailQuery.refetch(), caseListQuery.refetch(), colListQuery.refetch()]);
  }

  function buildAutoTestUrl(mode: 'json' | 'html', download?: boolean) {
    if (!projectTokenValue || selectedColId <= 0) return '';
    const query = new URLSearchParams();
    query.set('id', String(selectedColId));
    query.set('project_id', String(props.projectId));
    query.set('token', projectTokenValue);
    query.set('mode', mode);
    Object.entries(selectedRunEnvByProject).forEach(([projectId, envName]) => {
      const id = Number(projectId || 0);
      const env = String(envName || '').trim();
      if (!Number.isFinite(id) || id <= 0 || !env) return;
      query.set(`env_${id}`, env);
    });
    if (download) query.set('download', 'true');
    return `/api/open/run_auto_test?${query.toString()}`;
  }

  function openAutoTest(mode: 'json' | 'html', download?: boolean) {
    const url = buildAutoTestUrl(mode, download);
    if (!url) {
      message.error('测试 token 获取失败，请稍后重试');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function runAutoTestInPage(focusCaseId?: string) {
    const baseUrl = buildAutoTestUrl('json');
    if (!baseUrl) {
      message.error('测试 token 获取失败，请稍后重试');
      return;
    }
    const matchedCase = focusCaseId
      ? caseRows.find(item => String(item?._id || item?.id || '') === String(focusCaseId))
      : null;
    const focusInterfaceId = Number(matchedCase?.interface_id || matchedCase?.interfaceId || 0);

    let requestUrl = baseUrl;
    let requestMethod: 'GET' | 'POST' = 'GET';
    let requestBody: string | undefined;
    let requestHeaders: Record<string, string> | undefined;

    setAutoTestRunning(true);
    const requestMeta = {
      type: 'col' as const,
      projectId: props.projectId,
      interfaceId: focusInterfaceId,
      caseId: focusCaseId
    };
    const caseRequestMeta = {
      type: 'case' as const,
      projectId: props.projectId,
      interfaceId: focusInterfaceId,
      caseId: focusCaseId || ''
    };
    try {
      const beforePayload = focusCaseId
        ? await webPlugins.runBeforeRequest(
            {
              method: 'GET',
              url: requestUrl,
              colId: selectedColId,
              type: 'case',
              caseId: focusCaseId,
              projectId: props.projectId,
              interfaceId: focusInterfaceId
            },
            caseRequestMeta
          )
        : await webPlugins.runBeforeCollectionRequest(
            {
              method: 'GET',
              url: requestUrl,
              colId: selectedColId,
              type: 'col',
              caseId: focusCaseId,
              projectId: props.projectId,
              interfaceId: focusInterfaceId
            },
            requestMeta
          );
      if (beforePayload && typeof beforePayload === 'object' && beforePayload.url) {
        requestUrl = String(beforePayload.url || requestUrl);
      }
      if (beforePayload && typeof beforePayload === 'object' && beforePayload.method) {
        const nextMethod = String(beforePayload.method || '').trim().toUpperCase();
        if (nextMethod === 'POST') requestMethod = 'POST';
      }
      if (beforePayload && typeof beforePayload === 'object' && beforePayload.headers) {
        const rawHeaders = beforePayload.headers as Record<string, unknown>;
        const normalizedHeaders: Record<string, string> = {};
        Object.entries(rawHeaders || {}).forEach(([key, value]) => {
          const name = String(key || '').trim();
          if (name) normalizedHeaders[name] = String(value ?? '');
        });
        if (Object.keys(normalizedHeaders).length > 0) requestHeaders = normalizedHeaders;
      }
      if (beforePayload && typeof beforePayload === 'object' && beforePayload.body !== undefined) {
        const body = beforePayload.body;
        requestBody = typeof body === 'string' ? body : JSON.stringify(body);
      }

      if (!focusCaseId && caseRows.length > 0) {
        await Promise.all(
          caseRows.map(async row => {
            const rowCaseId = String(row._id || row.id || '');
            const rowInterfaceId = Number(row.interface_id || row.interfaceId || 0);
            await webPlugins.runBeforeCollectionRequest(
              {
                method: String(row.method || 'GET').toUpperCase(),
                url: String(row.path || ''),
                colId: selectedColId,
                type: 'col',
                caseId: rowCaseId,
                projectId: props.projectId,
                interfaceId: rowInterfaceId
              },
              {
                type: 'col',
                projectId: props.projectId,
                caseId: rowCaseId,
                interfaceId: rowInterfaceId
              }
            );
          })
        );
      }

      const response = await fetch(requestUrl, {
        method: requestMethod,
        credentials: 'include',
        headers: requestHeaders,
        body: requestMethod === 'POST' ? requestBody : undefined
      });
      const data = (await response.json()) as any;
      if (typeof data.errcode === 'number' && Number(data.errcode) !== 0) {
        message.error(String(data.errmsg || '执行测试失败'));
        return;
      }
      const report = (data && typeof data === 'object' && Array.isArray(data.list)
        ? data
        : (data.data as AutoTestReport)) || { list: [] };
      const normalizedList = Array.isArray(report.list) ? report.list : [];
      const hookedList = focusCaseId
        ? await Promise.all(
            normalizedList.map(async (item: any) => {
              if (String(item.id || '') !== String(focusCaseId)) return item;
              const pluginResult = await webPlugins.runAfterRequest(
                { ...item },
                {
                  type: 'case',
                  projectId: props.projectId,
                  caseId: String(item.id || ''),
                  interfaceId: Number(item.interface_id || item.interfaceId || 0)
                }
              );
              return { ...item, ...pluginResult } as AutoTestResultItem;
            })
          )
        : await Promise.all(
            normalizedList.map(async (item: any) => {
              const pluginResult = await webPlugins.runAfterCollectionRequest(
                { ...item },
                {
                  type: 'col',
                  projectId: props.projectId,
                  caseId: String(item.id || ''),
                  interfaceId: Number(item.interface_id || item.interfaceId || 0)
                }
              );
              return { ...item, ...pluginResult } as AutoTestResultItem;
            })
          );
      report.list = hookedList;
      setAutoTestReport(report);
      setAutoTestModalOpen(true);
      if (focusCaseId) {
        const matched = (report.list || []).find((item: any) => String(item.id || '') === focusCaseId);
        if (matched) {
          setAutoTestDetailItem(matched);
          setAutoTestModalOpen(false);
        }
      }
      message.success('测试执行完成');
    } catch (err) {
      message.error(String((err as Error).message || err || '执行测试失败'));
    } finally {
      setAutoTestRunning(false);
    }
  }

  async function handleRunCaseRequest(detail: any) {
    const bodyType = String(caseForm.getFieldValue('req_body_type') || detail.req_body_type || 'form').toLowerCase();
    const interfaceId = Number(detail.interface_id || detail.interfaceId || 0);
    await caseRequestRunner.run({
      interfaceId,
      requestMeta: {
        type: 'case',
        projectId: props.projectId,
        interfaceId,
        caseId
      },
      bodyMode: bodyType === 'raw' || bodyType === 'file' ? 'raw' : 'json'
    });
  }

  function getCurrentCaseReportById(targetCaseId: string): AutoTestResultItem | null {
    const caseKey = String(targetCaseId || '');
    if (!caseKey) return null;
    if (String(autoTestDetailItem?.id || '') === caseKey) return autoTestDetailItem;
    return autoTestResultMap.get(caseKey) || null;
  }

  function handleCopyCaseResult(targetCaseId: string) {
    const report = getCurrentCaseReportById(targetCaseId);
    if (!report) {
      message.warning('暂无测试结果可复制');
      return;
    }
    void copyText(stringifyPretty(report), '测试结果已复制');
  }

  function openCommonSettingModal(col: any | undefined) {
    const source = toRecord(col);
    const checkResponseField = toRecord(source.checkResponseField);
    const checkScript = toRecord(source.checkScript);
    commonSettingForm.setFieldsValue({
      checkHttpCodeIs200: source.checkHttpCodeIs200 === true,
      checkResponseSchema: source.checkResponseSchema === true,
      checkResponseFieldEnable: checkResponseField.enable === true,
      checkResponseFieldName: String(checkResponseField.name || 'code'),
      checkResponseFieldValue: String(checkResponseField.value ?? '0'),
      checkScriptEnable: checkScript.enable === true,
      checkScriptContent: String(checkScript.content || '')
    });
    setCommonSettingOpen(true);
  }

  async function handleSaveCommonSetting() {
    if (selectedColId <= 0) {
      message.error('请选择测试集合');
      return;
    }
    const values = await commonSettingForm.validateFields();
    const response = await callApi(
      updateCol({
        col_id: selectedColId,
        checkHttpCodeIs200: values.checkHttpCodeIs200 === true,
        checkResponseSchema: values.checkResponseSchema === true,
        checkResponseField: {
          enable: values.checkResponseFieldEnable === true,
          name: values.checkResponseFieldName || 'code',
          value: values.checkResponseFieldValue ?? '0'
        },
        checkScript: {
          enable: values.checkScriptEnable === true,
          content: values.checkScriptContent || ''
        },
        token: props.token
      }).unwrap(),
      '保存通用规则失败'
    );
    if (!response) return;
    message.success('通用规则已保存');
    setCommonSettingOpen(false);
    await colListQuery.refetch();
  }

  async function handleAddCase(values: AddCaseForm) {
    if (selectedColId <= 0) {
      message.error('请选择测试集合');
      return;
    }
    const interfaceId = Number(values.interface_id || 0);
    if (interfaceId <= 0) {
      message.error('请选择接口');
      return;
    }
    const detailRes = await callApi(
      fetchInterfaceDetail({
        id: interfaceId,
        projectId: props.projectId,
        token: props.token
      }).unwrap(),
      '获取接口详情失败'
    );
    if (!detailRes?.data) return;
    const detail = detailRes.data as LegacyInterfaceDTO & Record<string, unknown>;
    const response = await callApi(
      addColCase({
        casename: values.casename.trim() || String(detail.title || `case-${interfaceId}`),
        project_id: props.projectId,
        col_id: selectedColId,
        interface_id: interfaceId,
        case_env: values.case_env?.trim() || '',
        req_params: Array.isArray(detail.req_params) ? detail.req_params : [],
        req_headers: Array.isArray(detail.req_headers) ? detail.req_headers : [],
        req_query: Array.isArray(detail.req_query) ? detail.req_query : [],
        req_body_form: Array.isArray(detail.req_body_form) ? detail.req_body_form : [],
        req_body_other: String(detail.req_body_other || ''),
        req_body_type: String(detail.req_body_type || 'raw'),
        token: props.token
      }).unwrap(),
      '添加用例失败'
    );
    if (!response) return;
    message.success('测试用例添加成功');
    setAddCaseOpen(false);
    addCaseForm.resetFields();
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
    const newCaseId = String(response.data?._id || '');
    if (newCaseId) {
      navigate(`/project/${props.projectId}/interface/case/${newCaseId}`);
    }
  }

  async function handleDropOnCol(targetColId: number) {
    const drag = draggingColItem;
    setDraggingColItem(null);
    if (!colDragEnabled || !drag || targetColId <= 0) return;
    if (drag.type === 'col') {
      if (drag.colId === targetColId) return;
      const reordered = reorderById(colRows, drag.colId, targetColId);
      const payload = buildIndexPayload(reordered);
      if (payload.length === 0) return;
      const response = await callApi(upColIndex(payload).unwrap(), '测试集合排序失败');
      if (!response) return;
      await colListQuery.refetch();
      return;
    }
    if (drag.type === 'case' && drag.colId !== targetColId) {
      const response = await callApi(
        upColCase({
          id: drag.caseId,
          col_id: targetColId,
          token: props.token
        }).unwrap(),
        '移动测试用例失败'
      );
      if (!response) return;
      await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
    }
  }

  async function handleDropOnCase(targetColId: number, targetCaseId: string) {
    const drag = draggingColItem;
    setDraggingColItem(null);
    if (!colDragEnabled || !drag || drag.type !== 'case') return;
    if (!targetCaseId || drag.caseId === targetCaseId) return;

    if (drag.colId !== targetColId) {
      const moveResponse = await callApi(
        upColCase({
          id: drag.caseId,
          col_id: targetColId,
          token: props.token
        }).unwrap(),
        '移动测试用例失败'
      );
      if (!moveResponse) return;
      await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
      return;
    }

    const col = colDisplayRows.find((item: any) => Number(item._id || 0) === targetColId);
    const sourceCases = (col?.caseList || []).map((item: any) => ({ ...item, _id: String(item._id || '') }));
    if (sourceCases.length === 0) return;
    const reordered = reorderByCaseId(sourceCases, drag.caseId, targetCaseId);
    const payload = buildCaseIndexPayload(reordered).map(item => ({
      ...item,
      col_id: targetColId
    }));
    if (payload.length === 0) return;
    const response = await callApi(upColCaseIndex(payload).unwrap(), '测试用例排序失败');
    if (!response) return;
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
  }

  const { apiMenuProps, apiContentProps } = buildProjectInterfaceApiWorkspace({
    projectId: props.projectId,
    basepath: props.basepath,
    canEdit,
    menuKeyword,
    menuDisplayRows,
    catId,
    interfaceId,
    expandedCatIds,
    menuDragEnabled,
    catLoadingMap,
    setMenuKeyword,
    navigateWithGuard,
    openAddInterfaceModal,
    addCatForm,
    setAddCatOpen,
    handleDropOnCat,
    setExpandedCatIds,
    loadCatInterfaces,
    setDraggingMenuItem,
    handleDropOnInterface,
    openEditCatModal,
    confirmDeleteCat,
    copyInterfaceRow,
    confirmDeleteInterface,
    detailLoading: detailQuery.isLoading,
    currentInterface,
    currentCat,
    currentCatName,
    filteredList,
    currentListLoading,
    listKeyword,
    statusFilter,
    listPage,
    catSelectOptions,
    setListKeyword,
    setStatusFilter,
    setListPage,
    openAddCatModal,
    handleInterfaceListStatusChange,
    handleInterfaceListCatChange,
    tab,
    interfaceTabs,
    handleSwitch,
    projectIsMockOpen: props.projectIsMockOpen,
    projectStrict: props.projectStrict,
    customField: props.customField,
    copyText,
    editConflictState,
    form,
    catRows,
    reqRadioType,
    setReqRadioType,
    projectTagOptions,
    openTagSettingModal,
    openBulkImport,
    projectIsJson5: props.projectIsJson5,
    reqSchemaEditorMode,
    setReqSchemaEditorMode,
    watchedReqBodyOther: (watchedReqBodyOther as string) || '',
    watchedValues: (watchedValues || {}) as Record<string, unknown>,
    resEditorTab,
    handleResponseEditorTabChange,
    resSchemaEditorMode,
    setResSchemaEditorMode,
    watchedResBody: (watchedResBody as string) || '',
    resPreviewText,
    handleSave,
    handleRun,
    saving: updateState.isLoading,
    interfaceRequestRunner
  });

  const { collectionMenuProps, collectionContentProps } = buildProjectInterfaceCollectionWorkspace({
    action,
    projectId: props.projectId,
    colKeyword,
    canEdit,
    colDisplayRows,
    selectedColId,
    caseId,
    expandedColIds,
    colDragEnabled,
    setColKeyword,
    openColModal,
    toggleExpandedCol,
    navigateWithGuard,
    handleCollectionDragStartCol,
    handleCollectionDragStartCase,
    handleCollectionDragEnd,
    handleDropOnCol,
    handleDropOnCase,
    confirmDeleteCol,
    openImportInterfaceModal,
    handleCopyCol,
    confirmDeleteCase,
    handleCopyCase,
    colRows,
    autoTestRunning,
    autoTestReport,
    autoTestRows,
    caseRows,
    caseListLoading: caseListQuery.isLoading,
    caseEnvProjects,
    selectedRunEnvByProject,
    autoTestResultMap,
    setSelectedRunEnvByProject,
    setAddCaseOpen,
    openCommonSettingModal,
    runAutoTestInPage,
    openAutoTest,
    setAutoTestModalOpen,
    setAutoTestDetailItem,
    caseDetailLoading: caseDetailQuery.isLoading,
    caseDetailData: (caseDetailQuery.data?.data || {}) as Record<string, unknown>,
    autoTestDetailItem,
    upColCaseLoading: upColCaseState.isLoading,
    caseForm,
    caseEnvOptions,
    caseRequestRunner,
    copyText,
    handleCopyCaseResult,
    handleSaveCase,
    handleRunCaseRequest
  });

  const coreModalsProps = buildProjectInterfaceCoreModalsProps({
    confirmOpen,
    cancelNavigation,
    confirmNavigation,
    addInterfaceOpen,
    addInterfaceForm,
    addInterfaceLoading: addInterfaceState.isLoading,
    catRows,
    setAddInterfaceOpen,
    handleAddNewInterface,
    tagSettingOpen,
    tagSettingInput,
    tagSettingLoading: updateProjectTagState.isLoading,
    setTagSettingInput,
    setTagSettingOpen,
    handleSaveProjectTag,
    bulkOpen,
    bulkValue,
    setBulkValue,
    setBulkOpen,
    setBulkFieldName,
    applyBulkImport,
    addCatOpen,
    addCatForm,
    addCatLoading: addInterfaceCatState.isLoading,
    setAddCatOpen,
    handleAddNewCat,
    editCatOpen,
    editCatForm,
    editCatLoading: updateInterfaceCatState.isLoading,
    setEditCatOpen,
    setEditingCat,
    handleUpdateCat
  });

  const collectionModalsProps = buildProjectInterfaceCollectionModalsProps({
    colModalType,
    colModalOpen,
    colForm,
    colModalLoading: addColState.isLoading || updateColState.isLoading,
    setColModalOpen,
    setEditingCol,
    handleSubmitCol,
    importModalOpen,
    importModalLoading: addColCaseListState.isLoading,
    importProjectId,
    currentProjectId: props.projectId,
    importProjectOptions,
    selectedImportInterfaceCount: selectedImportInterfaceIds.length,
    importTableRows,
    importTableLoading:
      importTreeQuery.isLoading || importTreeQuery.isFetching || importLoading || projectListQuery.isFetching,
    importSelectedRowKeys,
    setImportProjectId,
    setImportSelectedRowKeys,
    setImportModalOpen,
    handleImportInterfaces,
    addCaseOpen,
    addCaseForm,
    addCaseLoading: addColCaseState.isLoading,
    caseInterfaceTruncated,
    caseInterfaceOptions,
    setAddCaseOpen,
    handleAddCase,
    commonSettingOpen,
    commonSettingForm,
    commonSettingLoading: updateColState.isLoading,
    setCommonSettingOpen,
    handleSaveCommonSetting
  });

  const autoTestModalsProps = buildProjectInterfaceAutoTestModalsProps({
    reportOpen: autoTestModalOpen,
    setReportOpen: setAutoTestModalOpen,
    detailItem: autoTestDetailItem,
    setDetailItem: setAutoTestDetailItem,
    report: autoTestReport,
    rows: autoTestRows
  });

  return {
    action,
    apiMenuProps,
    collectionMenuProps,
    apiContentProps,
    collectionContentProps,
    coreModalsProps,
    collectionModalsProps,
    autoTestModalsProps,
    navigateWithGuard
  };
}
