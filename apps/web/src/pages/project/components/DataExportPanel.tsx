import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Button, Radio, Select, Space, Switch, Tooltip, Typography } from 'antd';
import { useExportSpecMutation } from '../../../services/yapi-api';
import { webPlugins, type ExportDataItem } from '../../../plugins';
import { safeApiRequest } from '../../../utils/safe-request';
import { SectionCard } from '../../../components/layout';
import type { ExportFormat, ExportStatus } from '../ProjectDataPage.types';

export interface DataExportPanelProps {
  projectId: number;
  token?: string;
}

export default function DataExportPanel({ projectId, token }: DataExportPanelProps) {
  const { message: messageApi } = AntdApp.useApp();
  const [exportMethod, setExportMethod] = useState<string>('openapi3');
  const exportFormat: ExportFormat = 'openapi3';
  const [exportStatus, setExportStatus] = useState<ExportStatus>('all');
  const [withWiki, setWithWiki] = useState(false);
  const [exportText, setExportText] = useState('');

  const [exportSpec, exportState] = useExportSpecMutation();
  const callApi = useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => messageApi.error(msg) }),
    [messageApi]
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
      messageApi.warning('该导出插件未提供可访问路由');
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

  return (
    <SectionCard title="数据导出" className="legacy-data-card">
      <div className="dataImportTile">
        <Select<string>
          placeholder="请选择导出数据的方式"
          value={exportMethod}
          onChange={setExportMethod}
          className="legacy-workspace-control"
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
          包含 Wiki
          <Tooltip title="开启后导出时附带项目 Wiki 内容">
            <Typography.Text type="secondary" className="legacy-inline-help">
              <span className="anticon anticon-question-circle-o" />
            </Typography.Text>
          </Tooltip>
        </span>
        <Switch checked={withWiki} onChange={setWithWiki} disabled={!wikiSupported} />
      </div>

      <div className="export-content">
        <p className="export-desc">
          {exportMethodDesc || '支持 OpenAPI3/Swagger2 导出（插件导出可能在新页面打开）'}
        </p>
        <Space wrap>
          <Button
            className="export-button"
            type="primary"
            size="large"
            onClick={() => void handleExportByMethod()}
            loading={exportState.isLoading}
          >
            导出
          </Button>
          <Button className="export-button" size="large" onClick={downloadExportJson} disabled={!exportText}>
            下载 JSON
          </Button>
        </Space>
      </div>
    </SectionCard>
  );
}
