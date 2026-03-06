import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { FormInstance } from 'antd';
import type { NavigateFunction } from 'react-router-dom';
import json5 from 'json5';
import type { LegacyInterfaceDTO } from '@yapi-next/shared-types';

import { generateMockStringFromJsonSchema } from '../../utils/schema-mock';
import type {
  AddCaseForm,
  AutoTestResultItem,
  CaseEditForm,
  CaseEnvProjectItem,
  EditConflictState,
  EditForm
} from './ProjectInterfacePage.types';
import {
  buildReqParamsByPath,
  normalizeCaseHeaderMap,
  normalizeCaseParamMap,
  sanitizeReqParams,
  supportsRequestBody
} from './ProjectInterfacePage.utils';

type UseProjectInterfaceMenuSyncEffectsParams = {
  action: string;
  catId: number;
  expandedCatIds: number[];
  menuRows: Array<{ _id?: number }>;
  projectId: number;
  colRows: Array<{ _id?: number }>;
  selectedColId: number;
  colKeyword: string;
  importModalOpen: boolean;
  importProjectId: number;
  importTreeRows: Array<{ _id?: number }>;
  addCaseOpen: boolean;
  caseInterfaceOptions: Array<{ value?: number | string }>;
  caseEnvProjects: CaseEnvProjectItem[];
  setExpandedCatIds: Dispatch<SetStateAction<number[]>>;
  loadCatInterfaces: (catid: number) => Promise<void>;
  catLoadingRef: MutableRefObject<Record<number, boolean>>;
  catLoadedRef: MutableRefObject<Record<number, boolean>>;
  setCatInterfaceMap: Dispatch<SetStateAction<Record<number, LegacyInterfaceDTO[]>>>;
  setCatLoadingMap: Dispatch<SetStateAction<Record<number, boolean>>>;
  setExpandedColIds: Dispatch<SetStateAction<number[]>>;
  setImportProjectId: (value: number) => void;
  importCatLoadingRef: MutableRefObject<Record<number, boolean>>;
  importCatLoadedRef: MutableRefObject<Record<number, boolean>>;
  setImportCatInterfaceMap: Dispatch<SetStateAction<Record<number, LegacyInterfaceDTO[]>>>;
  setImportCatLoadingMap: Dispatch<SetStateAction<Record<number, boolean>>>;
  loadImportCatInterfaces: (catid: number, options?: { force?: boolean; notifyError?: boolean }) => Promise<void>;
  addCaseForm: FormInstance<AddCaseForm>;
  setSelectedRunEnvByProject: Dispatch<SetStateAction<Record<number, string>>>;
};

