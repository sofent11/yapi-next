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
  RequestDocument,
  SendRequestResult,
  WorkspaceIndex
} from '@yapi-debugger/schema';
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

function caseOptions(cases: CaseDocument[]) {
  return [{ value: '__base__', label: '基础请求' }, ...cases.map(item => ({ value: item.id, label: item.name }))];
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

function pageTitle(selectedCategory: string) {
  return selectedCategory === '__overview__' ? '项目概览' : selectedCategory.split('/').at(-1) || '未命名分类';
}

function responseHeadersText(response: SendRequestResult | null) {
  return (response?.headers || []).map(item => `${item.name}: ${item.value}`).join('\n');
}

function bodyModeLabel(mode: RequestDocument['body']['mode']) {
  switch (mode) {
    case 'json':
      return 'JSON';
    case 'form':
      return 'Form';
    case 'text':
      return 'Raw';
    default:
      return 'None';
  }
}

function responseSummaryText(response: SendRequestResult | null) {
  if (!response) return '尚未发送请求';
  return `${response.status} ${response.statusText}`;
}

export function WorkspaceMainPanel(props: {
  workspaceName: string;
  selectedCategory: string;
  categoryRequests: WorkspaceIndex['requests'];
  request: RequestDocument | null;
  response: SendRequestResult | null;
  cases: CaseDocument[];
  selectedCaseId: string | null;
  environments: EnvironmentDocument[];
  activeEnvironmentName: string;
  isRunning: boolean;
  isDirty: boolean;
  onRequestChange: (request: RequestDocument) => void;
  onCasesChange: (cases: CaseDocument[]) => void;
  onCaseSelect: (caseId: string | null) => void;
  onAddCase: () => void;
  onRun: () => void;
  onSave: () => void;
  onEnvironmentChange: (name: string) => void;
  onSelectRequest: (requestId: string) => void;
  onOpenImport: () => void;
  onCreateInterface: () => void;
}) {
  const [mainTab, setMainTab] = useState<'debug' | 'cases' | 'settings'>('debug');
  const [requestTab, setRequestTab] = useState<'query' | 'headers' | 'body' | 'auth'>('query');
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'raw'>('body');
  const request = props.request;
  const selectedCase = props.cases.find(item => item.id === props.selectedCaseId) || null;
  const stats = useMemo(() => statsFromResponse(props.response), [props.response]);
  const validation = useMemo(() => validationMessages(props.response), [props.response]);

  if (!request) {
    if (props.selectedCategory === '__overview__') {
      return (
        <section className="workspace-main workspace-surface">
          <div className="workspace-tabs-head">
            <div className="workspace-page-tabs">
              <button type="button" className="workspace-page-tab is-active">
                {props.workspaceName}
              </button>
            </div>
          </div>

          <div className="workspace-overview-hero">
            <div>
              <p className="eyebrow">项目</p>
              <h2>{props.workspaceName}</h2>
              <Text c="dimmed">按“项目 / 分类 / 接口”的层级管理本地接口工作区，导入只发生在项目层，不再混入单个接口编辑。</Text>
            </div>
            <Group>
              <Button variant="light" color="dark" leftSection={<IconUpload size={16} />} onClick={props.onOpenImport}>
                导入接口
              </Button>
              <Button color="dark" leftSection={<IconLayoutGridAdd size={16} />} onClick={props.onCreateInterface}>
                新建接口
              </Button>
            </Group>
          </div>

          <div className="overview-grid">
            <div className="overview-card">
              <span>分类层级</span>
              <strong>{new Set(props.categoryRequests.map(item => item.folderSegments.join('/'))).size}</strong>
              <Text c="dimmed">分类由目录结构直接推导，可继续向下拆分子分类。</Text>
            </div>
            <div className="overview-card">
              <span>接口数量</span>
              <strong>{props.categoryRequests.length}</strong>
              <Text c="dimmed">导入规范和手工接口统一进入左侧树，交互保持一致。</Text>
            </div>
            <div className="overview-card">
              <span>环境数量</span>
              <strong>{props.environments.length}</strong>
              <Text c="dimmed">环境和本地 token 仍然保持文本友好，适合 Git 协作。</Text>
            </div>
          </div>

          <div className="workspace-card workspace-note-card">
            <Text fw={700}>下一步</Text>
            <Text c="dimmed">从左侧选择一个分类继续创建接口，或者直接在项目层导入 OpenAPI、Swagger、HAR、Postman Collection。</Text>
          </div>
        </section>
      );
    }

    return (
      <section className="workspace-main workspace-surface">
        <div className="workspace-tabs-head">
          <div className="workspace-page-tabs">
            <button type="button" className="workspace-page-tab">
              {props.workspaceName}
            </button>
            <button type="button" className="workspace-page-tab is-active">
              {pageTitle(props.selectedCategory)}
            </button>
          </div>
        </div>

        <div className="workspace-overview-hero">
          <div>
            <p className="eyebrow">分类</p>
            <h2>{pageTitle(props.selectedCategory)}</h2>
            <Text c="dimmed">在当前分类下维护接口列表。请求编辑、运行结果和用例会在选中接口后进入同一工作台页面。</Text>
          </div>
          <Group>
            <Button variant="light" color="dark" leftSection={<IconUpload size={16} />} onClick={props.onOpenImport}>
              项目导入
            </Button>
            <Button color="dark" leftSection={<IconLayoutGridAdd size={16} />} onClick={props.onCreateInterface}>
              在此分类新建接口
            </Button>
          </Group>
        </div>

        <div className="category-interface-list">
          {props.categoryRequests.length > 0 ? (
            props.categoryRequests.map(record => (
              <button
                key={record.request.id}
                type="button"
                className="category-interface-row"
                onClick={() => props.onSelectRequest(record.request.id)}
              >
                <span className={`category-interface-method method-${record.request.method.toLowerCase()}`}>
                  {record.request.method}
                </span>
                <span className="category-interface-copy">
                  <strong>{record.request.name}</strong>
                  <span>{record.request.path || record.request.url || '/'}</span>
                </span>
                <span className="category-interface-meta">{record.cases.length} 用例</span>
              </button>
            ))
          ) : (
            <div className="workspace-card workspace-note-card">
              <Text fw={700}>这个分类还没有接口</Text>
              <Text c="dimmed">可以在这里手工新建接口，也可以回到项目层执行导入，把接口分发到对应分类。</Text>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-main workspace-surface">
      <div className="workspace-tabs-head">
        <div className="workspace-page-tabs">
          <button type="button" className="workspace-page-tab">
            {props.workspaceName}
          </button>
          <button type="button" className="workspace-page-tab">
            {pageTitle(props.selectedCategory)}
          </button>
          <button type="button" className="workspace-page-tab is-active">
            {request.name}
          </button>
        </div>
        <Select
          value={props.activeEnvironmentName}
          data={props.environments.map(item => ({ value: item.name, label: item.name }))}
          onChange={value => value && props.onEnvironmentChange(value)}
        />
      </div>

      <div className="workspace-request-head">
        <div>
          <p className="eyebrow">接口</p>
          <h2>{request.name}</h2>
          <Text c="dimmed">
            {props.selectedCategory === '__overview__' ? '默认分类' : props.selectedCategory} / {request.path || request.url || '/'}
          </Text>
        </div>
        <div className="workspace-request-facts">
          <div className="request-fact-pill">
            <span>Method</span>
            <strong>{request.method}</strong>
          </div>
          <div className="request-fact-pill">
            <span>Body</span>
            <strong>{bodyModeLabel(request.body.mode)}</strong>
          </div>
          <div className="request-fact-pill">
            <span>Cases</span>
            <strong>{props.cases.length}</strong>
          </div>
          <div className="request-fact-pill">
            <span>状态</span>
            <strong>{props.isDirty ? '未保存' : '已保存'}</strong>
          </div>
        </div>
      </div>

      <Tabs value={mainTab} onChange={value => value && setMainTab(value as typeof mainTab)}>
        <Tabs.List>
          <Tabs.Tab value="debug">调试</Tabs.Tab>
          <Tabs.Tab value="cases">用例</Tabs.Tab>
          <Tabs.Tab value="settings">设置</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="debug" pt="md">
          <div className="request-runner-bar">
            <SegmentedControl
              value={request.method}
              data={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']}
              onChange={value => props.onRequestChange({ ...request, method: value as RequestDocument['method'] })}
            />
            <TextInput
              className="request-url-input"
              value={request.url}
              placeholder="https://api.example.com/path"
              onChange={event => props.onRequestChange({ ...request, url: event.currentTarget.value })}
            />
            <Button color="dark" leftSection={<IconPlayerPlay size={16} />} loading={props.isRunning} onClick={props.onRun}>
              发送
            </Button>
            <Button variant="default" color="dark" leftSection={<IconDeviceFloppy size={16} />} onClick={props.onSave}>
              保存
            </Button>
          </div>

          <div className="workspace-case-strip">
            <Select
              value={props.selectedCaseId || '__base__'}
              data={caseOptions(props.cases)}
              onChange={value => props.onCaseSelect(value === '__base__' ? null : value)}
            />
            <Button variant="light" color="dark" onClick={props.onAddCase}>
              新建用例
            </Button>
          </div>

          <div className="runner-split">
            <div className="runner-left">
              <div className="runner-pane-head">
                <div className="runner-pane-tabs">
                  {[
                    { key: 'query', label: 'Query / Path' },
                    { key: 'headers', label: 'Headers' },
                    { key: 'body', label: 'Body' },
                    { key: 'auth', label: 'Auth' }
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
                  <span>{selectedCase ? selectedCase.name : '基础请求'}</span>
                </div>
              </div>

              <div className="runner-pane-body">
                {requestTab === 'query' ? (
                  <div className="request-param-grid">
                    <div className="workspace-card">
                      <Text fw={700}>Query</Text>
                      <KeyValueEditor rows={request.query} onChange={rows => props.onRequestChange({ ...request, query: rows })} />
                    </div>
                    <div className="workspace-card">
                      <Text fw={700}>Path Params</Text>
                      <KeyValueEditor
                        rows={request.pathParams}
                        onChange={rows => props.onRequestChange({ ...request, pathParams: rows })}
                      />
                    </div>
                  </div>
                ) : requestTab === 'headers' ? (
                  <div className="workspace-card">
                    <Text fw={700}>Headers</Text>
                    <KeyValueEditor rows={request.headers} onChange={rows => props.onRequestChange({ ...request, headers: rows })} />
                  </div>
                ) : requestTab === 'auth' ? (
                  <div className="workspace-card workspace-note-card">
                    <Text fw={700}>认证配置</Text>
                    <Text c="dimmed">当前版本用 Header、Query 和 Case 覆盖表达认证，后续再补完整认证面板。</Text>
                  </div>
                ) : request.body.mode === 'form' ? (
                  <div className="workspace-card">
                    <Text fw={700}>Form Data</Text>
                    <KeyValueEditor
                      rows={request.body.fields}
                      onChange={rows =>
                        props.onRequestChange({
                          ...request,
                          body: {
                            ...request.body,
                            fields: rows
                          }
                        })
                      }
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
                          className={['workspace-body-mode', request.body.mode === item.key ? 'is-active' : '']
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() =>
                            props.onRequestChange({
                              ...request,
                              body: {
                                ...request.body,
                                mode: item.key as RequestDocument['body']['mode']
                              }
                            })
                          }
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <CodeEditor
                      value={selectedCase?.overrides.body?.text || request.body.text}
                      language={request.body.mode === 'json' ? 'json' : 'text'}
                      onChange={value => {
                        if (selectedCase) {
                          props.onCasesChange(
                            props.cases.map(item =>
                              item.id === selectedCase.id
                                ? {
                                    ...item,
                                    overrides: {
                                      ...item.overrides,
                                      body: {
                                        mode: request.body.mode,
                                        mimeType: request.body.mimeType,
                                        text: value,
                                        fields: request.body.fields
                                      }
                                    }
                                  }
                                : item
                            )
                          );
                          return;
                        }

                        props.onRequestChange({
                          ...request,
                          body: {
                            ...request.body,
                            text: value
                          }
                        });
                      }}
                      minHeight="420px"
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
                  <CodeEditor value={responseHeadersText(props.response)} readOnly language="text" minHeight="220px" />
                ) : responseTab === 'raw' ? (
                  <CodeEditor value={props.response?.bodyText || ''} readOnly language="text" minHeight="220px" />
                ) : (
                  <CodeEditor
                    value={props.response?.bodyText || ''}
                    readOnly
                    language={responseBodyLanguage(props.response)}
                    minHeight="220px"
                  />
                )}
              </div>
            </aside>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="cases" pt="md">
          <div className="workspace-card workspace-case-card">
            <div className="workspace-case-head">
              <Select
                value={props.selectedCaseId || '__base__'}
                data={caseOptions(props.cases)}
                onChange={value => props.onCaseSelect(value === '__base__' ? null : value)}
              />
              <Button variant="light" color="dark" onClick={props.onAddCase}>
                新建用例
              </Button>
            </div>

            {selectedCase ? (
              <div className="workspace-case-grid">
                <TextInput
                  label="用例名称"
                  value={selectedCase.name}
                  onChange={event =>
                    props.onCasesChange(
                      props.cases.map(item =>
                        item.id === selectedCase.id ? { ...item, name: event.currentTarget.value } : item
                      )
                    )
                  }
                />
                <Select
                  label="环境"
                  clearable
                  value={selectedCase.environment || null}
                  data={props.environments.map(item => ({ value: item.name, label: item.name }))}
                  onChange={value =>
                    props.onCasesChange(
                      props.cases.map(item =>
                        item.id === selectedCase.id ? { ...item, environment: value || undefined } : item
                      )
                    )
                  }
                />
                <Textarea
                  label="备注"
                  minRows={3}
                  autosize
                  value={selectedCase.notes}
                  onChange={event =>
                    props.onCasesChange(
                      props.cases.map(item =>
                        item.id === selectedCase.id ? { ...item, notes: event.currentTarget.value } : item
                      )
                    )
                  }
                />
              </div>
            ) : (
              <Text c="dimmed">基础请求不包含额外覆盖项。切换到某个用例后，可以继续补环境绑定和覆盖规则。</Text>
            )}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="settings" pt="md">
          <div className="workspace-settings-stack">
            <div className="workspace-card workspace-settings-grid">
              <TextInput
                label="接口名称"
                value={request.name}
                onChange={event => props.onRequestChange({ ...request, name: event.currentTarget.value })}
              />
              <TextInput
                label="Path"
                value={request.path}
                placeholder="/users/{id}"
                onChange={event => props.onRequestChange({ ...request, path: event.currentTarget.value })}
              />
            </div>

            <div className="workspace-card workspace-settings-grid">
              <Textarea
                label="描述"
                minRows={3}
                autosize
                value={request.description}
                onChange={event => props.onRequestChange({ ...request, description: event.currentTarget.value })}
              />
              <TextInput
                label="标签"
                value={request.tags.join(', ')}
                placeholder="auth, user"
                onChange={event =>
                  props.onRequestChange({
                    ...request,
                    tags: event.currentTarget.value
                      .split(',')
                      .map(item => item.trim())
                      .filter(Boolean)
                  })
                }
              />
            </div>
          </div>
        </Tabs.Panel>
      </Tabs>

      {props.isDirty ? <div className="dirty-indicator">Unsaved changes</div> : null}
    </section>
  );
}
