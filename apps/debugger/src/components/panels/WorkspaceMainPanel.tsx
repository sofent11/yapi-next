import { useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { Badge, Button, Select, Text, TextInput, Textarea } from '@mantine/core';
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
import type { RequestTab, ResponseTab, SelectedNode } from '../../store/workspace-store';
import { CodeEditor } from '../editors/CodeEditor';
import { KeyValueEditor } from '../primitives/KeyValueEditor';

function statsFromResponse(response: SendRequestResult | null) {
  if (!response) {
    return [
      { label: '状态', value: '--' },
      { label: '耗时', value: '--' },
      { label: '大小', value: '--' }
    ];
  }

  return [
    { label: '状态', value: String(response.status) },
    { label: '耗时', value: `${response.durationMs} ms` },
    { label: '大小', value: `${response.sizeBytes} B` }
  ];
}

function validationMessages(response: SendRequestResult | null) {
  if (!response) return ['发送请求后，这里会展示关键反馈和最近一次响应。'];
  if (!response.ok) {
    return [
      `请求返回 ${response.status}，建议先检查认证、参数或上游服务状态。`,
      '如果是用例覆盖场景，优先核对 Header、Query 和 Body 的差异。'
    ];
  }

  try {
    const parsed = JSON.parse(response.bodyText) as Record<string, unknown>;
    const messages: string[] = [];
    if (!('data' in parsed)) messages.push('响应中未发现 `data` 字段。');
    if (!('code' in parsed) && !('errcode' in parsed)) messages.push('响应中未发现统一状态码字段。');
    return messages.length > 0 ? messages : ['响应结构看起来完整，可以继续围绕这个结果补充更多用例覆盖。'];
  } catch (_err) {
    return ['响应不是 JSON 文本，当前以原始响应方式展示。'];
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
  if (!response) return 'No Response';
  return `${response.status} ${response.statusText}`;
}

function categoryLabel(path: string | null) {
  if (!path) return '项目';
  return path.split('/').at(-1) || path;
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
  if (selectedNode.kind === 'project') return [project.name, 'Project'];
  if (selectedNode.kind === 'category') return [project.name, categoryLabel(selectedNode.path)];
  if (selectedNode.kind === 'case') {
    return [project.name, request?.name || '接口', '用例'];
  }
  return [project.name, request?.name || '接口'];
}

function rowsOrFallback(rows: ParameterRow[] | undefined, fallback: ParameterRow[]) {
  return rows ?? fallback;
}

function caseOverrideSummary(selectedCase: CaseDocument | null) {
  if (!selectedCase) return ['基础请求'];
  const tokens: string[] = [];
  if (selectedCase.overrides.method) tokens.push('Method');
  if (selectedCase.overrides.url) tokens.push('URL');
  if (selectedCase.overrides.path) tokens.push('Path');
  if (selectedCase.overrides.query?.length) tokens.push('Query');
  if (selectedCase.overrides.headers?.length) tokens.push('Header');
  if (selectedCase.overrides.body) tokens.push('Body');
  if (selectedCase.environment) tokens.push(`Env:${selectedCase.environment}`);
  return tokens.length > 0 ? tokens : ['无覆盖'];
}

function projectCounts(workspace: WorkspaceIndex) {
  const categorySet = new Set(workspace.requests.map(item => item.folderSegments.join('/')).filter(Boolean));
  const caseTotal = workspace.requests.reduce((total, item) => total + item.cases.length, 0);
  return {
    categories: categorySet.size,
    requests: workspace.requests.length,
    cases: caseTotal
  };
}

const REQUEST_METHODS: RequestDocument['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

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
  activeRequestTab: RequestTab;
  activeResponseTab: ResponseTab;
  mainSplitRatio: number;
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
  onRequestTabChange: (tab: RequestTab) => void;
  onResponseTabChange: (tab: ResponseTab) => void;
  onMainSplitRatioChange: (ratio: number) => void;
}) {
  const splitRef = useRef<HTMLDivElement | null>(null);
  const stats = useMemo(() => statsFromResponse(props.response), [props.response]);
  const validation = useMemo(() => validationMessages(props.response), [props.response]);
  const counts = useMemo(() => projectCounts(props.workspace), [props.workspace]);
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

  function updateCaseRows(key: 'query' | 'headers' | 'pathParams', rows: ParameterRow[]) {
    updateSelectedCase(current => ({
      ...current,
      overrides: {
        ...current.overrides,
        [key]: rows
      }
    }));
  }

  function startMainSplitResize(event: ReactMouseEvent<HTMLDivElement>) {
    const container = splitRef.current;
    if (!container) return;
    event.preventDefault();
    const bounds = container.getBoundingClientRect();

    function handleMove(moveEvent: MouseEvent) {
      const nextRatio = (moveEvent.clientX - bounds.left) / bounds.width;
      props.onMainSplitRatioChange(Math.max(0.44, Math.min(0.76, nextRatio)));
    }

    function handleUp() {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    }

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  function renderToolbar(actions: React.ReactNode) {
    return (
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          {breadcrumbs.map(item => (
            <span key={item} className="breadcrumb-chip">
              {item}
            </span>
          ))}
        </div>
        <div className="panel-toolbar-actions">{actions}</div>
      </div>
    );
  }

  if (props.selectedNode.kind === 'project' && props.draftProject) {
    const project = props.draftProject;
    return (
      <section className="workspace-main">
        {renderToolbar(
          <>
            {props.isDirty ? <Badge color="orange" variant="light">未保存</Badge> : <Badge color="gray" variant="light">已保存</Badge>}
            <Button size="xs" variant="default" color="dark" leftSection={<IconDeviceFloppy size={14} />} onClick={props.onSave}>
              保存项目
            </Button>
          </>
        )}

        <div className="project-inspector">
          <div className="inspector-main">
            <section className="inspector-section">
              <div className="inspector-section-header">
                <div>
                  <p className="section-kicker">Project Inspector</p>
                  <h3 className="section-title">项目共享运行时</h3>
                </div>
                <Text c="dimmed" size="xs">
                  基础配置和共享变量都在这里维护。
                </Text>
              </div>

              <div className="form-grid form-grid-2">
                <TextInput
                  label="项目名称"
                  size="xs"
                  value={project.name}
                  onChange={event => props.onProjectChange({ ...project, name: event.currentTarget.value })}
                />
                <Select
                  label="默认环境"
                  size="xs"
                  value={project.defaultEnvironment}
                  data={props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))}
                  onChange={value => value && props.onProjectChange({ ...project, defaultEnvironment: value })}
                />
              </div>

              <div className="form-grid form-grid-2">
                <TextInput
                  label="Base URL"
                  size="xs"
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
                  size="xs"
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
            </section>

            <section className="inspector-section">
              <div className="inspector-section-header">
                <div>
                  <p className="section-kicker">Shared Vars</p>
                  <h3 className="section-title">公共变量</h3>
                </div>
              </div>
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
            </section>

            <section className="inspector-section">
              <div className="inspector-section-header">
                <div>
                  <p className="section-kicker">Shared Headers</p>
                  <h3 className="section-title">公共 Header</h3>
                </div>
              </div>
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
            </section>
          </div>

          <aside className="inspector-side">
            <section className="inspector-section">
              <div className="inspector-section-header">
                <div>
                  <p className="section-kicker">Workspace</p>
                  <h3 className="section-title">项目动作</h3>
                </div>
              </div>

              <div className="inspector-actions">
                <Button size="xs" color="dark" leftSection={<IconUpload size={14} />} onClick={props.onOpenImport}>
                  导入到当前项目
                </Button>
                <Button size="xs" variant="default" color="dark" leftSection={<IconLayoutGridAdd size={14} />} onClick={props.onCreateInterface}>
                  新建接口
                </Button>
              </div>

              <div className="inspector-summary-grid">
                <div className="summary-tile">
                  <span>分类</span>
                  <strong>{counts.categories}</strong>
                </div>
                <div className="summary-tile">
                  <span>接口</span>
                  <strong>{counts.requests}</strong>
                </div>
                <div className="summary-tile">
                  <span>用例</span>
                  <strong>{counts.cases}</strong>
                </div>
              </div>
            </section>

            <section className="inspector-section">
              <div className="inspector-section-header">
                <div>
                  <p className="section-kicker">Environment</p>
                  <h3 className="section-title">当前环境覆盖</h3>
                </div>
                <Select
                  size="xs"
                  value={props.activeEnvironmentName}
                  data={props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))}
                  onChange={value => value && props.onEnvironmentChange(value)}
                />
              </div>
              <Text c="dimmed" size="xs">
                环境只负责覆盖共享变量，优先级低于接口和用例。
              </Text>
              <KeyValueEditor
                rows={Object.entries(props.selectedEnvironment?.vars || {}).map(([name, value]) => ({ name, value, enabled: true }))}
                onChange={rows =>
                  props.onEnvironmentUpdate(props.activeEnvironmentName, environment => ({
                    ...environment,
                    vars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                  }))
                }
              />
            </section>
          </aside>
        </div>
      </section>
    );
  }

  if (props.selectedNode.kind === 'category') {
    return (
      <section className="workspace-main">
        {renderToolbar(
          <Button size="xs" color="dark" leftSection={<IconLayoutGridAdd size={14} />} onClick={props.onCreateInterface}>
            在此分类新建接口
          </Button>
        )}

        <div className="category-workbench">
          <div className="category-header">
            <div>
              <p className="section-kicker">Category Overview</p>
              <h3 className="section-title">{categoryLabel(props.selectedNode.path)}</h3>
            </div>
            <Text c="dimmed" size="xs">
              分类页只负责组织和快速进入接口，不承载请求编辑。
            </Text>
          </div>

          <div className="category-table">
            {props.categoryRequests.map(record => (
              <button
                key={record.request.id}
                type="button"
                className="category-row"
                onClick={() => props.onSelectRequest(record.request.id)}
              >
                <span className={`tree-method-pill method-${record.request.method.toLowerCase()}`}>{record.request.method}</span>
                <span className="tree-row-copy">
                  <strong>{record.request.name}</strong>
                  <span>{record.request.path || record.request.url || '/'}</span>
                </span>
                <span className="category-row-meta">{record.cases.length} 个用例</span>
              </button>
            ))}

            {props.categoryRequests.length === 0 ? (
              <div className="empty-surface">
                <Text fw={600}>这个分类还没有接口</Text>
                <Text c="dimmed" size="xs">
                  可以在左侧树或这里直接创建接口，导入后的接口也会进入这棵树。
                </Text>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (!request) {
    return (
      <section className="workspace-main">
        <div className="empty-surface">
          <Text fw={600}>选择一个接口开始调试</Text>
          <Text c="dimmed" size="xs">
            左侧树始终是唯一导航入口，接口和用例会在同一个工作台里连续编辑。
          </Text>
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
    <section className="workspace-main">
      {renderToolbar(
        <>
          <Select
            size="xs"
            className="compact-select"
            value={props.activeEnvironmentName}
            data={props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))}
            onChange={value => value && props.onEnvironmentChange(value)}
          />
          <Select
            size="xs"
            className="compact-select"
            value={caseId || '__base__'}
            data={caseOptions(props.cases)}
            onChange={value => props.onCaseSelect(value === '__base__' ? null : value)}
          />
          {props.isDirty ? <Badge color="orange" variant="light">未保存</Badge> : <Badge color="gray" variant="light">已保存</Badge>}
        </>
      )}

      <div className="request-commandbar">
        <Select
          size="xs"
          className="method-select"
          value={effectiveMethod}
          data={REQUEST_METHODS.map(method => ({ value: method, label: method }))}
          onChange={value => value && setMethod(value as RequestDocument['method'])}
        />
        <TextInput
          size="xs"
          className="request-url-field"
          value={effectiveUrl}
          placeholder="https://api.example.com/path"
          onChange={event => setUrl(event.currentTarget.value)}
        />
        <Button size="xs" color="dark" leftSection={<IconPlayerPlay size={14} />} loading={props.isRunning} onClick={props.onRun}>
          Send
        </Button>
        <Button size="xs" variant="default" color="dark" leftSection={<IconDeviceFloppy size={14} />} onClick={props.onSave}>
          Save
        </Button>
      </div>

      <div className="case-toolbar">
        <div className="case-toolbar-copy">
          <div>
            <p className="section-kicker">Active Case</p>
            <h3 className="section-title">{selectedCase ? selectedCase.name : '基础请求'}</h3>
          </div>
          <div className="case-badges">
            {caseOverrideSummary(selectedCase).map(token => (
              <span key={token} className="case-badge">
                {token}
              </span>
            ))}
            <span className="case-badge">Body:{bodyModeLabel(body.mode)}</span>
          </div>
        </div>
        <div className="case-toolbar-actions">
          <Text c="dimmed" size="xs">
            {requestDocument.path || requestDocument.url || '/'}
          </Text>
          <Button size="xs" variant="default" color="dark" onClick={props.onAddCase}>
            新建用例
          </Button>
        </div>
      </div>

      <div
        ref={splitRef}
        className="workbench-split"
        style={{
          gridTemplateColumns: `minmax(0, ${props.mainSplitRatio}fr) 8px minmax(320px, ${1 - props.mainSplitRatio}fr)`
        }}
      >
        <div className="pane-surface">
          <div className="pane-header">
            <div>
              <p className="section-kicker">Editor</p>
              <h3 className="section-title">{requestDocument.name}</h3>
            </div>
            <div className="pane-tabs">
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
                  className={['pane-tab', props.activeRequestTab === item.key ? 'is-active' : ''].filter(Boolean).join(' ')}
                  onClick={() => props.onRequestTabChange(item.key as RequestTab)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pane-content pane-scroll">
            {selectedCase ? (
              <section className="case-inspector-inline">
                <div className="inspector-section-header">
                  <div>
                    <p className="section-kicker">Case Inspector</p>
                    <h3 className="section-title">用例覆盖</h3>
                  </div>
                </div>

                <div className="form-grid form-grid-2">
                  <TextInput
                    label="用例名称"
                    size="xs"
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
                    size="xs"
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
                  size="xs"
                  minRows={2}
                  autosize
                  value={selectedCase.notes}
                  onChange={event =>
                    updateSelectedCase(current => ({
                      ...current,
                      notes: event.currentTarget.value
                    }))
                  }
                />
              </section>
            ) : (
              <div className="empty-inline">
                <span>当前正在编辑基础请求。选择用例后，这里只会替换覆盖层，不会重置接口本体。</span>
              </div>
            )}

            {props.activeRequestTab === 'query' ? (
              <div className="editor-grid">
                <section className="inspector-section">
                  <div className="inspector-section-header">
                    <div>
                      <p className="section-kicker">Query</p>
                      <h3 className="section-title">Query 参数</h3>
                    </div>
                  </div>
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
                </section>

                <section className="inspector-section">
                  <div className="inspector-section-header">
                    <div>
                      <p className="section-kicker">Path Params</p>
                      <h3 className="section-title">路径参数</h3>
                    </div>
                  </div>
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
                </section>
              </div>
            ) : null}

            {props.activeRequestTab === 'headers' ? (
              <section className="inspector-section">
                <div className="inspector-section-header">
                  <div>
                    <p className="section-kicker">Headers</p>
                    <h3 className="section-title">{selectedCase ? 'Header 覆盖' : '请求 Header'}</h3>
                  </div>
                </div>
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
              </section>
            ) : null}

            {props.activeRequestTab === 'auth' ? (
              <section className="inspector-section">
                <div className="inspector-section-header">
                  <div>
                    <p className="section-kicker">Auth</p>
                    <h3 className="section-title">认证配置</h3>
                  </div>
                </div>
                <Text c="dimmed" size="xs">
                  一期保持轻量模型，认证优先通过项目 Header、接口 Header 和用例 Header 覆盖实现。
                </Text>
              </section>
            ) : null}

            {props.activeRequestTab === 'settings' ? (
              <section className="inspector-section">
                <div className="inspector-section-header">
                  <div>
                    <p className="section-kicker">Settings</p>
                    <h3 className="section-title">接口属性</h3>
                  </div>
                </div>

                <div className="form-grid form-grid-2">
                  <TextInput
                    label="接口名称"
                    size="xs"
                    value={requestDocument.name}
                    onChange={event => props.onRequestChange({ ...requestDocument, name: event.currentTarget.value })}
                  />
                  <TextInput
                    label={selectedCase ? 'Path Override' : 'Path'}
                    size="xs"
                    value={effectivePath}
                    onChange={event => setPath(event.currentTarget.value)}
                  />
                </div>

                <Textarea
                  label="描述"
                  size="xs"
                  minRows={3}
                  autosize
                  value={requestDocument.description}
                  onChange={event => props.onRequestChange({ ...requestDocument, description: event.currentTarget.value })}
                />
              </section>
            ) : null}

            {props.activeRequestTab === 'body' ? (
              body.mode === 'form' ? (
                <section className="inspector-section">
                  <div className="inspector-section-header">
                    <div>
                      <p className="section-kicker">Body</p>
                      <h3 className="section-title">Form Data</h3>
                    </div>
                  </div>
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
                </section>
              ) : (
                <section className="inspector-section">
                  <div className="inspector-section-header">
                    <div>
                      <p className="section-kicker">Body</p>
                      <h3 className="section-title">请求体编辑器</h3>
                    </div>
                  </div>
                  <div className="body-modebar">
                    {[
                      { key: 'none', label: 'None' },
                      { key: 'json', label: 'JSON' },
                      { key: 'text', label: 'Raw' },
                      { key: 'form', label: 'Form' }
                    ].map(item => (
                      <button
                        key={item.key}
                        type="button"
                        className={['body-mode-button', body.mode === item.key ? 'is-active' : ''].filter(Boolean).join(' ')}
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
                    minHeight="360px"
                  />
                </section>
              )
            ) : null}
          </div>
        </div>

        <div className="pane-resizer" onMouseDown={startMainSplitResize} />

        <aside className="pane-surface response-surface">
          <div className="pane-header response-header">
            <div>
              <p className="section-kicker">Response</p>
              <h3 className="section-title">最近一次运行结果</h3>
            </div>
            <Badge color={props.response?.ok ? 'green' : 'gray'} variant="light">
              {responseSummaryText(props.response)}
            </Badge>
          </div>

          <div className="response-stats">
            {stats.map(item => (
              <div key={item.label} className="response-stat">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="response-feedback">
            {validation.map(message => (
              <div key={message} className="response-feedback-item">
                {message}
              </div>
            ))}
          </div>

          <div className="response-tabs">
            {[
              { key: 'body', label: 'Body' },
              { key: 'headers', label: 'Headers' },
              { key: 'raw', label: 'Raw' }
            ].map(item => (
              <button
                key={item.key}
                type="button"
                className={['pane-tab', props.activeResponseTab === item.key ? 'is-active' : ''].filter(Boolean).join(' ')}
                onClick={() => props.onResponseTabChange(item.key as ResponseTab)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="response-editor">
            {!props.response ? (
              <div className="response-empty">
                <span>发送一次请求后，这里会保持最近一次响应，不会因为切换用例而丢失上下文。</span>
              </div>
            ) : props.activeResponseTab === 'headers' ? (
              <CodeEditor value={responseHeadersText(props.response)} readOnly language="text" minHeight="280px" />
            ) : props.activeResponseTab === 'raw' ? (
              <CodeEditor value={props.response.bodyText || ''} readOnly language="text" minHeight="280px" />
            ) : (
              <CodeEditor
                value={props.response.bodyText || ''}
                readOnly
                language={responseBodyLanguage(props.response)}
                minHeight="280px"
              />
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
