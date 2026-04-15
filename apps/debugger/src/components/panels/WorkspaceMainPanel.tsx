import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  SegmentedControl,
  Select,
  Tabs,
  Text,
  TextInput,
  Textarea
} from '@mantine/core';
import {
  IconDeviceFloppy,
  IconLayoutGridAdd,
  IconPlayerPlay,
  IconUpload
} from '@tabler/icons-react';
import type {
  CaseDocument,
  EnvironmentDocument,
  ParameterRow,
  ProjectDocument,
  RequestBody,
  RequestDocument,
  SendRequestResult,
  WorkspaceIndex
} from '@yapi-debugger/schema';
import type { SelectedNode } from '../../store/workspace-store';
import { CodeEditor } from '../editors/CodeEditor';
import { KeyValueEditor } from '../primitives/KeyValueEditor';

function statsFromResponse(response: SendRequestResult | null) {
  if (!response) {
    return [
      { label: '状态码', value: '--' },
      { label: '耗时', value: '--' },
      { label: '大小', value: '--' }
    ];
  }

  return [
    { label: '状态码', value: String(response.status) },
    { label: '耗时', value: `${response.durationMs} ms` },
    { label: '大小', value: `${response.sizeBytes} B` }
  ];
}

function validationMessages(response: SendRequestResult | null) {
  if (!response) return ['发送请求后，这里会展示运行反馈与关键观察。'];
  if (!response.ok) {
    return [
      `请求返回 ${response.status}，需要检查认证、参数或上游服务状态。`,
      '可以先确认 Header、Query 与 Body 是否符合预期。'
    ];
  }

  try {
    const parsed = JSON.parse(response.bodyText) as Record<string, unknown>;
    const messages: string[] = [];
    if (!('data' in parsed)) messages.push('响应中未发现 `data` 字段。');
    if (!('code' in parsed) && !('errcode' in parsed)) messages.push('响应中未发现统一状态码字段。');
    return messages.length > 0 ? messages : ['响应结构看起来完整，可以继续补充更细的断言能力。'];
  } catch (_err) {
    return ['响应不是 JSON 文本，当前仅能展示原始响应。'];
  }
}

function responseBodyLanguage(response: SendRequestResult | null) {
  if (!response?.bodyText) return 'text';
  try {
    JSON.parse(response.bodyText);
    return 'json';
  } catch (_err) {
    return 'text';
  }
}

function responseHeadersText(response: SendRequestResult | null) {
  return (response?.headers || []).map(item => `${item.name}: ${item.value}`).join('\n');
}

function responseSummaryText(response: SendRequestResult | null) {
  if (!response) return '尚未发送请求';
  return `${response.status} ${response.statusText}`;
}

function categoryLabel(path: string | null) {
  if (!path) return '项目首页';
  return path.split('/').at(-1) || path;
}

function selectedRequestId(node: SelectedNode) {
  return node.kind === 'request' || node.kind === 'case' ? node.requestId : null;
}

function selectedCaseId(node: SelectedNode) {
  return node.kind === 'case' ? node.caseId : null;
}

function caseOptions(cases: CaseDocument[]) {
  return [{ value: '__base__', label: '基础请求' }, ...cases.map(item => ({ value: item.id, label: item.name }))];
}

function replaceCase(
  cases: CaseDocument[],
  caseId: string,
  updater: (current: CaseDocument) => CaseDocument
) {
  return cases.map(item => (item.id === caseId ? updater(item) : item));
}

function bodyModeLabel(mode: RequestDocument['body']['mode']) {
  switch (mode) {
    case 'json':
      return 'JSON';
    case 'form':
      return 'FORM';
    case 'text':
      return 'RAW';
    default:
      return 'NONE';
  }
}

function projectBreadcrumbs(project: ProjectDocument, selectedNode: SelectedNode, request: RequestDocument | null) {
  if (selectedNode.kind === 'project') return [project.name];
  if (selectedNode.kind === 'category') return [project.name, categoryLabel(selectedNode.path)];
  if (selectedNode.kind === 'case') {
    return [project.name, request?.name || '接口', '用例'];
  }
  return [project.name, request?.name || '接口'];
}

