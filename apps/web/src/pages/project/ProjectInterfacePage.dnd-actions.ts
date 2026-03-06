import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { InterfaceDTO } from '../../types/interface-dto';

import type { ColDragItem, MenuDragItem } from './ProjectInterfacePage.types';
import { buildCaseIndexPayload, buildIndexPayload, reorderByCaseId, reorderById } from './ProjectInterfacePage.utils';

type MutationTrigger = (args: any) => { unwrap: () => Promise<any> };

type UseProjectInterfaceDndActionsParams = {
  projectId: number;
  token?: string;
  menuRows: Array<{ _id?: number; list?: InterfaceDTO[] }>;
  colRows: Array<{ _id?: number }>;
  colDisplayRows: Array<{ _id?: number; caseList?: Array<Record<string, unknown>> }>;
  menuDragEnabled: boolean;
  colDragEnabled: boolean;
  draggingMenuItem: MenuDragItem | null;
  draggingColItem: ColDragItem | null;
  setDraggingMenuItem: (value: MenuDragItem | null) => void;
  setDraggingColItem: (value: ColDragItem | null) => void;
  setExpandedColIds: Dispatch<SetStateAction<number[]>>;
  callApi: <T>(promise: Promise<T>, errorText: string) => Promise<T | null>;
  refreshInterfaceMenu: () => Promise<void>;
  refetchInterfaceListSafe: () => Promise<unknown>;
  refetchColList: () => Promise<unknown>;
  refetchCaseList: () => Promise<unknown>;
  updateInterface: MutationTrigger;
  upInterfaceIndex: MutationTrigger;
  upInterfaceCatIndex: MutationTrigger;
  upColCase: MutationTrigger;
  upColCaseIndex: MutationTrigger;
  upColIndex: MutationTrigger;
};

