import { useMemo } from 'react';
import { Badge, Button, Checkbox, Group, NumberInput, Select, Tabs, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { 
  IconAdjustments, 
  IconDeviceFloppy,
  IconKey, 
  IconListCheck, 
  IconMessageCode, 
  IconPlayerPlay, 
  IconPlus, 
  IconSettings,
  IconVariable
} from '@tabler/icons-react';
import { createEmptyCheck, inspectResolvedRequest } from '@yapi-debugger/core';
import type {
  AuthConfig,
  CaseCheck,
  CaseDocument,
  EnvironmentDocument,
  RequestBody,
  RequestDocument,
  ResolvedRequestInsight,
  SessionSnapshot,
  WorkspaceIndex
} from '@yapi-debugger/schema';
import type { RequestTab } from '../../store/workspace-store';
import { parseCurlCommand } from '../../lib/curl';
import { chooseRequestBodyFile } from '../../lib/desktop';
import { CodeEditor } from '../editors/CodeEditor';
import { KeyValueEditor } from '../primitives/KeyValueEditor';

const REQUEST_METHODS: RequestDocument['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const REQUEST_KINDS: RequestDocument['kind'][] = ['http', 'graphql', 'grpc', 'websocket', 'script'];

function bodyModeOptions() {
  return [
    { value: 'none', label: 'none' },
    { value: 'json', label: 'json' },
    { value: 'text', label: 'raw' },
    { value: 'xml', label: 'xml' },
    { value: 'graphql', label: 'graphql' },
    { value: 'sparql', label: 'sparql' },
    { value: 'file', label: 'file' },
    { value: 'form-urlencoded', label: 'x-www-form-urlencoded' },
    { value: 'multipart', label: 'multipart/form-data' }
  ];
}

function authTypeOptions() {
  return [
    { value: 'inherit', label: 'inherit' },
    { value: 'none', label: 'none' },
    { value: 'bearer', label: 'bearer' },
    { value: 'basic', label: 'basic' },
    { value: 'apikey', label: 'api key' },
    { value: 'oauth2', label: 'oauth2' },
    { value: 'oauth1', label: 'oauth1' },
    { value: 'awsv4', label: 'aws signature v4' },
    { value: 'digest', label: 'digest' },
    { value: 'ntlm', label: 'ntlm' },
    { value: 'wsse', label: 'wsse' },
    { value: 'profile', label: 'environment profile' }
  ];
}

function checkOptions() {
  return [
    { value: 'status-equals', label: 'Status Equals' },
    { value: 'header-equals', label: 'Header Equals' },
    { value: 'header-includes', label: 'Header Includes' },
    { value: 'json-exists', label: 'JSON Path Exists' },
    { value: 'json-not-exists', label: 'JSON Path Missing' },
    { value: 'json-equals', label: 'JSON Path Equals' },
    { value: 'json-type', label: 'JSON Path Type' },
    { value: 'json-length', label: 'JSON Path Length' },
    { value: 'body-contains', label: 'Body Contains' },
    { value: 'body-regex', label: 'Body Regex' },
    { value: 'response-time-lt', label: 'Response Time <' },
    { value: 'number-gt', label: 'Number >' },
    { value: 'number-lt', label: 'Number <' },
    { value: 'number-between', label: 'Number Between' },
    { value: 'schema-match', label: 'JSON Schema Match' },
    { value: 'snapshot-match', label: 'Snapshot Match' }
  ];
}

function retryWhenOptions() {
  return [
    { value: 'network-error', label: 'network-error' },
    { value: '5xx', label: '5xx' },
    { value: 'assertion-failed', label: 'assertion-failed' }
  ];
}

type RequestSection = 'request' | 'validation' | 'automation';

function requestSectionForTab(tab: RequestTab): RequestSection {
  if (tab === 'checks') return 'validation';
  if (tab === 'scripts' || tab === 'settings') return 'automation';
  return 'request';
}

function tabOptionsForSection(section: RequestSection) {
  if (section === 'validation') {
    return ['checks'] satisfies RequestTab[];
  }
  if (section === 'automation') {
    return ['scripts', 'settings'] satisfies RequestTab[];
  }
  return ['query', 'headers', 'body', 'auth', 'preview'] satisfies RequestTab[];
}

export function RequestPanel(props: {
  workspace: WorkspaceIndex;
  activeEnvironmentName?: string;
  selectedEnvironment: EnvironmentDocument | null;
  request: RequestDocument;
  selectedCase: CaseDocument | null;
  activeTab: RequestTab;
  isRunning: boolean;
  isDirty: boolean;
  onTabChange: (tab: RequestTab) => void;
  onRequestChange: (request: RequestDocument) => void;
  onCasesChange: (cases: CaseDocument[]) => void;
  onCaseSelect?: (caseId: string | null) => void;
  onAddCase: () => void;
  onRun: () => void;
  onSave?: () => void;
  cases: CaseDocument[];
  allowCases?: boolean;
  latestResponseOk?: boolean;
  onSaveAsCase?: () => void;
  onAddToCollection?: () => void;
  requestInsight?: ResolvedRequestInsight | null;
  sessionSnapshot?: SessionSnapshot | null;
  onSaveAuthProfile?: (seed: string, auth: AuthConfig) => void;
  onRefreshRequestAuth?: () => void;
  onCopyText?: (value: string, successMessage: string) => void;
}) {
  const { request: requestDocument, selectedCase, selectedEnvironment, workspace } = props;
  const allowCases = props.allowCases ?? true;
  const effectiveMethod = selectedCase?.overrides.method || requestDocument.method;
  const effectiveKind = selectedCase?.overrides.kind || requestDocument.kind || 'http';
  const effectiveUrl = selectedCase?.overrides.url || requestDocument.url;
  const effectivePath = selectedCase?.overrides.path || requestDocument.path;
  const queryRows = selectedCase?.overrides.query ?? requestDocument.query;
  const pathRows = selectedCase?.overrides.pathParams ?? requestDocument.pathParams;
  const headerRows = selectedCase?.overrides.headers ?? requestDocument.headers;
  const body = selectedCase?.overrides.body || requestDocument.body;
  const auth = selectedCase?.overrides.auth || requestDocument.auth;
  const runtime = {
    ...requestDocument.runtime,
    ...(selectedCase?.overrides.runtime || {})
  };

  const resolvedInsight = useMemo(
    () =>
      props.requestInsight ||
      inspectResolvedRequest(workspace.project, requestDocument, selectedCase || undefined, selectedEnvironment || undefined),
    [props.requestInsight, workspace.project, requestDocument, selectedCase, selectedEnvironment]
  );
  const resolvedPreview = resolvedInsight.preview;
  const blockingDiagnostics = resolvedInsight.diagnostics.filter(item => item.blocking);
  const attentionDiagnostics = resolvedInsight.diagnostics.filter(item => !item.blocking);
  const activeSection = requestSectionForTab(props.activeTab);
  const visibleTabs = new Set<RequestTab>(tabOptionsForSection(activeSection));

  function updateSelectedCase(updater: (current: CaseDocument) => CaseDocument) {
    if (!selectedCase) return;
    props.onCasesChange(props.cases.map(item => (item.id === selectedCase.id ? updater(item) : item)));
  }

  function updateAuth(nextAuth: AuthConfig) {
    if (selectedCase) {
      updateSelectedCase(current => ({
        ...current,
        overrides: { ...current.overrides, auth: nextAuth }
      }));
      return;
    }
    props.onRequestChange({ ...requestDocument, auth: nextAuth });
  }

  function updateBody(nextBody: RequestBody) {
    if (selectedCase) {
      updateSelectedCase(current => ({
        ...current,
        overrides: { ...current.overrides, body: nextBody }
      }));
      return;
    }
    props.onRequestChange({ ...requestDocument, body: nextBody });
  }

  function updateChecks(nextChecks: CaseCheck[]) {
    if (!selectedCase) return;
    updateSelectedCase(current => ({
      ...current,
      checks: nextChecks
    }));
  }

  function updateRuntime(nextRuntime: { timeoutMs: number; followRedirects: boolean }) {
    if (selectedCase) {
      updateSelectedCase(current => ({
        ...current,
        overrides: { ...current.overrides, runtime: nextRuntime }
      }));
      return;
    }
    props.onRequestChange({ ...requestDocument, runtime: nextRuntime });
  }

  async function handlePickBodyFile(index: number) {
    const selectedPath = await chooseRequestBodyFile();
    if (!selectedPath) return;
    const nextFields = [...(body.fields || [])];
    nextFields[index] = {
      ...nextFields[index],
      kind: 'file',
      filePath: selectedPath,
      value: selectedPath
    };
    updateBody({ ...body, fields: nextFields });
  }

  async function handlePickRawBodyFile() {
    const selectedPath = await chooseRequestBodyFile();
    if (!selectedPath) return;
    updateBody({ ...body, mode: 'file', file: selectedPath, text: selectedPath });
  }

  function applyUrlChange(nextUrl: string) {
    if (selectedCase) {
      updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, url: nextUrl } }));
      return;
    }
    props.onRequestChange({ ...requestDocument, url: nextUrl });
  }

  function applyPastedRequest(text: string) {
    const parsed = parseCurlCommand(text);
    if (!parsed) {
      applyUrlChange(text);
      return false;
    }

    if (selectedCase) {
      updateSelectedCase(current => ({
        ...current,
        overrides: {
          ...current.overrides,
          method: parsed.method,
          url: parsed.url,
          path: parsed.path,
          query: parsed.query,
          headers: parsed.headers,
          body: parsed.body,
          auth: parsed.auth
        }
      }));
      notifications.show({ color: 'teal', message: 'cURL imported into the current request' });
      return true;
    }

    props.onRequestChange({
      ...requestDocument,
      method: parsed.method,
      url: parsed.url,
      path: parsed.path,
      query: parsed.query,
      headers: parsed.headers,
      body: parsed.body,
      auth: parsed.auth
    });
    notifications.show({ color: 'teal', message: 'cURL imported into the current request' });
    return true;
  }

  return (
    <div className="request-panel">
      <div className="request-header-compact">
        <div className="request-header-meta">
          <div className="request-header-meta-copy">
            <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {allowCases ? 'Workbench Request' : 'Scratch Request'}
            </Text>
            <Text size="sm" fw={700}>
              {selectedCase ? `${requestDocument.name} · ${selectedCase.name}` : requestDocument.name}
            </Text>
          </div>
          <Group gap="xs" wrap="wrap" className="request-header-meta-pills">
            {props.activeEnvironmentName ? (
              <Badge variant="light" color="gray">
                Env · {props.activeEnvironmentName}
              </Badge>
            ) : null}
            {selectedCase ? (
              <Badge variant="light" color="indigo">
                Case Active
              </Badge>
            ) : null}
            {props.isDirty ? (
              <Badge variant="filled" color="orange">
                Unsaved
              </Badge>
            ) : null}
          </Group>
        </div>

        {allowCases ? (
          <div className="request-case-strip">
            <Select
              size="xs"
              label="Case"
              placeholder="Base request"
              value={selectedCase?.id || '__base__'}
              data={[
                { value: '__base__', label: 'Base Request' },
                ...props.cases.map(caseItem => ({
                  value: caseItem.id,
                  label: caseItem.name
                }))
              ]}
              onChange={value => props.onCaseSelect?.(value === '__base__' ? null : value || null)}
            />
            <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => props.onAddCase()}>
              New Case
            </Button>
          </div>
        ) : null}

        <div className="method-url-group">
          <Select
            size="sm"
            className="request-kind-select-ide"
            value={effectiveKind}
            data={REQUEST_KINDS.map(kind => ({ value: kind, label: kind.toUpperCase() }))}
            onChange={value => {
              const nextKind = (value as RequestDocument['kind']) || 'http';
              if (selectedCase) {
                updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, kind: nextKind } }));
              } else {
                props.onRequestChange({ ...requestDocument, kind: nextKind });
              }
            }}
            variant="filled"
          />
          <Select
            size="sm"
            className="method-select-ide"
            value={effectiveMethod}
            data={REQUEST_METHODS.map(method => ({ value: method, label: method }))}
            onChange={value => {
              const nextMethod = value as RequestDocument['method'];
              if (selectedCase) {
                updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, method: nextMethod } }));
              } else {
                props.onRequestChange({ ...requestDocument, method: nextMethod });
              }
            }}
            variant="filled"
          />
          <TextInput
            size="sm"
            className="url-input-ide"
            value={effectiveUrl}
            placeholder="输入请求地址，支持直接粘贴 cURL"
            onChange={event => applyUrlChange(event.currentTarget.value)}
            onPaste={event => {
              const pastedText = event.clipboardData.getData('text');
              if (!pastedText) return;
              if (applyPastedRequest(pastedText)) {
                event.preventDefault();
              }
            }}
            variant="filled"
          />
          {props.onSave ? (
            <Button size="sm" variant="default" leftSection={<IconDeviceFloppy size={14} />} onClick={props.onSave}>
              保存
            </Button>
          ) : null}
          <Button size="sm" variant="filled" leftSection={<IconPlayerPlay size={14} />} loading={props.isRunning} onClick={props.onRun}>
            发送请求
          </Button>
        </div>
      </div>

      {blockingDiagnostics.length > 0 || attentionDiagnostics.length > 0 ? (
        <div className="request-diagnostics-banner">
          {blockingDiagnostics.length > 0 ? (
            <Badge color="red" variant="filled">{blockingDiagnostics.length} 个阻塞项</Badge>
          ) : null}
          {attentionDiagnostics.length > 0 ? (
            <Badge color="orange" variant="light">{attentionDiagnostics.length} 个待确认项</Badge>
          ) : null}
          <Text size="sm" c="dimmed">
            {blockingDiagnostics[0]?.message || attentionDiagnostics[0]?.message}
          </Text>
        </div>
      ) : null}

      <Tabs value={props.activeTab} onChange={value => props.onTabChange(value as RequestTab)} className="request-tabs-ide">
        <div className="request-tab-tier">
          <button
            type="button"
            className={activeSection === 'request' ? 'request-tab-tier-button is-active' : 'request-tab-tier-button'}
            onClick={() => props.onTabChange('query')}
          >
            Request
          </button>
          <button
            type="button"
            className={activeSection === 'validation' ? 'request-tab-tier-button is-active' : 'request-tab-tier-button'}
            onClick={() => props.onTabChange('checks')}
            disabled={!allowCases}
          >
            Validation
          </button>
          <button
            type="button"
            className={activeSection === 'automation' ? 'request-tab-tier-button is-active' : 'request-tab-tier-button'}
            onClick={() => props.onTabChange('scripts')}
            disabled={!allowCases}
          >
            Automation
          </button>
        </div>
        <Tabs.List>
          {visibleTabs.has('query') ? <Tabs.Tab value="query" leftSection={<IconVariable size={14} />}>参数</Tabs.Tab> : null}
          {visibleTabs.has('headers') ? <Tabs.Tab value="headers" leftSection={<IconListCheck size={14} />}>请求头</Tabs.Tab> : null}
          {visibleTabs.has('body') ? <Tabs.Tab value="body" leftSection={<IconMessageCode size={14} />}>请求体</Tabs.Tab> : null}
          {visibleTabs.has('auth') ? <Tabs.Tab value="auth" leftSection={<IconKey size={14} />}>认证</Tabs.Tab> : null}
          {visibleTabs.has('checks') ? <Tabs.Tab value="checks" leftSection={<IconListCheck size={14} />} disabled={!allowCases}>断言</Tabs.Tab> : null}
          {visibleTabs.has('scripts') ? <Tabs.Tab value="scripts" leftSection={<IconSettings size={14} />} disabled={!allowCases}>脚本</Tabs.Tab> : null}
          {visibleTabs.has('settings') ? <Tabs.Tab value="settings" leftSection={<IconAdjustments size={14} />}>设置</Tabs.Tab> : null}
          {visibleTabs.has('preview') ? <Tabs.Tab value="preview" leftSection={<IconPlayerPlay size={14} />}>预览</Tabs.Tab> : null}
        </Tabs.List>

        <div className="request-tab-content">
          <Tabs.Panel value="preview">
            <div className="request-preview-card-embedded">
              <div className="request-preview-head">
                <div>
                  <Text size="xs" fw={700} c="dimmed">Resolved Request</Text>
                  <Text size="xs" c="dimmed">
                    {resolvedPreview.method} {resolvedPreview.url}
                  </Text>
                </div>
                <Group gap="xs">
                  <Badge variant="light" color="indigo">{resolvedPreview.authSource}</Badge>
                  <Badge variant="light" color="gray">{resolvedPreview.timeoutMs} ms</Badge>
                  <Badge variant="light" color={resolvedPreview.followRedirects ? 'green' : 'orange'}>
                    {resolvedPreview.followRedirects ? 'follow redirects' : 'no redirects'}
                  </Badge>
                </Group>
              </div>
              <div className="request-preview-grid">
                <CodeEditor
                  value={JSON.stringify(
                    {
                      headers: resolvedPreview.headers.filter(item => item.enabled),
                      query: resolvedPreview.query.filter(item => item.enabled)
                    },
                    null,
                    2
                  )}
                  readOnly
                  language="json"
                  minHeight="140px"
                />
                <CodeEditor
                  value={
                    resolvedPreview.body.mode === 'json'
                      ? resolvedPreview.body.text
                      : JSON.stringify(
                          {
                            mode: resolvedPreview.body.mode,
                            fields: resolvedPreview.body.fields,
                            text: resolvedPreview.body.text
                          },
                          null,
                          2
                        )
                  }
                  readOnly
                  language={
                    resolvedPreview.body.mode === 'json' || resolvedPreview.body.mode === 'graphql'
                      ? 'json'
                      : 'text'
                  }
                  minHeight="140px"
                />
              </div>
              {resolvedInsight.warnings.length > 0 ? (
                <div className="request-preview-warnings">
                  {resolvedInsight.warnings.map(warning => (
                    <div key={warning.code} className="request-preview-warning">
                      <strong>{warning.code}</strong>
                      <span>{warning.message}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {resolvedInsight.diagnostics.length > 0 ? (
                <div className="request-preview-warnings">
                  {resolvedInsight.diagnostics.map(diagnostic => (
                    <div key={diagnostic.code} className="request-preview-warning">
                      <strong>{diagnostic.blocking ? 'blocking' : diagnostic.level}</strong>
                      <span>{diagnostic.message}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="request-preview-grid request-preview-grid-secondary">
                <div className="request-preview-section">
                  <Text fw={700} size="sm">Resolved Variables</Text>
                  {resolvedInsight.variables.length === 0 ? (
                    <div className="empty-tab-state">No template variables were detected in this request.</div>
                  ) : (
                    <div className="variable-audit-list">
                      {resolvedInsight.variables.map(variable => (
                        <div key={variable.token} className="variable-audit-card">
                          <div>
                            <strong>{variable.token}</strong>
                            <span>{variable.sourceLabel}</span>
                          </div>
                          <Badge color={variable.missing ? 'red' : variable.source === 'environment' ? 'teal' : 'gray'}>
                            {variable.missing ? 'missing' : variable.value || 'empty'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="request-preview-section">
                  <Text fw={700} size="sm">Auth Preview</Text>
                  <div className="checks-list">
                    {resolvedPreview.authState ? (
                      <div className="check-card">
                        <Text fw={700}>Auth Runtime</Text>
                        <Text size="xs" c="dimmed">
                          {resolvedPreview.authState.type}
                          {resolvedPreview.authState.profileName ? ` · ${resolvedPreview.authState.profileName}` : ''}
                          {resolvedPreview.authState.source ? ` · ${resolvedPreview.authState.source}` : ''}
                        </Text>
                        <Text size="sm">
                          Injected: {resolvedPreview.authState.tokenInjected ? 'yes' : 'no'} · Cache: {resolvedPreview.authState.cacheStatus}
                        </Text>
                        {resolvedPreview.authState.expiresAt ? (
                          <Text size="xs" c="dimmed">Expires at {resolvedPreview.authState.expiresAt}</Text>
                        ) : null}
                        {resolvedPreview.authState.notes.length > 0 ? (
                          <Text size="xs" c="dimmed">{resolvedPreview.authState.notes.join(' ')}</Text>
                        ) : null}
                        {resolvedPreview.authState.missing.length > 0 ? (
                          <Text size="xs" c="red">Missing: {resolvedPreview.authState.missing.join(', ')}</Text>
                        ) : null}
                        {props.onRefreshRequestAuth && resolvedPreview.authState.type === 'oauth2' ? (
                          <Button size="xs" variant="default" onClick={props.onRefreshRequestAuth}>
                            Refresh OAuth Token
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    {resolvedInsight.authPreview.length === 0 ? (
                      <div className="empty-tab-state">No auth values will be injected for the current request.</div>
                    ) : (
                      <div className="checks-list">
                        {resolvedInsight.authPreview.map(item => (
                          <div key={`${item.target}:${item.name}`} className="check-card">
                            <Text fw={700}>{item.name}</Text>
                            <Text size="xs" c="dimmed">
                              {item.target}{item.sourceLabel ? ` · ${item.sourceLabel}` : ''}
                            </Text>
                            {item.detail ? <Text size="xs" c="dimmed">{item.detail}</Text> : null}
                            <CodeEditor value={item.value} readOnly language="text" minHeight="72px" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="request-preview-section">
                  <Text fw={700} size="sm">Session & Effective Headers</Text>
                  <div className="checks-list">
                    <div className="check-card">
                      <Text fw={700}>Cookie Header</Text>
                      <CodeEditor
                        value={props.sessionSnapshot?.cookieHeader || ''}
                        readOnly
                        language="text"
                        minHeight="72px"
                      />
                    </div>
                    <div className="check-card">
                      <Text fw={700}>Effective Headers</Text>
                      <CodeEditor
                        value={resolvedPreview.headers.filter(item => item.enabled).map(item => `${item.name}: ${item.value}`).join('\n')}
                        readOnly
                        language="text"
                        minHeight="120px"
                      />
                    </div>
                    {props.onCopyText ? (
                      <Button
                        size="xs"
                        variant="default"
                        onClick={() =>
                          props.onCopyText?.(
                            resolvedPreview.headers.filter(item => item.enabled).map(item => `${item.name}: ${item.value}`).join('\n'),
                            'Effective headers copied'
                          )
                        }
                      >
                        Copy Effective Headers
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="query">
            <div className="inspector-section">
              <h4 className="compact-section-title">Query Parameters</h4>
              <KeyValueEditor
                rows={queryRows}
                onChange={rows => {
                  if (selectedCase) {
                    updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, query: rows } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, query: rows });
                  }
                }}
              />
            </div>
            <div className="inspector-section">
              <h4 className="compact-section-title">Path Variables</h4>
              <KeyValueEditor
                rows={pathRows}
                onChange={rows => {
                  if (selectedCase) {
                    updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, pathParams: rows } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, pathParams: rows });
                  }
                }}
              />
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="headers">
            <div className="inspector-section">
              <h4 className="compact-section-title">Headers</h4>
              <KeyValueEditor
                rows={headerRows}
                onChange={rows => {
                  if (selectedCase) {
                    updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, headers: rows } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, headers: rows });
                  }
                }}
              />
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="body">
            <div className="body-config-row">
              <Select
                size="xs"
                value={body.mode}
                data={bodyModeOptions()}
                onChange={value => {
                  const nextMode = (value as RequestBody['mode']) || 'none';
                  updateBody({
                    ...body,
                    mode: nextMode,
                    mimeType:
                      nextMode === 'json'
                        ? 'application/json'
                        : nextMode === 'graphql'
                          ? 'application/json'
                          : nextMode === 'xml'
                            ? 'application/xml'
                            : nextMode === 'sparql'
                              ? 'application/sparql-query'
                        : nextMode === 'form-urlencoded'
                          ? 'application/x-www-form-urlencoded'
                          : nextMode === 'multipart'
                            ? 'multipart/form-data'
                            : body.mimeType
                  });
                }}
                variant="unstyled"
                className="body-mode-select"
              />
            </div>
            {body.mode === 'form-urlencoded' || body.mode === 'multipart' ? (
              <KeyValueEditor
                rows={body.fields || []}
                allowFileRows={body.mode === 'multipart'}
                onPickFile={handlePickBodyFile}
                onChange={rows => updateBody({ ...body, fields: rows })}
              />
            ) : body.mode === 'file' ? (
              <div className="settings-grid">
                <TextInput
                  label="Body File"
                  value={body.file || body.text || ''}
                  placeholder="/path/to/request-body.bin"
                  onChange={event => updateBody({ ...body, file: event.currentTarget.value, text: event.currentTarget.value })}
                />
                <div className="preview-note">
                  <Button size="xs" variant="default" onClick={handlePickRawBodyFile}>
                    Choose File
                  </Button>
                </div>
              </div>
            ) : body.mode !== 'none' ? (
              <CodeEditor
                value={body.text || ''}
                language={body.mode === 'json' || body.mode === 'graphql' ? 'json' : 'text'}
                onChange={value => updateBody({ ...body, text: value })}
                minHeight="300px"
              />
            ) : (
              <div className="empty-body-msg">This request does not have a body.</div>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="auth">
            <div className="settings-grid">
              <Select
                label="Auth Type"
                value={auth.type}
                data={authTypeOptions()}
                onChange={value => updateAuth({ type: (value as AuthConfig['type']) || 'inherit' })}
              />
              {auth.type === 'bearer' ? (
                <>
                  <TextInput
                    label="Bearer Token"
                    value={auth.token || ''}
                    onChange={event => updateAuth({ ...auth, token: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Token Variable"
                    placeholder="authToken"
                    value={auth.tokenFromVar || ''}
                    onChange={event => updateAuth({ ...auth, tokenFromVar: event.currentTarget.value })}
                  />
                </>
              ) : null}
              {auth.type === 'basic' ? (
                <>
                  <TextInput
                    label="Username"
                    value={auth.username || ''}
                    onChange={event => updateAuth({ ...auth, username: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Username Variable"
                    placeholder="basicUsername"
                    value={auth.usernameFromVar || ''}
                    onChange={event => updateAuth({ ...auth, usernameFromVar: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Password"
                    value={auth.password || ''}
                    onChange={event => updateAuth({ ...auth, password: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Password Variable"
                    placeholder="basicPassword"
                    value={auth.passwordFromVar || ''}
                    onChange={event => updateAuth({ ...auth, passwordFromVar: event.currentTarget.value })}
                  />
                </>
              ) : null}
              {auth.type === 'apikey' ? (
                <>
                  <TextInput
                    label="Key"
                    value={auth.key || ''}
                    onChange={event => updateAuth({ ...auth, key: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Value"
                    value={auth.value || ''}
                    onChange={event => updateAuth({ ...auth, value: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Value Variable"
                    placeholder="apiKeyValue"
                    value={auth.valueFromVar || ''}
                    onChange={event => updateAuth({ ...auth, valueFromVar: event.currentTarget.value })}
                  />
                  <Select
                    label="Send To"
                    value={auth.addTo || 'header'}
                    data={[
                      { value: 'header', label: 'Header' },
                      { value: 'query', label: 'Query' }
                    ]}
                    onChange={value => updateAuth({ ...auth, addTo: (value as AuthConfig['addTo']) || 'header' })}
                  />
                </>
              ) : null}
              {auth.type === 'oauth2' ? (
                <>
                  <Select
                    label="OAuth Flow"
                    value={auth.oauthFlow || 'client_credentials'}
                    data={[
                      { value: 'client_credentials', label: 'client_credentials' },
                      { value: 'authorization_code', label: 'authorization_code' },
                      { value: 'password', label: 'password' },
                      { value: 'implicit', label: 'implicit' }
                    ]}
                    onChange={value => updateAuth({ ...auth, oauthFlow: (value as AuthConfig['oauthFlow']) || 'client_credentials' })}
                  />
                  {auth.oauthFlow === 'authorization_code' || auth.oauthFlow === 'implicit' ? (
                    <>
                      <TextInput
                        label="Authorization URL"
                        value={auth.authorizationUrl || ''}
                        onChange={event => updateAuth({ ...auth, authorizationUrl: event.currentTarget.value })}
                      />
                      <TextInput
                        label="Callback URL"
                        value={auth.callbackUrl || ''}
                        onChange={event => updateAuth({ ...auth, callbackUrl: event.currentTarget.value })}
                      />
                    </>
                  ) : null}
                  <TextInput
                    label="Token URL"
                    placeholder="https://auth.example.com/oauth/token"
                    value={auth.tokenUrl || ''}
                    onChange={event => updateAuth({ ...auth, tokenUrl: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Client ID"
                    value={auth.clientId || ''}
                    onChange={event => updateAuth({ ...auth, clientId: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Client ID Variable"
                    placeholder="oauthClientId"
                    value={auth.clientIdFromVar || ''}
                    onChange={event => updateAuth({ ...auth, clientIdFromVar: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Client Secret"
                    value={auth.clientSecret || ''}
                    onChange={event => updateAuth({ ...auth, clientSecret: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Client Secret Variable"
                    placeholder="oauthClientSecret"
                    value={auth.clientSecretFromVar || ''}
                    onChange={event => updateAuth({ ...auth, clientSecretFromVar: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Scope"
                    placeholder="read:users write:orders"
                    value={auth.scope || ''}
                    onChange={event => updateAuth({ ...auth, scope: event.currentTarget.value })}
                  />
                  <Select
                    label="Token Placement"
                    value={auth.tokenPlacement || 'header'}
                    data={[
                      { value: 'header', label: 'Header' },
                      { value: 'query', label: 'Query' }
                    ]}
                    onChange={value => updateAuth({ ...auth, tokenPlacement: (value as AuthConfig['tokenPlacement']) || 'header' })}
                  />
                  <TextInput
                    label="Token Name"
                    placeholder={auth.tokenPlacement === 'query' ? 'access_token' : 'Authorization'}
                    value={auth.tokenName || ''}
                    onChange={event => updateAuth({ ...auth, tokenName: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Token Prefix"
                    placeholder="Bearer"
                    value={auth.tokenPrefix || ''}
                    onChange={event => updateAuth({ ...auth, tokenPrefix: event.currentTarget.value })}
                  />
                  {resolvedPreview.authState?.type === 'oauth2' ? (
                    <div className="preview-note">
                      <Text size="xs" c="dimmed">
                        Cache {resolvedPreview.authState.cacheStatus}
                        {resolvedPreview.authState.expiresAt ? ` · expires ${resolvedPreview.authState.expiresAt}` : ''}
                      </Text>
                    </div>
                  ) : null}
                  {props.onRefreshRequestAuth ? (
                    <div className="preview-note">
                      <Button size="xs" variant="default" onClick={props.onRefreshRequestAuth}>
                        Refresh OAuth Token
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
              {auth.type === 'oauth1' ? (
                <>
                  <TextInput label="Consumer Key" value={auth.consumerKey || ''} onChange={event => updateAuth({ ...auth, consumerKey: event.currentTarget.value })} />
                  <TextInput label="Consumer Secret" value={auth.consumerSecret || ''} onChange={event => updateAuth({ ...auth, consumerSecret: event.currentTarget.value })} />
                  <TextInput label="Token" value={auth.token || ''} onChange={event => updateAuth({ ...auth, token: event.currentTarget.value })} />
                  <TextInput label="Token Secret" value={auth.clientSecret || ''} onChange={event => updateAuth({ ...auth, clientSecret: event.currentTarget.value })} />
                </>
              ) : null}
              {auth.type === 'awsv4' ? (
                <>
                  <TextInput label="Access Key" value={auth.accessKey || ''} onChange={event => updateAuth({ ...auth, accessKey: event.currentTarget.value })} />
                  <TextInput label="Secret Key" value={auth.secretKey || ''} onChange={event => updateAuth({ ...auth, secretKey: event.currentTarget.value })} />
                  <TextInput label="Region" value={auth.region || ''} onChange={event => updateAuth({ ...auth, region: event.currentTarget.value })} />
                  <TextInput label="Service" value={auth.service || ''} onChange={event => updateAuth({ ...auth, service: event.currentTarget.value })} />
                  <TextInput label="Session Token" value={auth.sessionToken || ''} onChange={event => updateAuth({ ...auth, sessionToken: event.currentTarget.value })} />
                </>
              ) : null}
              {auth.type === 'digest' || auth.type === 'ntlm' || auth.type === 'wsse' ? (
                <>
                  <TextInput label="Username" value={auth.username || ''} onChange={event => updateAuth({ ...auth, username: event.currentTarget.value })} />
                  <TextInput label="Password" value={auth.password || ''} onChange={event => updateAuth({ ...auth, password: event.currentTarget.value })} />
                  {auth.type === 'ntlm' ? (
                    <>
                      <TextInput label="Domain" value={auth.domain || ''} onChange={event => updateAuth({ ...auth, domain: event.currentTarget.value })} />
                      <TextInput label="Workstation" value={auth.workstation || ''} onChange={event => updateAuth({ ...auth, workstation: event.currentTarget.value })} />
                    </>
                  ) : null}
                </>
              ) : null}
              {auth.type === 'profile' ? (
                <Select
                  label="Environment Profile"
                  value={auth.profileName || null}
                  data={(selectedEnvironment?.authProfiles || []).map(item => ({ value: item.name, label: item.name }))}
                  onChange={value => updateAuth({ ...auth, profileName: value || '' })}
                />
              ) : null}
              {selectedEnvironment?.authProfiles?.length ? (
                <div className="preview-note">
                  <Text size="xs" c="dimmed">
                    Active environment profiles: {selectedEnvironment.authProfiles.map(item => item.name).join(', ')}
                  </Text>
                </div>
              ) : null}
              {props.onSaveAuthProfile && auth.type !== 'inherit' && auth.type !== 'none' ? (
                <div className="preview-note">
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() => {
                      const seed = auth.profileName || requestDocument.name || 'auth-profile';
                      props.onSaveAuthProfile?.(seed, auth);
                    }}
                  >
                    保存为环境认证配置
                  </Button>
                </div>
              ) : null}
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="checks">
            {!allowCases ? (
              <div className="empty-tab-state">Scratch requests do not persist case assertions. Save to workspace first if you want reusable checks.</div>
            ) : !selectedCase ? (
              <div className="empty-tab-state">Checks are case-scoped. Select or create a case to add smoke assertions.</div>
            ) : (
              <div className="checks-panel">
                <div className="checks-head">
                  <Text fw={600}>Smoke Checks</Text>
                  <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => updateChecks([...(selectedCase.checks || []), createEmptyCheck()])}>
                    Add Check
                  </Button>
                </div>
                {(selectedCase.checks || []).length === 0 ? (
                  <div className="empty-tab-state">No checks yet. Add one to validate status, headers or JSON fields after Send.</div>
                ) : (
                  <div className="checks-list">
                    {(selectedCase.checks || []).map((check, index) => (
                      <div key={check.id} className="check-card">
                        <div className="check-card-head">
                          <Checkbox
                            checked={check.enabled}
                            onChange={event =>
                              updateChecks(
                                (selectedCase.checks || []).map(item =>
                                  item.id === check.id ? { ...item, enabled: event.currentTarget.checked } : item
                                )
                              )
                            }
                          />
                          <Select
                            value={check.type}
                            data={checkOptions()}
                            onChange={value =>
                              updateChecks(
                                (selectedCase.checks || []).map(item =>
                                  item.id === check.id ? { ...item, type: (value as CaseCheck['type']) || item.type } : item
                                )
                              )
                            }
                          />
                          <ActionButton
                            label="Remove"
                            onClick={() => updateChecks((selectedCase.checks || []).filter(item => item.id !== check.id))}
                          />
                        </div>
                        <div className="settings-grid">
                          <TextInput
                            label="Label"
                            value={check.label}
                            onChange={event =>
                              updateChecks(
                                (selectedCase.checks || []).map(item =>
                                  item.id === check.id ? { ...item, label: event.currentTarget.value } : item
                                )
                              )
                            }
                          />
                          {check.type === 'status-equals' || check.type === 'body-contains' || check.type === 'body-regex' || check.type === 'response-time-lt' || check.type === 'snapshot-match' ? null : (
                            <TextInput
                              label={check.type === 'header-includes' || check.type === 'header-equals' ? 'Header Name' : 'JSON Path'}
                              value={check.path}
                              onChange={event =>
                                updateChecks(
                                  (selectedCase.checks || []).map(item =>
                                    item.id === check.id ? { ...item, path: event.currentTarget.value } : item
                                  )
                                )
                              }
                            />
                          )}
                          {check.type === 'json-exists' || check.type === 'json-not-exists' ? null : check.type === 'snapshot-match' ? (
                            <Select
                              label="Baseline / Snapshot"
                              value={check.expected}
                              data={(requestDocument.examples || []).map(example => ({
                                value: example.name,
                                label: `${example.name}${example.role === 'baseline' ? ' · baseline' : ''}`
                              }))}
                              onChange={value =>
                                updateChecks(
                                  (selectedCase.checks || []).map(item =>
                                    item.id === check.id ? { ...item, expected: value || '' } : item
                                  )
                                )
                              }
                            />
                          ) : (
                            <TextInput
                              label="Expected"
                              value={check.expected}
                              onChange={event =>
                                updateChecks(
                                  (selectedCase.checks || []).map(item =>
                                    item.id === check.id ? { ...item, expected: event.currentTarget.value } : item
                                  )
                                )
                              }
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="scripts">
            {!allowCases ? (
              <div className="empty-tab-state">Scratch requests keep scripts lightweight. Save to workspace first to attach reusable scripts to a case.</div>
            ) : !selectedCase ? (
              <div className="empty-tab-state">Scripts are case-scoped. Select or create a case to add pre-request and post-response logic.</div>
            ) : (
              <div className="checks-list">
                <div className="check-card">
                  <Text fw={700}>Pre-request Script</Text>
                  <CodeEditor
                    value={selectedCase.scripts?.preRequest || ''}
                    language="text"
                    onChange={value =>
                      updateSelectedCase(current => ({
                        ...current,
                        scripts: {
                          preRequest: value,
                          postResponse: current.scripts?.postResponse || ''
                        }
                      }))
                    }
                    minHeight="180px"
                  />
                </div>
                <div className="check-card">
                  <Text fw={700}>Post-response Script</Text>
                  <CodeEditor
                    value={selectedCase.scripts?.postResponse || ''}
                    language="text"
                    onChange={value =>
                      updateSelectedCase(current => ({
                        ...current,
                        scripts: {
                          preRequest: current.scripts?.preRequest || '',
                          postResponse: value
                        }
                      }))
                    }
                    minHeight="220px"
                  />
                </div>
              </div>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="settings">
            <div className="settings-grid">
              <TextInput
                label="Name"
                value={requestDocument.name}
                onChange={event => props.onRequestChange({ ...requestDocument, name: event.currentTarget.value })}
              />
              <TextInput
                label="Path"
                value={effectivePath}
                onChange={event => {
                  const nextPath = event.currentTarget.value;
                  if (selectedCase) {
                    updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, path: nextPath } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, path: nextPath });
                  }
                }}
              />
              <NumberInput
                label="Timeout (ms)"
                value={runtime.timeoutMs}
                min={100}
                step={500}
                onChange={value => updateRuntime({ ...runtime, timeoutMs: Number(value) || 30000 })}
              />
              <div className="toggle-field">
                <Checkbox
                  label="Follow Redirects"
                  checked={runtime.followRedirects}
                  onChange={event => updateRuntime({ ...runtime, followRedirects: event.currentTarget.checked })}
                />
              </div>
              <Textarea
                label="Description"
                value={requestDocument.description}
                onChange={event => props.onRequestChange({ ...requestDocument, description: event.currentTarget.value })}
                minRows={3}
              />
              {selectedCase ? (
                <>
                  <Select
                    label="Test Mode"
                    value={selectedCase.testMode}
                    data={[
                      { value: 'automation', label: 'automation' },
                      { value: 'debug', label: 'debug' }
                    ]}
                    onChange={value =>
                      updateSelectedCase(current => ({
                        ...current,
                        testMode: (value as CaseDocument['testMode']) || 'automation'
                      }))
                    }
                  />
                  <TextInput
                    label="Tags"
                    placeholder="smoke, regression"
                    value={(selectedCase.tags || []).join(', ')}
                    onChange={event =>
                      updateSelectedCase(current => ({
                        ...current,
                        tags: event.currentTarget.value.split(',').map(item => item.trim()).filter(Boolean)
                      }))
                    }
                  />
                  <TextInput
                    label="Baseline Ref"
                    placeholder="shared-baseline"
                    value={selectedCase.baselineRef || ''}
                    onChange={event =>
                      updateSelectedCase(current => ({
                        ...current,
                        baselineRef: event.currentTarget.value
                      }))
                    }
                  />
                  <NumberInput
                    label="Retry Count"
                    value={selectedCase.retry?.count || 0}
                    min={0}
                    onChange={value =>
                      updateSelectedCase(current => ({
                        ...current,
                        retry: {
                          ...current.retry,
                          count: Number(value) || 0
                        }
                      }))
                    }
                  />
                  <NumberInput
                    label="Retry Delay (ms)"
                    value={selectedCase.retry?.delayMs || 0}
                    min={0}
                    step={100}
                    onChange={value =>
                      updateSelectedCase(current => ({
                        ...current,
                        retry: {
                          ...current.retry,
                          delayMs: Number(value) || 0
                        }
                      }))
                    }
                  />
                  <Select
                    label="Retry When"
                    value={(selectedCase.retry?.when || []).join(',')}
                    data={retryWhenOptions().map(option => ({
                      value: option.value,
                      label: option.label
                    }))}
                    onChange={value =>
                      updateSelectedCase(current => ({
                        ...current,
                        retry: {
                          ...current.retry,
                          when: value ? [value as any] : []
                        }
                      }))
                    }
                  />
                  <Checkbox
                    label="Skip This Case"
                    checked={selectedCase.skip?.enabled || false}
                    onChange={event =>
                      updateSelectedCase(current => ({
                        ...current,
                        skip: {
                          ...current.skip,
                          enabled: event.currentTarget.checked
                        }
                      }))
                    }
                  />
                  <TextInput
                    label="Skip Reason"
                    value={selectedCase.skip?.reason || ''}
                    onChange={event =>
                      updateSelectedCase(current => ({
                        ...current,
                        skip: {
                          ...current.skip,
                          reason: event.currentTarget.value
                        }
                      }))
                    }
                  />
                  <TextInput
                    label="Skip Condition"
                    placeholder="{{runMode}} == dryrun"
                    value={selectedCase.skip?.when || ''}
                    onChange={event =>
                      updateSelectedCase(current => ({
                        ...current,
                        skip: {
                          ...current.skip,
                          when: event.currentTarget.value
                        }
                      }))
                    }
                  />
                </>
              ) : null}
            </div>
          </Tabs.Panel>
        </div>
      </Tabs>
    </div>
  );
}

function ActionButton(props: { label: string; onClick: () => void }) {
  return (
    <Button size="xs" variant="subtle" color="red" onClick={props.onClick}>
      {props.label}
    </Button>
  );
}
