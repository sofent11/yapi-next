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
  Card,
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
import { safeApiRequest } from '../../utils/safe-request';

const { Title, Paragraph, Text } = Typography;

type SpecWorkspaceMode = 'console' | 'workbench';

type SpecWorkspaceProps = {
  mode: SpecWorkspaceMode;
};

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

export function SpecWorkspace(props: SpecWorkspaceProps) {
  const isWorkbench = props.mode === 'workbench';
  const [projectId, setProjectId] = useState<number>(11);
  const [token, setToken] = useState<string>(isWorkbench ? 'demo-token' : '');
  const [source, setSource] = useState<SpecSource>('json');
  const [syncMode, setSyncMode] = useState<SyncMode>('merge');
  const [format, setFormat] = useState<'auto' | 'swagger2' | 'openapi3'>('auto');
  const [specJson, setSpecJson] = useState<string>(
    '{\n  "openapi": "3.0.0",\n  "info": { "title": "Demo", "version": "1.0.0" },\n  "paths": {}\n}'
  );
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

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title={isWorkbench ? undefined : undefined}>
        {isWorkbench ? (
          <>
            <Title level={3} style={{ marginTop: 0 }}>
              YApi Next Workbench
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              React 18 + Vite + RTK Query + AntD 5。当前页面已接入规范导入任务、导出和接口树浏览。
            </Paragraph>
          </>
        ) : (
          <Paragraph style={{ marginBottom: 8 }}>
            Spec Console：OpenAPI/Swagger 导入任务化 + 导出 + 分类统计视图。
          </Paragraph>
        )}
        <Row gutter={12}>
          <Col span={8}>
            <Text>Project ID</Text>
            <InputNumber
              style={{ width: '100%', marginTop: 8 }}
              min={1}
              value={projectId}
              onChange={value => setProjectId(typeof value === 'number' ? value : 0)}
            />
          </Col>
          <Col span={16}>
            <Text>{isWorkbench ? 'Token (可选，私有项目必填)' : 'Token (私有项目必填)'}</Text>
            <Input
              style={{ marginTop: 8 }}
              value={token}
              onChange={event => setToken(event.target.value)}
              placeholder={isWorkbench ? 'demo-token' : 'project token'}
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title={isWorkbench ? 'OpenAPI 导入任务' : '规范导入'}>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Row gutter={8}>
                <Col span={8}>
                  <Text>{isWorkbench ? '来源' : 'Source'}</Text>
                  <Select<SpecSource>
                    style={{ width: '100%', marginTop: 8 }}
                    value={source}
                    onChange={setSource}
                    options={[
                      { value: 'json', label: 'JSON' },
                      { value: 'url', label: 'URL' }
                    ]}
                  />
                </Col>
                <Col span={8}>
                  <Text>{isWorkbench ? '格式' : 'Format'}</Text>
                  <Select<'auto' | 'swagger2' | 'openapi3'>
                    style={{ width: '100%', marginTop: 8 }}
                    value={format}
                    onChange={setFormat}
                    options={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'swagger2', label: 'Swagger2' },
                      { value: 'openapi3', label: 'OpenAPI3' }
                    ]}
                  />
                </Col>
                <Col span={8}>
                  <Text>{isWorkbench ? '同步模式' : 'Sync Mode'}</Text>
                  <Select<SyncMode>
                    style={{ width: '100%', marginTop: 8 }}
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
                <Input.TextArea
                  rows={isWorkbench ? 12 : 10}
                  value={specJson}
                  onChange={event => setSpecJson(event.target.value)}
                  placeholder={isWorkbench ? '粘贴 OpenAPI/Swagger JSON' : '粘贴 OpenAPI / Swagger JSON'}
                />
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
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
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
          </Card>
        </Col>

        <Col span={12}>
          <Card title="规范导出">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Row gutter={8}>
                <Col span={12}>
                  <Text>{isWorkbench ? '导出格式' : 'Format'}</Text>
                  <Select<SpecExportFormat>
                    style={{ width: '100%', marginTop: 8 }}
                    value={exportFormat}
                    onChange={setExportFormat}
                    options={[
                      { value: 'openapi3', label: 'OpenAPI3' },
                      { value: 'swagger2', label: 'Swagger2' }
                    ]}
                  />
                </Col>
                <Col span={12}>
                  <Text>{isWorkbench ? '可见性' : 'Status'}</Text>
                  <Select<'all' | 'open'>
                    style={{ width: '100%', marginTop: 8 }}
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
                {!isWorkbench ? (
                  <Button
                    disabled={!exportData}
                    onClick={() => downloadJsonFile(`spec-export-${projectId}-${exportFormat}.json`, exportData)}
                  >
                    下载 JSON
                  </Button>
                ) : null}
              </Space>
              <Input.TextArea
                rows={isWorkbench ? 14 : 13}
                readOnly
                value={exportText}
                placeholder={isWorkbench ? '导出结果将展示在这里' : '导出结果'}
              />
            </Space>
          </Card>
        </Col>
      </Row>

      {isWorkbench ? (
        <Card title="导入任务历史">
          <Table
            size="small"
            pagination={false}
            loading={tasksQuery.isLoading}
            rowKey="task_id"
            dataSource={taskRows}
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
        </Card>
      ) : null}

      {isWorkbench ? (
        <Row gutter={16}>
          <Col span={12}>
            <Card title="分类树">
              <Table
                size="small"
                pagination={false}
                loading={treeQuery.isLoading}
                dataSource={categoryRows}
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
            </Card>
          </Col>
          <Col span={12}>
            <Card title={`分类接口列表 ${selectedCatid > 0 ? `(catid=${selectedCatid})` : ''}`}>
              <Table
                size="small"
                pagination={false}
                loading={nodeQuery.isLoading}
                dataSource={interfaceRows}
                columns={[
                  { title: 'Method', dataIndex: 'method', key: 'method', width: 100 },
                  { title: 'Path', dataIndex: 'path', key: 'path' },
                  { title: 'Title', dataIndex: 'title', key: 'title' },
                  { title: 'Status', dataIndex: 'status', key: 'status', width: 100 }
                ]}
              />
            </Card>
          </Col>
        </Row>
      ) : (
        <Row gutter={16}>
          <Col span={12}>
            <Card title="导入任务历史">
              <Table
                size="small"
                rowKey="task_id"
                loading={tasksQuery.isLoading}
                dataSource={taskRows}
                pagination={false}
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
            </Card>
          </Col>
          <Col span={12}>
            <Card title="接口分类统计">
              <Table
                size="small"
                rowKey="key"
                loading={treeQuery.isLoading}
                dataSource={categoryRows}
                pagination={false}
                columns={[
                  { title: '分类ID', dataIndex: '_id', width: 100 },
                  { title: '名称', dataIndex: 'name' },
                  { title: '接口数', dataIndex: 'interface_count', width: 100 }
                ]}
              />
            </Card>
          </Col>
        </Row>
      )}
    </Space>
  );
}
