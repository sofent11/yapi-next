import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useForm as useRcForm, useWatch as useRcWatch } from 'rc-field-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { InterfaceDTO } from '../../types/interface-dto';
import { useExportSpecMutation, useGenerateProjectApiMarkdownMutation } from '../../services/yapi-api';
import { safeApiRequest } from '../../utils/safe-request';
import { useProjectInterfaceNavigationGuard } from './ProjectInterfacePage.navigation';
import { useProjectInterfaceRequestRunner } from './ProjectInterfacePage.request-runner';
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
import { useProjectInterfaceCollectionActions } from './ProjectInterfacePage.collection-actions';
import { useProjectInterfaceDndActions } from './ProjectInterfacePage.dnd-actions';
import { useProjectInterfaceData } from './ProjectInterfacePage.data';
import {
  useProjectInterfaceEditHelpers,
  useProjectInterfaceRunHelpers
} from './ProjectInterfacePage.helpers';
import {
  useProjectInterfaceEditSyncEffects,
  useProjectInterfaceMenuSyncEffects,
  useProjectInterfacePageSyncEffects
} from './ProjectInterfacePage.sync-effects';

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
  CommonSettingForm,
  MenuDragItem,
  ColDragItem,
  EditConflictState
} from './ProjectInterfacePage.types';
import {
  RUN_METHODS,
  HTTP_REQUEST_HEADER,
  statusLabel,
  formatUnixTime,
  normalizePathInput,
  parseLooseJson,
  normalizeJsonText,
  checkIsJsonSchema,
  parseInterfaceId,
  parseColId,
  normalizeParamRows,
  buildSchemaRows,
  mockFlagText
} from './ProjectInterfacePage.utils';

const message = {
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  },
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  warning(text: string) {
    notifications.show({ color: 'yellow', message: text });
  }
};

