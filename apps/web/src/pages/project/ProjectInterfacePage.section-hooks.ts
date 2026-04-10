import { useMemo } from 'react';
import type { InterfaceTreeNode } from '@yapi-next/shared-types';
import type { InterfaceDTO } from '../../types/interface-dto';

import type {
  AutoTestResultItem,
  CaseEnvProjectItem,
  ImportInterfaceRow
} from './ProjectInterfacePage.types';
import { STABLE_EMPTY_ARRAY } from './ProjectInterfacePage.utils';

type CategoryRow = {
  _id: number;
  name: string;
  desc?: string;
};

type CollectionRow = Record<string, unknown>;

type ApiSectionParams = {
  allInterfaces: InterfaceDTO[];
  treeRows: InterfaceTreeNode[];
  menuSearchRows: InterfaceTreeNode[];
  catInterfaceMap: Record<number, InterfaceDTO[]>;
  catRows: CategoryRow[];
  catId: number;
  catLoadingMap: Record<number, boolean>;
  listKeyword: string;
  statusFilter: 'all' | 'done' | 'undone';
  menuKeyword: string;
  canEdit: boolean;
  listLoading: boolean;
  listFetching: boolean;
};

export function useProjectInterfaceApiSection(params: ApiSectionParams) {
  const matchesInterfaceKeyword = (item: Pick<InterfaceDTO, 'title' | 'path' | 'desc'>, keyword: string) => {
    if (!keyword) return true;
    const title = String(item.title || '').toLowerCase();
    const path = String(item.path || '').toLowerCase();
    const desc = String(item.desc || '').toLowerCase();
    return title.includes(keyword) || path.includes(keyword) || desc.includes(keyword);
  };

  const allInterfaceMapByCat = useMemo(() => {
    const map = new Map<number, InterfaceDTO[]>();
    params.allInterfaces.forEach(item => {
      const key = Number(item.catid || 0);
      if (key <= 0) return;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)?.push(item);
    });
    return map;
  }, [params.allInterfaces]);

  const menuRows = useMemo<InterfaceTreeNode[]>(
    () =>
      params.treeRows.map(cat => {
        const catIdNum = Number(cat._id || 0);
        return {
          ...cat,
          list: params.catInterfaceMap[catIdNum] || []
        };
      }),
    [params.catInterfaceMap, params.treeRows]
  );

  const currentList = useMemo(() => {
    if (params.catId > 0) {
      return params.catInterfaceMap[params.catId] || STABLE_EMPTY_ARRAY;
    }
    return params.allInterfaces;
  }, [params.allInterfaces, params.catId, params.catInterfaceMap]);

  const filteredList = useMemo(() => {
    let rows = [...currentList];
    if (params.statusFilter !== 'all') {
      rows = rows.filter(item => String(item.status || 'undone') === params.statusFilter);
    }
    const keyword = params.listKeyword.trim().toLowerCase();
    if (keyword) {
      rows = rows.filter(item => matchesInterfaceKeyword(item, keyword));
    }
    return rows;
  }, [currentList, params.listKeyword, params.statusFilter]);

  const currentListLoading =
    params.catId > 0
      ? params.catLoadingMap[params.catId] === true
      : Boolean(params.listLoading || params.listFetching);

  const currentCatName = useMemo(() => {
    if (!params.catId) return '全部接口';
    const found = params.catRows.find(item => Number(item._id) === params.catId);
    return found?.name || `分类 ${params.catId}`;
  }, [params.catId, params.catRows]);

  const currentCat = useMemo(
    () => params.catRows.find(item => Number(item._id || 0) === params.catId) || null,
    [params.catId, params.catRows]
  );

  const catSelectOptions = useMemo(
    () =>
      params.catRows.map(item => ({
        label: item.name,
        value: Number(item._id || 0)
      })),
    [params.catRows]
  );

  const filteredMenuRows = useMemo(() => {
    const keyword = params.menuKeyword.trim().toLowerCase();
    if (!keyword) return menuRows;
    const keywordSourceRows = params.menuSearchRows.length > 0 ? params.menuSearchRows : menuRows;
    return keywordSourceRows
      .map(cat => {
        const catIdNum = Number(cat._id || 0);
        const catName = String(cat.name || '').toLowerCase();
        const catDesc = String(cat.desc || '').toLowerCase();
        const sourceList = cat.list || allInterfaceMapByCat.get(catIdNum) || [];
        const list = sourceList.filter(item => matchesInterfaceKeyword(item, keyword));
        if (catName.includes(keyword) || catDesc.includes(keyword)) {
          return { ...cat, list: sourceList };
        }
        if (list.length > 0) {
          return { ...cat, list };
        }
        return null;
      })
      .filter(Boolean) as InterfaceTreeNode[];
  }, [allInterfaceMapByCat, menuRows, params.menuKeyword, params.menuSearchRows]);

  const menuDragEnabled = params.canEdit && params.menuKeyword.trim().length === 0;

  const menuDisplayRows = useMemo(
    () => (params.menuKeyword.trim().length > 0 ? filteredMenuRows : menuRows),
    [filteredMenuRows, params.menuKeyword, menuRows]
  );

  return {
    allInterfaceMapByCat,
    menuRows,
    filteredList,
    currentListLoading,
    currentCatName,
    currentCat,
    catSelectOptions,
    menuDragEnabled,
    menuDisplayRows
  };
}

