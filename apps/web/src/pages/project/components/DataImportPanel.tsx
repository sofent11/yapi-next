import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Select, Stack, Switch, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconHelpCircle, IconUpload } from '@tabler/icons-react';
import type { SpecImportResult } from '@yapi-next/shared-types';
import { InfoGrid, InfoGridItem } from '../../../components/patterns/InfoGrid';
import { ProjectDataActions } from '../../../domains/project/ProjectDataActions';
import { ProjectDataIntro } from '../../../domains/project/ProjectDataIntro';
import { ProjectDataPanel } from '../../../domains/project/ProjectDataPanel';
import { useGetCatMenuQuery, useImportSpecMutation, useInterUploadMutation } from '../../../services/yapi-api';
import { webPlugins, type ImportDataItem } from '../../../plugins';
import { safeApiRequest } from '../../../utils/safe-request';
import type { ImportInputOverrides, SpecFormat, SpecSource, SyncMode } from '../ProjectDataPage.types';
import {
  asObject,
  buildOpenApiFromImportPayload,
  normalizeImportPayload,
  parseMaybeJsonText,
  syncModeLabel
} from '../ProjectDataPage.utils';

const message = {
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  },
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  info(text: string) {
    notifications.show({ color: 'blue', message: text });
  },
  warning(text: string) {
    notifications.show({ color: 'yellow', message: text });
  }
};

async function confirmImport(summary: SpecImportResult, syncMode: SyncMode): Promise<boolean> {
  if (syncMode !== 'merge' && syncMode !== 'good') return true;
  return new Promise(resolve => {
    modals.openConfirmModal({
      title: '确认执行规范导入',
      labels: { confirm: '确认', cancel: '取消' },
      confirmProps: { color: 'red' },
      children: (
        <div className="flex flex-col gap-2">
          <Text>检测格式：{summary.detectedFormat || 'unknown'}</Text>
          <Text>分类数量：{summary.categories || 0}</Text>
          <Text>接口数量：{summary.interfaces || 0}</Text>
          <Text>BasePath：{summary.basePath || '/'}</Text>
          <Text>同步模式：{syncModeLabel(syncMode)}</Text>
        </div>
      ),
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    });
  });
}

export interface DataImportPanelProps {
  projectId: number;
  token?: string;
  onTaskStart: (taskId: string) => void;
}

function normalizeCompatSyncMode(syncMode: SyncMode): 'normal' | 'good' | 'merge' {
  return syncMode === 'sync' ? 'merge' : syncMode;
}