export function useProjectInterfaceLogic(props: ProjectInterfacePageProps) {
  const params = useParams<{ action?: string; actionId?: string }>();
  const action = params.action || 'api';
  const actionId = params.actionId;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSearch = searchParams.toString();
  const pendingSearchSyncRef = useRef(false);
  const parsePage = (value: string | null) => {
    const nextPage = Number(value || 1);
    return Number.isFinite(nextPage) && nextPage > 0 ? nextPage : 1;
  };

  const initialTab = searchParams.get('tab') || 'view';
  const initialListKeyword = searchParams.get('q') || '';
  const initialListPage = parsePage(searchParams.get('page'));
  const initialStatusFilter = searchParams.get('status');
  const initialReqPanel = searchParams.get('reqPanel');
  const initialResTab = searchParams.get('resTab');
  const initialReqSchema = searchParams.get('reqSchema');
  const initialResSchema = searchParams.get('resSchema');

  const [tab, setTab] = useState<string>(initialTab);
  const interfaceRequestRunner = useProjectInterfaceRequestRunner();
  const caseRequestRunner = useProjectInterfaceRequestRunner();
  const resetInterfaceRequestRunner = interfaceRequestRunner.reset;
  const resetCaseRequestRunner = caseRequestRunner.reset;
  const [listKeyword, setListKeyword] = useState(initialListKeyword);
  const [listPage, setListPage] = useState(initialListPage);
  const [menuKeyword, setMenuKeyword] = useState('');
  const [expandedCatIds, setExpandedCatIds] = useState<number[]>([]);
  const [catInterfaceMap, setCatInterfaceMap] = useState<Record<number, InterfaceDTO[]>>({});
  const [catLoadingMap, setCatLoadingMap] = useState<Record<number, boolean>>({});
  const catLoadingRef = useRef<Record<number, boolean>>({});
  const catLoadedRef = useRef<Record<number, boolean>>({});
  const [draggingMenuItem, setDraggingMenuItem] = useState<MenuDragItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'undone'>(
    initialStatusFilter === 'done' || initialStatusFilter === 'undone' ? initialStatusFilter : 'all'
  );
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
  const [importCatInterfaceMap, setImportCatInterfaceMap] = useState<Record<number, InterfaceDTO[]>>({});
  const [importCatLoadingMap, setImportCatLoadingMap] = useState<Record<number, boolean>>({});
  const importCatLoadingRef = useRef<Record<number, boolean>>({});
  const importCatLoadedRef = useRef<Record<number, boolean>>({});
  const [autoTestRunning, setAutoTestRunning] = useState(false);
  const [autoTestModalOpen, setAutoTestModalOpen] = useState(false);
  const [autoTestReport, setAutoTestReport] = useState<AutoTestReport | null>(null);
  const [autoTestDetailItem, setAutoTestDetailItem] = useState<AutoTestResultItem | null>(null);
  const [selectedRunEnvByProject, setSelectedRunEnvByProject] = useState<Record<number, string>>({});
  const [commonSettingOpen, setCommonSettingOpen] = useState(false);
  const [reqRadioType, setReqRadioType] = useState<'req-body' | 'req-query' | 'req-headers'>(
    initialReqPanel === 'req-body' || initialReqPanel === 'req-headers' ? initialReqPanel : 'req-query'
  );
  const [editBaseline, setEditBaseline] = useState('');
  const [tagSettingOpen, setTagSettingOpen] = useState(false);
  const [tagSettingInput, setTagSettingInput] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFieldName, setBulkFieldName] = useState<'req_query' | 'req_body_form' | null>(null);
  const [bulkValue, setBulkValue] = useState('');
  const [resEditorTab, setResEditorTab] = useState<'tpl' | 'preview'>(
    initialResTab === 'preview' ? 'preview' : 'tpl'
  );
  const [resPreviewText, setResPreviewText] = useState('');
  const [reqSchemaEditorMode, setReqSchemaEditorMode] = useState<'text' | 'visual'>(
    initialReqSchema === 'text' ? 'text' : 'visual'
  );
  const [resSchemaEditorMode, setResSchemaEditorMode] = useState<'text' | 'visual'>(
    initialResSchema === 'text' ? 'text' : 'visual'
  );
  const [editConflictState, setEditConflictState] = useState<EditConflictState>({ status: 'idle' });
  const [exportSpec, exportSpecState] = useExportSpecMutation();
  const [generateApiMarkdown, generateApiMarkdownState] = useGenerateProjectApiMarkdownMutation();

  const [form] = useRcForm<EditForm>();
  const [addInterfaceForm] = useRcForm<AddInterfaceForm>();
  const [addCatForm] = useRcForm<AddCatForm>();
  const [editCatForm] = useRcForm<EditCatForm>();
  const [colForm] = useRcForm<ColForm>();
  const [addCaseForm] = useRcForm<AddCaseForm>();
  const [caseForm] = useRcForm<CaseEditForm>();
  const [commonSettingForm] = useRcForm<CommonSettingForm>();

  const watchedValues = useRcWatch([], form);
  const watchedReqBodyOther = useRcWatch('req_body_other', form);
  const watchedResBody = useRcWatch('res_body', form);

  const setTabWithSearchSync = useCallback((next: string) => {
    pendingSearchSyncRef.current = true;
    setTab(next);
  }, []);

  const setListKeywordWithSearchSync = useCallback((next: string) => {
    pendingSearchSyncRef.current = true;
    setListKeyword(next);
  }, []);

  const setListPageWithSearchSync = useCallback((next: number) => {
    pendingSearchSyncRef.current = true;
    setListPage(next);
  }, []);

  const setStatusFilterWithSearchSync = useCallback((next: 'all' | 'done' | 'undone') => {
    pendingSearchSyncRef.current = true;
    setStatusFilter(next);
  }, []);

  useEffect(() => {
    if (pendingSearchSyncRef.current) {
      return;
    }

    const nextTab = searchParams.get('tab') || 'view';
    const nextListKeyword = searchParams.get('q') || '';
    const nextListPage = parsePage(searchParams.get('page'));
    const nextStatusFilter = searchParams.get('status');

    if (tab !== nextTab) setTab(nextTab);
    if (listKeyword !== nextListKeyword) setListKeyword(nextListKeyword);
    if (listPage !== nextListPage) setListPage(nextListPage);
    if (statusFilter !== nextStatusFilter && (nextStatusFilter === 'all' || nextStatusFilter === 'done' || nextStatusFilter === 'undone')) {
      setStatusFilter(nextStatusFilter);
    }
    if (statusFilter !== 'all' && !nextStatusFilter) setStatusFilter('all');
  }, [
    listKeyword,
    listPage,
    searchParams,
    statusFilter,
    tab
  ]);

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(currentSearch);
    const syncParam = (key: string, value: string | null, fallback?: string) => {
      if (!value || value === fallback) {
        nextSearchParams.delete(key);
        return;
      }
      nextSearchParams.set(key, value);
    };

    syncParam('tab', tab, 'view');
    syncParam('q', listKeyword.trim(), '');
    syncParam('status', statusFilter, 'all');
    syncParam('page', listPage > 1 ? String(listPage) : '', '');

    const nextSearch = nextSearchParams.toString();
    if (nextSearch !== currentSearch) {
      setSearchParams(nextSearchParams, { replace: true });
      return;
    }

    if (pendingSearchSyncRef.current) {
      pendingSearchSyncRef.current = false;
    }
  }, [
    currentSearch,
    listKeyword,
    listPage,
    setSearchParams,
    statusFilter,
    tab
  ]);

  const interfaceId = action === 'api' ? parseInterfaceId(actionId) : 0;
  const catId = action === 'api' && actionId?.startsWith('cat_') ? Number(actionId.slice(4)) : 0;
  const colIdFromRoute = action === 'col' ? parseColId(actionId) : 0;
  const caseId = action === 'case' ? actionId || '' : '';
  const {
    shouldFetchGlobalInterfaceList,
    treeQuery,
    listQuery,
    detailQuery,
    catMenuQuery,
    updateInterface,
    updateState,
    addInterface,
    addInterfaceState,
    fetchInterfaceDetail,
    upInterfaceIndex,
    upInterfaceCatIndex,
    updateProjectTag,
    updateProjectTagState,
    addInterfaceCat,
    addInterfaceCatState,
    updateInterfaceCat,
    updateInterfaceCatState,
    delInterface,
    delInterfaceState,
    delInterfaceCat,
    delInterfaceCatState,
    addCol,
    addColState,
    updateCol,
    updateColState,
    triggerDelCol,
    triggerDelCase,
    addColCaseList,
    addColCaseListState,
    cloneColCaseList,
    addColCase,
    addColCaseState,
    upColCase,
    upColCaseState,
    upColCaseIndex,
    upColIndex,
    fetchColCaseDetail,
    colListQuery,
    caseDetailQuery,
    selectedColId,
    caseListQuery,
    caseEnvListQuery,
    projectTokenQuery,
    projectListQuery,
    importTreeQuery,
    catRows,
    currentInterface,
    colRows,
    caseRows,
    canEdit,
    importTreeRows,
    caseEnvProjects,
    menuRows,
    filteredList,
    currentListLoading,
    currentCatName,
    currentCat,
    catSelectOptions,
    menuDragEnabled,
    menuDisplayRows,
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
    caseEnvOptions,
    loadCatInterfaces,
    refreshInterfaceMenu,
    refetchInterfaceListSafe,
    loadImportCatInterfaces,
    interfaceTabs,
    projectTagOptions,
    projectTokenValue
  } = useProjectInterfaceData({
    props,
    action,
    interfaceId,
    catId,
    colIdFromRoute,
    caseId,
    addCaseOpen,
    importModalOpen,
    importProjectId,
    menuKeyword,
    listKeyword,
    statusFilter,
    colKeyword,
    catInterfaceMap,
    catLoadingMap,
    importCatInterfaceMap,
    importCatLoadingMap,
    importSelectedRowKeys,
    autoTestReport,
    catLoadingRef,
    catLoadedRef,
    importCatLoadingRef,
    importCatLoadedRef,
    setCatInterfaceMap,
    setCatLoadingMap,
    setImportCatInterfaceMap,
    setImportCatLoadingMap
  });

  const callApi = useCallback(
    <T,>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => message.error(msg) }),
    []
  );

  const { serializeEditValues, buildEditFormValues } = useProjectInterfaceEditHelpers({
    props,
    catRows
  });

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
    setTab: setTabWithSearchSync,
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

  const {
    openColModal,
    handleSubmitCol,
    confirmDeleteCol,
    handleCopyCol,
    openImportInterfaceModal,
    handleImportInterfaces,
    confirmDeleteCase,
    handleCopyCase,
    handleSaveCase,
    openAutoTest,
    runAutoTestInPage,
    openCommonSettingModal,
    handleSaveCommonSetting,
    handleAddCase
  } = useProjectInterfaceCollectionActions({
    projectId: props.projectId,
    token: props.token,
    selectedColId,
    action,
    caseId,
    projectTokenValue,
    selectedRunEnvByProject,
    colRows,
    caseRows,
    colModalType,
    editingCol,
    colForm,
    addCaseForm,
    caseForm,
    commonSettingForm,
    setColModalType,
    setColModalOpen,
    setEditingCol,
    setImportColId,
    setImportProjectId,
    setImportSelectedRowKeys,
    setImportModalOpen,
    setAddCaseOpen,
    setAutoTestRunning,
    setAutoTestReport,
    setAutoTestModalOpen,
    setAutoTestDetailItem,
    setCommonSettingOpen,
    importColId,
    importProjectId,
    selectedImportInterfaceIds,
    callApi,
    navigate,
    refetchColList: colListQuery.refetch,
    refetchCaseList: caseListQuery.refetch,
    refetchCaseDetail: caseDetailQuery.refetch,
    addCol,
    updateCol,
    triggerDelCol,
    cloneColCaseList,
    addColCaseList,
    triggerDelCase,
    fetchColCaseDetail,
    addColCase,
    upColCase,
    fetchInterfaceDetail
  });

  const {
    toggleExpandedCol,
    handleCollectionDragStartCol,
    handleCollectionDragStartCase,
    handleCollectionDragEnd,
    handleDropOnCat,
    handleDropOnInterface,
    handleDropOnCol,
    handleDropOnCase
  } = useProjectInterfaceDndActions({
    projectId: props.projectId,
    token: props.token,
    menuRows,
    colRows,
    colDisplayRows,
    menuDragEnabled,
    colDragEnabled,
    draggingMenuItem,
    draggingColItem,
    setDraggingMenuItem,
    setDraggingColItem,
    setExpandedColIds,
    callApi,
    refreshInterfaceMenu,
    refetchInterfaceListSafe,
    refetchColList: colListQuery.refetch,
    refetchCaseList: caseListQuery.refetch,
    updateInterface,
    upInterfaceIndex,
    upInterfaceCatIndex,
    upColCase,
    upColCaseIndex,
    upColIndex
  });

  useProjectInterfaceMenuSyncEffects({
    action,
    catId,
    expandedCatIds,
    menuRows,
    projectId: props.projectId,
    colRows,
    selectedColId,
    colKeyword,
    importModalOpen,
    importProjectId,
    importTreeRows,
    addCaseOpen,
    caseInterfaceOptions,
    caseEnvProjects,
    setExpandedCatIds,
    loadCatInterfaces,
    catLoadingRef,
    catLoadedRef,
    setCatInterfaceMap,
    setCatLoadingMap,
    setExpandedColIds,
    setImportProjectId,
    importCatLoadingRef,
    importCatLoadedRef,
    setImportCatInterfaceMap,
    setImportCatLoadingMap,
    loadImportCatInterfaces,
    addCaseForm,
    setSelectedRunEnvByProject
  });

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
    setTab: setTabWithSearchSync,
    tab
  });

  useProjectInterfacePageSyncEffects({
    action,
    projectId: props.projectId,
    catId,
    listKeyword,
    statusFilter,
    caseId,
    colIdFromRoute,
    interfaceId,
    currentInterface,
    selectedColId,
    colRows,
    caseDetailData: (caseDetailQuery.data?.data || null) as Record<string, unknown> | null,
    navigate,
    setListPage,
    setAutoTestDetailItem
  });

  useProjectInterfaceEditSyncEffects({
    action,
    interfaceId,
    tab,
    currentInterface,
    basepath: props.basepath,
    watchedValues: ((watchedValues || {}) as EditForm),
    reqRadioType,
    form,
    caseForm,
    caseDetailData: (caseDetailQuery.data?.data || null) as Record<string, unknown> | null,
    buildEditFormValues,
    serializeEditValues,
    resetInterfaceRequestRunner,
    resetCaseRequestRunner,
    setEditConflictState,
    setReqRadioType,
    setEditBaseline,
    setResEditorTab,
    setResPreviewText,
    setReqSchemaEditorMode,
    setResSchemaEditorMode
  });

  const { copyText, handleRun, handleRunCaseRequest, handleCopyCaseResult } = useProjectInterfaceRunHelpers({
    currentInterface,
    projectId: props.projectId,
    caseId,
    caseForm,
    interfaceRequestRunner,
    caseRequestRunner,
    autoTestDetailItem,
    autoTestResultMap
  });

  const copyExportedSpec = useCallback(async (
    format: 'swagger2' | 'openapi3',
    target: { catId?: number; interfaceId?: number },
    successText: string
  ) => {
    const exportToken = projectTokenValue || props.token;
    if (!exportToken) {
      message.warning('项目 token 读取中，请稍后重试');
      return;
    }
    const response = await callApi(
      exportSpec({
        project_id: props.projectId,
        token: exportToken,
        format,
        status: 'all',
        cat_id: target.catId,
        interface_id: target.interfaceId
      }).unwrap(),
      '复制规范失败'
    );
    if (!response) return;
    await copyText(JSON.stringify(response.data || {}, null, 2), successText);
  }, [callApi, copyText, exportSpec, projectTokenValue, props.projectId, props.token]);

  const copyCatSwaggerJson = useCallback(async (targetCatId: number) => {
    if (targetCatId <= 0) {
      message.warning('请先选择分类');
      return;
    }
    await copyExportedSpec('swagger2', { catId: targetCatId }, '分类 Swagger JSON 已复制');
  }, [copyExportedSpec]);

  const copyCatOpenApiJson = useCallback(async (targetCatId: number) => {
    if (targetCatId <= 0) {
      message.warning('请先选择分类');
      return;
    }
    await copyExportedSpec('openapi3', { catId: targetCatId }, '分类 OpenAPI 3.0 已复制');
  }, [copyExportedSpec]);

  const copyInterfaceSwaggerJson = useCallback(async (targetInterfaceId: number) => {
    if (targetInterfaceId <= 0) {
      message.warning('请先选择接口');
      return;
    }
    await copyExportedSpec('swagger2', { interfaceId: targetInterfaceId }, '接口 Swagger JSON 已复制');
  }, [copyExportedSpec]);

  const copyInterfaceOpenApiJson = useCallback(async (targetInterfaceId: number) => {
    if (targetInterfaceId <= 0) {
      message.warning('请先选择接口');
      return;
    }
    await copyExportedSpec('openapi3', { interfaceId: targetInterfaceId }, '接口 OpenAPI 3.0 已复制');
  }, [copyExportedSpec]);

  const copyInterfaceMarkdown = useCallback(async (targetInterfaceId: number) => {
    if (targetInterfaceId <= 0) {
      message.warning('请先选择接口');
      return;
    }
    const exportToken = projectTokenValue || props.token;
    const response = await callApi(
      generateApiMarkdown({
        project_id: props.projectId,
        source: String(targetInterfaceId),
        token: exportToken
      }).unwrap(),
      '复制接口 Markdown 失败'
    );
    const markdown = String(response?.data?.markdown || '').trim();
    if (!markdown) {
      message.warning('当前接口没有可复制的 Markdown');
      return;
    }
    await copyText(markdown, '接口 Markdown 已复制');
  }, [callApi, copyText, generateApiMarkdown, projectTokenValue, props.projectId, props.token]);

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
    setListKeyword: setListKeywordWithSearchSync,
    setStatusFilter: setStatusFilterWithSearchSync,
    setListPage: setListPageWithSearchSync,
    openAddCatModal,
    handleInterfaceListStatusChange,
    handleInterfaceListCatChange,
    copyCatSwaggerJson,
    copyCatOpenApiJson,
    copyInterfaceSwaggerJson,
    copyInterfaceOpenApiJson,
    copyInterfaceMarkdown,
    copyingSpec: exportSpecState.isLoading,
    copyingMarkdown: generateApiMarkdownState.isLoading,
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
