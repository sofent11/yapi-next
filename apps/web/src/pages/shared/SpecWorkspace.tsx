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
  Badge,
  Button,
  NumberInput,
  Progress,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
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

type SpecWorkspaceMode = 'console' | 'workbench';

type SpecWorkspaceProps = {
  mode: SpecWorkspaceMode;
};

const DEFAULT_SPEC_JSON_SAMPLE =
  '{\n  "openapi": "3.0.0",\n  "info": { "title": "Demo", "version": "1.0.0" },\n  "paths": {}\n}';

const message = {
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  },
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  },
  warning(text: string) {
    notifications.show({ color: 'yellow', message: text });
  }
};

function formatUnixTime(value?: number): string {
  if (!value || value <= 0) return '-';
  return new Date(value * 1000).toLocaleString();
}

function taskColor(status: TaskStatus | undefined): string {
  if (status === 'success') return 'teal';
  if (status === 'running' || status === 'queued') return 'blue';
  if (status === 'failed') return 'red';
  return 'gray';
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
    <div className={`workspace-page spec-workspace ${isWorkbench ? 'is-workbench' : 'is-console'}`}>
      <PageHeader
        title={isWorkbench ? '规范迁移工作台' : 'Spec Console'}
        subtitle={
          isWorkbench
            ? '覆盖 OpenAPI/Swagger 导入任务化、规范导出与接口分类浏览。'
            : 'OpenAPI/Swagger 导入任务化 + 导出 + 分类统计视图。'
        }
      />

      <SectionCard title="连接参数" className="workspace-card">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Text mb={6}>Project ID</Text>
            <NumberInput
              className="workspace-control-top"
              min={1}
              value={projectId}
              onChange={value => setProjectId(typeof value === 'number' ? value : 0)}
            />
          </div>
          <div className="md:col-span-2">
            <Text mb={6}>{isWorkbench ? 'Token (可选，私有项目必填)' : 'Token (私有项目必填)'}</Text>
            <TextInput
              className="workspace-field-top"
              value={token}
              onChange={event => setToken(event.currentTarget.value)}
              placeholder={isWorkbench ? 'demo-token' : 'project token'}
            />
          </div>
        </div>
      </SectionCard>

      <div className="workspace-grid grid gap-4 xl:grid-cols-2">
        <SectionCard title={isWorkbench ? 'OpenAPI 导入任务' : '规范导入'} className="workspace-card">
          <Stack className="workspace-stack">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Text mb={6}>{isWorkbench ? '来源' : 'Source'}</Text>
                <Select
                  className="workspace-control-top"
                  value={source}
                  onChange={value => setSource((value as SpecSource) || 'json')}
                  data={[
                    { value: 'json', label: 'JSON' },
                    { value: 'url', label: 'URL' }
                  ]}
                />
              </div>
              <div>
                <Text mb={6}>{isWorkbench ? '格式' : 'Format'}</Text>
                <Select
                  className="workspace-control-top"
                  value={format}
                  onChange={value => setFormat((value as 'auto' | 'swagger2' | 'openapi3') || 'auto')}
                  data={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'swagger2', label: 'Swagger2' },
                    { value: 'openapi3', label: 'OpenAPI3' }
                  ]}
                />
              </div>
              <div>
                <Text mb={6}>{isWorkbench ? '同步模式' : 'Sync Mode'}</Text>
                <Select
                  className="workspace-control-top"
                  value={syncMode}
                  onChange={value => setSyncMode((value as SyncMode) || 'merge')}
                  data={[
                    { value: 'normal', label: 'Normal' },
                    { value: 'good', label: 'Good' },
                    { value: 'merge', label: 'Merge' }
                  ]}
                />
              </div>
            </div>

            {source === 'json' ? (
              <>
                <div className="workspace-result-actions flex flex-wrap gap-2">
                  <Button size="xs" variant="default" onClick={handleFormatSpecJson} disabled={!specJson.trim()}>
                    格式化 JSON
                  </Button>
                  <Button size="xs" variant="default" onClick={() => setSpecJson(DEFAULT_SPEC_JSON_SAMPLE)}>
                    加载示例
                  </Button>
                  <Button size="xs" variant="default" onClick={() => setSpecJson('')} disabled={!specJson.trim()}>
                    清空
                  </Button>
                </div>
                <Textarea
                  minRows={isWorkbench ? 12 : 10}
                  value={specJson}
                  onChange={event => setSpecJson(event.currentTarget.value)}
                  placeholder={isWorkbench ? '粘贴 OpenAPI/Swagger JSON' : '粘贴 OpenAPI / Swagger JSON'}
                />
              </>
            ) : (
              <TextInput
                value={specUrl}
                onChange={event => setSpecUrl(event.currentTarget.value)}
                placeholder="https://example.com/openapi.json"
              />
            )}

            <div>
              <Button onClick={handleCreateImportTask} loading={importState.isLoading}>
                创建导入任务
              </Button>
            </div>

            {taskId ? (
              <Alert
                color="blue"
                title={`当前任务: ${taskId}`}
              >
                <Stack className="workspace-stack" gap="xs" mt="xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={taskColor(task?.status)}>{task?.status || 'queued'}</Badge>
                    <Text>{task?.message || '-'}</Text>
                    {taskErrors.length > 0 ? (
                      <Button
                        size="xs"
                        variant="default"
                        onClick={() => downloadJsonFile(`import-task-${taskId}-errors.json`, taskErrors)}
                      >
                        下载失败明细
                      </Button>
                    ) : null}
                  </div>
                  <Progress value={task?.progress || 0} color={task?.status === 'failed' ? 'red' : 'blue'} />
                  <Text c="dimmed">阶段: {task?.stage || '-'}</Text>
                </Stack>
              </Alert>
            ) : null}
          </Stack>
        </SectionCard>

        <SectionCard title="规范导出" className="workspace-card">
          <Stack className="workspace-stack">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Text mb={6}>{isWorkbench ? '导出格式' : 'Format'}</Text>
                <Select
                  className="workspace-control-top"
                  value={exportFormat}
                  onChange={value => setExportFormat((value as SpecExportFormat) || 'openapi3')}
                  data={[
                    { value: 'openapi3', label: 'OpenAPI3' },
                    { value: 'swagger2', label: 'Swagger2' }
                  ]}
                />
              </div>
              <div>
                <Text mb={6}>{isWorkbench ? '可见性' : 'Status'}</Text>
                <Select
                  className="workspace-control-top"
                  value={exportStatus}
                  onChange={value => setExportStatus((value as 'all' | 'open') || 'all')}
                  data={
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
              </div>
            </div>
            <div>
              <Button onClick={handleExport} loading={exportState.isLoading}>
                {isWorkbench ? '导出' : '导出规范'}
              </Button>
            </div>
            <div className="workspace-result-actions flex flex-wrap gap-2">
              <Button
                size="xs"
                variant="default"
                disabled={!exportText.trim()}
                onClick={() => {
                  void copyToClipboard(exportText, '导出结果');
                }}
              >
                复制结果
              </Button>
              <Button
                size="xs"
                variant="default"
                disabled={!exportData}
                onClick={() => downloadJsonFile(`spec-export-${projectId}-${exportFormat}.json`, exportData)}
              >
                下载 JSON
              </Button>
              <Button
                size="xs"
                variant="default"
                disabled={!exportText.trim() && !exportData}
                onClick={() => {
                  setExportText('');
                  setExportData(null);
                }}
              >
                清空结果
              </Button>
            </div>
            <Textarea
              minRows={isWorkbench ? 14 : 13}
              readOnly
              value={exportText}
              placeholder={isWorkbench ? '导出结果将展示在这里' : '导出结果'}
            />
          </Stack>
        </SectionCard>
      </div>

      {isWorkbench ? (
        <SectionCard title="导入任务历史" className="workspace-card">
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Task ID</Table.Th>
                <Table.Th>状态</Table.Th>
                <Table.Th>进度</Table.Th>
                <Table.Th>更新时间</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {taskRows.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text c="dimmed" ta="center" py="md">暂无导入任务</Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                taskRows.map(row => (
                  <Table.Tr key={row.task_id}>
                    <Table.Td>
                      <Button variant="subtle" size="compact-sm" onClick={() => setTaskId(row.task_id)}>
                        {row.task_id}
                      </Button>
                    </Table.Td>
                    <Table.Td><Badge color={taskColor(row.status)}>{row.status}</Badge></Table.Td>
                    <Table.Td><Progress value={row.progress || 0} /></Table.Td>
                    <Table.Td>{formatUnixTime(row.up_time)}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </SectionCard>
      ) : null}

      {isWorkbench ? (
        <div className="workspace-grid grid gap-4 xl:grid-cols-2">
          <SectionCard title="分类树" className="workspace-card">
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>分类ID</Table.Th>
                  <Table.Th>名称</Table.Th>
                  <Table.Th>接口数</Table.Th>
                  <Table.Th>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {categoryRows.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text c="dimmed" ta="center" py="md">暂无分类数据</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  categoryRows.map(row => (
                    <Table.Tr key={row.key}>
                      <Table.Td>{row._id}</Table.Td>
                      <Table.Td>{row.name}</Table.Td>
                      <Table.Td>{row.interface_count}</Table.Td>
                      <Table.Td>
                        <Button size="xs" variant="default" onClick={() => setSelectedCatid(row._id)}>
                          查看接口
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </SectionCard>
          <SectionCard title={`分类接口列表 ${selectedCatid > 0 ? `(catid=${selectedCatid})` : ''}`} className="workspace-card">
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Method</Table.Th>
                  <Table.Th>Path</Table.Th>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {interfaceRows.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text c="dimmed" ta="center" py="md">
                        {selectedCatid > 0 ? '该分类下暂无接口' : '请选择分类后查看接口'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  interfaceRows.map(row => {
                    const method = normalizeHttpMethod(row.method || 'GET');
                    return (
                      <Table.Tr key={row.key}>
                        <Table.Td><span className={getHttpMethodBadgeClassName(method)}>{method}</span></Table.Td>
                        <Table.Td>{row.path}</Table.Td>
                        <Table.Td>{row.title}</Table.Td>
                        <Table.Td>{row.status}</Table.Td>
                      </Table.Tr>
                    );
                  })
                )}
              </Table.Tbody>
            </Table>
          </SectionCard>
        </div>
      ) : (
        <div className="workspace-grid grid gap-4 xl:grid-cols-2">
          <SectionCard title="导入任务历史" className="workspace-card">
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Task ID</Table.Th>
                  <Table.Th>状态</Table.Th>
                  <Table.Th>进度</Table.Th>
                  <Table.Th>更新时间</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {taskRows.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text c="dimmed" ta="center" py="md">暂无导入任务</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  taskRows.map(row => (
                    <Table.Tr key={row.task_id}>
                      <Table.Td>
                        <Button variant="subtle" size="compact-sm" onClick={() => setTaskId(row.task_id)}>
                          {row.task_id}
                        </Button>
                      </Table.Td>
                      <Table.Td><Badge color={taskColor(row.status)}>{row.status}</Badge></Table.Td>
                      <Table.Td><Progress value={row.progress || 0} /></Table.Td>
                      <Table.Td>{formatUnixTime(row.up_time)}</Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </SectionCard>
          <SectionCard title="接口分类统计" className="workspace-card">
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>分类ID</Table.Th>
                  <Table.Th>名称</Table.Th>
                  <Table.Th>接口数</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {categoryRows.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={3}>
                      <Text c="dimmed" ta="center" py="md">暂无分类数据</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  categoryRows.map(row => (
                    <Table.Tr key={row.key}>
                      <Table.Td>{row._id}</Table.Td>
                      <Table.Td>{row.name}</Table.Td>
                      <Table.Td>{row.interface_count}</Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
