import { useCallback } from 'react';
import { message, Modal } from 'antd';
import type { FormInstance } from 'antd';
import type { NavigateFunction } from 'react-router-dom';
import type { LegacyInterfaceDTO } from '@yapi-next/shared-types';

import { webPlugins } from '../../plugins';
import type {
  AddCaseForm,
  AutoTestReport,
  AutoTestResultItem,
  CaseEditForm,
  CaseEnvProjectItem,
  ColForm,
  CommonSettingForm
} from './ProjectInterfacePage.types';
import { parseJsonText } from './ProjectInterfacePage.request-runner';
import { toRecord } from './ProjectInterfacePage.utils';

type MutationTrigger = (args: any) => { unwrap: () => Promise<any> };

type UseProjectInterfaceCollectionActionsParams = {
  projectId: number;
  token?: string;
  selectedColId: number;
  action: string;
  caseId: string;
  projectTokenValue: string;
  selectedRunEnvByProject: Record<number, string>;
  colRows: Array<{ _id?: number; name?: string; desc?: string }>;
  caseRows: Array<Record<string, any>>;
  colModalType: 'add' | 'edit';
  editingCol: { _id: number; name: string; desc?: string } | null;
  colForm: FormInstance<ColForm>;
  addCaseForm: FormInstance<AddCaseForm>;
  caseForm: FormInstance<CaseEditForm>;
  commonSettingForm: FormInstance<CommonSettingForm>;
  setColModalType: (value: 'add' | 'edit') => void;
  setColModalOpen: (open: boolean) => void;
  setEditingCol: (value: { _id: number; name: string; desc?: string } | null) => void;
  setImportColId: (value: number) => void;
  setImportProjectId: (value: number) => void;
  setImportSelectedRowKeys: (value: Array<string | number>) => void;
  setImportModalOpen: (open: boolean) => void;
  setAddCaseOpen: (open: boolean) => void;
  setAutoTestRunning: (value: boolean) => void;
  setAutoTestReport: (value: AutoTestReport | null) => void;
  setAutoTestModalOpen: (open: boolean) => void;
  setAutoTestDetailItem: (item: AutoTestResultItem | null) => void;
  setCommonSettingOpen: (open: boolean) => void;
  importColId: number;
  importProjectId: number;
  selectedImportInterfaceIds: number[];
  callApi: <T>(promise: Promise<T>, errorText: string) => Promise<T | null>;
  navigate: NavigateFunction;
  refetchColList: () => Promise<any>;
  refetchCaseList: () => Promise<any>;
  refetchCaseDetail: () => Promise<any>;
  addCol: MutationTrigger;
  updateCol: MutationTrigger;
  triggerDelCol: MutationTrigger;
  cloneColCaseList: MutationTrigger;
  addColCaseList: MutationTrigger;
  triggerDelCase: MutationTrigger;
  fetchColCaseDetail: MutationTrigger;
  addColCase: MutationTrigger;
  upColCase: MutationTrigger;
  fetchInterfaceDetail: MutationTrigger;
};

