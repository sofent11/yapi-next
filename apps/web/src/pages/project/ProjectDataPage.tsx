import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App as AntdApp, Button, Card, Col, Input, Modal, Progress, Row, Select, Space, Switch, Tabs, Typography, Upload, Tooltip, Radio } from 'antd';
import json5 from 'json5';
import type { SpecImportResult } from '@yapi-next/shared-types';
import {
  useExportSpecMutation,
  useGetCatMenuQuery,
  useGetImportTaskQuery,
  useImportSpecMutation,
  useInterUploadMutation
} from '../../services/yapi-api';
import { webPlugins, type ExportDataItem, type ImportDataItem } from '../../plugins';
import { safeApiRequest } from '../../utils/safe-request';
import './ProjectData.scss';

const { Text, Paragraph } = Typography;

type ProjectDataPageProps = {
  projectId: number;
  token?: string;
};

type SpecSource = 'json' | 'url';
type SpecFormat = 'auto' | 'swagger2' | 'openapi3';
type SyncMode = 'normal' | 'good' | 'merge';

type ExportFormat = 'openapi3' | 'swagger2';
type ExportStatus = 'all' | 'open';
type ImportInputOverrides = Partial<{
  jsonText: string;
  urlText: string;
}>;

type LegacyImportParam = Record<string, unknown> & {
  name?: string;
  value?: unknown;
  example?: unknown;
  required?: string | number | boolean;
  type?: string;
  desc?: string;
};

type LegacyImportApi = Record<string, unknown> & {
  title?: string;
  path?: string;
  method?: string;
  catname?: string;
  desc?: string;
  req_params?: LegacyImportParam[];
  req_query?: LegacyImportParam[];
  req_headers?: LegacyImportParam[];
  req_body_type?: string;
  req_body_form?: LegacyImportParam[];
  req_body_other?: string;
  req_body_is_json_schema?: boolean;
  res_body_type?: string;
  res_body?: string;
  res_body_is_json_schema?: boolean;
};

type LegacyImportPayload = {
  cats: Array<{ name?: string; desc?: string }>;
  apis: LegacyImportApi[];
};

function syncModeLabel(mode: SyncMode): string {
  if (mode === 'normal') return '普通模式';
  if (mode === 'good') return '智能合并';
  return '完全覆盖';
}

function taskStatusLabel(status?: string): string {
  if (status === 'queued') return '排队中';
  if (status === 'running') return '执行中';
  if (status === 'success') return '已完成';
  if (status === 'failed') return '失败';
  return status || '-';
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseMaybeJsonText(input: unknown): unknown {
  const raw = String(input || '').trim();
  if (!raw) return undefined;
  try {
    return json5.parse(raw);
  } catch (_err) {
    return undefined;
  }
}

function normalizeMethod(input: unknown): string {
  const method = String(input || 'GET').trim().toUpperCase();
  const supported = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  return supported.includes(method) ? method : 'GET';
}

function normalizePath(input: unknown): string {
  const path = String(input || '').trim();
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function requiredFlag(input: unknown): boolean {
  return !(input === false || input === '0' || input === 0);
}

function inferSchemaFromValue(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value.length > 0 ? inferSchemaFromValue(value[0]) : { type: 'string' }
    };
  }
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    Object.keys(obj).forEach(key => {
      properties[key] = inferSchemaFromValue(obj[key]);
      required.push(key);
    });
    const output: Record<string, unknown> = {
      type: 'object',
      properties
    };
    if (required.length > 0) output.required = required;
    return output;
  }
  return { type: 'string' };
}

function normalizeLegacyImportPayload(input: unknown): LegacyImportPayload | null {
  const source = asObject(input);
  const apis = Array.isArray(source.apis) ? (source.apis as LegacyImportApi[]) : [];
  if (apis.length === 0) return null;
  const cats = Array.isArray(source.cats) ? (source.cats as Array<{ name?: string; desc?: string }>) : [];
  return { cats, apis };
}

