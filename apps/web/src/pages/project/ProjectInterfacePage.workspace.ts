import type { Dispatch, SetStateAction } from 'react';
import type { FormInstance } from 'rc-field-form';
import type { InterfaceTreeNode } from '@yapi-next/shared-types';
import type { InterfaceDTO } from '../../types/interface-dto';

import type { InterfaceTabItem } from '../../plugins';
import { getHttpMethodBadgeClassName } from '../../utils/http-method';
import type { InterfaceApiContentProps } from './components/InterfaceApiContent';
import type { InterfaceCollectionContentProps } from './components/InterfaceCollectionContent';
import type { ProjectInterfaceApiMenuProps } from './components/ProjectInterfaceApiMenu';
import type { ProjectInterfaceCollectionMenuProps } from './components/ProjectInterfaceCollectionMenu';
import {
  HTTP_REQUEST_HEADER,
  RUN_METHODS,
  buildSchemaRows,
  formatUnixTime,
  mockFlagText,
  normalizeParamRows,
  normalizePathInput,
  sanitizeReqBodyForm,
  sanitizeReqHeaders,
  sanitizeReqQuery,
  statusLabel,
  supportsRequestBody
} from './ProjectInterfacePage.utils';
import {
  stringifyPretty,
  type ProjectInterfaceRequestRunnerState
} from './ProjectInterfacePage.request-runner';
import type {
  AutoTestReport,
  AutoTestResultItem,
  CaseEnvProjectItem,
  EditConflictState,
  MenuDragItem
} from './ProjectInterfacePage.types';

type BuildApiWorkspaceParams = {
  projectId: number;
  basepath?: string;
  canEdit: boolean;
  menuKeyword: string;
  menuDisplayRows: InterfaceTreeNode[];
  catId: number;
  interfaceId: number;
  expandedCatIds: number[];
  menuDragEnabled: boolean;
  catLoadingMap: Record<number, boolean>;
  setMenuKeyword: (keyword: string) => void;
  navigateWithGuard: (path: string) => void;
  openAddInterfaceModal: (catid?: number) => void;
  addCatForm: FormInstance<any>;
  setAddCatOpen: (open: boolean) => void;
  handleDropOnCat: (catIdNum: number) => void;
  setExpandedCatIds: Dispatch<SetStateAction<number[]>>;
  loadCatInterfaces: (catid: number) => void;
  setDraggingMenuItem: (item: MenuDragItem | null) => void;
  handleDropOnInterface: (catIdNum: number, ifaceId: number) => void;
  openEditCatModal: (cat: InterfaceTreeNode) => void;
  confirmDeleteCat: (cat: InterfaceTreeNode) => void;
  copyInterfaceRow: (item: InterfaceDTO) => void | Promise<void>;
  confirmDeleteInterface: (id: number) => void;
  detailLoading: boolean;
  currentInterface: InterfaceDTO | null;
  currentCat: { _id?: number; name?: string; desc?: string } | null;
  currentCatName: string;
  filteredList: InterfaceDTO[];
  currentListLoading: boolean;
  listKeyword: string;
  statusFilter: 'all' | 'done' | 'undone';
  listPage: number;
  catSelectOptions: Array<{ label: string; value: number }>;
  setListKeyword: (value: string) => void;
  setStatusFilter: (value: 'all' | 'done' | 'undone') => void;
  setListPage: (page: number) => void;
  openAddCatModal: () => void;
  handleInterfaceListStatusChange: (id: number, status: 'done' | 'undone') => Promise<void>;
  handleInterfaceListCatChange: (id: number, catid: number) => Promise<void>;
  copyCatSwaggerJson: (catId: number) => void | Promise<void>;
  copyCatOpenApiJson: (catId: number) => void | Promise<void>;
  copyInterfaceSwaggerJson: (interfaceId: number) => void | Promise<void>;
  copyInterfaceOpenApiJson: (interfaceId: number) => void | Promise<void>;
  copyInterfaceMarkdown: (interfaceId: number) => void | Promise<void>;
  copyingSpec: boolean;
  copyingMarkdown: boolean;
  tab: string;
  interfaceTabs: Record<string, InterfaceTabItem>;
  handleSwitch: (next: string) => void;
  projectIsMockOpen?: boolean;
  projectStrict?: boolean;
  customField?: { name?: string; enable?: boolean };
  copyText: (text: string, successText: string) => void | Promise<void>;
  editConflictState: EditConflictState;
  form: FormInstance;
  catRows: Array<{ _id?: number; name?: string }>;
  reqRadioType: 'req-query' | 'req-body' | 'req-headers';
  setReqRadioType: (value: 'req-query' | 'req-body' | 'req-headers') => void;
  projectTagOptions: Array<{ label: string; value: string }>;
  openTagSettingModal: () => void;
  openBulkImport: (field: 'req_query' | 'req_body_form') => void;
  projectIsJson5?: boolean;
  reqSchemaEditorMode: 'text' | 'visual';
  setReqSchemaEditorMode: (mode: 'text' | 'visual') => void;
  watchedReqBodyOther: string;
  watchedValues: Record<string, unknown> | undefined;
  resEditorTab: 'tpl' | 'preview';
  handleResponseEditorTabChange: (next: string) => void;
  resSchemaEditorMode: 'text' | 'visual';
  setResSchemaEditorMode: (mode: 'text' | 'visual') => void;
  watchedResBody: string;
  resPreviewText: string;
  handleSave: () => void | Promise<void>;
  handleRun: () => void | Promise<void>;
  saving: boolean;
  interfaceRequestRunner: ProjectInterfaceRequestRunnerState;
};

