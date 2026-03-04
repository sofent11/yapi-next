import { useMemo, useState } from 'react';
import type {
  InterfaceTreeNode,
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
  useGetInterfaceTreeQuery,
  useImportSpecMutation,
  useListImportTasksQuery
} from '../services/yapi-api';

const { Paragraph, Text } = Typography;

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

export function SpecConsolePage() {
  const [projectId, setProjectId] = useState<number>(11);
  const [token, setToken] = useState<string>('');
  const [source, setSource] = useState<SpecSource>('json');
  const [syncMode, setSyncMode] = useState<SyncMode>('merge');
  const [format, setFormat] = useState<'auto' | 'swagger2' | 'openapi3'>('auto');
  const [specJson, setSpecJson] = useState<string>(
    '{\n  "openapi": "3.0.0",\n  "info": { "title": "Demo", "version": "1.0.0" },\n  "paths": {}\n}'
  );
  const [specUrl, setSpecUrl] = useState<string>('');
  const [taskId, setTaskId] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<SpecExportFormat>('openapi3');
  const [exportStatus, setExportStatus] = useState<'all' | 'open'>('all');
  const [exportData, setExportData] = useState<Record<string, unknown> | null>(null);

  const [importSpec, importState] = useImportSpecMutation();
  const [exportSpec, exportState] = useExportSpecMutation();

  const tasksQuery = useListImportTasksQuery(
    { projectId, token: token || undefined, limit: 20 },
    { skip: projectId <= 0 }
  );
  const taskQuery = useGetImportTaskQuery(
    { taskId, projectId, token: token || undefined },
    {
      skip: !taskId || projectId <= 0,
      pollingInterval: 1200
    }
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

  const categoryRows = useMemo(() => {
    const list = treeQuery.data?.data?.list || [];
    return list.map(item => ({ ...item, key: item._id })) as Array<InterfaceTreeNode & { key: number }>;
  }, [treeQuery.data]);
  const taskRows = useMemo(() => {
    return tasksQuery.data?.data?.list || [];
  }, [tasksQuery.data]);

  const task = taskQuery.data?.data;
  const taskErrors = Array.isArray((task as { result?: { errors?: unknown[] } } | undefined)?.result?.errors)
    ? ((task as { result?: { errors?: unknown[] } }).result?.errors as unknown[])
    : [];

  async function handleCreateImportTask() {
    if (projectId <= 0) {
      message.error('project_id 必须大于 0');
      return;
    }
    const response = await importSpec({
      project_id: projectId,
      token: token || undefined,
      source,
      format,
      syncMode,
      async: true,
      json: source === 'json' ? specJson : undefined,
      url: source === 'url' ? specUrl : undefined
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '导入失败');
      return;
    }
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
    const response = await exportSpec({
      project_id: projectId,
      token: token || undefined,
      format: exportFormat,
      status: exportStatus
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '导出失败');
      return;
    }
    setExportData((response.data || {}) as Record<string, unknown>);
    message.success('导出成功');
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Paragraph style={{ marginBottom: 8 }}>
          Spec Console：OpenAPI/Swagger 导入任务化 + 导出 + 分类统计视图。
        </Paragraph>
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
            <Text>Token (私有项目必填)</Text>
            <Input
              style={{ marginTop: 8 }}
              value={token}
              onChange={event => setToken(event.target.value)}
              placeholder="project token"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="规范导入">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Row gutter={8}>
                <Col span={8}>
                  <Text>Source</Text>
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
                  <Text>Format</Text>
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
                  <Text>Sync Mode</Text>
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
                  rows={10}
                  value={specJson}
                  onChange={event => setSpecJson(event.target.value)}
                  placeholder="粘贴 OpenAPI / Swagger JSON"
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
                      <Progress
                        percent={task?.progress || 0}
                        status={task?.status === 'failed' ? 'exception' : 'active'}
                      />
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
                  <Text>Format</Text>
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
                  <Text>Status</Text>
                  <Select<'all' | 'open'>
                    style={{ width: '100%', marginTop: 8 }}
                    value={exportStatus}
                    onChange={setExportStatus}
                    options={[
                      { value: 'all', label: 'all' },
                      { value: 'open', label: 'open' }
                    ]}
                  />
                </Col>
              </Row>
              <Space>
                <Button type="primary" onClick={handleExport} loading={exportState.isLoading}>
                  导出规范
                </Button>
                <Button
                  disabled={!exportData}
                  onClick={() => downloadJsonFile(`spec-export-${projectId}-${exportFormat}.json`, exportData)}
                >
                  下载 JSON
                </Button>
              </Space>
              <Input.TextArea
                rows={13}
                readOnly
                value={exportData ? JSON.stringify(exportData, null, 2) : ''}
                placeholder="导出结果"
              />
            </Space>
          </Card>
        </Col>
      </Row>

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
                  render: (_value: unknown, row: SpecImportTaskDTO) => (
                    <Progress percent={row.progress || 0} size="small" />
                  )
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
    </Space>
  );
}
