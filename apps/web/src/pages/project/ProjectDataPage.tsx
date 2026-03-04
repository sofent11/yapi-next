import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Input, Modal, Progress, Row, Select, Space, Switch, Tabs, Typography, Upload, message, Tooltip, Radio } from 'antd';
import type { SpecImportResult } from '@yapi-next/shared-types';
import {
  useExportSpecMutation,
  useGetImportTaskQuery,
  useImportSpecMutation,
  useInterUploadMutation
} from '../../services/yapi-api';
import { webPlugins, type ExportDataItem, type ImportDataItem } from '../../plugins';
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

async function confirmImport(summary: SpecImportResult, syncMode: SyncMode): Promise<boolean> {
  if (syncMode !== 'merge' && syncMode !== 'good') return true;
  return new Promise(resolve => {
    const modal = Modal.confirm({
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

  const [taskId, setTaskId] = useState('');
  const [preview, setPreview] = useState<SpecImportResult | null>(null);
  const [notifiedStatus, setNotifiedStatus] = useState('');

  const exportFormat: ExportFormat = 'openapi3';
  const [exportStatus, setExportStatus] = useState<ExportStatus>('all');
  const [withWiki, setWithWiki] = useState(false);
  const [exportText, setExportText] = useState('');

  const [importSpec, importState] = useImportSpecMutation();
  const [interUpload, uploadState] = useInterUploadMutation();
  const [exportSpec, exportState] = useExportSpecMutation();

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
      message.success(task.message || '导入任务执行成功');
    } else {
      message.error(task.message || '导入任务执行失败');
    }
    setNotifiedStatus(task.status);
  }, [notifiedStatus, taskQuery.data]);

  const task = taskQuery.data?.data;
  const token = useMemo(() => props.token || undefined, [props.token]);
  const importDataModules = useMemo<Record<string, ImportDataItem>>(() => {
    return webPlugins.collectImportDataModules({ projectId: props.projectId });
  }, [props.projectId]);
  const exportDataModules = useMemo<Record<string, ExportDataItem>>(() => {
    return webPlugins.collectExportDataModules({ projectId: props.projectId });
  }, [props.projectId]);

  function getImportPayload(overrides?: Partial<{ dryRun: boolean; async: boolean }>) {
    return {
      project_id: props.projectId,
      token,
      format,
      syncMode,
      source,
      json: source === 'json' ? jsonText : undefined,
      url: source === 'url' ? urlText.trim() : undefined,
      dryRun: overrides?.dryRun,
      async: overrides?.async
    };
  }

  function canSubmitImport(): boolean {
    if (source === 'url') {
      if (!urlText.trim()) {
        message.error('请输入规范 URL');
        return false;
      }
      return true;
    }
    if (!jsonText.trim()) {
      message.error('请输入或上传规范 JSON');
      return false;
    }
    return true;
  }

  async function readTextFile(file: File) {
    const text = await file.text();
    setJsonText(text);
    setImportFileName(file.name);
    message.success(`已加载文件: ${file.name}`);
  }

  async function handlePreview() {
    if (!canSubmitImport()) return;
    const response = await importSpec(getImportPayload({ dryRun: true })).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '导入预检失败');
      return;
    }
    const data = (response.data || null) as SpecImportResult | null;
    setPreview(data);
    message.success('预检完成');
  }

  async function handleImport() {
    if (!canSubmitImport()) return;
    const dryRunResponse = await importSpec(getImportPayload({ dryRun: true })).unwrap();
    if (dryRunResponse.errcode !== 0) {
      message.error(dryRunResponse.errmsg || '导入预检失败');
      return;
    }

    const dryRunData = (dryRunResponse.data || null) as SpecImportResult | null;
    if (dryRunData) {
      setPreview(dryRunData);
      const ok = await confirmImport(dryRunData, syncMode);
      if (!ok) {
        message.info('已取消导入');
        return;
      }
    }

    const response = await importSpec(getImportPayload({ async: true })).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '导入失败');
      return;
    }

    const payload = (response.data || {}) as Record<string, unknown>;
    const nextTaskId = String(payload.task_id || '');
    if (nextTaskId) {
      setTaskId(nextTaskId);
      setNotifiedStatus('');
      message.success(response.errmsg || '导入任务已提交');
      return;
    }

    message.success(response.errmsg || '导入成功');
  }

  async function handleCompatImport() {
    if (!canSubmitImport()) return;
    const response = await interUpload({
      project_id: props.projectId,
      token,
      source,
      format,
      merge: syncMode,
      interfaceData: source === 'json' ? jsonText : undefined,
      url: source === 'url' ? urlText.trim() : undefined
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '兼容导入失败');
      return;
    }
    message.success(response.errmsg || '兼容导入成功');
  }

  async function handleExport(selectedFormat: ExportFormat = exportFormat) {
    const response = await exportSpec({
      project_id: props.projectId,
      token,
      format: selectedFormat,
      status: exportStatus,
      withWiki
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '导出失败');
      return;
    }
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

  async function handlePluginImport(moduleKey: string) {
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
    if (!jsonText.trim()) {
      message.error('请先输入或上传待转换的内容（JSON 文本）');
      return;
    }

    let converted: unknown;
    try {
      converted = await importer.run(jsonText);
    } catch (err) {
      message.error((err as Error)?.message || '插件导入转换失败');
      return;
    }
    if (converted == null) {
      message.error('插件导入转换结果为空');
      return;
    }
    const interfaceData = typeof converted === 'string' ? converted : JSON.stringify(converted);
    const response = await interUpload({
      project_id: props.projectId,
      token,
      source: 'json',
      format: 'auto',
      merge: syncMode,
      interfaceData
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || `${importer.name} 导入失败`);
      return;
    }
    message.success(response.errmsg || `${importer.name} 导入成功`);
  }

  async function handleImportByMethod() {
    if (importMethod === 'swagger') {
      await handleImport();
      return;
    }
    if (importMethod === 'compat') {
      await handleCompatImport();
      return;
    }
    await handlePluginImport(importMethod);
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

            <div className="catidSelect" style={{ display: 'none' }}>
              <Select style={{ width: '100%' }} placeholder="请选择数据导入的默认分类" />
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

            <div className="dataSync">
              <span className="label">
                开启url导入&nbsp;
                <Tooltip title="swagger url 导入"><Typography.Text type="secondary"><span className="anticon anticon-question-circle-o" /></Typography.Text></Tooltip>&nbsp;&nbsp;
              </span>
              <Switch checked={source === 'url'} onChange={(checked) => setSource(checked ? 'url' : 'json')} />
            </div>

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
                  beforeUpload={file => {
                    void readTextFile(file as File);
                    setTimeout(() => void handleImportByMethod(), 500);
                    return false;
                  }}
                >
                  <p className="ant-upload-drag-icon"><span className="anticon anticon-inbox" /></p>
                  <p className="ant-upload-text">点击或者拖拽文件到上传区域</p>
                </Upload.Dragger>
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
              <Switch checked={withWiki} onChange={setWithWiki} />
            </div>

            <div className="export-content">
              <div>
                <p className="export-desc">支持 OpenAPI3/Swagger2 导出（如果使用插件导出，可能需在新页面打开）</p>
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
