import { useCallback } from 'react';
import { message, Modal } from 'antd';
import type { FormInstance } from 'antd';
import type { NavigateFunction } from 'react-router-dom';
import type { InterfaceTreeNode, LegacyInterfaceDTO } from '@yapi-next/shared-types';

import type {
  AddCatForm,
  AddInterfaceForm,
  EditCatForm,
  EditForm,
  EditFormBodyParam,
  EditFormParam
} from './ProjectInterfacePage.types';
import {
  checkIsJsonSchema,
  normalizeJsonText,
  normalizePathInput,
  parseLooseJson,
  safeStringArray,
  sanitizeReqBodyForm,
  sanitizeReqHeaders,
  sanitizeReqParams,
  sanitizeReqQuery,
  supportsRequestBody,
  toRecord
} from './ProjectInterfacePage.utils';
import { stringifyPretty } from './ProjectInterfacePage.request-runner';

type ApiMutationTrigger = (args: any) => { unwrap: () => Promise<any> };

type UseProjectInterfaceApiActionsParams = {
  projectId: number;
  token?: string;
  projectTag?: Array<{ name?: string; desc?: string }>;
  currentInterface: LegacyInterfaceDTO | null;
  interfaceId: number;
  catId: number;
  catRows: Array<{ _id?: number; name?: string }>;
  editingCat: { _id: number; name: string; desc?: string } | null;
  form: FormInstance<EditForm>;
  addInterfaceForm: FormInstance<AddInterfaceForm>;
  addCatForm: FormInstance<AddCatForm>;
  editCatForm: FormInstance<EditCatForm>;
  setAddInterfaceOpen: (open: boolean) => void;
  setAddCatOpen: (open: boolean) => void;
  setEditCatOpen: (open: boolean) => void;
  setEditingCat: (value: { _id: number; name: string; desc?: string } | null) => void;
  setTagSettingOpen: (open: boolean) => void;
  setTagSettingInput: (value: string) => void;
  setBulkFieldName: (value: 'req_query' | 'req_body_form' | null) => void;
  setBulkValue: (value: string) => void;
  setBulkOpen: (open: boolean) => void;
  setEditBaseline: (value: string) => void;
  serializeEditValues: (values: EditForm | undefined) => string;
  setTab: (value: string) => void;
  setResPreviewText: (value: string) => void;
  setResEditorTab: (value: 'tpl' | 'preview') => void;
  navigate: NavigateFunction;
  callApi: <T>(promise: Promise<T>, errorText: string) => Promise<T | null>;
  refetchDetail: () => Promise<unknown>;
  refetchInterfaceListSafe: () => Promise<unknown>;
  refreshInterfaceMenu: () => Promise<void>;
  updateInterface: ApiMutationTrigger;
  addInterface: ApiMutationTrigger;
  updateProjectTag: ApiMutationTrigger;
  addInterfaceCat: ApiMutationTrigger;
  updateInterfaceCat: ApiMutationTrigger;
  delInterface: ApiMutationTrigger;
  delInterfaceCat: ApiMutationTrigger;
  fetchInterfaceDetail: ApiMutationTrigger;
};