export function useProjectInterfaceDndActions(params: UseProjectInterfaceDndActionsParams) {
  const toggleExpandedCol = useCallback((colId: number) => {
    params.setExpandedColIds(prev => {
      if (prev.includes(colId)) {
        return prev.filter(item => item !== colId);
      }
      return [...prev, colId];
    });
  }, [params]);

  const handleCollectionDragStartCol = useCallback((colId: number) => {
    params.setDraggingColItem({ type: 'col', colId });
  }, [params]);

  const handleCollectionDragStartCase = useCallback((colId: number, caseId: string) => {
    params.setDraggingColItem({ type: 'case', colId, caseId });
  }, [params]);

  const handleCollectionDragEnd = useCallback(() => {
    params.setDraggingColItem(null);
  }, [params]);

  const handleDropOnCat = useCallback(
    async (targetCatId: number) => {
      const drag = params.draggingMenuItem;
      params.setDraggingMenuItem(null);
      if (!params.menuDragEnabled || !drag || targetCatId <= 0) return;

      if (drag.type === 'cat') {
        if (drag.id === targetCatId) return;
        const reordered = reorderById(params.menuRows, drag.id, targetCatId);
        const payload = buildIndexPayload(reordered);
        if (payload.length === 0) return;
        const response = await params.callApi(params.upInterfaceCatIndex(payload).unwrap(), '分类排序失败');
        if (!response) return;
        await params.refreshInterfaceMenu();
        return;
      }

      if (drag.type === 'interface' && drag.catid !== targetCatId) {
        const response = await params.callApi(
          params.updateInterface({
            id: drag.id,
            project_id: params.projectId,
            catid: targetCatId,
            token: params.token
          }).unwrap(),
          '移动接口失败'
        );
        if (!response) return;
        await Promise.all([params.refreshInterfaceMenu(), params.refetchInterfaceListSafe()]);
      }
    },
    [params]
  );

  const handleDropOnInterface = useCallback(
    async (targetCatId: number, targetInterfaceId: number) => {
      const drag = params.draggingMenuItem;
      params.setDraggingMenuItem(null);
      if (!params.menuDragEnabled || !drag || drag.type !== 'interface') return;
      if (targetCatId <= 0 || targetInterfaceId <= 0 || drag.id <= 0) return;
      if (drag.id === targetInterfaceId) return;

      if (drag.catid !== targetCatId) {
        const response = await params.callApi(
          params.updateInterface({
            id: drag.id,
            project_id: params.projectId,
            catid: targetCatId,
            token: params.token
          }).unwrap(),
          '移动接口失败'
        );
        if (!response) return;
        await Promise.all([params.refreshInterfaceMenu(), params.refetchInterfaceListSafe()]);
        return;
      }

      const cat = params.menuRows.find(item => Number(item._id || 0) === targetCatId);
      const list = (cat?.list || []) as InterfaceDTO[];
      if (list.length === 0) return;
      const reordered = reorderById(list, drag.id, targetInterfaceId);
      const payload = buildIndexPayload(reordered);
      if (payload.length === 0) return;
      const response = await params.callApi(params.upInterfaceIndex(payload).unwrap(), '接口排序失败');
      if (!response) return;
      await Promise.all([params.refreshInterfaceMenu(), params.refetchInterfaceListSafe()]);
    },
    [params]
  );

  const handleDropOnCol = useCallback(
    async (targetColId: number) => {
      const drag = params.draggingColItem;
      params.setDraggingColItem(null);
      if (!params.colDragEnabled || !drag || targetColId <= 0) return;

      if (drag.type === 'col') {
        if (drag.colId === targetColId) return;
        const reordered = reorderById(params.colRows, drag.colId, targetColId);
        const payload = buildIndexPayload(reordered);
        if (payload.length === 0) return;
        const response = await params.callApi(params.upColIndex(payload).unwrap(), '测试集合排序失败');
        if (!response) return;
        await params.refetchColList();
        return;
      }

      if (drag.type === 'case' && drag.colId !== targetColId) {
        const response = await params.callApi(
          params.upColCase({
            id: drag.caseId,
            col_id: targetColId,
            token: params.token
          }).unwrap(),
          '移动测试用例失败'
        );
        if (!response) return;
        await Promise.all([params.refetchColList(), params.refetchCaseList()]);
      }
    },
    [params]
  );

  const handleDropOnCase = useCallback(
    async (targetColId: number, targetCaseId: string) => {
      const drag = params.draggingColItem;
      params.setDraggingColItem(null);
      if (!params.colDragEnabled || !drag || drag.type !== 'case') return;
      if (!targetCaseId || drag.caseId === targetCaseId) return;

      if (drag.colId !== targetColId) {
        const moveResponse = await params.callApi(
          params.upColCase({
            id: drag.caseId,
            col_id: targetColId,
            token: params.token
          }).unwrap(),
          '移动测试用例失败'
        );
        if (!moveResponse) return;
        await Promise.all([params.refetchColList(), params.refetchCaseList()]);
        return;
      }

      const col = params.colDisplayRows.find(item => Number(item._id || 0) === targetColId);
      const sourceCases = (col?.caseList || []).map(item => ({ ...item, _id: String(item._id || '') }));
      if (sourceCases.length === 0) return;
      const reordered = reorderByCaseId(sourceCases, drag.caseId, targetCaseId);
      const payload = buildCaseIndexPayload(reordered).map(item => ({
        ...item,
        col_id: targetColId
      }));
      if (payload.length === 0) return;
      const response = await params.callApi(params.upColCaseIndex(payload).unwrap(), '测试用例排序失败');
      if (!response) return;
      await Promise.all([params.refetchColList(), params.refetchCaseList()]);
    },
    [params]
  );

  return {
    toggleExpandedCol,
    handleCollectionDragStartCol,
    handleCollectionDragStartCase,
    handleCollectionDragEnd,
    handleDropOnCat,
    handleDropOnInterface,
    handleDropOnCol,
    handleDropOnCase
  };
}
