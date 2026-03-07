import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Radio, Select, Stack, Switch, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconHelpCircle } from '@tabler/icons-react';
import { CopyableTextPanel } from '../../../components/patterns/CopyableTextPanel';
import { InfoGrid, InfoGridItem } from '../../../components/patterns/InfoGrid';
import { ProjectDataActions } from '../../../domains/project/ProjectDataActions';
import { ProjectDataIntro } from '../../../domains/project/ProjectDataIntro';
import { ProjectDataPanel } from '../../../domains/project/ProjectDataPanel';
import { useExportSpecMutation } from '../../../services/yapi-api';
import { webPlugins, type ExportDataItem } from '../../../plugins';
import { safeApiRequest } from '../../../utils/safe-request';
import type { ExportFormat, ExportStatus } from '../ProjectDataPage.types';

export interface DataExportPanelProps {
  projectId: number;
  token?: string;
}

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

export default function DataExportPanel({ projectId, token }: DataExportPanelProps) {
  const [exportMethod, setExportMethod] = useState<string>('openapi3');
  const exportFormat: ExportFormat = 'openapi3';
  const [exportStatus, setExportStatus] = useState<ExportStatus>('all');
  const [withWiki, setWithWiki] = useState(false);
  const [exportText, setExportText] = useState('');

  const [exportSpec, exportState] = useExportSpecMutation();
  const callApi = useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => message.error(msg) }),
    []
  );

  const exportDataModules = useMemo<Record<string, ExportDataItem>>(() => {
    return webPlugins.collectExportDataModules({ projectId });
  }, [projectId]);

  async function handleExport(selectedFormat: ExportFormat = exportFormat) {
    const response = await callApi(
      exportSpec({
        project_id: projectId,
        token,
        format: selectedFormat,
        status: exportStatus,
        withWiki
      }).unwrap(),
      '导出失败'
    );
    if (!response) return;
    setExportText(JSON.stringify(response.data || {}, null, 2));
    message.success('导出成功');
  }

  function downloadExportJson() {
    if (!exportText.trim()) {
      message.info('请先执行导出');
      return;
    }
    const blob = new Blob([exportText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `project-${projectId}-${exportMethod}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  async function handleExportByMethod() {
    if (exportMethod === 'swagger2' || exportMethod === 'openapi3') {
      await handleExport(exportMethod);
      return;
    }
    const pluginItem = exportDataModules[exportMethod];
    if (!pluginItem?.route) {
      message.warning('该导出插件未提供可访问路由');
      return;
    }
    const href = buildPluginExportHref(pluginItem.route);
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  const mergedExportOptions = [
    { value: 'swagger2', label: 'Swagger 2.0' },
    { value: 'openapi3', label: 'OpenAPI 3.0' },
    ...Object.keys(exportDataModules).map(key => ({ value: key, label: exportDataModules[key].name }))
  ];

  const exportMethodDesc = useMemo(() => {
    if (exportMethod === 'openapi3') return '导出 OpenAPI 3.0 Json';
    if (exportMethod === 'swagger2') return '导出 Swagger 2.0 Json';
    return exportDataModules[exportMethod]?.desc || '';
  }, [exportDataModules, exportMethod]);

  const wikiSupported = useMemo(() => {
    const key = String(exportMethod || '').toLowerCase();
    if (key === 'openapi3' || key === 'swagger2') return false;
    return !key.includes('json');
  }, [exportMethod]);

  useEffect(() => {
    if (!wikiSupported && withWiki) {
      setWithWiki(false);
    }
  }, [wikiSupported, withWiki]);

  async function handleCopyExport() {
    if (!exportText.trim()) {
      message.info('请先执行导出');
      return;
    }
    try {
      await navigator.clipboard.writeText(exportText);
      message.success('导出结果已复制');
    } catch (_err) {
      message.error('复制失败，请手动复制');
    }
  }

  return (
    <ProjectDataPanel title="数据导出">
      <Stack>
        <ProjectDataIntro title={exportMethodDesc || '支持 OpenAPI3/Swagger2 导出（插件导出可能在新页面打开）'}>
          <Text size="sm" c="blue.8">
            当前导出范围：{exportStatus === 'all' ? '全部接口' : '公开接口'}。{wikiSupported ? '支持附带 Wiki 内容。' : '当前格式不支持附带 Wiki。'}
          </Text>
        </ProjectDataIntro>

        <div className="project-data-control-grid">
          <Select
            placeholder="请选择导出数据的方式"
            value={exportMethod}
            onChange={value => {
              if (value) setExportMethod(value);
            }}
            className="workspace-control"
            data={mergedExportOptions}
          />
          <Radio.Group value={exportStatus} onChange={value => setExportStatus(value as ExportStatus)}>
            <div className="flex flex-wrap gap-4">
              <Radio value="all" label="全部接口" />
              <Radio value="open" label="公开接口" />
            </div>
          </Radio.Group>
        </div>

        <div className="project-data-switch-row">
          <span className="label inline-flex items-center gap-1">
            包含 Wiki
            <Tooltip label="开启后导出时附带项目 Wiki 内容">
              <span className="inline-help-text inline-flex text-slate-500">
                <IconHelpCircle size={16} />
              </span>
            </Tooltip>
          </span>
          <Switch checked={withWiki} onChange={event => setWithWiki(event.currentTarget.checked)} disabled={!wikiSupported} />
        </div>

        <div className="project-data-editor-stack">
          <Text c="dimmed" className="export-desc">
            {exportMethodDesc || '支持 OpenAPI3/Swagger2 导出（插件导出可能在新页面打开）'}
          </Text>
          <ProjectDataActions className="justify-start">
            <Button onClick={() => void handleExportByMethod()} loading={exportState.isLoading}>
              导出
            </Button>
            <Button variant="default" onClick={downloadExportJson} disabled={!exportText}>
              下载 JSON
            </Button>
          </ProjectDataActions>
        </div>

        {exportText ? (
          <div className="project-data-result-card">
            <Text fw={600}>导出结果</Text>
            <InfoGrid>
              <InfoGridItem label="导出方式" value={mergedExportOptions.find(item => item.value === exportMethod)?.label || exportMethod} />
              <InfoGridItem label="导出范围" value={exportStatus === 'all' ? '全部接口' : '公开接口'} />
              <InfoGridItem label="附带 Wiki" value={withWiki ? '是' : '否'} />
              <InfoGridItem label="结果状态" value="已生成，可复制或下载" />
            </InfoGrid>
            <CopyableTextPanel
              title="导出 JSON"
              value={exportText}
              onCopy={() => void handleCopyExport()}
              rows={10}
              monospace
              placeholder="导出结果会显示在这里"
            />
          </div>
        ) : null}
      </Stack>
    </ProjectDataPanel>
  );
}