function buildOpenApiFromLegacyImport(params: {
  projectId: number;
  defaultCatName: string;
  payload: LegacyImportPayload;
}): Record<string, unknown> {
  const tagDescMap = new Map<string, string>();
  params.payload.cats.forEach(item => {
    const name = String(item?.name || '').trim();
    if (!name) return;
    tagDescMap.set(name, String(item?.desc || ''));
  });

  const paths: Record<string, Record<string, unknown>> = {};
  params.payload.apis.forEach((api, index) => {
    const method = normalizeMethod(api.method).toLowerCase();
    const path = normalizePath(api.path);
    const tagName = String(api.catname || '').trim() || params.defaultCatName;
    if (tagName && !tagDescMap.has(tagName)) {
      tagDescMap.set(tagName, '');
    }

    const operation: Record<string, unknown> = {
      summary: String(api.title || api.path || `api-${index + 1}`),
      description: String(api.desc || ''),
      operationId: `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}_${index + 1}`,
      tags: tagName ? [tagName] : [],
      parameters: [],
      responses: {}
    };

    const parameters = operation.parameters as Array<Record<string, unknown>>;
    const addParam = (inType: 'path' | 'query' | 'header', rows: LegacyImportParam[] | undefined) => {
      if (!Array.isArray(rows)) return;
      rows.forEach(row => {
        const name = String(row?.name || '').trim();
        if (!name) return;
        const exampleValue = row.value ?? row.example;
        parameters.push({
          name,
          in: inType,
          required: inType === 'path' ? true : requiredFlag(row.required),
          description: String(row.desc || ''),
          schema: inferSchemaFromValue(exampleValue),
          example: exampleValue
        });
      });
    };
    addParam('path', Array.isArray(api.req_params) ? api.req_params : []);
    addParam('query', Array.isArray(api.req_query) ? api.req_query : []);
    addParam('header', Array.isArray(api.req_headers) ? api.req_headers : []);

    const reqBodyType = String(api.req_body_type || '').toLowerCase();
    if (reqBodyType === 'form') {
      const reqBodyForm = Array.isArray(api.req_body_form) ? api.req_body_form : [];
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      reqBodyForm.forEach(row => {
        const name = String(row?.name || '').trim();
        if (!name) return;
        const rowType = String(row?.type || 'text').toLowerCase();
        properties[name] =
          rowType === 'file'
            ? { type: 'string', format: 'binary' }
            : inferSchemaFromValue(row.value ?? row.example ?? '');
        if (requiredFlag(row.required)) required.push(name);
      });
      operation.requestBody = {
        content: {
          'application/x-www-form-urlencoded': {
            schema: {
              type: 'object',
              properties,
              ...(required.length > 0 ? { required } : {})
            }
          }
        }
      };
    } else if (reqBodyType === 'json') {
      const sourceText = String(api.req_body_other || '').trim();
      const parsed = parseMaybeJsonText(sourceText);
      if (api.req_body_is_json_schema && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        operation.requestBody = {
          content: {
            'application/json': {
              schema: parsed as Record<string, unknown>
            }
          }
        };
      } else if (typeof parsed !== 'undefined') {
        operation.requestBody = {
          content: {
            'application/json': {
              schema: inferSchemaFromValue(parsed),
              example: parsed
            }
          }
        };
      } else if (sourceText) {
        operation.requestBody = {
          content: {
            'text/plain': {
              schema: { type: 'string' },
              example: sourceText
            }
          }
        };
      }
    } else if (reqBodyType === 'raw' || reqBodyType === 'file') {
      const sourceText = String(api.req_body_other || '');
      if (sourceText) {
        operation.requestBody = {
          content: {
            [reqBodyType === 'file' ? 'application/octet-stream' : 'text/plain']: {
              schema: { type: 'string' },
              example: sourceText
            }
          }
        };
      }
    }

    const responses = operation.responses as Record<string, unknown>;
    const resBodyType = String(api.res_body_type || 'json').toLowerCase();
    const responseText = String(api.res_body || '').trim();
    if (!responseText) {
      responses['200'] = { description: 'OK' };
    } else if (resBodyType === 'json') {
      const parsed = parseMaybeJsonText(responseText);
      if (api.res_body_is_json_schema && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        responses['200'] = {
          description: 'OK',
          content: {
            'application/json': {
              schema: parsed as Record<string, unknown>
            }
          }
        };
      } else if (typeof parsed !== 'undefined') {
        responses['200'] = {
          description: 'OK',
          content: {
            'application/json': {
              schema: inferSchemaFromValue(parsed),
              example: parsed
            }
          }
        };
      } else {
        responses['200'] = {
          description: 'OK',
          content: {
            'text/plain': {
              schema: { type: 'string' },
              example: responseText
            }
          }
        };
      }
    } else {
      responses['200'] = {
        description: 'OK',
        content: {
          'text/plain': {
            schema: { type: 'string' },
            example: responseText
          }
        }
      };
    }

    if (!paths[path]) {
      paths[path] = {};
    }
    paths[path][method] = operation;
  });

  const tags = Array.from(tagDescMap.entries()).map(([name, description]) => ({
    name,
    ...(description ? { description } : {})
  }));

  return {
    openapi: '3.0.3',
    info: {
      title: `YApi Project ${params.projectId}`,
      version: '1.0.0'
    },
    paths,
    tags
  };
}

