import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App as AntdApp, Button, Input, Select, Space, Switch, Tooltip, Typography, Upload } from 'antd';
import type { SpecImportResult } from '@yapi-next/shared-types';
import { useGetCatMenuQuery, useImportSpecMutation, useInterUploadMutation } from '../../../services/yapi-api';
import { webPlugins, type ImportDataItem } from '../../../plugins';
import { safeApiRequest } from '../../../utils/safe-request';
import { SectionCard } from '../../../components/layout';
import type { ImportInputOverrides, SpecFormat, SpecSource, SyncMode } from '../ProjectDataPage.types';
import { asObject, buildOpenApiFromLegacyImport, normalizeLegacyImportPayload, parseMaybeJsonText, syncModeLabel } from '../ProjectDataPage.utils';

const { Text, Paragraph } = Typography;

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

export interface DataImportPanelProps {
  projectId: number;
  token?: string;
  onTaskStart: (taskId: string) => void;
}

export default function DataImportPanel({ projectId, token, onTaskStart }: DataImportPanelProps) {
  const { message: messageApi, modal } = AntdApp.useApp();
  const [source, setSource] = useState<SpecSource>('json');
  const [importMethod, setImportMethod] = useState('swagger');
  const [format, setFormat] = useState<SpecFormat>('auto');
  const [syncMode, setSyncMode] = useState<SyncMode>('merge');
  const [jsonText, setJsonText] = useState(`{\n  "openapi": "3.0.0",\n  "info": {"title":"demo","version":"1.0.0"},\n  "paths": {}\n}`);
  const [urlText, setUrlText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [defaultCatId, setDefaultCatId] = useState(0);
  const [preview, setPreview] = useState<SpecImportResult | null>(null);

  const [importSpec, importState] = useImportSpecMutation();
  const [interUpload, uploadState] = useInterUploadMutation();

  const callApi = useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => messageApi.error(msg) }),
    [messageApi]
  );

  const catMenuQuery = useGetCatMenuQuery(
    { projectId, token },
    { skip: projectId <= 0 }
  );

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
    return webPlugins.collectImportDataModules({ projectId });
  }, [projectId]);

  function getImportPayload(
    overrides?: Partial<{ dryRun: boolean; async: boolean }> & ImportInputOverrides
  ) {
    const nextJsonText = overrides?.jsonText ?? jsonText;
    const nextUrlText = (overrides?.urlText ?? urlText).trim();
    return {
      project_id: projectId,
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
      onTaskStart(nextTaskId);
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
        project_id: projectId,
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
            projectId,
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
            projectId,
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
        project_id: projectId,
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

  const mergedImportOptions = [
    { value: 'swagger', label: 'Swagger' },
    { value: 'compat', label: '旧版兼容导入' },
    ...Object.keys(importDataModules).map(key => ({ value: key, label: importDataModules[key].name }))
  ];

  const importMethodDesc = useMemo(() => {
    if (importMethod === 'swagger') return '支持 Swagger/OpenAPI 文档导入';
    if (importMethod === 'compat') return '通过旧版兼容接口导入';
    return importDataModules[importMethod]?.desc || '';
  }, [importDataModules, importMethod]);

  const previewSupported = importMethod === 'swagger';
  const supportsUrlImport = importMethod === 'swagger';

  useEffect(() => {
    if (!supportsUrlImport && source === 'url') {
      setSource('json');
    }
  }, [source, supportsUrlImport]);

  useEffect(() => {
    setPreview(null);
  }, [importMethod, source]);

  return (
    <SectionCard
      title="数据导入"
      className="legacy-data-card"
      extra={
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://hellosean1025.github.io/yapi/documents/data.html"
        >
          导入文档
        </a>
      }
    >
      <div className="dataImportTile">
        <Select
          placeholder="请选择导入数据的方式"
          value={importMethod}
          onChange={setImportMethod}
          className="legacy-workspace-control"
          options={mergedImportOptions}
        />
      </div>

      <div className="catidSelect">
        <Select<number>
          className="legacy-workspace-control"
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
          数据同步
          <Tooltip
            title={
              <div>
                <h3 className="legacy-data-tooltip-title">普通模式</h3>
                <p>不导入已存在的接口</p>
                <br />
                <h3 className="legacy-data-tooltip-title">智能合并</h3>
                <p>合并已存在接口的返回结构，适合保留手工维护内容。</p>
                <br />
                <h3 className="legacy-data-tooltip-title">完全覆盖</h3>
                <p>使用新文档覆盖旧定义，适合后端主导接口结构的场景。</p>
              </div>
            }
          >
            <Typography.Text type="secondary" className="legacy-inline-help">
              <span className="anticon anticon-question-circle-o" />
            </Typography.Text>
          </Tooltip>
        </span>
        <Select<SyncMode>
          value={syncMode}
          onChange={setSyncMode}
          className="legacy-workspace-control"
          options={[
            { value: 'normal', label: '普通模式' },
            { value: 'good', label: '智能合并' },
            { value: 'merge', label: '完全覆盖' }
          ]}
        />
      </div>

      {supportsUrlImport ? (
        <div className="dataSync">
          <span className="label">
            开启 URL 导入
            <Tooltip title="使用 swagger/openapi 链接地址导入">
              <Typography.Text type="secondary" className="legacy-inline-help">
                <span className="anticon anticon-question-circle-o" />
              </Typography.Text>
            </Tooltip>
          </span>
          <Switch checked={source === 'url'} onChange={checked => setSource(checked ? 'url' : 'json')} />
        </div>
      ) : null}

      {source === 'url' ? (
        <div className="import-content url-import-content">
          <Input
            placeholder="http://demo.swagger.io/v2/swagger.json"
            value={urlText}
            onChange={e => setUrlText(e.target.value)}
          />
          <Space className="url-btn" wrap>
            <Button
              onClick={() => void handlePreview()}
              disabled={!previewSupported}
              loading={importState.isLoading}
            >
              预检
            </Button>
            <Button
              type="primary"
              onClick={() => void handleImportByMethod()}
              loading={importState.isLoading || uploadState.isLoading}
            >
              执行导入
            </Button>
          </Space>
        </div>
      ) : (
        <div className="import-content">
          <Upload.Dragger
            maxCount={1}
            showUploadList={false}
            beforeUpload={async file => {
              try {
                await readTextFile(file as File);
              } catch (error) {
                messageApi.error((error as Error)?.message || '读取文件失败');
              }
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <span className="anticon anticon-inbox" />
            </p>
            <p className="ant-upload-text">点击或者拖拽文件到上传区域</p>
          </Upload.Dragger>
          <Input.TextArea
            rows={10}
            value={jsonText}
            onChange={event => setJsonText(event.target.value)}
            placeholder='粘贴 OpenAPI/Swagger JSON，例如：{"openapi":"3.0.0","paths":{}}'
          />
          <Space wrap>
            <Button
              onClick={() => void handlePreview()}
              disabled={!previewSupported}
              loading={importState.isLoading}
            >
              预检
            </Button>
            <Button
              type="primary"
              onClick={() => void handleImportByMethod()}
              loading={importState.isLoading || uploadState.isLoading}
            >
              执行导入
            </Button>
          </Space>
          {importMethodDesc ? (
            <Paragraph type="secondary" className="legacy-workspace-paragraph-top-compact">
              {importMethodDesc}
            </Paragraph>
          ) : null}
          {importFileName ? (
            <Typography.Paragraph type="secondary" className="legacy-workspace-paragraph-top">
              {importFileName}
            </Typography.Paragraph>
          ) : null}
        </div>
      )}
      {preview ? (
        <Alert
          showIcon
          type="info"
          message={`预检结果：${preview.detectedFormat || 'unknown'}`}
          description={
            <Space direction="vertical" size={2}>
              <span>分类数量：{preview.categories || 0}</span>
              <span>接口数量：{preview.interfaces || 0}</span>
              <span>BasePath：{preview.basePath || '/'}</span>
              <span>同步模式：{syncModeLabel(syncMode)}</span>
            </Space>
          }
        />
      ) : null}
    </SectionCard>
  );
}