export function useProjectInterfaceApiActions(params: UseProjectInterfaceApiActionsParams) {
  const handleSave = useCallback(async () => {
    if (!params.currentInterface?._id) {
      message.error('请先选择接口');
      return;
    }
    const values = await params.form.validateFields();

    const method = String(values.method || 'GET').toUpperCase();
    const path = String(values.path || '').trim();
    const reqBodyType = values.req_body_type || 'form';
    const reqParams = sanitizeReqParams(values.req_params);
    const reqQuery = sanitizeReqQuery(values.req_query);
    const reqHeaders = sanitizeReqHeaders(values.req_headers);
    const reqBodyForm = sanitizeReqBodyForm(values.req_body_form);
    const tags = safeStringArray(values.tag);
    const reqBodyOther = String(values.req_body_other || '');
    const resBody = String(values.res_body || '');

    if (!path.startsWith('/')) {
      message.error('接口路径第一位必须为 /');
      return;
    }

    if (reqBodyType === 'json' && reqBodyOther.trim()) {
      if (values.req_body_is_json_schema) {
        const schemaText = checkIsJsonSchema(reqBodyOther);
        if (!schemaText) {
          message.error('请求参数 json-schema 格式有误');
          return;
        }
      } else {
        try {
          parseLooseJson(reqBodyOther);
        } catch (_err) {
          message.error('请求Body json格式有问题，请检查');
          return;
        }
      }
    }

    if ((values.res_body_type || 'json') === 'json' && resBody.trim()) {
      if (values.res_body_is_json_schema) {
        const schemaText = checkIsJsonSchema(resBody);
        if (!schemaText) {
          message.error('返回数据 json-schema 格式有误');
          return;
        }
      } else {
        try {
          parseLooseJson(resBody);
        } catch (_err) {
          message.error('返回Body json格式有问题，请检查');
          return;
        }
      }
    }

    const normalizedPath = normalizePathInput(path);
    if (!normalizedPath) {
      message.error('接口路径不能为空');
      return;
    }

    let normalizedReqBodyOther = reqBodyType === 'json' ? normalizeJsonText(reqBodyOther) : reqBodyOther;
    let normalizedResBody = values.res_body_type === 'json' ? normalizeJsonText(resBody) : resBody;
    if (reqBodyType === 'json' && values.req_body_is_json_schema) {
      normalizedReqBodyOther = String(checkIsJsonSchema(reqBodyOther) || reqBodyOther);
    }
    if (values.res_body_type === 'json' && values.res_body_is_json_schema) {
      normalizedResBody = String(checkIsJsonSchema(resBody) || resBody);
    }

    const contentTypeValue =
      reqBodyType === 'json'
        ? 'application/json'
        : reqBodyType === 'form'
          ? reqBodyForm.some(item => item.type === 'file')
            ? 'multipart/form-data'
            : 'application/x-www-form-urlencoded'
          : '';

    let normalizedHeaders = [...reqHeaders];
    if (supportsRequestBody(method) && contentTypeValue) {
      let hasContentType = false;
      normalizedHeaders = normalizedHeaders.map(item => {
        if (item.name.toLowerCase() !== 'content-type') return item;
        hasContentType = true;
        return { ...item, value: contentTypeValue };
      });
      if (!hasContentType) {
        normalizedHeaders = [{ name: 'Content-Type', value: contentTypeValue, required: '1' }, ...normalizedHeaders];
      }
    }
    if (!supportsRequestBody(method)) {
      normalizedReqBodyOther = '';
    }

    const response = await params.callApi(
      params.updateInterface({
        id: Number(params.currentInterface._id),
        project_id: params.projectId,
        catid: Number(values.catid || params.currentInterface.catid || params.catRows[0]?._id || 0),
        title: String(values.title || '').trim(),
        path: normalizedPath,
        method,
        status: values.status,
        desc: String(values.desc || '').trim(),
        tag: tags,
        req_params: reqParams,
        req_query: reqQuery,
        req_headers: normalizedHeaders,
        req_body_type: reqBodyType,
        req_body_form: reqBodyType === 'form' ? reqBodyForm : [],
        req_body_other: reqBodyType === 'form' || !supportsRequestBody(method) ? '' : normalizedReqBodyOther,
        req_body_is_json_schema: reqBodyType === 'json' ? values.req_body_is_json_schema === true : false,
        res_body_type: values.res_body_type || 'json',
        res_body: normalizedResBody,
        res_body_is_json_schema:
          (values.res_body_type || 'json') === 'json' ? values.res_body_is_json_schema === true : false,
        custom_field_value: String(values.custom_field_value || ''),
        switch_notice: values.switch_notice === true,
        api_opened: values.api_opened === true,
        token: params.token
      } as any).unwrap(),
      '保存失败'
    );
    if (!response) return;
    message.success('接口已更新');
    await Promise.all([params.refetchDetail(), params.refetchInterfaceListSafe(), params.refreshInterfaceMenu()]);
    params.setEditBaseline(params.serializeEditValues(values));
    params.setTab('view');
  }, [params]);

  const handleSaveProjectTag = useCallback(async (tagSettingInput: string) => {
    const lines = tagSettingInput
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);
    const unique = Array.from(new Set(lines));
    const payload = unique.map(name => ({ name, desc: '' }));
    const response = await params.callApi(
      params.updateProjectTag({
        id: params.projectId,
        tag: payload
      }).unwrap(),
      'Tag 设置保存失败'
    );
    if (!response) return;
    message.success('Tag 设置已保存');
    params.setTagSettingOpen(false);
  }, [params]);

  const handleAddNewInterface = useCallback(async (values: AddInterfaceForm) => {
    const catid = Number(values.catid || 0);
    if (!catid) {
      message.error('请先选择接口分类');
      return;
    }
    const response = await params.callApi(
      params.addInterface({
        project_id: params.projectId,
        catid,
        title: values.title.trim(),
        path: values.path.trim(),
        method: values.method,
        status: 'undone',
        token: params.token
      }).unwrap(),
      '添加接口失败'
    );
    if (!response) return;
    message.success('接口添加成功');
    params.setAddInterfaceOpen(false);
    params.addInterfaceForm.resetFields();
    await Promise.all([params.refreshInterfaceMenu(), params.refetchInterfaceListSafe()]);
    const id = Number(response.data?._id || 0);
    if (id > 0) {
      params.navigate(`/project/${params.projectId}/interface/api/${id}`);
    }
  }, [params]);

  const openAddInterfaceModal = useCallback((defaultCatid?: number) => {
    params.addInterfaceForm.setFieldsValue({
      method: 'GET',
      catid: Number(defaultCatid || params.catId || params.catRows[0]?._id || 0)
    });
    params.setAddInterfaceOpen(true);
  }, [params]);

  const handleAddNewCat = useCallback(async (values: AddCatForm) => {
    const response = await params.callApi(
      params.addInterfaceCat({
        project_id: params.projectId,
        name: values.name.trim(),
        desc: values.desc?.trim() || '',
        token: params.token
      }).unwrap(),
      '添加分类失败'
    );
    if (!response) return;
    message.success('接口分类添加成功');
    params.setAddCatOpen(false);
    params.addCatForm.resetFields();
    await params.refreshInterfaceMenu();
  }, [params]);

  const handleUpdateCat = useCallback(async (values: EditCatForm) => {
    if (!params.editingCat?._id) {
      message.error('分类不存在');
      return;
    }
    const response = await params.callApi(
      params.updateInterfaceCat({
        catid: Number(params.editingCat._id),
        project_id: params.projectId,
        name: values.name.trim(),
        desc: values.desc?.trim() || '',
        token: params.token
      }).unwrap(),
      '修改分类失败'
    );
    if (!response) return;
    message.success('分类已更新');
    params.setEditCatOpen(false);
    params.setEditingCat(null);
    await Promise.all([params.refreshInterfaceMenu(), params.refetchInterfaceListSafe()]);
  }, [params]);

  const openEditCatModal = useCallback((cat: InterfaceTreeNode) => {
    const source = toRecord(cat);
    const catData = {
      _id: Number(cat._id || 0),
      name: String(cat.name || ''),
      desc: String(source.desc || '')
    };
    params.setEditingCat(catData);
    params.editCatForm.setFieldsValue({
      name: catData.name,
      desc: catData.desc
    });
    params.setEditCatOpen(true);
  }, [params]);

  const confirmDeleteCat = useCallback((cat: InterfaceTreeNode) => {
    Modal.confirm({
      title: `确定删除分类 ${cat.name} 吗？`,
      content: '该操作会删除分类下所有接口，且无法恢复。',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const response = await params.callApi(
          params.delInterfaceCat({
            catid: Number(cat._id || 0),
            project_id: params.projectId,
            token: params.token
          }).unwrap(),
          '删除分类失败'
        );
        if (!response) return;
        message.success('分类已删除');
        await Promise.all([params.refreshInterfaceMenu(), params.refetchInterfaceListSafe()]);
        params.navigate(`/project/${params.projectId}/interface/api`);
      }
    });
  }, [params]);

  const confirmDeleteInterface = useCallback((id: number) => {
    Modal.confirm({
      title: '确定删除此接口吗？',
      content: '接口删除后无法恢复。',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const response = await params.callApi(
          params.delInterface({
            id,
            project_id: params.projectId,
            token: params.token
          }).unwrap(),
          '删除接口失败'
        );
        if (!response) return;
        message.success('接口已删除');
        await Promise.all([params.refetchInterfaceListSafe(), params.refreshInterfaceMenu()]);
        if (params.interfaceId === id) {
          params.navigate(`/project/${params.projectId}/interface/api`);
        }
      }
    });
  }, [params]);

  const copyInterfaceRow = useCallback(async (row: LegacyInterfaceDTO) => {
    const sourceId = Number(row._id || 0);
    if (sourceId <= 0) {
      message.error('接口数据不完整，无法复制');
      return;
    }
    const detailRes = await params.callApi(
      params.fetchInterfaceDetail({
        id: sourceId,
        projectId: params.projectId,
        token: params.token
      }).unwrap(),
      '获取接口详情失败'
    );
    if (!detailRes?.data) return;
    const source = detailRes.data as LegacyInterfaceDTO & Record<string, unknown>;
    const pathBase = String(source.path || '/copy').replace(/\/+$/, '') || '/copy';
    const copyPayload = {
      project_id: params.projectId,
      catid: Number(source.catid || row.catid || params.catRows[0]?._id || 0),
      title: `${source.title || row.title || 'untitled'}_copy`,
      path: `${pathBase}_${Date.now()}`,
      method: String(source.method || row.method || 'GET').toUpperCase(),
      status: String(source.status || row.status || 'undone') as 'done' | 'undone',
      desc: String(source.desc || ''),
      req_query: Array.isArray(source.req_query) ? source.req_query : [],
      req_headers: Array.isArray(source.req_headers) ? source.req_headers : [],
      req_params: Array.isArray(source.req_params) ? source.req_params : [],
      req_body_type: source.req_body_type,
      req_body_form: Array.isArray(source.req_body_form) ? source.req_body_form : [],
      req_body_other: String(source.req_body_other || ''),
      req_body_is_json_schema: source.req_body_is_json_schema === true,
      res_body_type: source.res_body_type,
      res_body: String(source.res_body || ''),
      res_body_is_json_schema: source.res_body_is_json_schema === true,
      custom_field_value: String(source.custom_field_value || ''),
      api_opened: source.api_opened === true,
      tag: Array.isArray(source.tag) ? source.tag : [],
      token: params.token
    };
    const response = await params.callApi(params.addInterface(copyPayload).unwrap(), '复制接口失败');
    if (!response) return;
    message.success('接口已复制');
    await Promise.all([params.refetchInterfaceListSafe(), params.refreshInterfaceMenu()]);
    const id = Number(response.data?._id || 0);
    if (id > 0) {
      params.navigate(`/project/${params.projectId}/interface/api/${id}`);
    }
  }, [params]);

  const openAddCatModal = useCallback(() => {
    params.addCatForm.resetFields();
    params.setAddCatOpen(true);
  }, [params]);

  const openTagSettingModal = useCallback(() => {
    params.setTagSettingInput((params.projectTag || []).map(item => String(item.name || '')).filter(Boolean).join('\n'));
    params.setTagSettingOpen(true);
  }, [params]);

  const handleInterfaceListStatusChange = useCallback(async (id: number, next: 'done' | 'undone') => {
    const response = await params.callApi(
      params.updateInterface({
        id,
        project_id: params.projectId,
        status: next,
        token: params.token
      }).unwrap(),
      '更新状态失败'
    );
    if (!response) return;
    await Promise.all([params.refetchInterfaceListSafe(), params.refreshInterfaceMenu()]);
  }, [params]);

  const handleInterfaceListCatChange = useCallback(async (id: number, nextCatId: number) => {
    const response = await params.callApi(
      params.updateInterface({
        id,
        project_id: params.projectId,
        catid: nextCatId,
        token: params.token
      }).unwrap(),
      '更新分类失败'
    );
    if (!response) return;
    await Promise.all([params.refetchInterfaceListSafe(), params.refreshInterfaceMenu()]);
  }, [params]);

  const openBulkImport = useCallback((field: 'req_query' | 'req_body_form') => {
    const rows =
      field === 'req_query'
        ? sanitizeReqQuery(params.form.getFieldValue('req_query'))
        : sanitizeReqBodyForm(params.form.getFieldValue('req_body_form'));
    const text = rows.map(item => `${item.name}:${item.example || ''}`).join('\n');
    params.setBulkFieldName(field);
    params.setBulkValue(text);
    params.setBulkOpen(true);
  }, [params]);

  const applyBulkImport = useCallback((bulkFieldName: 'req_query' | 'req_body_form' | null, bulkValue: string) => {
    if (!bulkFieldName) {
      params.setBulkOpen(false);
      return;
    }
    const lines = String(bulkValue || '')
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);
    if (bulkFieldName === 'req_query') {
      const next = lines
        .map(line => {
          const index = line.indexOf(':');
          if (index < 0) return null;
          const name = line.slice(0, index).trim();
          if (!name) return null;
          return { name, example: line.slice(index + 1).trim(), required: '1' as const, desc: '' };
        })
        .filter(Boolean) as EditFormParam[];
      params.form.setFieldValue('req_query', next);
    } else {
      const next = lines
        .map(line => {
          const index = line.indexOf(':');
          if (index < 0) return null;
          const name = line.slice(0, index).trim();
          if (!name) return null;
          return { name, example: line.slice(index + 1).trim(), required: '1' as const, desc: '', type: 'text' as const };
        })
        .filter(Boolean) as EditFormBodyParam[];
      params.form.setFieldValue('req_body_form', next);
    }
    params.setBulkOpen(false);
    params.setBulkFieldName(null);
    params.setBulkValue('');
  }, [params]);

  const buildResponsePreviewText = useCallback(async () => {
    const values = params.form.getFieldsValue() as EditForm;
    const bodyType = String(values.res_body_type || 'json');
    if (bodyType !== 'json') {
      params.setResPreviewText('RAW 响应不支持模板预览，请直接查看返回内容文本。');
      return;
    }
    const resBodyText = String(values.res_body || '');
    if (!resBodyText.trim()) {
      params.setResPreviewText('');
      return;
    }
    if (values.res_body_is_json_schema) {
      try {
        const schema = parseLooseJson(resBodyText);
        const response = await fetch('/api/interface/schema2json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ schema })
        });
        const data = await response.json();
        params.setResPreviewText(stringifyPretty(data));
      } catch (err) {
        params.setResPreviewText(`解析出错: ${String((err as Error).message || err)}`);
      }
      return;
    }
    try {
      params.setResPreviewText(JSON.stringify(parseLooseJson(resBodyText), null, 2));
    } catch (err) {
      params.setResPreviewText(`解析出错: ${String((err as Error).message || err)}`);
    }
  }, [params]);

  const handleResponseEditorTabChange = useCallback((next: string) => {
    if (next === 'preview') {
      void buildResponsePreviewText();
    }
    params.setResEditorTab(next === 'preview' ? 'preview' : 'tpl');
  }, [buildResponsePreviewText, params]);

  return {
    handleSave,
    handleSaveProjectTag,
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
    applyBulkImport,
    handleResponseEditorTabChange
  };
}