async function confirmImport(
  summary: SpecImportResult,
  syncMode: SyncMode,
  modalApi: Pick<ReturnType<typeof AntdApp.useApp>['modal'], 'confirm'>
): Promise<boolean> {
  if (syncMode !== 'merge' && syncMode !== 'good') return true;
  return new Promise(resolve => {
    const modal = modalApi.confirm({
      title: '确认执行规范导入',
      okType: 'danger',
      okText: '确认',
      cancelText: '取消',
      content: (
        <Space direction="vertical">
          <Text>检测格式：{summary.detectedFormat || 'unknown'}</Text>
          <Text>分类数量：{summary.categories || 0}</Text>
          <Text>接口数量：{summary.interfaces || 0}</Text>
          <Text>BasePath：{summary.basePath || '/'}</Text>
          <Text>同步模式：{syncModeLabel(syncMode)}</Text>
        </Space>
      ),
      onOk: () => resolve(true),
      onCancel: () => {
        resolve(false);
        modal.destroy();
      }
    });
  });
}

export function ProjectDataPage(props: ProjectDataPageProps) {
  const { message: messageApi, modal } = AntdApp.useApp();
  const [source, setSource] = useState<SpecSource>('json');
  const [importMethod, setImportMethod] = useState('swagger');
  const [exportMethod, setExportMethod] = useState<string>('openapi3');
  const [format, setFormat] = useState<SpecFormat>('auto');
  const [syncMode, setSyncMode] = useState<SyncMode>('merge');
  const [jsonText, setJsonText] = useState(`{
  "openapi": "3.0.0",
  "info": {"title":"demo","version":"1.0.0"},
  "paths": {}
}`);
  const [urlText, setUrlText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [defaultCatId, setDefaultCatId] = useState(0);

  const [taskId, setTaskId] = useState('');
  const [preview, setPreview] = useState<SpecImportResult | null>(null);
  const [notifiedStatus, setNotifiedStatus] = useState('');

  const exportFormat: ExportFormat = 'openapi3';
  const [exportStatus, setExportStatus] = useState<ExportStatus>('all');
  const [withWiki, setWithWiki] = useState(false);
  const [exportText, setExportText] = useState('');
  const token = useMemo(() => props.token || undefined, [props.token]);

  const [importSpec, importState] = useImportSpecMutation();
  const [interUpload, uploadState] = useInterUploadMutation();
  const [exportSpec, exportState] = useExportSpecMutation();
  const callApi = useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => messageApi.error(msg) }),
    [messageApi]
  );
  const catMenuQuery = useGetCatMenuQuery(
    { projectId: props.projectId, token },
    { skip: props.projectId <= 0 }
  );

  const taskQuery = useGetImportTaskQuery(
    {
      taskId,
      projectId: props.projectId,
      token: props.token
    },
    {
      skip: !taskId,
      pollingInterval: taskId ? 1200 : 0
    }
  );

  useEffect(() => {
    const task = taskQuery.data?.data;
    if (!task) return;
    if (task.status !== 'success' && task.status !== 'failed') return;
    if (notifiedStatus === task.status) return;

    if (task.status === 'success') {
      messageApi.success(task.message || '导入任务执行成功');
    } else {
      messageApi.error(task.message || '导入任务执行失败');
    }
    setNotifiedStatus(task.status);
  }, [notifiedStatus, taskQuery.data]);

  const task = taskQuery.data?.data;
  const catList = useMemo(
    () => (Array.isArray(catMenuQuery.data?.data) ? catMenuQuery.data?.data : []),
    [catMenuQuery.data]
  );
  const catNameMap = useMemo(() => {
    const map = new Map<number, string>();
    catList.forEach(item => {
      const id = Number((item as Record<string, unknown>)._id || 0);
      if (id > 0) {
        map.set(id, String((item as Record<string, unknown>).name || '默认分类'));
      }
    });
    return map;
  }, [catList]);

  useEffect(() => {
    if (defaultCatId > 0 && catNameMap.has(defaultCatId)) return;
    const firstId = Number((catList[0] as Record<string, unknown> | undefined)?._id || 0);
    if (firstId > 0) {
      setDefaultCatId(firstId);
    }
  }, [catList, catNameMap, defaultCatId]);
  const importDataModules = useMemo<Record<string, ImportDataItem>>(() => {
    return webPlugins.collectImportDataModules({ projectId: props.projectId });
  }, [props.projectId]);
  const exportDataModules = useMemo<Record<string, ExportDataItem>>(() => {
    return webPlugins.collectExportDataModules({ projectId: props.projectId });
  }, [props.projectId]);

  function getImportPayload(
    overrides?: Partial<{ dryRun: boolean; async: boolean }> & ImportInputOverrides
  ) {
    const nextJsonText = overrides?.jsonText ?? jsonText;
    const nextUrlText = (overrides?.urlText ?? urlText).trim();
    return {
      project_id: props.projectId,
      token,
      format,
      syncMode,
      source,
      json: source === 'json' ? nextJsonText : undefined,
      url: source === 'url' ? nextUrlText : undefined,
      dryRun: overrides?.dryRun,
      async: overrides?.async
    };
  }

  function canSubmitImport(overrides?: ImportInputOverrides): boolean {
    const nextJsonText = overrides?.jsonText ?? jsonText;
    const nextUrlText = (overrides?.urlText ?? urlText).trim();
    if (source === 'url') {
      if (!nextUrlText) {
        messageApi.error('请输入规范 URL');
        return false;
      }
      return true;
    }
    if (!nextJsonText.trim()) {
      messageApi.error('请输入或上传规范 JSON');
      return false;
    }
    return true;
  }

  async function readTextFile(file: File): Promise<string> {
    const text = await file.text();
    setJsonText(text);
    setImportFileName(file.name);
    messageApi.success(`已加载文件: ${file.name}`);
    return text;
  }

  async function handlePreview(overrides?: ImportInputOverrides) {
    if (!canSubmitImport(overrides)) return;
    const response = await callApi(importSpec(getImportPayload({ dryRun: true, ...overrides })).unwrap(), '导入预检失败');
    if (!response) return;
    const data = (response.data || null) as SpecImportResult | null;
    setPreview(data);
    messageApi.success('预检完成');
  }

  async function handleImport(overrides?: ImportInputOverrides) {
    if (!canSubmitImport(overrides)) return;
    const dryRunResponse = await callApi(importSpec(getImportPayload({ dryRun: true, ...overrides })).unwrap(), '导入预检失败');
    if (!dryRunResponse) return;

    const dryRunData = (dryRunResponse.data || null) as SpecImportResult | null;
    if (dryRunData) {
      setPreview(dryRunData);
      const ok = await confirmImport(dryRunData, syncMode, modal);
      if (!ok) {
        messageApi.info('已取消导入');
        return;
      }
    }

    const response = await callApi(importSpec(getImportPayload({ async: true, ...overrides })).unwrap(), '导入失败');
    if (!response) return;

    const payload = (response.data || {}) as Record<string, unknown>;
    const nextTaskId = String(payload.task_id || '');
    if (nextTaskId) {
      setTaskId(nextTaskId);
      setNotifiedStatus('');
      messageApi.success(response.errmsg || '导入任务已提交');
      return;
    }

    messageApi.success(response.errmsg || '导入成功');
  }

  async function handleCompatImport(overrides?: ImportInputOverrides) {
    if (!canSubmitImport(overrides)) return;
    const nextJsonText = overrides?.jsonText ?? jsonText;
    const nextUrlText = (overrides?.urlText ?? urlText).trim();
    const response = await callApi(
      interUpload({
        project_id: props.projectId,
        token,
        source,
        format,
        merge: syncMode,
        interfaceData: source === 'json' ? nextJsonText : undefined,
        url: source === 'url' ? nextUrlText : undefined
      }).unwrap(),
      '兼容导入失败'
    );
    if (!response) return;
    messageApi.success(response.errmsg || '兼容导入成功');
  }

  async function handleExport(selectedFormat: ExportFormat = exportFormat) {
    const response = await callApi(
      exportSpec({
        project_id: props.projectId,
        token,
        format: selectedFormat,
        status: exportStatus,
        withWiki
      }).unwrap(),
      '导出失败'
    );
    if (!response) return;
    setExportText(JSON.stringify(response.data || {}, null, 2));
    messageApi.success('导出成功');
  }

  function downloadExportJson() {
    if (!exportText.trim()) {
      messageApi.info('请先执行导出');
      return;
    }
    const blob = new Blob([exportText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `project-${props.projectId}-${exportMethod}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadTaskReport() {
    if (!taskId) return;
    const link = document.createElement('a');
    link.href = `/api/spec/import/task/download?task_id=${encodeURIComponent(taskId)}`;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handlePluginImport(moduleKey: string, overrides?: ImportInputOverrides) {
    const importer = importDataModules[moduleKey];
    if (!importer) return;
    if (typeof importer.run !== 'function') {
      if (importer.route) {
        window.open(importer.route, '_blank', 'noopener,noreferrer');
      } else {
        messageApi.warning('该导入插件未提供可执行入口');
      }
      return;
    }
    let importSourceText = '';
    const nextJsonText = overrides?.jsonText ?? jsonText;
    const nextUrlText = (overrides?.urlText ?? urlText).trim();
    if (source === 'url') {
      if (!nextUrlText) {
        messageApi.error('请输入规范 URL');
        return;
      }
      try {
        const response = await fetch(nextUrlText, { method: 'GET' });
        importSourceText = await response.text();
      } catch (err) {
        messageApi.error((err as Error)?.message || '下载 URL 内容失败');
        return;
      }
    } else {
      importSourceText = nextJsonText;
    }
    if (!String(importSourceText || '').trim()) {
      messageApi.error('请先输入或上传待转换的内容（JSON 文本）');
      return;
    }

    let converted: unknown;
    try {
      converted = await importer.run(importSourceText);
    } catch (err) {
      messageApi.error((err as Error)?.message || '插件导入转换失败');
      return;
    }
    if (converted == null) {
      messageApi.error('插件导入转换结果为空');
      return;
    }

    let interfaceData = '';
    let importFormat: SpecFormat = 'auto';
    if (typeof converted === 'string') {
      const parsed = parseMaybeJsonText(converted);
      const legacy = normalizeLegacyImportPayload(parsed);
      if (legacy) {
        const defaultCatName = catNameMap.get(defaultCatId) || '默认分类';
        interfaceData = JSON.stringify(
          buildOpenApiFromLegacyImport({
            projectId: props.projectId,
            defaultCatName,
            payload: legacy
          })
        );
        importFormat = 'openapi3';
      } else {
        interfaceData = converted;
      }
    } else {
      const objectValue = asObject(converted);
      const legacy = normalizeLegacyImportPayload(objectValue);
      if (legacy) {
        const defaultCatName = catNameMap.get(defaultCatId) || '默认分类';
        interfaceData = JSON.stringify(
          buildOpenApiFromLegacyImport({
            projectId: props.projectId,
            defaultCatName,
            payload: legacy
          })
        );
        importFormat = 'openapi3';
      } else {
        interfaceData = JSON.stringify(converted);
      }
    }

    const response = await callApi(
      interUpload({
        project_id: props.projectId,
        token,
        source: 'json',
        format: importFormat,
        merge: syncMode,
        interfaceData
      }).unwrap(),
      `${importer.name} 导入失败`
    );
    if (!response) return;
    messageApi.success(response.errmsg || `${importer.name} 导入成功`);
  }

  async function handleImportByMethod(overrides?: ImportInputOverrides) {
    if (importMethod === 'swagger') {
      await handleImport(overrides);
      return;
    }
    if (importMethod === 'compat') {
      await handleCompatImport(overrides);
      return;
    }
    await handlePluginImport(importMethod, overrides);
  }

  async function handleExportByMethod() {
    if (exportMethod === 'swagger2' || exportMethod === 'openapi3') {
      await handleExport(exportMethod);
      return;
    }
    const pluginItem = exportDataModules[exportMethod];
    if (!pluginItem?.route) {
      messageApi.warning('该导出插件未提供可访问路由');
      return;
    }
    const href = buildPluginExportHref(pluginItem.route);
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  function buildPluginExportHref(route: string): string {
    if (!route) return '#';
    try {
      const url = new URL(route, window.location.origin);
      url.searchParams.set('status', exportStatus);
      if (withWiki) {
        url.searchParams.set('isWiki', 'true');
      } else {
        url.searchParams.delete('isWiki');
      }
      return /^https?:\/\//i.test(route) ? url.toString() : `${url.pathname}${url.search}`;
    } catch (_err) {
      return route;
    }
  }

  const isTaskFinished = task?.status === 'success' || task?.status === 'failed';
  const taskProgressStatus = task?.status === 'failed' ? 'exception' : task?.status === 'success' ? 'success' : 'active';

  const mergedImportOptions = [
    { value: 'swagger', label: 'Swagger' },
    { value: 'compat', label: '旧版兼容导入' },
    ...Object.keys(importDataModules).map(key => ({ value: key, label: importDataModules[key].name }))
  ];
  const mergedExportOptions = [
    { value: 'swagger2', label: 'Swagger 2.0' },
    { value: 'openapi3', label: 'OpenAPI 3.0' },
    ...Object.keys(exportDataModules).map(key => ({ value: key, label: exportDataModules[key].name }))
  ];
  const importMethodDesc = useMemo(() => {
    if (importMethod === 'swagger') return '支持 Swagger/OpenAPI 文档导入';
    if (importMethod === 'compat') return '通过旧版兼容接口导入';
    return importDataModules[importMethod]?.desc || '';
  }, [importDataModules, importMethod]);
  const exportMethodDesc = useMemo(() => {
    if (exportMethod === 'openapi3') return '导出 OpenAPI 3.0 Json';
    if (exportMethod === 'swagger2') return '导出 Swagger 2.0 Json';
    return exportDataModules[exportMethod]?.desc || '';
  }, [exportDataModules, exportMethod]);
  const supportsUrlImport = importMethod === 'swagger';
  const wikiSupported = useMemo(() => {
    const key = String(exportMethod || '').toLowerCase();
    if (key === 'openapi3' || key === 'swagger2') return false;
    return !key.includes('json');
  }, [exportMethod]);

  useEffect(() => {
    if (!supportsUrlImport && source === 'url') {
      setSource('json');
    }
  }, [source, supportsUrlImport]);

  useEffect(() => {
    if (!wikiSupported && withWiki) {
      setWithWiki(false);
    }
  }, [wikiSupported, withWiki]);

  return (
    <div className="g-row">
      <div className="m-panel">
        <div className="postman-dataImport">
          <div className="dataImportCon">
            <div>
              <h3>
                数据导入&nbsp;
                <a target="_blank" rel="noopener noreferrer" href="https://hellosean1025.github.io/yapi/documents/data.html">
                  <Tooltip title="点击查看文档"><Typography.Text type="secondary" ><span className="anticon anticon-question-circle-o" /></Typography.Text></Tooltip>
                </a>
              </h3>
            </div>

            <div className="dataImportTile">
              <Select
                placeholder="请选择导入数据的方式"
                value={importMethod}
                onChange={setImportMethod}
                style={{ width: '100%' }}
                options={mergedImportOptions}
              />
            </div>

            <div className="catidSelect">
              <Select<number>
                style={{ width: '100%' }}
                placeholder="请选择数据导入的默认分类"
                value={defaultCatId > 0 ? defaultCatId : undefined}
                onChange={value => setDefaultCatId(Number(value || 0))}
                loading={catMenuQuery.isFetching}
                options={catList.map(item => ({
                  label: String((item as Record<string, unknown>).name || ''),
                  value: Number((item as Record<string, unknown>)._id || 0)
                }))}
              />
            </div>

            <div className="dataSync">
              <span className="label">
                数据同步&nbsp;
                <Tooltip title={
                  <div>
                    <h3 style={{ color: 'white' }}>普通模式</h3><p>不导入已存在的接口</p><br />
                    <h3 style={{ color: 'white' }}>智能合并</h3><p>已存在的接口，将合并返回数据的 response，适用于导入了 swagger 数据，保留对数据结构的改动</p><br />
                    <h3 style={{ color: 'white' }}>完全覆盖</h3><p>不保留旧数据，完全使用新数据，适用于接口定义完全交给后端定义</p>
                  </div>
                }><Typography.Text type="secondary"><span className="anticon anticon-question-circle-o" /></Typography.Text></Tooltip>{' '}
              </span>
              <Select<SyncMode> value={syncMode} onChange={setSyncMode} style={{ width: '100%' }}>
                <Select.Option value="normal">普通模式</Select.Option>
                <Select.Option value="good">智能合并</Select.Option>
                <Select.Option value="merge">完全覆盖</Select.Option>
              </Select>
            </div>

            {supportsUrlImport ? (
              <div className="dataSync">
                <span className="label">
                  开启url导入&nbsp;
                  <Tooltip title="swagger url 导入"><Typography.Text type="secondary"><span className="anticon anticon-question-circle-o" /></Typography.Text></Tooltip>&nbsp;&nbsp;
                </span>
                <Switch checked={source === 'url'} onChange={(checked) => setSource(checked ? 'url' : 'json')} />
              </div>
            ) : null}

            {source === 'url' ? (
              <div className="import-content url-import-content">
                <Input placeholder="http://demo.swagger.io/v2/swagger.json" value={urlText} onChange={e => setUrlText(e.target.value)} />
                <Button type="primary" className="url-btn" onClick={() => void handleImportByMethod()} loading={importState.isLoading}>上传</Button>
              </div>
            ) : (
              <div className="import-content">
                <Upload.Dragger
                  maxCount={1}
                  showUploadList={false}
                  beforeUpload={async file => {
                    try {
                      const loadedText = await readTextFile(file as File);
                      await handleImportByMethod({ jsonText: loadedText });
                    } catch (error) {
                      messageApi.error((error as Error)?.message || '读取文件失败');
                    }
                    return false;
                  }}
                >
                  <p className="ant-upload-drag-icon"><span className="anticon anticon-inbox" /></p>
                  <p className="ant-upload-text">点击或者拖拽文件到上传区域</p>
                </Upload.Dragger>
                {importMethodDesc ? (
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                    {importMethodDesc}
                  </Paragraph>
                ) : null}
                {importFileName && <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>{importFileName}</Typography.Paragraph>}
              </div>
            )}
          </div>

          <div className="dataImportCon" style={{ marginLeft: '20px' }}>
            <div>
              <h3>数据导出</h3>
            </div>
            <div className="dataImportTile">
              <Select<string>
                placeholder="请选择导出数据的方式"
                value={exportMethod}
                onChange={setExportMethod}
                style={{ width: '100%' }}
                options={mergedExportOptions}
              />
            </div>

            <div className="dataExport">
              <Radio.Group value={exportStatus} onChange={e => setExportStatus(e.target.value as ExportStatus)}>
                <Radio value="all">全部接口</Radio>
                <Radio value="open">公开接口</Radio>
              </Radio.Group>
            </div>

            <div className="dataSync">
              <span className="label">
                包含 Wiki&nbsp;
                <Tooltip title="开启后导出时会附带项目 Wiki 内容">
                  <Typography.Text type="secondary">
                    <span className="anticon anticon-question-circle-o" />
                  </Typography.Text>
                </Tooltip>
                &nbsp;&nbsp;
              </span>
              <Switch checked={withWiki} onChange={setWithWiki} disabled={!wikiSupported} />
            </div>

            <div className="export-content">
              <div>
                <p className="export-desc">{exportMethodDesc || '支持 OpenAPI3/Swagger2 导出（如果使用插件导出，可能需在新页面打开）'}</p>
                <Button className="export-button" type="primary" size="large" onClick={() => void handleExportByMethod()} loading={exportState.isLoading}>导出</Button>
                &nbsp;
                <Button className="export-button" size="large" onClick={downloadExportJson} disabled={!exportText}>下载 JSON</Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        title="OpenAPI 导入任务"
        open={Boolean(taskId)}
        onCancel={() => setTaskId('')}
        footer={[
          <Button key="download" onClick={downloadTaskReport} disabled={!taskId}>下载结果</Button>,
          <Button key="close" type="primary" onClick={() => setTaskId('')}>{isTaskFinished ? '关闭' : '后台继续'}</Button>
        ]}
      >
        <p>任务 ID：{taskId || '-'}</p>
        <p>状态：{taskStatusLabel(task?.status)}</p>
        <Progress percent={Math.max(0, Math.min(100, Math.round(Number(task?.progress || 0))))} status={taskProgressStatus} />
        <p>阶段：{task?.stage || '-'}</p>
        <p>消息：{task?.message || '-'}</p>
      </Modal>
    </div>
  );
}