export default function DataImportPanel({ projectId, token, onTaskStart }: DataImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [source, setSource] = useState<SpecSource>('json');
  const [importMethod, setImportMethod] = useState('swagger');
  const [format] = useState<SpecFormat>('auto');
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
      safeApiRequest(request, { fallback, onError: msg => message.error(msg) }),
    []
  );

  const catMenuQuery = useGetCatMenuQuery({ projectId, token }, { skip: projectId <= 0 });

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
        message.error('请输入规范 URL');
        return false;
      }
      return true;
    }
    if (!nextJsonText.trim()) {
      message.error('请输入或上传规范 JSON');
      return false;
    }
    return true;
  }

  async function readTextFile(file: File): Promise<string> {
    const text = await file.text();
    setJsonText(text);
    setImportFileName(file.name);
    message.success(`已加载文件: ${file.name}`);
    return text;
  }

  async function handlePreview(overrides?: ImportInputOverrides) {
    if (!canSubmitImport(overrides)) return;
    const response = await callApi(importSpec(getImportPayload({ dryRun: true, ...overrides })).unwrap(), '导入预检失败');
    if (!response) return;
    const data = (response.data || null) as SpecImportResult | null;
    setPreview(data);
    message.success('预检完成');
  }

  async function handleImport(overrides?: ImportInputOverrides) {
    if (!canSubmitImport(overrides)) return;
    const dryRunResponse = await callApi(importSpec(getImportPayload({ dryRun: true, ...overrides })).unwrap(), '导入预检失败');
    if (!dryRunResponse) return;

    const dryRunData = (dryRunResponse.data || null) as SpecImportResult | null;
    if (dryRunData) {
      setPreview(dryRunData);
      const ok = await confirmImport(dryRunData, syncMode);
      if (!ok) {
        message.info('已取消导入');
        return;
      }
    }

    const response = await callApi(importSpec(getImportPayload({ async: true, ...overrides })).unwrap(), '导入失败');
    if (!response) return;

    const payload = (response.data || {}) as Record<string, unknown>;
    const nextTaskId = String(payload.task_id || '');
    if (nextTaskId) {
      onTaskStart(nextTaskId);
      message.success(response.errmsg || '导入任务已提交');
      return;
    }

    message.success(response.errmsg || '导入成功');
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
        merge: normalizeCompatSyncMode(syncMode),
        interfaceData: source === 'json' ? nextJsonText : undefined,
        url: source === 'url' ? nextUrlText : undefined
      }).unwrap(),
      '兼容导入失败'
    );
    if (!response) return;
    message.success(response.errmsg || '兼容导入成功');
  }

  async function handlePluginImport(moduleKey: string, overrides?: ImportInputOverrides) {
    const importer = importDataModules[moduleKey];
    if (!importer) return;
    if (typeof importer.run !== 'function') {
      if (importer.route) {
        window.open(importer.route, '_blank', 'noopener,noreferrer');
      } else {
        message.warning('该导入插件未提供可执行入口');
      }
      return;
    }

    let importSourceText = '';
    const nextJsonText = overrides?.jsonText ?? jsonText;
    const nextUrlText = (overrides?.urlText ?? urlText).trim();

    if (source === 'url') {
      if (!nextUrlText) {
        message.error('请输入规范 URL');
        return;
      }
      try {
        const response = await fetch(nextUrlText, { method: 'GET' });
        importSourceText = await response.text();
      } catch (err) {
        message.error((err as Error)?.message || '下载 URL 内容失败');
        return;
      }
    } else {
      importSourceText = nextJsonText;
    }

    if (!String(importSourceText || '').trim()) {
      message.error('请先输入或上传待转换的内容（JSON 文本）');
      return;
    }

    let converted: unknown;
    try {
      converted = await importer.run(importSourceText);
    } catch (err) {
      message.error((err as Error)?.message || '插件导入转换失败');
      return;
    }
    if (converted == null) {
      message.error('插件导入转换结果为空');
      return;
    }

    let interfaceData = '';
    let importFormat: SpecFormat = 'auto';
    if (typeof converted === 'string') {
      const parsed = parseMaybeJsonText(converted);
      const legacy = normalizeImportPayload(parsed);
      if (legacy) {
        const defaultCatName = catNameMap.get(defaultCatId) || '默认分类';
        interfaceData = JSON.stringify(
          buildOpenApiFromImportPayload({
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
      const legacy = normalizeImportPayload(objectValue);
      if (legacy) {
        const defaultCatName = catNameMap.get(defaultCatId) || '默认分类';
        interfaceData = JSON.stringify(
          buildOpenApiFromImportPayload({
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
        merge: normalizeCompatSyncMode(syncMode),
        interfaceData
      }).unwrap(),
      `${importer.name} 导入失败`
    );
    if (!response) return;
    message.success(response.errmsg || `${importer.name} 导入成功`);
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
  const selectedCategoryName = catNameMap.get(defaultCatId) || '未选择默认分类';

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
    <ProjectDataPanel
      title="数据导入"
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
      <Stack>
        <ProjectDataIntro title={importMethodDesc || '支持 Swagger/OpenAPI 文档导入'}>
          <Text size="sm" c="blue.8">
            默认分类：{selectedCategoryName}。当前来源：{source === 'url' ? 'URL 链接' : '文本或文件'}。
          </Text>
        </ProjectDataIntro>

        <div className="project-data-control-grid">
          <Select
            placeholder="请选择导入数据的方式"
            value={importMethod}
            onChange={value => {
              if (value) setImportMethod(value);
            }}
            className="workspace-control"
            data={mergedImportOptions}
          />
          <Select
            className="workspace-control"
            placeholder="请选择数据导入的默认分类"
            value={defaultCatId > 0 ? String(defaultCatId) : null}
            onChange={value => setDefaultCatId(Number(value || 0))}
            disabled={catMenuQuery.isFetching}
            data={catList.map(item => ({
              label: String((item as Record<string, unknown>).name || ''),
              value: String(Number((item as Record<string, unknown>)._id || 0))
            }))}
          />
        </div>

        <div className="project-data-switch-row">
          <span className="label inline-flex items-center gap-1">
            数据同步
            <Tooltip
              label={
                <div className="space-y-2">
                  <div>
                    <div className="font-semibold">普通模式</div>
                    <div>不导入已存在的接口</div>
                  </div>
                  <div>
                    <div className="font-semibold">智能合并</div>
                    <div>合并已存在接口的返回结构，适合保留手工维护内容。</div>
                  </div>
                  <div>
                    <div className="font-semibold">完全覆盖</div>
                    <div>使用新文档覆盖旧定义，适合后端主导接口结构的场景。</div>
                  </div>
                </div>
              }
              multiline
              maw={320}
            >
              <span className="inline-help-text inline-flex text-slate-500">
                <IconHelpCircle size={16} />
              </span>
            </Tooltip>
          </span>
          <Select
            value={syncMode}
            onChange={value => {
              if (value) setSyncMode(value as SyncMode);
            }}
            className="workspace-control"
            data={[
              { value: 'normal', label: '普通模式' },
              { value: 'good', label: '智能合并' },
              { value: 'merge', label: '完全覆盖' }
            ]}
          />
        </div>

        {supportsUrlImport ? (
          <div className="project-data-switch-row">
            <span className="label inline-flex items-center gap-1">
              开启 URL 导入
              <Tooltip label="使用 swagger/openapi 链接地址导入">
                <span className="inline-help-text inline-flex text-slate-500">
                  <IconHelpCircle size={16} />
                </span>
              </Tooltip>
            </span>
            <Switch checked={source === 'url'} onChange={event => setSource(event.currentTarget.checked ? 'url' : 'json')} />
          </div>
        ) : null}

        {source === 'url' ? (
          <div className="project-data-editor-stack">
            <TextInput
              placeholder="http://demo.swagger.io/v2/swagger.json"
              value={urlText}
              onChange={event => setUrlText(event.currentTarget.value)}
            />
            <ProjectDataActions className="justify-start">
              <Button onClick={() => void handlePreview()} disabled={!previewSupported} loading={importState.isLoading}>
                预检
              </Button>
              <Button onClick={() => void handleImportByMethod()} loading={importState.isLoading || uploadState.isLoading}>
                执行导入
              </Button>
            </ProjectDataActions>
          </div>
        ) : (
          <div className="project-data-editor-stack">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt,.yaml,.yml"
              className="hidden"
              onChange={async event => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                try {
                  await readTextFile(file);
                } catch (error) {
                  message.error((error as Error)?.message || '读取文件失败');
                } finally {
                  event.currentTarget.value = '';
                }
              }}
            />
            <button
              type="button"
              className="project-data-upload-trigger"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="mb-2 inline-flex">
                <IconUpload size={20} />
              </span>
              <div className="text-sm font-medium text-slate-800">点击选择规范文件</div>
              <div className="mt-1 text-sm text-slate-500">支持 JSON / YAML / TXT，选择后会自动填充到下方文本框</div>
            </button>
            <Textarea
              minRows={10}
              value={jsonText}
              onChange={event => setJsonText(event.currentTarget.value)}
              placeholder='粘贴 OpenAPI/Swagger JSON，例如：{"openapi":"3.0.0","paths":{}}'
            />
            <ProjectDataActions className="justify-start">
              <Button onClick={() => void handlePreview()} disabled={!previewSupported} loading={importState.isLoading}>
                预检
              </Button>
              <Button onClick={() => void handleImportByMethod()} loading={importState.isLoading || uploadState.isLoading}>
                执行导入
              </Button>
            </ProjectDataActions>
            {importMethodDesc ? (
              <Text c="dimmed" className="workspace-paragraph-compact">
                {importMethodDesc}
              </Text>
            ) : null}
            {importFileName ? (
              <Text c="dimmed" className="workspace-paragraph">
                {importFileName}
              </Text>
            ) : null}
          </div>
        )}

        {preview ? (
          <div className="project-data-result-card">
            <Text fw={600}>{`预检结果：${preview.detectedFormat || 'unknown'}`}</Text>
            <InfoGrid>
              <InfoGridItem label="分类数量" value={preview.categories || 0} />
              <InfoGridItem label="接口数量" value={preview.interfaces || 0} />
              <InfoGridItem label="BasePath" value={preview.basePath || '/'} />
              <InfoGridItem label="同步模式" value={syncModeLabel(syncMode)} />
            </InfoGrid>
          </div>
        ) : null}
      </Stack>
    </ProjectDataPanel>
  );
}
