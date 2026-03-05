import { useCallback, useMemo, useState } from 'react';
import type {
  InterfaceTreeNode,
  LegacyInterfaceDTO,
  SpecExportFormat,
  SpecImportTaskDTO,
  SpecSource,
  SyncMode,
  TaskStatus
} from '@yapi-next/shared-types';
import {
  Alert,
  Button,
  Col,
  Input,
  InputNumber,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd';
import {
  useExportSpecMutation,
  useGetImportTaskQuery,
  useGetInterfaceTreeNodeQuery,
  useGetInterfaceTreeQuery,
  useImportSpecMutation,
  useListImportTasksQuery
} from '../../services/yapi-api';
import { PageHeader, SectionCard } from '../../components/layout';
import { getHttpMethodBadgeClassName, normalizeHttpMethod } from '../../utils/http-method';
import { safeApiRequest } from '../../utils/safe-request';

const { Text } = Typography;

type SpecWorkspaceMode = 'console' | 'workbench';

type SpecWorkspaceProps = {
  mode: SpecWorkspaceMode;
};

const DEFAULT_SPEC_JSON_SAMPLE =
  '{\n  "openapi": "3.0.0",\n  "info": { "title": "Demo", "version": "1.0.0" },\n  "paths": {}\n}';

function formatUnixTime(value?: number): string {
  if (!value || value <= 0) return '-';
  return new Date(value * 1000).toLocaleString();
}

function taskColor(status: TaskStatus | undefined): 'default' | 'success' | 'processing' | 'error' {
  if (status === 'success') return 'success';
  if (status === 'running' || status === 'queued') return 'processing';
  if (status === 'failed') return 'error';
  return 'default';
}

function downloadJsonFile(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatJsonInput(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch (_err) {
    return null;
  }
}

export function SpecWorkspace(props: SpecWorkspaceProps) {
  const isWorkbench = props.mode === 'workbench';
  const [projectId, setProjectId] = useState<number>(11);
  const [token, setToken] = useState<string>(isWorkbench ? 'demo-token' : '');
  const [source, setSource] = useState<SpecSource>('json');
  const [syncMode, setSyncMode] = useState<SyncMode>('merge');
  const [format, setFormat] = useState<'auto' | 'swagger2' | 'openapi3'>('auto');
  const [specJson, setSpecJson] = useState<string>(DEFAULT_SPEC_JSON_SAMPLE);
  const [specUrl, setSpecUrl] = useState<string>('');
  const [taskId, setTaskId] = useState<string>('');
  const [selectedCatid, setSelectedCatid] = useState<number>(0);
  const [exportFormat, setExportFormat] = useState<SpecExportFormat>('openapi3');
  const [exportStatus, setExportStatus] = useState<'all' | 'open'>('all');
  const [exportText, setExportText] = useState<string>('');
  const [exportData, setExportData] = useState<Record<string, unknown> | null>(null);

  const [importSpec, importState] = useImportSpecMutation();
  const [exportSpec, exportState] = useExportSpecMutation();
  const callApi = useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => message.error(msg) }),
    []
  );

  const taskQuery = useGetImportTaskQuery(
    { taskId, projectId, token: token || undefined },
    {
      skip: !taskId || projectId <= 0,
      pollingInterval: 1200
    }
  );
  const tasksQuery = useListImportTasksQuery(
    { projectId, token: token || undefined, limit: isWorkbench ? 10 : 20 },
    { skip: projectId <= 0 }
  );
  const treeQuery = useGetInterfaceTreeQuery(
    {
      projectId,
      token: token || undefined,
      page: 1,
      limit: 50,
      includeList: false,
      detail: 'summary'
    },
    { skip: projectId <= 0 }
  );
  const nodeQuery = useGetInterfaceTreeNodeQuery(
    {
      catid: selectedCatid,
      token: token || undefined,
      page: 1,
      limit: 100,
      detail: 'summary'
    },
    { skip: selectedCatid <= 0 || !isWorkbench }
  );

  const categoryRows = useMemo(() => {
    const list = treeQuery.data?.data?.list || [];
    return list.map(item => ({ ...item, key: item._id })) as Array<InterfaceTreeNode & { key: number }>;
  }, [treeQuery.data]);
  const taskRows = useMemo(() => tasksQuery.data?.data?.list || [], [tasksQuery.data]);
  const interfaceRows = useMemo(() => {
    const list = nodeQuery.data?.data?.list || [];
    return list.map(item => ({
      ...item,
      key: `${item.method || ''}:${item.path || ''}`
    })) as Array<LegacyInterfaceDTO & { key: string }>;
  }, [nodeQuery.data]);
  const task = taskQuery.data?.data;
  const taskErrors = Array.isArray((task as { result?: { errors?: unknown[] } } | undefined)?.result?.errors)
    ? ((task as { result?: { errors?: unknown[] } }).result?.errors as unknown[])
    : [];

  async function handleCreateImportTask() {
    if (projectId <= 0) {
      message.error('project_id 必须大于 0');
      return;
    }
    const response = await callApi(
      importSpec({
        project_id: projectId,
        token: token || undefined,
        source,
        format,
        syncMode,
        async: true,
        json: source === 'json' ? specJson : undefined,
        url: source === 'url' ? specUrl : undefined
      }).unwrap(),
      '导入失败'
    );
    if (!response) return;
    const result = response.data as Record<string, unknown>;
    if (typeof result.task_id === 'string') {
      setTaskId(result.task_id);
      message.success(`任务已创建: ${result.task_id}`);
      return;
    }
    message.success(response.errmsg || '导入完成');
  }

  async function handleExport() {
    if (projectId <= 0) {
      message.error('project_id 必须大于 0');
      return;
    }
    const response = await callApi(
      exportSpec({
        project_id: projectId,
        token: token || undefined,
        format: exportFormat,
        status: exportStatus
      }).unwrap(),
      '导出失败'
    );
    if (!response) return;
    const data = (response.data || {}) as Record<string, unknown>;
    setExportData(data);
    setExportText(JSON.stringify(data, null, 2));
    message.success('导出成功');
  }

  async function copyToClipboard(text: string, label: string) {
    if (!text.trim()) {
      message.warning(`${label}为空`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      message.success(`${label}已复制`);
    } catch (_err) {
      message.error('复制失败，请手动复制');
    }
  }

  function handleFormatSpecJson() {
    const formatted = formatJsonInput(specJson);
    if (!formatted) {
      message.error('当前 JSON 不是合法格式，无法格式化');
      return;
    }
    setSpecJson(formatted);
    message.success('JSON 已格式化');
  }

  return (
    <div className={`legacy-workspace-page legacy-spec-workspace ${isWorkbench ? 'is-workbench' : 'is-console'}`}>
      <PageHeader
        title={isWorkbench ? '规范迁移工作台' : 'Spec Console'}
        subtitle={
          isWorkbench
            ? '覆盖 OpenAPI/Swagger 导入任务化、规范导出与接口分类浏览。'
            : 'OpenAPI/Swagger 导入任务化 + 导出 + 分类统计视图。'
        }
      />

      <SectionCard title="连接参数" className="legacy-workspace-card">
        <Row gutter={12}>
          <Col xs={24} md={8}>
            <Text>Project ID</Text>
            <InputNumber
              className="legacy-workspace-control-top"
              min={1}
              value={projectId}
              onChange={value => setProjectId(typeof value === 'number' ? value : 0)}
            />
          </Col>
          <Col xs={24} md={16}>
            <Text>{isWorkbench ? 'Token (可选，私有项目必填)' : 'Token (私有项目必填)'}</Text>
            <Input
              className="legacy-workspace-field-top"
              value={token}
              onChange={event => setToken(event.target.value)}
              placeholder={isWorkbench ? 'demo-token' : 'project token'}
            />
          </Col>
        </Row>
      </SectionCard>

      <Row gutter={16} className="legacy-workspace-row">
        <Col xs={24} xl={12}>
          <SectionCard title={isWorkbench ? 'OpenAPI 导入任务' : '规范导入'} className="legacy-workspace-card">
            <Space direction="vertical" className="legacy-workspace-stack" size={12}>
              <Row gutter={8}>
                <Col xs={24} md={8}>
                  <Text>{isWorkbench ? '来源' : 'Source'}</Text>
                  <Select<SpecSource>
                    className="legacy-workspace-control-top"
                    value={source}
                    onChange={setSource}
                    options={[
                      { value: 'json', label: 'JSON' },
                      { value: 'url', label: 'URL' }
                    ]}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Text>{isWorkbench ? '格式' : 'Format'}</Text>
                  <Select<'auto' | 'swagger2' | 'openapi3'>
                    className="legacy-workspace-control-top"
                    value={format}
                    onChange={setFormat}
                    options={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'swagger2', label: 'Swagger2' },
                      { value: 'openapi3', label: 'OpenAPI3' }
                    ]}
                  />
                </Col>
                <Col xs={24} md={8}>
                  <Text>{isWorkbench ? '同步模式' : 'Sync Mode'}</Text>
                  <Select<SyncMode>
                    className="legacy-workspace-control-top"
                    value={syncMode}
                    onChange={setSyncMode}
                    options={[
                      { value: 'normal', label: 'Normal' },
                      { value: 'good', label: 'Good' },
                      { value: 'merge', label: 'Merge' }
                    ]}
                  />
                </Col>
              </Row>

              {source === 'json' ? (
                <>
                  <Space className="legacy-workspace-result-actions" size={8}>
                    <Button size="small" onClick={handleFormatSpecJson} disabled={!specJson.trim()}>
                      格式化 JSON
                    </Button>
                    <Button size="small" onClick={() => setSpecJson(DEFAULT_SPEC_JSON_SAMPLE)}>
                      加载示例
                    </Button>
                    <Button size="small" onClick={() => setSpecJson('')} disabled={!specJson.trim()}>
                      清空
                    </Button>
                  </Space>
                  <Input.TextArea
                    rows={isWorkbench ? 12 : 10}
                    value={specJson}
                    onChange={event => setSpecJson(event.target.value)}
                    placeholder={isWorkbench ? '粘贴 OpenAPI/Swagger JSON' : '粘贴 OpenAPI / Swagger JSON'}
                  />
                </>
              ) : (
                <Input
                  value={specUrl}
                  onChange={event => setSpecUrl(event.target.value)}
                  placeholder="https://example.com/openapi.json"
                />
              )}

              <Button type="primary" onClick={handleCreateImportTask} loading={importState.isLoading}>
                创建导入任务
              </Button>

              {taskId ? (
                <Alert
                  type="info"
                  showIcon
                  message={`当前任务: ${taskId}`}
                  description={
                    <Space direction="vertical" className="legacy-workspace-stack" size={8}>
                      <Space>
                        <Tag color={taskColor(task?.status)}>{task?.status || 'queued'}</Tag>
                        <Text>{task?.message || '-'}</Text>
                        {taskErrors.length > 0 ? (
                          <Button
                            size="small"
                            onClick={() => downloadJsonFile(`import-task-${taskId}-errors.json`, taskErrors)}
                          >
                            下载失败明细
                          </Button>
                        ) : null}
                      </Space>
                      <Progress percent={task?.progress || 0} status={task?.status === 'failed' ? 'exception' : 'active'} />
                      <Text type="secondary">阶段: {task?.stage || '-'}</Text>
                    </Space>
                  }
                />
              ) : null}
            </Space>
          </SectionCard>
        </Col>

        <Col xs={24} xl={12}>
          <SectionCard title="规范导出" className="legacy-workspace-card">
            <Space direction="vertical" className="legacy-workspace-stack" size={12}>
              <Row gutter={8}>
                <Col xs={24} md={12}>
                  <Text>{isWorkbench ? '导出格式' : 'Format'}</Text>
                  <Select<SpecExportFormat>
                    className="legacy-workspace-control-top"
                    value={exportFormat}
                    onChange={setExportFormat}
                    options={[
                      { value: 'openapi3', label: 'OpenAPI3' },
                      { value: 'swagger2', label: 'Swagger2' }
                    ]}
                  />
                </Col>
                <Col xs={24} md={12}>
                  <Text>{isWorkbench ? '可见性' : 'Status'}</Text>
                  <Select<'all' | 'open'>
                    className="legacy-workspace-control-top"
                    value={exportStatus}
                    onChange={setExportStatus}
                    options={
                      isWorkbench
                        ? [
                            { value: 'all', label: '全部接口' },
                            { value: 'open', label: '公开接口' }
                          ]
                        : [
                            { value: 'all', label: 'all' },
                            { value: 'open', label: 'open' }
                          ]
                    }
                  />
                </Col>
              </Row>
              <Space>
                <Button type="primary" onClick={handleExport} loading={exportState.isLoading}>
                  {isWorkbench ? '导出' : '导出规范'}
                </Button>
              </Space>
              <Space className="legacy-workspace-result-actions" size={8}>
                <Button
                  size="small"
                  disabled={!exportText.trim()}
                  onClick={() => {
                    void copyToClipboard(exportText, '导出结果');
                  }}
                >
                  复制结果
                </Button>
                <Button
                  size="small"
                  disabled={!exportData}
                  onClick={() => downloadJsonFile(`spec-export-${projectId}-${exportFormat}.json`, exportData)}
                >
                  下载 JSON
                </Button>
                <Button
                  size="small"
                  disabled={!exportText.trim() && !exportData}
                  onClick={() => {
                    setExportText('');
                    setExportData(null);
                  }}
                >
                  清空结果
                </Button>
              </Space>
              <Input.TextArea
                rows={isWorkbench ? 14 : 13}
                readOnly
                value={exportText}
                placeholder={isWorkbench ? '导出结果将展示在这里' : '导出结果'}
              />
            </Space>
          </SectionCard>
        </Col>
      </Row>

      {isWorkbench ? (
        <SectionCard title="导入任务历史" className="legacy-workspace-card">
          <Table
            size="small"
            pagination={false}
            loading={tasksQuery.isLoading}
            rowKey="task_id"
            dataSource={taskRows}
            locale={{ emptyText: '暂无导入任务' }}
            columns={[
              {
                title: 'Task ID',
                dataIndex: 'task_id',
                key: 'task_id',
                render: (value: string) => (
                  <Button type="link" onClick={() => setTaskId(value)}>
                    {value}
                  </Button>
                )
              },
              {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                render: (value: TaskStatus) => <Tag color={taskColor(value)}>{value}</Tag>
              },
              {
                title: '进度',
                dataIndex: 'progress',
                key: 'progress',
                width: 260,
                render: (_value: number, row: SpecImportTaskDTO) => <Progress percent={row.progress || 0} size="small" />
              },
              {
                title: '更新时间',
                dataIndex: 'up_time',
                key: 'up_time',
                width: 180,
                render: (value: number) => formatUnixTime(value)
              }
            ]}
          />
        </SectionCard>
      ) : null}

      {isWorkbench ? (
        <Row gutter={16} className="legacy-workspace-row">
          <Col xs={24} xl={12}>
            <SectionCard title="分类树" className="legacy-workspace-card">
              <Table
                size="small"
                pagination={false}
                loading={treeQuery.isLoading}
                dataSource={categoryRows}
                locale={{ emptyText: '暂无分类数据' }}
                columns={[
                  { title: '分类ID', dataIndex: '_id', key: '_id', width: 100 },
                  { title: '名称', dataIndex: 'name', key: 'name' },
                  { title: '接口数', dataIndex: 'interface_count', key: 'interface_count', width: 100 },
                  {
                    title: '操作',
                    key: 'action',
                    width: 120,
                    render: (_value, row) => (
                      <Button size="small" onClick={() => setSelectedCatid(row._id)}>
                        查看接口
                      </Button>
                    )
                  }
                ]}
              />
            </SectionCard>
          </Col>
          <Col xs={24} xl={12}>
            <SectionCard title={`分类接口列表 ${selectedCatid > 0 ? `(catid=${selectedCatid})` : ''}`} className="legacy-workspace-card">
              <Table
                size="small"
                pagination={false}
                loading={nodeQuery.isLoading}
                dataSource={interfaceRows}
                locale={{ emptyText: selectedCatid > 0 ? '该分类下暂无接口' : '请选择分类后查看接口' }}
                columns={[
                  {
                    title: 'Method',
                    dataIndex: 'method',
                    key: 'method',
                    width: 110,
                    render: (value: string) => {
                      const method = normalizeHttpMethod(value || 'GET');
                      return <span className={getHttpMethodBadgeClassName(method)}>{method}</span>;
                    }
                  },
                  { title: 'Path', dataIndex: 'path', key: 'path' },
                  { title: 'Title', dataIndex: 'title', key: 'title' },
                  { title: 'Status', dataIndex: 'status', key: 'status', width: 100 }
                ]}
              />
            </SectionCard>
          </Col>
        </Row>
      ) : (
        <Row gutter={16} className="legacy-workspace-row">
          <Col xs={24} xl={12}>
            <SectionCard title="导入任务历史" className="legacy-workspace-card">
              <Table
                size="small"
                rowKey="task_id"
                loading={tasksQuery.isLoading}
                dataSource={taskRows}
                pagination={false}
                locale={{ emptyText: '暂无导入任务' }}
                columns={[
                  {
                    title: 'Task ID',
                    dataIndex: 'task_id',
                    render: (value: string) => (
                      <Button type="link" onClick={() => setTaskId(value)}>
                        {value}
                      </Button>
                    )
                  },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    width: 100,
                    render: (value: TaskStatus) => <Tag color={taskColor(value)}>{value}</Tag>
                  },
                  {
                    title: '进度',
                    width: 180,
                    render: (_value: unknown, row: SpecImportTaskDTO) => <Progress percent={row.progress || 0} size="small" />
                  },
                  {
                    title: '更新时间',
                    dataIndex: 'up_time',
                    width: 170,
                    render: (value: number) => formatUnixTime(value)
                  }
                ]}
              />
            </SectionCard>
          </Col>
          <Col xs={24} xl={12}>
            <SectionCard title="接口分类统计" className="legacy-workspace-card">
              <Table
                size="small"
                rowKey="key"
                loading={treeQuery.isLoading}
                dataSource={categoryRows}
                pagination={false}
                locale={{ emptyText: '暂无分类数据' }}
                columns={[
                  { title: '分类ID', dataIndex: '_id', width: 100 },
                  { title: '名称', dataIndex: 'name' },
                  { title: '接口数', dataIndex: 'interface_count', width: 100 }
                ]}
              />
            </SectionCard>
          </Col>
        </Row>
      )}
    </div>
  );
}