export function useProjectInterfaceMenuSyncEffects(params: UseProjectInterfaceMenuSyncEffectsParams) {
  useEffect(() => {
    if (params.menuRows.length === 0) {
      params.setExpandedCatIds([]);
      return;
    }
    params.setExpandedCatIds(prev => {
      const validCatIds = new Set(
        params.menuRows.map(cat => Number(cat._id || 0)).filter(id => Number.isFinite(id) && id > 0)
      );
      const kept = prev.filter(id => validCatIds.has(id));
      if (params.catId > 0 && validCatIds.has(params.catId) && !kept.includes(params.catId)) {
        kept.push(params.catId);
      }
      return kept;
    });
  }, [params.catId, params.menuRows, params.setExpandedCatIds]);

  useEffect(() => {
    if (params.action !== 'api') return;
    const targets = new Set<number>();
    if (params.catId > 0) {
      targets.add(params.catId);
    }
    params.expandedCatIds.forEach(id => {
      if (id > 0) targets.add(id);
    });
    const queue = Array.from(targets);
    if (queue.length === 0) return;
    let cancelled = false;
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (!cancelled) {
        const nextId = queue.shift();
        if (!nextId) return;
        await params.loadCatInterfaces(nextId);
      }
    });
    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
  }, [params.action, params.catId, params.expandedCatIds, params.loadCatInterfaces]);

  useEffect(() => {
    params.catLoadingRef.current = {};
    params.catLoadedRef.current = {};
    params.setCatInterfaceMap({});
    params.setCatLoadingMap({});
  }, [params.projectId, params.catLoadedRef, params.catLoadingRef, params.setCatInterfaceMap, params.setCatLoadingMap]);

  useEffect(() => {
    if (params.colRows.length === 0) {
      params.setExpandedColIds([]);
      return;
    }
    params.setExpandedColIds(prev => {
      const next = new Set(prev);
      params.colRows.forEach(col => {
        const id = Number(col._id || 0);
        if (id > 0 && !next.has(id)) next.add(id);
      });
      if (params.selectedColId > 0) next.add(params.selectedColId);
      return Array.from(next);
    });
  }, [params.colRows, params.selectedColId, params.setExpandedColIds]);

  useEffect(() => {
    if (!params.colKeyword.trim()) return;
    params.setExpandedColIds(params.colRows.map(item => Number(item._id || 0)).filter(id => id > 0));
  }, [params.colKeyword, params.colRows, params.setExpandedColIds]);

  useEffect(() => {
    if (!params.importModalOpen) return;
    if (params.importProjectId > 0) return;
    params.setImportProjectId(params.projectId);
  }, [params.importModalOpen, params.importProjectId, params.projectId, params.setImportProjectId]);

  useEffect(() => {
    params.importCatLoadingRef.current = {};
    params.importCatLoadedRef.current = {};
    params.setImportCatInterfaceMap({});
    params.setImportCatLoadingMap({});
  }, [
    params.importModalOpen,
    params.importProjectId,
    params.importCatLoadedRef,
    params.importCatLoadingRef,
    params.setImportCatInterfaceMap,
    params.setImportCatLoadingMap
  ]);

  useEffect(() => {
    if (!params.importModalOpen || params.importProjectId <= 0 || params.importTreeRows.length === 0) return;
    let cancelled = false;
    const run = async () => {
      const catIds = params.importTreeRows
        .map(cat => Number(cat._id || 0))
        .filter(catIdNum => catIdNum > 0);
      const queue = [...catIds];
      const concurrency = Math.min(4, queue.length);
      const workers = Array.from({ length: concurrency }, async () => {
        while (!cancelled) {
          const nextCatId = queue.shift();
          if (!nextCatId) return;
          await params.loadImportCatInterfaces(nextCatId, { notifyError: false });
        }
      });
      await Promise.all(workers);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [params.importModalOpen, params.importProjectId, params.importTreeRows, params.loadImportCatInterfaces]);

  useEffect(() => {
    if (!params.addCaseOpen) return;
    const firstInterfaceId = Number(params.caseInterfaceOptions[0]?.value || 0);
    params.addCaseForm.setFieldsValue({
      interface_id: firstInterfaceId > 0 ? firstInterfaceId : undefined,
      casename: '',
      case_env: ''
    });
  }, [params.addCaseForm, params.addCaseOpen, params.caseInterfaceOptions]);

  useEffect(() => {
    if (!Array.isArray(params.caseEnvProjects) || params.caseEnvProjects.length === 0) return;
    params.setSelectedRunEnvByProject(prev => {
      const next = { ...prev };
      params.caseEnvProjects.forEach(item => {
        const projectId = Number(item._id || 0);
        if (projectId <= 0) return;
        if (typeof next[projectId] === 'string') return;
        const firstEnvName = String(item.env?.[0]?.name || '');
        next[projectId] = firstEnvName;
      });
      return next;
    });
  }, [params.caseEnvProjects, params.setSelectedRunEnvByProject]);
}

type UseProjectInterfacePageSyncEffectsParams = {
  action: string;
  projectId: number;
  catId: number;
  listKeyword: string;
  statusFilter: 'all' | 'done' | 'undone';
  caseId: string;
  colIdFromRoute: number;
  interfaceId: number;
  currentInterface: LegacyInterfaceDTO | null;
  selectedColId: number;
  colRows: any[];
  caseDetailData: Record<string, unknown> | null;
  navigate: NavigateFunction;
  setListPage: Dispatch<SetStateAction<number>>;
  setAutoTestDetailItem: Dispatch<SetStateAction<AutoTestResultItem | null>>;
};

export function useProjectInterfacePageSyncEffects(params: UseProjectInterfacePageSyncEffectsParams) {
  useEffect(() => {
    if (params.action !== 'api' && params.action !== 'col' && params.action !== 'case') {
      params.navigate(`/project/${params.projectId}/interface/api`, { replace: true });
    }
  }, [params.action, params.navigate, params.projectId]);

  useEffect(() => {
    params.setListPage(1);
  }, [params.action, params.catId, params.listKeyword, params.setListPage, params.statusFilter]);

  useEffect(() => {
    if (params.action !== 'case') {
      params.setAutoTestDetailItem(null);
      return;
    }
    params.setAutoTestDetailItem(prev => {
      if (!prev) return null;
      return String(prev.id || '') === String(params.caseId || '') ? prev : null;
    });
  }, [params.action, params.caseId, params.setAutoTestDetailItem]);

  useEffect(() => {
    if (params.action !== 'col') return;
    if (params.colIdFromRoute > 0) return;
    if (!Array.isArray(params.colRows) || params.colRows.length === 0) return;
    const first = Number(params.colRows[0]?._id || 0);
    if (first > 0) {
      params.navigate(`/project/${params.projectId}/interface/col/${first}`, { replace: true });
    }
  }, [params.action, params.colIdFromRoute, params.colRows, params.navigate, params.projectId]);

  useEffect(() => {
    const baseTitle = 'YApi';
    if (params.action === 'api' && params.interfaceId > 0 && params.currentInterface) {
      const title = String(params.currentInterface.title || params.currentInterface.path || params.interfaceId);
      document.title = `${title} - ${baseTitle}`;
      return;
    }
    if (params.action === 'col') {
      const currentCol = params.colRows.find(item => Number(item._id || 0) === params.selectedColId);
      const name = String(currentCol?.name || `测试集合 ${params.selectedColId || ''}` || '').trim();
      document.title = `${name || '测试集合'} - ${baseTitle}`;
      return;
    }
    if (params.action === 'case') {
      const caseName = String(params.caseDetailData?.casename || '测试用例');
      document.title = `${caseName} - ${baseTitle}`;
      return;
    }
    document.title = baseTitle;
  }, [
    params.action,
    params.caseDetailData,
    params.colRows,
    params.currentInterface,
    params.interfaceId,
    params.selectedColId
  ]);
}

type UseProjectInterfaceEditSyncEffectsParams = {
  action: string;
  interfaceId: number;
  tab: string;
  currentInterface: LegacyInterfaceDTO | null;
  basepath?: string;
  watchedValues: EditForm;
  reqRadioType: 'req-body' | 'req-query' | 'req-headers';
  form: FormInstance<EditForm>;
  caseForm: FormInstance<CaseEditForm>;
  caseDetailData: Record<string, unknown> | null;
  buildEditFormValues: (source: LegacyInterfaceDTO | null) => EditForm;
  serializeEditValues: (values: EditForm | undefined) => string;
  resetInterfaceRequestRunner: (value: {
    method?: string;
    path?: string;
    query?: string;
    headers?: string;
    body?: string;
  }) => void;
  resetCaseRequestRunner: (value: {
    method?: string;
    path?: string;
    query?: string;
    headers?: string;
    body?: string;
  }) => void;
  setEditConflictState: Dispatch<SetStateAction<EditConflictState>>;
  setReqRadioType: Dispatch<SetStateAction<'req-body' | 'req-query' | 'req-headers'>>;
  setEditBaseline: (value: string) => void;
  setResEditorTab: Dispatch<SetStateAction<'tpl' | 'preview'>>;
  setResPreviewText: Dispatch<SetStateAction<string>>;
  setReqSchemaEditorMode: Dispatch<SetStateAction<'text' | 'visual'>>;
  setResSchemaEditorMode: Dispatch<SetStateAction<'text' | 'visual'>>;
};

export function useProjectInterfaceEditSyncEffects(params: UseProjectInterfaceEditSyncEffectsParams) {
  useEffect(() => {
    const shouldWatchConflict = params.action === 'api' && params.interfaceId > 0 && params.tab === 'edit';
    if (!shouldWatchConflict) {
      params.setEditConflictState({ status: 'idle' });
      return;
    }

    params.setEditConflictState({ status: 'loading' });
    let destroyed = false;
    let pollTimer: number | null = null;

    const applyPayload = (payload: Record<string, unknown>) => {
      const errno = Number(payload.errno || 0);
      if (errno === 0) {
        params.setEditConflictState({ status: 'ready' });
        return;
      }
      const data = (payload.data || {}) as Record<string, unknown>;
      params.setEditConflictState({
        status: 'locked',
        uid: Number(data.uid || errno || 0),
        username: String(data.username || '未知用户')
      });
    };

    const runCheck = async () => {
      try {
        const response = await fetch(`/api/interface/solve_conflict?id=${params.interfaceId}`, {
          credentials: 'include'
        });
        const payload = (await response.json()) as Record<string, unknown>;
        if (destroyed) return;
        if (payload && typeof payload === 'object' && typeof payload.errno !== 'undefined') {
          applyPayload(payload);
        } else if (Number(payload.errcode || 0) === 0) {
          applyPayload({ errno: 0, data: payload.data });
        } else {
          params.setEditConflictState({ status: 'error' });
        }
      } catch (_err) {
        if (!destroyed) {
          params.setEditConflictState({ status: 'error' });
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
  }, [params.action, params.interfaceId, params.setEditConflictState, params.tab]);

  useEffect(() => {
    const method = String((params.watchedValues || {}).method || 'GET').toUpperCase();
    if (!supportsRequestBody(method) && params.reqRadioType === 'req-body') {
      params.setReqRadioType('req-query');
    }
  }, [params.reqRadioType, params.setReqRadioType, params.watchedValues]);

  useEffect(() => {
    if (params.tab !== 'edit') return;
    const values = params.watchedValues || ({} as EditForm);
    const pathValue = String(values.path || '');
    const reqParams = sanitizeReqParams(values.req_params);
    const nextReqParams = buildReqParamsByPath(pathValue, reqParams);
    if (JSON.stringify(reqParams) !== JSON.stringify(nextReqParams)) {
      params.form.setFieldValue('req_params', nextReqParams);
    }
  }, [params.form, params.tab, params.watchedValues]);

  useEffect(() => {
    if (!params.currentInterface) return;
    const values = params.buildEditFormValues(params.currentInterface);
    params.form.setFieldsValue(values);
    params.setEditBaseline(params.serializeEditValues(values));
    params.setReqRadioType(supportsRequestBody(values.method) ? 'req-body' : 'req-query');
    params.setResEditorTab('tpl');
    params.setResPreviewText('');
    params.setReqSchemaEditorMode('visual');
    params.setResSchemaEditorMode('visual');
  }, [
    params.buildEditFormValues,
    params.currentInterface,
    params.form,
    params.serializeEditValues,
    params.setEditBaseline,
    params.setReqRadioType,
    params.setReqSchemaEditorMode,
    params.setResEditorTab,
    params.setResPreviewText,
    params.setResSchemaEditorMode
  ]);

  useEffect(() => {
    if (!params.currentInterface) return;
    const queryText = JSON.stringify(
      Array.isArray(params.currentInterface.req_query) ? params.currentInterface.req_query : [],
      null,
      2
    );
    const headersText = JSON.stringify(
      Array.isArray(params.currentInterface.req_headers) ? params.currentInterface.req_headers : [],
      null,
      2
    );
    let bodyText = '{}';
    if (params.currentInterface.req_body_type === 'form') {
      bodyText = JSON.stringify(params.currentInterface.req_body_form || [], null, 2);
    } else if (
      params.currentInterface.req_body_is_json_schema &&
      typeof params.currentInterface.req_body_other === 'string'
    ) {
      bodyText = generateMockStringFromJsonSchema(params.currentInterface.req_body_other);
    } else {
      const other = params.currentInterface.req_body_other;
      bodyText = typeof other === 'string' ? other : JSON.stringify(other || {}, null, 2);
    }
    params.resetInterfaceRequestRunner({
      method: String(params.currentInterface.method || 'GET').toUpperCase(),
      path: `${params.basepath || ''}${params.currentInterface.path || ''}`,
      query: queryText,
      headers: headersText,
      body: bodyText
    });
  }, [params.basepath, params.currentInterface, params.resetInterfaceRequestRunner]);

  useEffect(() => {
    if (params.action !== 'case') return;
    const detail = params.caseDetailData;
    if (!detail) return;
    const method = String(detail.method || 'GET').toUpperCase();
    const path = `${params.basepath || ''}${String(detail.path || '')}`;
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
    params.caseForm.setFieldsValue({
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
    params.resetCaseRequestRunner({
      method,
      path,
      query: JSON.stringify(reqQuery, null, 2),
      headers: JSON.stringify(reqHeaders, null, 2),
      body: typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody ?? {}, null, 2)
    });
  }, [params.action, params.basepath, params.caseDetailData, params.caseForm, params.resetCaseRequestRunner]);
}