type CollectionSectionParams = {
  colRows: CollectionRow[];
  caseRows: CollectionRow[];
  selectedColId: number;
  colKeyword: string;
  canEdit: boolean;
  importProjectRows: CollectionRow[];
  projectId: number;
  importTreeRows: InterfaceTreeNode[];
  importCatInterfaceMap: Record<number, InterfaceDTO[]>;
  importCatLoadingMap: Record<number, boolean>;
  importSelectedRowKeys: Array<string | number>;
  allInterfaces: InterfaceDTO[];
  caseInterfaceTotal: number;
  autoTestReport: { list?: AutoTestResultItem[] } | null;
  caseEnvProjects: CaseEnvProjectItem[];
  caseDetailProjectId: number;
};

export function useProjectInterfaceCollectionSection(params: CollectionSectionParams) {
  const colDragEnabled = params.canEdit && params.colKeyword.trim().length === 0;

  const colDisplayRows = useMemo(() => {
    const keyword = params.colKeyword.trim().toLowerCase();
    return params.colRows.map(col => {
      const colId = Number(col._id || 0);
      const sourceCaseList =
        Array.isArray(col.caseList) && col.caseList.length > 0
          ? col.caseList
          : params.selectedColId === colId
            ? params.caseRows
            : [];
      if (!keyword) {
        return { ...col, caseList: sourceCaseList };
      }
      const filteredCaseList = sourceCaseList.filter(item => {
        const name = String(item.casename || '').toLowerCase();
        const path = String(item.path || '').toLowerCase();
        return name.includes(keyword) || path.includes(keyword);
      });
      return { ...col, caseList: filteredCaseList };
    });
  }, [params.caseRows, params.colKeyword, params.colRows, params.selectedColId]);

  const importMenuRows = useMemo<InterfaceTreeNode[]>(
    () =>
      params.importTreeRows.map(cat => {
        const catIdNum = Number(cat._id || 0);
        return {
          ...cat,
          list: params.importCatInterfaceMap[catIdNum] || []
        };
      }),
    [params.importCatInterfaceMap, params.importTreeRows]
  );

  const importTableRows = useMemo<ImportInterfaceRow[]>(() => {
    return importMenuRows.map(cat => ({
      key: `category_${cat._id}`,
      id: Number(cat._id || 0),
      title: String(cat.name || ''),
      isCategory: true,
      children: (cat.list || []).map(item => ({
        key: `interface_${item._id}`,
        id: Number(item._id || 0),
        title: String(item.title || ''),
        path: String(item.path || ''),
        method: String(item.method || '').toUpperCase(),
        status: String(item.status || 'undone'),
        isCategory: false
      }))
    }));
  }, [importMenuRows]);

  const importLoading = useMemo(
    () => Object.values(params.importCatLoadingMap).some(Boolean),
    [params.importCatLoadingMap]
  );

  const selectedImportInterfaceIds = useMemo(
    () =>
      params.importSelectedRowKeys
        .map(item => String(item))
        .filter(item => item.startsWith('interface_'))
        .map(item => Number(item.slice('interface_'.length)))
        .filter(item => Number.isFinite(item) && item > 0),
    [params.importSelectedRowKeys]
  );

  const importProjectOptions = useMemo(() => {
    const options = params.importProjectRows.map(item => ({
      label: String(item.name || ''),
      value: Number(item._id || 0)
    }));
    if (!options.find(item => item.value === params.projectId)) {
      options.unshift({
        label: `当前项目(${params.projectId})`,
        value: params.projectId
      });
    }
    return options;
  }, [params.importProjectRows, params.projectId]);

  const caseInterfaceOptions = useMemo(
    () =>
      params.allInterfaces.map(item => ({
        value: Number(item._id || 0),
        label: `[${String(item.method || 'GET').toUpperCase()}] ${item.title || item.path || item._id}`,
        title: item.title || '',
        path: item.path || ''
      })),
    [params.allInterfaces]
  );

  const caseInterfaceTruncated = useMemo(
    () =>
      params.caseInterfaceTotal > 0 &&
      caseInterfaceOptions.length > 0 &&
      params.caseInterfaceTotal > caseInterfaceOptions.length,
    [caseInterfaceOptions.length, params.caseInterfaceTotal]
  );

  const autoTestRows = (params.autoTestReport?.list || STABLE_EMPTY_ARRAY) as AutoTestResultItem[];

  const autoTestResultMap = useMemo(() => {
    const map = new Map<string, AutoTestResultItem>();
    autoTestRows.forEach(item => {
      const id = String(item.id || '');
      if (id) map.set(id, item);
    });
    return map;
  }, [autoTestRows]);

  const caseEnvOptions = useMemo(() => {
    if (params.caseDetailProjectId <= 0 || !Array.isArray(params.caseEnvProjects)) return [];
    const project = params.caseEnvProjects.find(item => Number(item?._id || 0) === params.caseDetailProjectId);
    if (!project || !Array.isArray(project.env)) return [];
    return project.env
      .map(item => String(item?.name || '').trim())
      .filter(Boolean)
      .map(name => ({ label: name, value: name }));
  }, [params.caseDetailProjectId, params.caseEnvProjects]);

  return {
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
  };
}