type BuildCollectionWorkspaceParams = {
  action: string;
  projectId: number;
  colKeyword: string;
  canEdit: boolean;
  colDisplayRows: InterfaceCollectionContentProps['colRows'];
  selectedColId: number;
  caseId: string;
  expandedColIds: number[];
  colDragEnabled: boolean;
  setColKeyword: (keyword: string) => void;
  openColModal: (type: 'add' | 'edit', col?: { _id?: number; name?: string; desc?: string }) => void;
  toggleExpandedCol: (colId: number) => void;
  navigateWithGuard: (path: string) => void;
  handleCollectionDragStartCol: (colId: number) => void;
  handleCollectionDragStartCase: (colId: number, nextCaseId: string) => void;
  handleCollectionDragEnd: () => void;
  handleDropOnCol: (colId: number) => void;
  handleDropOnCase: (colId: number, id: string) => void;
  confirmDeleteCol: (colId: number) => void;
  openImportInterfaceModal: (colId: number) => void;
  handleCopyCol: (col: { _id?: number; name?: string; desc?: string }) => void | Promise<void>;
  confirmDeleteCase: (caseItemId: string) => void;
  handleCopyCase: (caseItemId: string) => void | Promise<void>;
  colRows: InterfaceCollectionContentProps['colRows'];
  autoTestRunning: boolean;
  autoTestReport: AutoTestReport | null;
  autoTestRows: InterfaceCollectionContentProps['autoTestRows'];
  caseRows: InterfaceCollectionContentProps['caseRows'];
  caseListLoading: boolean;
  caseEnvProjects: CaseEnvProjectItem[];
  selectedRunEnvByProject: InterfaceCollectionContentProps['selectedRunEnvByProject'];
  autoTestResultMap: InterfaceCollectionContentProps['autoTestResultMap'];
  setSelectedRunEnvByProject: Dispatch<SetStateAction<Record<number, string>>>;
  setAddCaseOpen: (open: boolean) => void;
  openCommonSettingModal: (col: InterfaceCollectionContentProps['colRows'][number] | undefined) => void;
  runAutoTestInPage: (focusCaseId?: string) => Promise<void>;
  openAutoTest: (mode: 'json' | 'html', isDownload?: boolean) => void;
  setAutoTestModalOpen: (open: boolean) => void;
  setAutoTestDetailItem: Dispatch<SetStateAction<InterfaceCollectionContentProps['autoTestDetailItem']>>;
  caseDetailLoading: boolean;
  caseDetailData: InterfaceCollectionContentProps['caseDetailData'];
  autoTestDetailItem: InterfaceCollectionContentProps['autoTestDetailItem'];
  upColCaseLoading: boolean;
  caseForm: InterfaceCollectionContentProps['caseForm'];
  caseEnvOptions: Array<{ label: string; value: string }>;
  caseRequestRunner: ProjectInterfaceRequestRunnerState;
  copyText: (text: string, successText: string) => void | Promise<void>;
  handleCopyCaseResult: (targetCaseId: string) => void;
  handleSaveCase: () => void | Promise<void>;
  handleRunCaseRequest: (detail: Record<string, unknown>) => void | Promise<void>;
};

