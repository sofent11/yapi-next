import { useCallback, useMemo } from 'react';
import { notifications } from '@mantine/notifications';
import type { InterfaceTreeNode } from '@yapi-next/shared-types';
import type { InterfaceDTO } from '../../types/interface-dto';

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
  useGetListMenuQuery,
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
import type {
  AutoTestReport,
  ColDragItem,
  MenuDragItem,
  ProjectInterfacePageProps
} from './ProjectInterfacePage.types';
import {
  STABLE_EMPTY_ARRAY,
  INTERFACE_LIST_PAGE_LIMIT,
  TREE_CATEGORY_LIMIT,
  TREE_NODE_PAGE_LIMIT,
  fetchAllCatInterfaces,
  toRecord
} from './ProjectInterfacePage.utils';
import {
  useProjectInterfaceApiSection,
  useProjectInterfaceCollectionSection
} from './ProjectInterfacePage.section-hooks';

const message = {
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  }
};

type UseProjectInterfaceDataParams = {
  props: ProjectInterfacePageProps;
  action: string;
  interfaceId: number;
  catId: number;
  colIdFromRoute: number;
  caseId: string;
  addCaseOpen: boolean;
  importModalOpen: boolean;
  importProjectId: number;
  menuKeyword: string;
  listKeyword: string;
  statusFilter: 'all' | 'done' | 'undone';
  colKeyword: string;
  catInterfaceMap: Record<number, InterfaceDTO[]>;
  catLoadingMap: Record<number, boolean>;
  importCatInterfaceMap: Record<number, InterfaceDTO[]>;
  importCatLoadingMap: Record<number, boolean>;
  importSelectedRowKeys: Array<string | number>;
  autoTestReport: AutoTestReport | null;
  catLoadingRef: React.MutableRefObject<Record<number, boolean>>;
  catLoadedRef: React.MutableRefObject<Record<number, boolean>>;
  importCatLoadingRef: React.MutableRefObject<Record<number, boolean>>;
  importCatLoadedRef: React.MutableRefObject<Record<number, boolean>>;
  setCatInterfaceMap: React.Dispatch<React.SetStateAction<Record<number, InterfaceDTO[]>>>;
  setCatLoadingMap: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  setImportCatInterfaceMap: React.Dispatch<React.SetStateAction<Record<number, InterfaceDTO[]>>>;
  setImportCatLoadingMap: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
};

