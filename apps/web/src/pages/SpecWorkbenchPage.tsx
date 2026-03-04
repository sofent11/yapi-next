import { useMemo, useState } from 'react';
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
  Form,
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
} from '../services/yapi-api';

const { Title, Paragraph, Text } = Typography;

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

export function SpecWorkbenchPage() {
  const [projectId, setProjectId] = useState<number>(11);
  const [token, setToken] = useState<string>('demo-token');
  const [source, setSource] = useState<SpecSource>('json');
  const [syncMode, setSyncMode] = useState<SyncMode>('merge');
  const [format, setFormat] = useState<'auto' | 'swagger2' | 'openapi3'>('auto');
  const [specJson, setSpecJson] = useState<string>('{\n  "openapi": "3.0.0",\n  "info": { "title": "Demo", "version": "1.0.0" },\n  "paths": {}\n}');
  const [specUrl, setSpecUrl] = useState<string>('');
  const [taskId, setTaskId] = useState<string>('');
  const [selectedCatid, setSelectedCatid] = useState<number>(0);
  const [exportFormat, setExportFormat] = useState<SpecExportFormat>('openapi3');
  const [exportStatus, setExportStatus] = useState<'all' | 'open'>('all');
  const [exportText, setExportText] = useState<string>('');

  const [importSpec, importState] = useImportSpecMutation();
  const [exportSpec, exportState] = useExportSpecMutation();

  const taskQuery = useGetImportTaskQuery(
    { taskId, projectId, token: token || undefined },
    {
      skip: !taskId || projectId <= 0,
      pollingInterval: 1200
    }
  );

  const tasksQuery = useListImportTasksQuery(
    { projectId, token: token || undefined, limit: 10 },
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
    { skip: selectedCatid <= 0 }
  );

  const categoryRows = useMemo(() => {
    const list = treeQuery.data?.data?.list || [];
    return list.map(item => ({ ...item, key: item._id })) as Array<InterfaceTreeNode & { key: number }>;
  }, [treeQuery.data]);

  const interfaceRows = useMemo(() => {
    const list = nodeQuery.data?.data?.list || [];
    return list.map(item => ({
      ...item,
      key: `${item.method || ''}:${item.path || ''}`
    })) as Array<LegacyInterfaceDTO & { key: string }>;
  }, [nodeQuery.data]);

  async function handleCreateImportTask() {
    if (projectId <= 0) {
      message.error('project_id 必须大于 0');
      return;
    }
    const payload = {
      project_id: projectId,
      token: token || undefined,
      source,
      format,
      syncMode,
      async: true,
      json: source === 'json' ? specJson : undefined,
      url: source === 'url' ? specUrl : undefined
    } as const;
    const response = await importSpec(payload).unwrap();
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
    setExportText(JSON.stringify(response.data, null, 2));
    message.success('导出成功');
  }

  const task = taskQuery.data?.data;
  const taskErrors = Array.isArray((task as { result?: { errors?: unknown[] } } | undefined)?.result?.errors)
    ? ((task as { result?: { errors?: unknown[] } }).result?.errors as unknown[])
    : [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Title level={3} style={{ marginTop: 0 }}>
          YApi Next Workbench
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          React 18 + Vite + RTK Query + AntD 5。当前页面已接入规范导入任务、导出和接口树浏览。
        </Paragraph>
      </Card>

      <Card title="连接设置">
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
            <Text>Token (可选，私有项目必填)</Text>
            <Input
              style={{ marginTop: 8 }}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="demo-token"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="OpenAPI 导入任务">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Row gutter={8}>
                <Col span={8}>
                  <Text>来源</Text>
                  <Select<SpecSource>
                    value={source}
                    style={{ width: '100%', marginTop: 8 }}
                    onChange={setSource}
                    options={[
                      { value: 'json', label: 'JSON' },
                      { value: 'url', label: 'URL' }
                    ]}
                  />
                </Col>
                <Col span={8}>
                  <Text>格式</Text>
                  <Select<'auto' | 'swagger2' | 'openapi3'>
                    value={format}
                    style={{ width: '100%', marginTop: 8 }}
                    onChange={setFormat}
                    options={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'swagger2', label: 'Swagger2' },
                      { value: 'openapi3', label: 'OpenAPI3' }
                    ]}
                  />
                </Col>
                <Col span={8}>
                  <Text>同步模式</Text>
                  <Select<SyncMode>
                    value={syncMode}
                    style={{ width: '100%', marginTop: 8 }}
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
                  value={specJson}
                  rows={12}
                  onChange={e => setSpecJson(e.target.value)}
                  placeholder="粘贴 OpenAPI/Swagger JSON"
                />
              ) : (
                <Input
                  value={specUrl}
                  onChange={e => setSpecUrl(e.target.value)}
                  placeholder="https://example.com/openapi.json"
                />
              )}

              <Button type="primary" loading={importState.isLoading} onClick={handleCreateImportTask}>
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
                  <Text>导出格式</Text>
                  <Select<SpecExportFormat>
                    value={exportFormat}
                    style={{ width: '100%', marginTop: 8 }}
                    onChange={setExportFormat}
                    options={[
                      { value: 'openapi3', label: 'OpenAPI3' },
                      { value: 'swagger2', label: 'Swagger2' }
                    ]}
                  />
                </Col>
                <Col span={12}>
                  <Text>可见性</Text>
                  <Select<'all' | 'open'>
                    value={exportStatus}
                    style={{ width: '100%', marginTop: 8 }}
                    onChange={setExportStatus}
                    options={[
                      { value: 'all', label: '全部接口' },
                      { value: 'open', label: '公开接口' }
                    ]}
                  />
                </Col>
              </Row>

              <Button type="primary" onClick={handleExport} loading={exportState.isLoading}>
                导出
              </Button>

              <Input.TextArea
                value={exportText}
                rows={14}
                readOnly
                placeholder="导出结果将展示在这里"
              />
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title="导入任务历史">
        <Table
          size="small"
          pagination={false}
          loading={tasksQuery.isLoading}
          rowKey="task_id"
          dataSource={tasksQuery.data?.data?.list || []}
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
              render: (_value: number, row: SpecImportTaskDTO) => (
                <Progress percent={row.progress || 0} size="small" />
              )
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
    </Space>
  );
}