function rowsOrFallback(rows: ParameterRow[] | undefined, fallback: ParameterRow[]) {
  return rows ?? fallback;
}

export function WorkspaceMainPanel(props: {
  workspace: WorkspaceIndex;
  selectedNode: SelectedNode;
  categoryRequests: WorkspaceIndex['requests'];
  draftProject: ProjectDocument | null;
  request: RequestDocument | null;
  response: SendRequestResult | null;
  cases: CaseDocument[];
  activeEnvironmentName: string;
  selectedEnvironment: EnvironmentDocument | null;
  isRunning: boolean;
  isDirty: boolean;
  onProjectChange: (project: ProjectDocument) => void;
  onEnvironmentChange: (name: string) => void;
  onEnvironmentUpdate: (name: string, updater: (environment: EnvironmentDocument) => EnvironmentDocument) => void;
  onRequestChange: (request: RequestDocument) => void;
  onCasesChange: (cases: CaseDocument[]) => void;
  onCaseSelect: (caseId: string | null) => void;
  onAddCase: () => void;
  onRun: () => void;
  onSave: () => void;
  onSelectRequest: (requestId: string) => void;
  onOpenImport: () => void;
  onCreateInterface: () => void;
}) {
  const [requestTab, setRequestTab] = useState<'query' | 'headers' | 'body' | 'auth' | 'settings'>('query');
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'raw'>('body');
  const [workspaceTab, setWorkspaceTab] = useState<'debug' | 'cases' | 'settings'>('debug');
  const stats = useMemo(() => statsFromResponse(props.response), [props.response]);
  const validation = useMemo(() => validationMessages(props.response), [props.response]);
  const request = props.request;
  const caseId = selectedCaseId(props.selectedNode);
  const selectedCase = props.cases.find(item => item.id === caseId) || null;
  const breadcrumbs = projectBreadcrumbs(props.workspace.project, props.selectedNode, request);

  function updateSelectedCase(updater: (current: CaseDocument) => CaseDocument) {
    if (!selectedCase) return;
    props.onCasesChange(replaceCase(props.cases, selectedCase.id, updater));
  }

  function updateCaseBody(body: RequestBody) {
    updateSelectedCase(current => ({
      ...current,
      overrides: {
        ...current.overrides,
        body
      }
    }));
  }

  function updateCaseRows(
    key: 'query' | 'headers' | 'pathParams',
    rows: ParameterRow[]
  ) {
    updateSelectedCase(current => ({
      ...current,
      overrides: {
        ...current.overrides,
        [key]: rows
      }
    }));
  }

  if (props.selectedNode.kind === 'project' && props.draftProject) {
    const project = props.draftProject;
    return (
      <section className="workspace-main workspace-surface">
        <div className="workspace-tabs-head">
          <div className="workspace-breadcrumbs">
            {breadcrumbs.map(item => (
              <span key={item} className="workspace-crumb">
                {item}
              </span>
            ))}
          </div>
          <Group>
            <Button variant="light" color="dark" leftSection={<IconUpload size={16} />} onClick={props.onOpenImport}>
              导入接口
            </Button>
            <Button variant="default" color="dark" leftSection={<IconDeviceFloppy size={16} />} onClick={props.onSave}>
              保存项目
            </Button>
          </Group>
        </div>

        <div className="workspace-overview-hero project-hero">
          <div>
            <p className="eyebrow">Project Runtime</p>
            <h2>{project.name}</h2>
            <Text c="dimmed">
              项目节点承载共享 baseUrl、公共变量、公共 Header 和导入入口。环境在这里作为覆盖层出现，不再和接口编辑混在一起。
            </Text>
          </div>
          <div className="workspace-request-facts">
            <div className="request-fact-pill">
              <span>分类</span>
              <strong>{new Set(props.workspace.requests.map(item => item.folderSegments.join('/')).filter(Boolean)).size}</strong>
            </div>
            <div className="request-fact-pill">
              <span>接口</span>
              <strong>{props.workspace.requests.length}</strong>
            </div>
            <div className="request-fact-pill">
              <span>环境</span>
              <strong>{props.workspace.environments.length}</strong>
            </div>
          </div>
        </div>

        <div className="project-config-grid">
          <div className="workspace-card project-main-card">
            <div className="panel-section-head">
              <Text fw={700}>项目配置</Text>
              {props.isDirty ? <Badge variant="light" color="orange">未保存</Badge> : null}
            </div>
            <div className="workspace-settings-grid">
              <TextInput
                label="项目名称"
                value={project.name}
                onChange={event => props.onProjectChange({ ...project, name: event.currentTarget.value })}
              />
              <Select
                label="默认环境"
                value={project.defaultEnvironment}
                data={props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))}
                onChange={value => value && props.onProjectChange({ ...project, defaultEnvironment: value })}
              />
            </div>

            <div className="workspace-settings-grid">
              <TextInput
                label="Base URL"
                value={project.runtime.baseUrl}
                placeholder="https://api.example.com"
                onChange={event =>
                  props.onProjectChange({
                    ...project,
                    runtime: {
                      ...project.runtime,
                      baseUrl: event.currentTarget.value
                    }
                  })
                }
              />
              <Textarea
                label="项目说明"
                minRows={3}
                autosize
                value={project.runtime.description}
                onChange={event =>
                  props.onProjectChange({
                    ...project,
                    runtime: {
                      ...project.runtime,
                      description: event.currentTarget.value
                    }
                  })
                }
              />
            </div>

            <div className="project-kv-grid">
              <div className="workspace-card nested-card">
                <Text fw={700}>公共变量</Text>
                <KeyValueEditor
                  rows={Object.entries(project.runtime.vars).map(([name, value]) => ({ name, value, enabled: true }))}
                  onChange={rows =>
                    props.onProjectChange({
                      ...project,
                      runtime: {
                        ...project.runtime,
                        vars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                      }
                    })
                  }
                />
              </div>
              <div className="workspace-card nested-card">
                <Text fw={700}>公共 Header</Text>
                <KeyValueEditor
                  rows={project.runtime.headers}
                  onChange={rows =>
                    props.onProjectChange({
                      ...project,
                      runtime: {
                        ...project.runtime,
                        headers: rows
                      }
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div className="project-side-stack">
            <div className="workspace-card">
              <div className="panel-section-head">
                <Text fw={700}>当前环境覆盖</Text>
                <Select
                  value={props.activeEnvironmentName}
                  data={props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))}
                  onChange={value => value && props.onEnvironmentChange(value)}
                />
              </div>
              <Text c="dimmed" size="sm">
                环境只负责覆盖共享变量。请求解析顺序为：项目共享配置、环境覆盖、接口配置、用例覆盖。
              </Text>
              <div className="workspace-card nested-card">
                <KeyValueEditor
                  rows={Object.entries(props.selectedEnvironment?.vars || {}).map(([name, value]) => ({ name, value, enabled: true }))}
                  onChange={rows =>
                    props.onEnvironmentUpdate(props.activeEnvironmentName, environment => ({
                      ...environment,
                      vars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                    }))
                  }
                />
              </div>
            </div>

            <div className="workspace-card project-import-card">
              <Text fw={700}>项目级入口</Text>
              <Text c="dimmed" size="sm">
                打开 workspace 已移到 File 菜单。导入入口保留在项目层，避免和单个接口编辑混淆。
              </Text>
              <Button color="dark" leftSection={<IconUpload size={16} />} onClick={props.onOpenImport}>
                从规范导入到当前项目
              </Button>
              <Button variant="light" color="dark" leftSection={<IconLayoutGridAdd size={16} />} onClick={props.onCreateInterface}>
                直接新建接口
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (props.selectedNode.kind === 'category') {
    return (
      <section className="workspace-main workspace-surface">
        <div className="workspace-tabs-head">
          <div className="workspace-breadcrumbs">
            {breadcrumbs.map(item => (
              <span key={item} className="workspace-crumb">
                {item}
              </span>
            ))}
          </div>
          <Button color="dark" leftSection={<IconLayoutGridAdd size={16} />} onClick={props.onCreateInterface}>
            在此分类新建接口
          </Button>
        </div>

        <div className="workspace-overview-hero category-hero">
          <div>
            <p className="eyebrow">Category</p>
            <h2>{categoryLabel(props.selectedNode.path)}</h2>
            <Text c="dimmed">分类页只负责摘要与组织，不承载请求编辑。接口与用例的实际工作流都在选中接口后进入同一工作台。</Text>
          </div>
          <div className="request-fact-pill">
            <span>接口数量</span>
            <strong>{props.categoryRequests.length}</strong>
          </div>
        </div>

        <div className="category-interface-list">
          {props.categoryRequests.map(record => (
            <button
              key={record.request.id}
              type="button"
              className="category-interface-row"
              onClick={() => props.onSelectRequest(record.request.id)}
            >
              <span className={`tree-method-pill method-${record.request.method.toLowerCase()}`}>{record.request.method}</span>
              <span className="tree-row-copy">
                <strong>{record.request.name}</strong>
                <span>{record.request.path || record.request.url || '/'}</span>
              </span>
              <span className="category-interface-meta">{record.cases.length} 个用例</span>
            </button>
          ))}
          {props.categoryRequests.length === 0 ? (
            <div className="workspace-card workspace-note-card">
              <Text fw={700}>这个分类还没有接口</Text>
              <Text c="dimmed">在左侧树或这里直接创建接口，导入后的接口也会统一进入这棵树。</Text>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  if (!request) {
    return (
      <section className="workspace-main workspace-surface">
        <div className="workspace-card workspace-note-card">
          <Text fw={700}>选择一个接口开始调试</Text>
          <Text c="dimmed">左侧树支持按项目、分类、接口、用例四层导航。选中接口后会进入单页工作台。</Text>
        </div>
      </section>
    );
  }

  const requestDocument = request;
  const effectiveMethod = selectedCase?.overrides.method || requestDocument.method;
  const effectiveUrl = selectedCase?.overrides.url || requestDocument.url;
  const effectivePath = selectedCase?.overrides.path || requestDocument.path;
  const queryRows = rowsOrFallback(selectedCase?.overrides.query, requestDocument.query);
  const pathRows = rowsOrFallback(selectedCase?.overrides.pathParams, requestDocument.pathParams);
  const headerRows = rowsOrFallback(selectedCase?.overrides.headers, requestDocument.headers);
  const body = selectedCase?.overrides.body || requestDocument.body;

  function setMethod(method: RequestDocument['method']) {
    if (!selectedCase) {
      props.onRequestChange({ ...requestDocument, method });
      return;
    }
    updateSelectedCase(current => ({
      ...current,
      overrides: {
        ...current.overrides,
        method
      }
    }));
  }

  function setUrl(url: string) {
    if (!selectedCase) {
      props.onRequestChange({ ...requestDocument, url });
      return;
    }
    updateSelectedCase(current => ({
      ...current,
      overrides: {
        ...current.overrides,
        url
      }
    }));
  }

  function setPath(path: string) {
    if (!selectedCase) {
      props.onRequestChange({ ...requestDocument, path });
      return;
    }
    updateSelectedCase(current => ({
      ...current,
      overrides: {
        ...current.overrides,
        path
      }
    }));
  }

  return (
    <section className="workspace-main workspace-surface">
      <div className="workspace-tabs-head">
        <div className="workspace-breadcrumbs">
          {breadcrumbs.map(item => (
            <span key={item} className="workspace-crumb">
              {item}
            </span>
          ))}
        </div>
        <div className="workspace-toolbar-right">
          <Select
            value={props.activeEnvironmentName}
            data={props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))}
            onChange={value => value && props.onEnvironmentChange(value)}
          />
          {props.isDirty ? <Badge color="orange" variant="light">未保存</Badge> : <Badge color="gray" variant="light">已保存</Badge>}
        </div>
      </div>

      <div className="workspace-request-head">
        <div>
          <p className="eyebrow">Interface Workspace</p>
          <h2>{requestDocument.name}</h2>
          <Text c="dimmed">
            当前分类: {requestDocument.path || requestDocument.url || '/'} {selectedCase ? `· 用例 ${selectedCase.name}` : '· 基础请求'}
          </Text>
        </div>
        <div className="workspace-request-facts">
          <div className="request-fact-pill">
            <span>Method</span>
            <strong>{effectiveMethod}</strong>
          </div>
          <div className="request-fact-pill">
            <span>Body</span>
            <strong>{bodyModeLabel(body.mode)}</strong>
          </div>
          <div className="request-fact-pill">
            <span>用例</span>
            <strong>{props.cases.length}</strong>
          </div>
          <div className="request-fact-pill">
            <span>环境</span>
            <strong>{props.activeEnvironmentName}</strong>
          </div>
        </div>
      </div>

      <Tabs value={workspaceTab} onChange={value => value && setWorkspaceTab(value as typeof workspaceTab)}>
        <Tabs.List>
          <Tabs.Tab value="debug">调试</Tabs.Tab>
          <Tabs.Tab value="cases">用例</Tabs.Tab>
          <Tabs.Tab value="settings">设置</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="debug" pt="md">
          <div className="request-runner-bar">
            <SegmentedControl
              value={effectiveMethod}
              data={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']}
              onChange={value => setMethod(value as RequestDocument['method'])}
            />
            <TextInput
              className="request-url-input"
              value={effectiveUrl}
              placeholder="https://api.example.com/path"
              onChange={event => setUrl(event.currentTarget.value)}
            />
            <Select
              className="case-select"
              value={caseId || '__base__'}
              data={caseOptions(props.cases)}
              onChange={value => props.onCaseSelect(value === '__base__' ? null : value)}
            />
            <Button color="dark" leftSection={<IconPlayerPlay size={16} />} loading={props.isRunning} onClick={props.onRun}>
              发送
            </Button>
            <Button variant="default" color="dark" leftSection={<IconDeviceFloppy size={16} />} onClick={props.onSave}>
              保存
            </Button>
          </div>

          <div className="workspace-case-strip">
            <Button variant="light" color="dark" onClick={props.onAddCase}>
              新建用例
            </Button>
            {props.cases.map(item => (
              <button
                key={item.id}
                type="button"
                className={['case-chip', caseId === item.id ? 'is-active' : ''].filter(Boolean).join(' ')}
                onClick={() => props.onCaseSelect(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>

          <div className="runner-split">
            <div className="runner-left">
              <div className="runner-pane-head">
                <div className="runner-pane-tabs">
                  {[
                    { key: 'query', label: 'Query / Path' },
                    { key: 'headers', label: 'Headers' },
                    { key: 'body', label: 'Body' },
                    { key: 'auth', label: 'Auth' },
                    { key: 'settings', label: 'Settings' }
                  ].map(item => (
                    <button
                      key={item.key}
                      type="button"
                      className={['runner-pane-tab', requestTab === item.key ? 'is-active' : ''].filter(Boolean).join(' ')}
                      onClick={() => setRequestTab(item.key as typeof requestTab)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="runner-pane-toolbar">
                  <span>{props.activeEnvironmentName}</span>
                  <span>{selectedCase ? `正在编辑用例覆盖` : `正在编辑基础请求`}</span>
                </div>
              </div>

              <div className="runner-pane-body">
                {requestTab === 'query' ? (
                  <div className="request-param-grid">
                    <div className="workspace-card nested-card">
                      <Text fw={700}>Query</Text>
                      <KeyValueEditor
                        rows={queryRows}
                        onChange={rows => {
                          if (selectedCase) {
                            updateCaseRows('query', rows);
                          } else {
                            props.onRequestChange({ ...requestDocument, query: rows });
                          }
                        }}
                      />
                    </div>
                    <div className="workspace-card nested-card">
                      <Text fw={700}>Path Params</Text>
                      <KeyValueEditor
                        rows={pathRows}
                        onChange={rows => {
                          if (selectedCase) {
                            updateCaseRows('pathParams', rows);
                          } else {
                            props.onRequestChange({ ...requestDocument, pathParams: rows });
                          }
                        }}
                      />
                    </div>
                  </div>
                ) : requestTab === 'headers' ? (
                  <div className="workspace-card nested-card">
                    <Text fw={700}>{selectedCase ? '用例 Header 覆盖' : 'Headers'}</Text>
                    <KeyValueEditor
                      rows={headerRows}
                      onChange={rows => {
                        if (selectedCase) {
                          updateCaseRows('headers', rows);
                        } else {
                          props.onRequestChange({ ...requestDocument, headers: rows });
                        }
                      }}
                    />
                  </div>
                ) : requestTab === 'auth' ? (
                  <div className="workspace-card workspace-note-card">
                    <Text fw={700}>认证配置</Text>
                    <Text c="dimmed">
                      当前版本保留轻量模型，认证主要通过公共 Header、接口 Header 或用例 Header 覆盖完成。后续再补完整认证向导。
                    </Text>
                  </div>
                ) : requestTab === 'settings' ? (
                  <div className="workspace-settings-stack">
                    <div className="workspace-card nested-card">
                      <div className="workspace-settings-grid">
                        <TextInput
                          label="接口名称"
                          value={requestDocument.name}
                          onChange={event => props.onRequestChange({ ...requestDocument, name: event.currentTarget.value })}
                        />
                        <TextInput
                          label={selectedCase ? 'Path Override' : 'Path'}
                          value={effectivePath}
                          onChange={event => setPath(event.currentTarget.value)}
                        />
                      </div>
                    </div>
                    <div className="workspace-card nested-card">
                      <Textarea
                        label="描述"
                        minRows={4}
                        autosize
                        value={requestDocument.description}
                        onChange={event => props.onRequestChange({ ...requestDocument, description: event.currentTarget.value })}
                      />
                    </div>
                  </div>
                ) : body.mode === 'form' ? (
                  <div className="workspace-card nested-card">
                    <Text fw={700}>Form Data</Text>
                    <KeyValueEditor
                      rows={body.fields}
                      onChange={rows => {
                        const nextBody = {
                          ...body,
                          fields: rows
                        };
                        if (selectedCase) {
                          updateCaseBody(nextBody);
                        } else {
                          props.onRequestChange({
                            ...requestDocument,
                            body: nextBody
                          });
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="request-body-shell">
                    <div className="workspace-body-modes">
                      {[
                        { key: 'none', label: 'None' },
                        { key: 'json', label: 'JSON' },
                        { key: 'text', label: 'Raw' },
                        { key: 'form', label: 'Form' }
                      ].map(item => (
                        <button
                          key={item.key}
                          type="button"
                          className={['workspace-body-mode', body.mode === item.key ? 'is-active' : ''].filter(Boolean).join(' ')}
                          onClick={() => {
                            const nextBody = {
                              ...body,
                              mode: item.key as RequestDocument['body']['mode']
                            };
                            if (selectedCase) {
                              updateCaseBody(nextBody);
                            } else {
                              props.onRequestChange({
                                ...requestDocument,
                                body: nextBody
                              });
                            }
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <CodeEditor
                      value={body.text}
                      language={body.mode === 'json' ? 'json' : 'text'}
                      onChange={value => {
                        const nextBody = {
                          ...body,
                          text: value
                        };
                        if (selectedCase) {
                          updateCaseBody(nextBody);
                        } else {
                          props.onRequestChange({
                            ...requestDocument,
                            body: nextBody
                          });
                        }
                      }}
                      minHeight="430px"
                    />
                  </div>
                )}
              </div>
            </div>

            <aside className="runner-right">
              <div className="runner-right-head">
                <Text fw={700}>运行结果</Text>
                <Badge color={props.response?.ok ? 'green' : 'gray'} variant="light">
                  {responseSummaryText(props.response)}
                </Badge>
              </div>

              <div className="runner-stats">
                {stats.map(item => (
                  <div key={item.label} className="runner-stat-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>

              <div className="runner-result-card">
                <Text fw={700}>运行反馈</Text>
                <div className="runner-feedback-list">
                  {validation.map(message => (
                    <div key={message} className="runner-feedback-item">
                      {message}
                    </div>
                  ))}
                </div>
              </div>

              <div className="runner-result-card response-tabs-card">
                <div className="runner-pane-head response-pane-head">
                  <div className="runner-pane-tabs">
                    {[
                      { key: 'body', label: 'Body' },
                      { key: 'headers', label: 'Headers' },
                      { key: 'raw', label: 'Raw' }
                    ].map(item => (
                      <button
                        key={item.key}
                        type="button"
                        className={['runner-pane-tab', responseTab === item.key ? 'is-active' : ''].filter(Boolean).join(' ')}
                        onClick={() => setResponseTab(item.key as typeof responseTab)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {responseTab === 'headers' ? (
                  <CodeEditor value={responseHeadersText(props.response)} readOnly language="text" minHeight="240px" />
                ) : responseTab === 'raw' ? (
                  <CodeEditor value={props.response?.bodyText || ''} readOnly language="text" minHeight="240px" />
                ) : (
                  <CodeEditor
                    value={props.response?.bodyText || ''}
                    readOnly
                    language={responseBodyLanguage(props.response)}
                    minHeight="240px"
                  />
                )}
              </div>
            </aside>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="cases" pt="md">
          <div className="workspace-card workspace-case-card">
            <div className="panel-section-head">
              <Text fw={700}>用例配置</Text>
              <Button variant="light" color="dark" onClick={props.onAddCase}>
                新建用例
              </Button>
            </div>

            {selectedCase ? (
              <div className="workspace-case-stack">
                <div className="workspace-settings-grid">
                  <TextInput
                    label="用例名称"
                    value={selectedCase.name}
                    onChange={event =>
                      updateSelectedCase(current => ({
                        ...current,
                        name: event.currentTarget.value
                      }))
                    }
                  />
                  <Select
                    label="用例环境"
                    clearable
                    value={selectedCase.environment || null}
                    data={props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))}
                    onChange={value =>
                      updateSelectedCase(current => ({
                        ...current,
                        environment: value || undefined
                      }))
                    }
                  />
                </div>
                <Textarea
                  label="备注"
                  minRows={3}
                  autosize
                  value={selectedCase.notes}
                  onChange={event =>
                    updateSelectedCase(current => ({
                      ...current,
                      notes: event.currentTarget.value
                    }))
                  }
                />
                <div className="request-param-grid">
                  <div className="workspace-card nested-card">
                    <Text fw={700}>Query Override</Text>
                    <KeyValueEditor
                      rows={selectedCase.overrides.query || []}
                      onChange={rows => updateCaseRows('query', rows)}
                    />
                  </div>
                  <div className="workspace-card nested-card">
                    <Text fw={700}>Header Override</Text>
                    <KeyValueEditor
                      rows={selectedCase.overrides.headers || []}
                      onChange={rows => updateCaseRows('headers', rows)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <Text c="dimmed">当前是基础请求。选择一个用例后，可以在这里管理环境绑定、说明和覆盖项。</Text>
            )}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="settings" pt="md">
          <div className="workspace-card workspace-note-card">
            <Text fw={700}>接口设置</Text>
            <Text c="dimmed">
              这里保留为更深层的接口配置区域，一期先把主要编辑流集中在调试面板中，避免信息被拆碎。
            </Text>
          </div>
        </Tabs.Panel>
      </Tabs>
    </section>
  );
}