export function useProjectInterfaceCollectionActions(params: UseProjectInterfaceCollectionActionsParams) {
  const openColModal = useCallback(
    (type: 'add' | 'edit', col?: { _id?: number; name?: string; desc?: string }) => {
      params.setColModalType(type);
      if (type === 'edit' && col?._id) {
        params.setEditingCol({
          _id: Number(col._id || 0),
          name: String(col.name || ''),
          desc: String(col.desc || '')
        });
        params.colForm.setFieldsValue({
          name: String(col.name || ''),
          desc: String(col.desc || '')
        });
      } else {
        params.setEditingCol(null);
        params.colForm.setFieldsValue({ name: '', desc: '' });
      }
      params.setColModalOpen(true);
    },
    [params]
  );

  const handleSubmitCol = useCallback(
    async (values: ColForm) => {
      const name = values.name.trim();
      const desc = values.desc?.trim() || '';
      if (!name) {
        message.error('请输入集合名');
        return;
      }
      if (params.colModalType === 'add') {
        const response = await params.callApi(
          params.addCol({
            project_id: params.projectId,
            name,
            desc,
            token: params.token
          }).unwrap(),
          '添加集合失败'
        );
        if (!response) return;
        message.success('添加集合成功');
        const newColId = Number(response.data?._id || 0);
        params.setColModalOpen(false);
        params.setEditingCol(null);
        params.colForm.resetFields();
        await Promise.all([params.refetchColList(), params.refetchCaseList()]);
        if (newColId > 0) {
          params.navigate(`/project/${params.projectId}/interface/col/${newColId}`);
        }
        return;
      }
      if (!params.editingCol?._id) {
        message.error('集合不存在');
        return;
      }
      const response = await params.callApi(
        params.updateCol({
          col_id: Number(params.editingCol._id),
          name,
          desc,
          token: params.token
        }).unwrap(),
        '修改集合失败'
      );
      if (!response) return;
      message.success('修改集合成功');
      params.setColModalOpen(false);
      params.setEditingCol(null);
      params.colForm.resetFields();
      await Promise.all([params.refetchColList(), params.refetchCaseList()]);
    },
    [params]
  );

  const confirmDeleteCol = useCallback(
    (colId: number) => {
      if (params.colRows.length <= 1) {
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
          const response = await params.callApi(
            params.triggerDelCol({
              col_id: colId,
              project_id: params.projectId,
              token: params.token
            }).unwrap(),
            '删除集合失败'
          );
          if (!response) return;
          message.success('删除集合成功');
          const refreshed = await params.refetchColList();
          const nextRows = (refreshed.data?.data || []) as any[];
          const nextColId = Number(nextRows[0]?._id || 0);
          if (params.selectedColId === colId || params.action === 'case') {
            if (nextColId > 0) {
              params.navigate(`/project/${params.projectId}/interface/col/${nextColId}`);
            } else {
              params.navigate(`/project/${params.projectId}/interface/col`);
            }
          }
        }
      });
    },
    [params]
  );

  const handleCopyCol = useCallback(
    async (col: { _id?: number; name?: string; desc?: string }) => {
      const sourceColId = Number(col._id || 0);
      if (sourceColId <= 0) {
        message.error('集合数据不完整');
        return;
      }
      const addResponse = await params.callApi(
        params.addCol({
          project_id: params.projectId,
          name: `${String(col.name || 'collection')} copy`,
          desc: String(col.desc || ''),
          token: params.token
        }).unwrap(),
        '克隆集合失败'
      );
      if (!addResponse) return;
      const newColId = Number(addResponse.data?._id || 0);
      if (newColId <= 0) {
        message.error('克隆集合失败');
        return;
      }
      const cloneResponse = await params.callApi(
        params.cloneColCaseList({
          project_id: params.projectId,
          col_id: sourceColId,
          new_col_id: newColId,
          token: params.token
        }).unwrap(),
        '克隆集合失败'
      );
      if (!cloneResponse) return;
      message.success('克隆测试集成功');
      await Promise.all([params.refetchColList(), params.refetchCaseList()]);
      params.navigate(`/project/${params.projectId}/interface/col/${newColId}`);
    },
    [params]
  );

  const openImportInterfaceModal = useCallback(
    (colId: number) => {
      params.setImportColId(colId);
      params.setImportProjectId(params.projectId);
      params.setImportSelectedRowKeys([]);
      params.setImportModalOpen(true);
    },
    [params]
  );

  const handleImportInterfaces = useCallback(async () => {
    if (params.importColId <= 0) {
      message.error('请选择测试集合');
      return;
    }
    if (params.selectedImportInterfaceIds.length === 0) {
      message.error('请选择要导入的接口');
      return;
    }
    if (params.importProjectId <= 0) {
      message.error('请选择项目');
      return;
    }
    const response = await params.callApi(
      params.addColCaseList({
        project_id: params.importProjectId,
        col_id: params.importColId,
        interface_list: params.selectedImportInterfaceIds,
        token: params.token
      }).unwrap(),
      '导入集合失败'
    );
    if (!response) return;
    message.success('导入集合成功');
    params.setImportModalOpen(false);
    params.setImportSelectedRowKeys([]);
    await Promise.all([params.refetchColList(), params.refetchCaseList()]);
  }, [params]);

  const confirmDeleteCase = useCallback(
    (caseItemId: string) => {
      Modal.confirm({
        title: '您确认删除此测试用例',
        content: '温馨提示：用例删除后无法恢复',
        okText: '确认',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          const response = await params.callApi(
            params.triggerDelCase({
              caseid: caseItemId,
              col_id: params.selectedColId > 0 ? params.selectedColId : undefined,
              token: params.token
            }).unwrap(),
            '删除用例失败'
          );
          if (!response) return;
          message.success('删除用例成功');
          await Promise.all([params.refetchColList(), params.refetchCaseList()]);
          if (params.action === 'case' && params.caseId === caseItemId) {
            params.navigate(`/project/${params.projectId}/interface/col/${params.selectedColId || ''}`);
          }
        }
      });
    },
    [params]
  );

  const handleCopyCase = useCallback(
    async (caseItemId: string) => {
      const detailResponse = await params.callApi(
        params.fetchColCaseDetail({
          caseid: caseItemId,
          token: params.token
        }).unwrap(),
        '获取用例详情失败'
      );
      if (!detailResponse?.data) return;
      const data = detailResponse.data as Record<string, unknown>;
      const addResponse = await params.callApi(
        params.addColCase({
          casename: `${String(data.casename || 'case')}_copy`,
          project_id: Number(data.project_id || params.projectId),
          col_id: Number(data.col_id || params.selectedColId || 0),
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
          token: params.token
        }).unwrap(),
        '克隆用例失败'
      );
      if (!addResponse) return;
      message.success('克隆用例成功');
      const nextColId = Number(addResponse.data?.col_id || data.col_id || params.selectedColId || 0);
      await Promise.all([params.refetchColList(), params.refetchCaseList()]);
      if (nextColId > 0) {
        params.navigate(`/project/${params.projectId}/interface/col/${nextColId}`);
      }
    },
    [params]
  );

  const handleSaveCase = useCallback(async () => {
    if (!params.caseId) {
      message.error('测试用例不存在');
      return;
    }
    const values = await params.caseForm.validateFields();
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
    const response = await params.callApi(
      params.upColCase({
        id: params.caseId,
        col_id: params.selectedColId > 0 ? params.selectedColId : undefined,
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
        token: params.token
      }).unwrap(),
      '保存用例失败'
    );
    if (!response) return;
    message.success('用例已保存');
    await Promise.all([params.refetchCaseDetail(), params.refetchCaseList(), params.refetchColList()]);
  }, [params]);

  const buildAutoTestUrl = useCallback(
    (mode: 'json' | 'html', download?: boolean) => {
      if (!params.projectTokenValue || params.selectedColId <= 0) return '';
      const query = new URLSearchParams();
      query.set('id', String(params.selectedColId));
      query.set('project_id', String(params.projectId));
      query.set('token', params.projectTokenValue);
      query.set('mode', mode);
      Object.entries(params.selectedRunEnvByProject).forEach(([projectId, envName]) => {
        const id = Number(projectId || 0);
        const env = String(envName || '').trim();
        if (!Number.isFinite(id) || id <= 0 || !env) return;
        query.set(`env_${id}`, env);
      });
      if (download) query.set('download', 'true');
      return `/api/open/run_auto_test?${query.toString()}`;
    },
    [params]
  );

  const openAutoTest = useCallback(
    (mode: 'json' | 'html', download?: boolean) => {
      const url = buildAutoTestUrl(mode, download);
      if (!url) {
        message.error('测试 token 获取失败，请稍后重试');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [buildAutoTestUrl]
  );

  const runAutoTestInPage = useCallback(
    async (focusCaseId?: string) => {
      const baseUrl = buildAutoTestUrl('json');
      if (!baseUrl) {
        message.error('测试 token 获取失败，请稍后重试');
        return;
      }
      const matchedCase = focusCaseId
        ? params.caseRows.find(item => String(item?._id || item?.id || '') === String(focusCaseId))
        : null;
      const focusInterfaceId = Number(matchedCase?.interface_id || matchedCase?.interfaceId || 0);

      let requestUrl = baseUrl;
      let requestMethod: 'GET' | 'POST' = 'GET';
      let requestBody: string | undefined;
      let requestHeaders: Record<string, string> | undefined;

      params.setAutoTestRunning(true);
      const requestMeta = {
        type: 'col' as const,
        projectId: params.projectId,
        interfaceId: focusInterfaceId,
        caseId: focusCaseId
      };
      const caseRequestMeta = {
        type: 'case' as const,
        projectId: params.projectId,
        interfaceId: focusInterfaceId,
        caseId: focusCaseId || ''
      };
      try {
        const beforePayload = focusCaseId
          ? await webPlugins.runBeforeRequest(
              {
                method: 'GET',
                url: requestUrl,
                colId: params.selectedColId,
                type: 'case',
                caseId: focusCaseId,
                projectId: params.projectId,
                interfaceId: focusInterfaceId
              },
              caseRequestMeta
            )
          : await webPlugins.runBeforeCollectionRequest(
              {
                method: 'GET',
                url: requestUrl,
                colId: params.selectedColId,
                type: 'col',
                caseId: focusCaseId,
                projectId: params.projectId,
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

        if (!focusCaseId && params.caseRows.length > 0) {
          await Promise.all(
            params.caseRows.map(async row => {
              const rowCaseId = String(row._id || row.id || '');
              const rowInterfaceId = Number(row.interface_id || row.interfaceId || 0);
              await webPlugins.runBeforeCollectionRequest(
                {
                  method: String(row.method || 'GET').toUpperCase(),
                  url: String(row.path || ''),
                  colId: params.selectedColId,
                  type: 'col',
                  caseId: rowCaseId,
                  projectId: params.projectId,
                  interfaceId: rowInterfaceId
                },
                {
                  type: 'col',
                  projectId: params.projectId,
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
                    projectId: params.projectId,
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
                    projectId: params.projectId,
                    caseId: String(item.id || ''),
                    interfaceId: Number(item.interface_id || item.interfaceId || 0)
                  }
                );
                return { ...item, ...pluginResult } as AutoTestResultItem;
              })
            );
        report.list = hookedList;
        params.setAutoTestReport(report);
        params.setAutoTestModalOpen(true);
        if (focusCaseId) {
          const matched = (report.list || []).find((item: any) => String(item.id || '') === focusCaseId);
          if (matched) {
            params.setAutoTestDetailItem(matched);
            params.setAutoTestModalOpen(false);
          }
        }
        message.success('测试执行完成');
      } catch (err) {
        message.error(String((err as Error).message || err || '执行测试失败'));
      } finally {
        params.setAutoTestRunning(false);
      }
    },
    [buildAutoTestUrl, params]
  );

  const openCommonSettingModal = useCallback(
    (col: any | undefined) => {
      const source = toRecord(col);
      const checkResponseField = toRecord(source.checkResponseField);
      const checkScript = toRecord(source.checkScript);
      params.commonSettingForm.setFieldsValue({
        checkHttpCodeIs200: source.checkHttpCodeIs200 === true,
        checkResponseSchema: source.checkResponseSchema === true,
        checkResponseFieldEnable: checkResponseField.enable === true,
        checkResponseFieldName: String(checkResponseField.name || 'code'),
        checkResponseFieldValue: String(checkResponseField.value ?? '0'),
        checkScriptEnable: checkScript.enable === true,
        checkScriptContent: String(checkScript.content || '')
      });
      params.setCommonSettingOpen(true);
    },
    [params]
  );

  const handleSaveCommonSetting = useCallback(async () => {
    if (params.selectedColId <= 0) {
      message.error('请选择测试集合');
      return;
    }
    const values = await params.commonSettingForm.validateFields();
    const response = await params.callApi(
      params.updateCol({
        col_id: params.selectedColId,
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
        token: params.token
      }).unwrap(),
      '保存通用规则失败'
    );
    if (!response) return;
    message.success('通用规则已保存');
    params.setCommonSettingOpen(false);
    await params.refetchColList();
  }, [params]);

  const handleAddCase = useCallback(
    async (values: AddCaseForm) => {
      if (params.selectedColId <= 0) {
        message.error('请选择测试集合');
        return;
      }
      const interfaceId = Number(values.interface_id || 0);
      if (interfaceId <= 0) {
        message.error('请选择接口');
        return;
      }
      const detailRes = await params.callApi(
        params.fetchInterfaceDetail({
          id: interfaceId,
          projectId: params.projectId,
          token: params.token
        }).unwrap(),
        '获取接口详情失败'
      );
      if (!detailRes?.data) return;
      const detail = detailRes.data as LegacyInterfaceDTO & Record<string, unknown>;
      const response = await params.callApi(
        params.addColCase({
          casename: values.casename.trim() || String(detail.title || `case-${interfaceId}`),
          project_id: params.projectId,
          col_id: params.selectedColId,
          interface_id: interfaceId,
          case_env: values.case_env?.trim() || '',
          req_params: Array.isArray(detail.req_params) ? detail.req_params : [],
          req_headers: Array.isArray(detail.req_headers) ? detail.req_headers : [],
          req_query: Array.isArray(detail.req_query) ? detail.req_query : [],
          req_body_form: Array.isArray(detail.req_body_form) ? detail.req_body_form : [],
          req_body_other: String(detail.req_body_other || ''),
          req_body_type: String(detail.req_body_type || 'raw'),
          token: params.token
        }).unwrap(),
        '添加用例失败'
      );
      if (!response) return;
      message.success('测试用例添加成功');
      params.setAddCaseOpen(false);
      params.addCaseForm.resetFields();
      await Promise.all([params.refetchColList(), params.refetchCaseList()]);
      const newCaseId = String(response.data?._id || '');
      if (newCaseId) {
        params.navigate(`/project/${params.projectId}/interface/case/${newCaseId}`);
      }
    },
    [params]
  );

  return {
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
  };
}