export function useProjectInterfaceData(params: UseProjectInterfaceDataParams) {
  const shouldFetchGlobalInterfaceList =
    params.action === 'api' &&
    (params.menuKeyword.trim().length > 0 || (params.catId <= 0 && params.interfaceId <= 0));

  const treeQuery = useGetInterfaceTreeQuery(
    {
      projectId: params.props.projectId,
      token: params.props.token,
      page: 1,
      limit: TREE_CATEGORY_LIMIT,
      includeList: false,
      detail: 'summary'
    },
    { skip: params.props.projectId <= 0 || params.action !== 'api' }
  );
  const [fetchInterfaceTreeNode] = useLazyGetInterfaceTreeNodeQuery();

  const listQuery = useGetInterfaceListQuery(
    {
      projectId: params.props.projectId,
      token: params.props.token,
      page: 1,
      limit: INTERFACE_LIST_PAGE_LIMIT
    },
    { skip: params.props.projectId <= 0 || (!params.addCaseOpen && !shouldFetchGlobalInterfaceList) }
  );
  const menuSearchQuery = useGetListMenuQuery(
    {
      projectId: params.props.projectId,
      token: params.props.token,
      detail: 'full'
    },
    { skip: params.props.projectId <= 0 || params.action !== 'api' }
  );

  const detailQuery = useGetInterfaceQuery(
    {
      id: params.interfaceId,
      projectId: params.props.projectId,
      token: params.props.token
    },
    { skip: params.interfaceId <= 0 || params.action !== 'api' }
  );

  const catMenuQuery = useGetCatMenuQuery(
    { projectId: params.props.projectId, token: params.props.token },
    { skip: params.props.projectId <= 0 || params.action !== 'api' }
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
    { project_id: params.props.projectId, token: params.props.token },
    { skip: params.props.projectId <= 0 || params.action === 'api' }
  );

  const caseDetailQuery = useGetColCaseQuery(
    { caseid: params.caseId, token: params.props.token },
    { skip: params.action !== 'case' || !params.caseId }
  );

  const selectedColId = useMemo(() => {
    if (params.action === 'col' && params.colIdFromRoute > 0) return params.colIdFromRoute;
    if (params.action === 'case') {
      const maybeColId = Number(
        (caseDetailQuery.data?.data as Record<string, unknown> | undefined)?.col_id || 0
      );
      if (maybeColId > 0) return maybeColId;
    }
    return 0;
  }, [caseDetailQuery.data, params.action, params.colIdFromRoute]);

  const caseListQuery = useGetColCaseListQuery(
    { col_id: selectedColId, token: params.props.token },
    { skip: selectedColId <= 0 || params.action === 'api' }
  );

  const caseEnvListQuery = useGetColCaseEnvListQuery(
    { col_id: selectedColId, token: params.props.token },
    { skip: selectedColId <= 0 || params.action === 'api' }
  );

  const projectTokenQuery = useGetProjectTokenQuery(
    { projectId: params.props.projectId },
    { skip: params.props.projectId <= 0 }
  );

  const projectListQuery = useGetProjectListQuery(
    { groupId: Number(params.props.projectGroupId || 0) },
    { skip: Number(params.props.projectGroupId || 0) <= 0 || !params.importModalOpen }
  );

  const importTreeQuery = useGetInterfaceTreeQuery(
    {
      projectId: params.importProjectId,
      token: params.props.token,
      page: 1,
      limit: TREE_CATEGORY_LIMIT,
      includeList: false,
      detail: 'summary'
    },
    { skip: params.importProjectId <= 0 || !params.importModalOpen }
  );
  const [fetchImportTreeNode] = useLazyGetInterfaceTreeNodeQuery();

  const allInterfaces = (listQuery.data?.data?.list || STABLE_EMPTY_ARRAY) as InterfaceDTO[];
  const treeRows = (treeQuery.data?.data?.list || STABLE_EMPTY_ARRAY) as InterfaceTreeNode[];
  const menuSearchRows = (menuSearchQuery.data?.data || STABLE_EMPTY_ARRAY) as InterfaceTreeNode[];
  const catRows = (catMenuQuery.data?.data || STABLE_EMPTY_ARRAY) as Array<{ _id: number; name: string; desc?: string }>;
  const currentInterface = (detailQuery.data?.data || null) as InterfaceDTO | null;
  const colRows = (colListQuery.data?.data || STABLE_EMPTY_ARRAY) as any[];
  const caseRows = (caseListQuery.data?.data || STABLE_EMPTY_ARRAY) as any[];
  const canEdit = /(admin|owner|dev)/.test(String(params.props.projectRole || ''));
  const importProjectRows = (projectListQuery.data?.data?.list || STABLE_EMPTY_ARRAY).filter(
    (item: any) => Number(item._id || 0) !== params.props.projectId
  );
  const importTreeRows = (importTreeQuery.data?.data?.list || STABLE_EMPTY_ARRAY) as InterfaceTreeNode[];
  const caseInterfaceTotal = Number(listQuery.data?.data?.total || 0);
  const caseEnvProjects = (caseEnvListQuery.data?.data || STABLE_EMPTY_ARRAY) as any[];
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
    menuSearchRows,
    catInterfaceMap: params.catInterfaceMap,
    catRows,
    catId: params.catId,
    catLoadingMap: params.catLoadingMap,
    listKeyword: params.listKeyword,
    statusFilter: params.statusFilter,
    menuKeyword: params.menuKeyword,
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
    colKeyword: params.colKeyword,
    canEdit,
    importProjectRows,
    projectId: params.props.projectId,
    importTreeRows,
    importCatInterfaceMap: params.importCatInterfaceMap,
    importCatLoadingMap: params.importCatLoadingMap,
    importSelectedRowKeys: params.importSelectedRowKeys,
    allInterfaces,
    caseInterfaceTotal,
    autoTestReport: params.autoTestReport,
    caseEnvProjects,
    caseDetailProjectId
  });

  const loadCatInterfaces = useCallback(
    async (catid: number, force = false) => {
      const catIdNum = Number(catid || 0);
      if (catIdNum <= 0) return;
      if (!force && params.catLoadedRef.current[catIdNum]) return;
      if (params.catLoadingRef.current[catIdNum]) return;

      params.catLoadingRef.current[catIdNum] = true;
      params.setCatLoadingMap(prev => ({ ...prev, [catIdNum]: true }));
      try {
        const merged = await fetchAllCatInterfaces(
          page =>
            fetchInterfaceTreeNode(
              {
                catid: catIdNum,
                token: params.props.token,
                page,
                limit: TREE_NODE_PAGE_LIMIT,
                detail: 'full'
              },
              true
            ).unwrap(),
          '加载分类接口失败'
        );
        params.setCatInterfaceMap(prev => ({ ...prev, [catIdNum]: merged }));
        params.catLoadedRef.current[catIdNum] = true;
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载分类接口失败');
      } finally {
        params.catLoadingRef.current[catIdNum] = false;
        params.setCatLoadingMap(prev => ({ ...prev, [catIdNum]: false }));
      }
    },
    [fetchInterfaceTreeNode, params]
  );

  const refreshInterfaceMenu = useCallback(async () => {
    params.catLoadingRef.current = {};
    params.catLoadedRef.current = {};
    params.setCatInterfaceMap({});
    params.setCatLoadingMap({});
    await Promise.all([treeQuery.refetch(), catMenuQuery.refetch()]);
  }, [catMenuQuery, params, treeQuery]);

  const refetchInterfaceListSafe = useCallback(async () => {
    if (params.addCaseOpen || shouldFetchGlobalInterfaceList) {
      await listQuery.refetch();
    }
  }, [listQuery, params.addCaseOpen, shouldFetchGlobalInterfaceList]);

  const loadImportCatInterfaces = useCallback(
    async (catid: number, options?: { force?: boolean; notifyError?: boolean }) => {
      const catIdNum = Number(catid || 0);
      if (catIdNum <= 0) return;
      const force = options?.force === true;
      if (
        !force &&
        (params.importCatLoadedRef.current[catIdNum] || params.importCatLoadingRef.current[catIdNum])
      ) {
        return;
      }
      params.importCatLoadingRef.current[catIdNum] = true;
      params.setImportCatLoadingMap(prev => ({ ...prev, [catIdNum]: true }));
      try {
        const merged = await fetchAllCatInterfaces(
          page =>
            fetchImportTreeNode(
              {
                catid: catIdNum,
                token: params.props.token,
                page,
                limit: TREE_NODE_PAGE_LIMIT,
                detail: 'full'
              },
              true
            ).unwrap(),
          '加载导入接口失败'
        );
        params.setImportCatInterfaceMap(prev => ({ ...prev, [catIdNum]: merged }));
        params.importCatLoadedRef.current[catIdNum] = true;
      } catch (err) {
        if (options?.notifyError !== false) {
          message.error(err instanceof Error ? err.message : '加载导入接口失败');
        }
      } finally {
        params.importCatLoadingRef.current[catIdNum] = false;
        params.setImportCatLoadingMap(prev => ({ ...prev, [catIdNum]: false }));
      }
    },
    [fetchImportTreeNode, params]
  );

  const interfaceTabs = useMemo<Record<string, InterfaceTabItem>>(() => {
    const tabs: Record<string, InterfaceTabItem> = {
      view: { name: '预览' },
      edit: { name: '编辑' },
      run: { name: '运行' }
    };
    webPlugins.applyInterfaceTabs(tabs, {
      projectId: params.props.projectId,
      interfaceData: toRecord(currentInterface)
    });
    return tabs;
  }, [currentInterface, params.props.projectId]);

  const projectTagOptions = useMemo(
    () =>
      (params.props.projectTag || [])
        .map(item => String(item.name || '').trim())
        .filter(Boolean)
        .map(item => ({ label: item, value: item })),
    [params.props.projectTag]
  );

  const projectTokenValue = String(projectTokenQuery.data?.data || '');

  return {
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
    allInterfaces,
    treeRows,
    catRows,
    currentInterface,
    colRows,
    caseRows,
    canEdit,
    importProjectRows,
    importTreeRows,
    caseInterfaceTotal,
    caseEnvProjects,
    caseDetailProjectId,
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
  };
}