export function buildProjectInterfaceApiWorkspace(
  params: BuildApiWorkspaceParams
): {
  apiMenuProps: ProjectInterfaceApiMenuProps;
  apiContentProps: InterfaceApiContentProps;
} {
  const apiMenuProps: ProjectInterfaceApiMenuProps = {
    menuKeyword: params.menuKeyword,
    canEdit: params.canEdit,
    hasCategories: params.catRows.length > 0,
    menuDisplayRows: params.menuDisplayRows,
    catId: params.catId,
    interfaceId: params.interfaceId,
    expandedCatIds: params.expandedCatIds,
    menuDragEnabled: params.menuDragEnabled,
    catLoadingMap: params.catLoadingMap,
    setMenuKeyword: params.setMenuKeyword,
    navigateWithGuard: params.navigateWithGuard,
    projectId: params.projectId,
    openAddInterfaceModal: params.openAddInterfaceModal,
    addCatForm: params.addCatForm,
    setAddCatOpen: params.setAddCatOpen,
    handleDropOnCat: params.handleDropOnCat,
    setExpandedCatIds: params.setExpandedCatIds,
    loadCatInterfaces: params.loadCatInterfaces,
    setDraggingMenuItem: params.setDraggingMenuItem,
    handleDropOnInterface: params.handleDropOnInterface,
    openEditCatModal: params.openEditCatModal,
    confirmDeleteCat: params.confirmDeleteCat,
    copyInterfaceRow: params.copyInterfaceRow,
    confirmDeleteInterface: params.confirmDeleteInterface
  };

  const apiContentProps: InterfaceApiContentProps = {
    projectId: params.projectId,
    interfaceId: params.interfaceId,
    detailLoading: params.detailLoading,
    currentInterface: params.currentInterface,
    basepath: params.basepath,
    canEdit: params.canEdit,
    currentCat: params.currentCat,
    currentCatName: params.currentCatName,
    filteredList: params.filteredList,
    currentListLoading: params.currentListLoading,
    listKeyword: params.listKeyword,
    statusFilter: params.statusFilter,
    listPage: params.listPage,
    catOptions: params.catSelectOptions,
    hasCategories: params.catRows.length > 0,
    onListKeywordChange: params.setListKeyword,
    onStatusFilterChange: params.setStatusFilter,
    onResetFilters: () => {
      params.setListKeyword('');
      params.setStatusFilter('all');
      params.setListPage(1);
    },
    onListPageChange: params.setListPage,
    onOpenAddInterface: () => params.openAddInterfaceModal(),
    onOpenAddCat: params.openAddCatModal,
    onOpenEditCat: cat => {
      if (!cat) return;
      params.openEditCatModal(cat as InterfaceTreeNode);
    },
    onNavigateAllInterfaces: () => params.navigateWithGuard(`/project/${params.projectId}/interface/api`),
    onNavigateInterface: id => params.navigateWithGuard(`/project/${params.projectId}/interface/api/${id}`),
    onUpdateStatus: params.handleInterfaceListStatusChange,
    onUpdateCategory: params.handleInterfaceListCatChange,
    onCopyCatSwaggerJson: catId => {
      void params.copyCatSwaggerJson(catId);
    },
    onCopyCatOpenApiJson: catId => {
      void params.copyCatOpenApiJson(catId);
    },
    onCopyInterfaceSwaggerJson: interfaceId => {
      void params.copyInterfaceSwaggerJson(interfaceId);
    },
    onCopyInterfaceOpenApiJson: interfaceId => {
      void params.copyInterfaceOpenApiJson(interfaceId);
    },
    onCopyInterfaceMarkdown: interfaceId => {
      void params.copyInterfaceMarkdown(interfaceId);
    },
    copyingSpec: params.copyingSpec,
    copyingMarkdown: params.copyingMarkdown,
    onCopyInterface: row => void params.copyInterfaceRow(row),
    onDeleteInterface: params.confirmDeleteInterface,
    methodClassName: getHttpMethodBadgeClassName,
    tab: params.tab,
    interfaceTabs: params.interfaceTabs,
    onSwitchTab: params.handleSwitch,
    projectIsMockOpen: params.projectIsMockOpen,
    projectStrict: params.projectStrict,
    customField: params.customField,
    normalizeParamRows,
    buildSchemaRows,
    statusLabel,
    formatUnixTime,
    mockFlagText,
    onCopyText: (text: string, successText: string) => {
      void params.copyText(text, successText);
    },
    editConflictState: params.editConflictState,
    form: params.form,
    catRows: params.catRows.map(item => ({ _id: Number(item._id || 0), name: String(item.name || '') })),
    runMethods: RUN_METHODS,
    supportsRequestBody,
    reqRadioType: params.reqRadioType,
    onReqRadioTypeChange: params.setReqRadioType,
    normalizePathInput,
    projectTagOptions: params.projectTagOptions,
    onOpenTagSetting: params.openTagSettingModal,
    sanitizeReqQuery,
    sanitizeReqHeaders,
    sanitizeReqBodyForm,
    onOpenBulkImport: params.openBulkImport,
    httpRequestHeaders: HTTP_REQUEST_HEADER,
    projectIsJson5: params.projectIsJson5,
    reqSchemaEditorMode: params.reqSchemaEditorMode,
    onReqSchemaEditorModeChange: params.setReqSchemaEditorMode,
    watchedReqBodyOther: params.watchedReqBodyOther,
    editValues: params.watchedValues || {},
    resEditorTab: params.resEditorTab,
    onResponseEditorTabChange: tab => params.handleResponseEditorTabChange(tab),
    resSchemaEditorMode: params.resSchemaEditorMode,
    onResSchemaEditorModeChange: params.setResSchemaEditorMode,
    watchedResBody: params.watchedResBody,
    resPreviewText: params.resPreviewText,
    onSave: () => {
      void params.handleSave();
    },
    saving: params.saving,
    runMethod: params.interfaceRequestRunner.method,
    runPath: params.interfaceRequestRunner.path,
    runQuery: params.interfaceRequestRunner.query,
    runHeaders: params.interfaceRequestRunner.headers,
    runBody: params.interfaceRequestRunner.body,
    runResponse: params.interfaceRequestRunner.response,
    runLoading: params.interfaceRequestRunner.loading,
    onSetRunMethod: params.interfaceRequestRunner.setMethod,
    onSetRunPath: params.interfaceRequestRunner.setPath,
    onSetRunQuery: params.interfaceRequestRunner.setQuery,
    onSetRunHeaders: params.interfaceRequestRunner.setHeaders,
    onSetRunBody: params.interfaceRequestRunner.setBody,
    onRun: () => {
      void params.handleRun();
    },
    onFormatRunQuery: params.interfaceRequestRunner.formatQuery,
    onFormatRunHeaders: params.interfaceRequestRunner.formatHeaders,
    onFormatRunBody: params.interfaceRequestRunner.formatBody,
    onCopyRunQuery: () => {
      void params.copyText(params.interfaceRequestRunner.query, 'Query 参数已复制');
    },
    onCopyRunHeaders: () => {
      void params.copyText(params.interfaceRequestRunner.headers, 'Header 参数已复制');
    },
    onCopyRunBody: () => {
      void params.copyText(params.interfaceRequestRunner.body, 'Body 参数已复制');
    },
    onClearRunQuery: params.interfaceRequestRunner.clearQuery,
    onClearRunHeaders: params.interfaceRequestRunner.clearHeaders,
    onClearRunBody: params.interfaceRequestRunner.clearBody,
    onCopyRunResponse: () => {
      void params.copyText(params.interfaceRequestRunner.response, '响应结果已复制');
    },
    onClearResponse: params.interfaceRequestRunner.clearResponse
  };

  return {
    apiMenuProps,
    apiContentProps
  };
}

export function buildProjectInterfaceCollectionWorkspace(
  params: BuildCollectionWorkspaceParams
): {
  collectionMenuProps: ProjectInterfaceCollectionMenuProps;
  collectionContentProps: InterfaceCollectionContentProps;
} {
  const collectionMenuProps: ProjectInterfaceCollectionMenuProps = {
    colKeyword: params.colKeyword,
    canEdit: params.canEdit,
    colDisplayRows: params.colDisplayRows,
    selectedColId: params.selectedColId,
    action: params.action,
    caseId: params.caseId,
    expandedColIds: params.expandedColIds,
    colDragEnabled: params.colDragEnabled,
    setColKeyword: params.setColKeyword,
    openColModal: params.openColModal,
    toggleExpandedCol: params.toggleExpandedCol,
    navigateWithGuard: params.navigateWithGuard,
    projectId: params.projectId,
    handleCollectionDragStartCol: params.handleCollectionDragStartCol,
    handleCollectionDragStartCase: params.handleCollectionDragStartCase,
    handleCollectionDragEnd: params.handleCollectionDragEnd,
    handleDropOnCol: params.handleDropOnCol,
    handleDropOnCase: params.handleDropOnCase,
    confirmDeleteCol: params.confirmDeleteCol,
    openImportInterfaceModal: params.openImportInterfaceModal,
    handleCopyCol: params.handleCopyCol,
    confirmDeleteCase: params.confirmDeleteCase,
    handleCopyCase: params.handleCopyCase
  };

  const collectionContentProps: InterfaceCollectionContentProps = {
    action: params.action,
    projectId: params.projectId,
    selectedColId: params.selectedColId,
    colRows: params.colRows,
    canEdit: params.canEdit,
    autoTestRunning: params.autoTestRunning,
    autoTestReport: params.autoTestReport,
    autoTestRows: params.autoTestRows,
    caseRows: params.caseRows,
    caseListLoading: params.caseListLoading,
    caseEnvProjects: params.caseEnvProjects,
    selectedRunEnvByProject: params.selectedRunEnvByProject,
    autoTestResultMap: params.autoTestResultMap,
    onSetRunEnv: (projectId: number, envName: string) =>
      params.setSelectedRunEnvByProject(prev => ({
        ...prev,
        [projectId]: envName
      })),
    onOpenAddCase: () => params.setAddCaseOpen(true),
    onOpenImportInterface: () => params.openImportInterfaceModal(params.selectedColId),
    onOpenEditCollection: currentCol => params.openColModal('edit', currentCol || undefined),
    onOpenCommonSetting: currentCol => params.openCommonSettingModal(currentCol || undefined),
    onRunAutoTestInCollection: () => {
      void params.runAutoTestInPage();
    },
    onViewReport: () => params.openAutoTest('html'),
    onDownloadReport: () => params.openAutoTest('html', true),
    onOpenReportModal: () => params.setAutoTestModalOpen(true),
    onOpenReportDetail: item => {
      params.setAutoTestDetailItem(item as AutoTestResultItem);
      params.setAutoTestModalOpen(false);
    },
    onNavigateCase: nextCaseId =>
      params.navigateWithGuard(`/project/${params.projectId}/interface/case/${nextCaseId}`),
    onRunCaseTest: nextCaseId => {
      void params.runAutoTestInPage(nextCaseId);
    },
    onCopyCase: nextCaseId => {
      void params.handleCopyCase(nextCaseId);
    },
    onDeleteCase: nextCaseId => params.confirmDeleteCase(nextCaseId),
    caseId: params.caseId,
    caseDetailLoading: params.caseDetailLoading,
    caseDetailData: params.caseDetailData,
    autoTestDetailItem: params.autoTestDetailItem,
    upColCaseLoading: params.upColCaseLoading,
    caseForm: params.caseForm,
    caseEnvOptions: params.caseEnvOptions,
    runMethods: RUN_METHODS,
    caseRunMethod: params.caseRequestRunner.method,
    caseRunPath: params.caseRequestRunner.path,
    caseRunQuery: params.caseRequestRunner.query,
    caseRunHeaders: params.caseRequestRunner.headers,
    caseRunBody: params.caseRequestRunner.body,
    caseRunResponse: params.caseRequestRunner.response,
    caseRunLoading: params.caseRequestRunner.loading,
    stringifyPretty,
    onSetCaseRunMethod: params.caseRequestRunner.setMethod,
    onSetCaseRunPath: params.caseRequestRunner.setPath,
    onSetCaseRunQuery: params.caseRequestRunner.setQuery,
    onSetCaseRunHeaders: params.caseRequestRunner.setHeaders,
    onSetCaseRunBody: params.caseRequestRunner.setBody,
    onFormatCaseRunQuery: params.caseRequestRunner.formatQuery,
    onFormatCaseRunHeaders: params.caseRequestRunner.formatHeaders,
    onFormatCaseRunBody: params.caseRequestRunner.formatBody,
    onCopyCaseRunQuery: () => {
      void params.copyText(params.caseRequestRunner.query, 'Query 参数已复制');
    },
    onCopyCaseRunHeaders: () => {
      void params.copyText(params.caseRequestRunner.headers, 'Header 参数已复制');
    },
    onCopyCaseRunBody: () => {
      void params.copyText(params.caseRequestRunner.body, 'Body 参数已复制');
    },
    onCopyCaseRunResponse: () => {
      void params.copyText(params.caseRequestRunner.response, '调试响应已复制');
    },
    onCopyCaseResult: () => params.handleCopyCaseResult(params.caseId),
    onClearCaseRunQuery: params.caseRequestRunner.clearQuery,
    onClearCaseRunHeaders: params.caseRequestRunner.clearHeaders,
    onClearCaseRunBody: params.caseRequestRunner.clearBody,
    onClearCaseRunResponse: params.caseRequestRunner.clearResponse,
    onRunAutoTestInCase: () => {
      void params.runAutoTestInPage(params.caseId);
    },
    onNavigateCollection: () =>
      params.navigateWithGuard(`/project/${params.projectId}/interface/col/${params.selectedColId || ''}`),
    onNavigateInterface: interfaceIdValue =>
      params.navigateWithGuard(`/project/${params.projectId}/interface/api/${interfaceIdValue}`),
    onCopyCurrentCase: () => {
      void params.handleCopyCase(params.caseId);
    },
    onDeleteCurrentCase: () => params.confirmDeleteCase(params.caseId),
    onSaveCase: () => {
      void params.handleSaveCase();
    },
    onRunCaseRequest: detail => {
      void params.handleRunCaseRequest(detail as Record<string, unknown>);
    }
  };

  return {
    collectionMenuProps,
    collectionContentProps
  };
}
