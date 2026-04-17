import { useMemo } from 'react';
import { Badge, Button, Checkbox, Group, NumberInput, Select, Tabs, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { 
  IconAdjustments, 
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

function bodyModeOptions() {
  return [
    { value: 'none', label: 'none' },
    { value: 'json', label: 'json' },
    { value: 'text', label: 'raw' },
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
    { value: 'oauth2', label: 'oauth2 client credentials' },
    { value: 'profile', label: 'environment profile' }
  ];
}

function checkOptions() {
  return [
    { value: 'status-equals', label: 'Status Equals' },
    { value: 'header-equals', label: 'Header Equals' },
    { value: 'header-includes', label: 'Header Includes' },
    { value: 'json-exists', label: 'JSON Path Exists' },
    { value: 'json-equals', label: 'JSON Path Equals' },
    { value: 'body-contains', label: 'Body Contains' },
    { value: 'body-regex', label: 'Body Regex' },
    { value: 'response-time-lt', label: 'Response Time <' }
  ];
}

export function RequestPanel(props: {
  workspace: WorkspaceIndex;
  selectedEnvironment: EnvironmentDocument | null;
  request: RequestDocument;
  selectedCase: CaseDocument | null;
  activeTab: RequestTab;
  isRunning: boolean;
  isDirty: boolean;
  onTabChange: (tab: RequestTab) => void;
  onRequestChange: (request: RequestDocument) => void;
  onCasesChange: (cases: CaseDocument[]) => void;
  onAddCase: () => void;
  onRun: () => void;
  cases: CaseDocument[];
  allowCases?: boolean;
  requestInsight?: ResolvedRequestInsight | null;
  sessionSnapshot?: SessionSnapshot | null;
  onSaveAuthProfile?: (name: string, auth: AuthConfig) => void;
  onRefreshRequestAuth?: () => void;
  onCopyText?: (value: string, successMessage: string) => void;
}) {
  const { request: requestDocument, selectedCase, selectedEnvironment, workspace } = props;
  const allowCases = props.allowCases ?? true;
  const effectiveMethod = selectedCase?.overrides.method || requestDocument.method;
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

  async function handleUrlShortcutPaste() {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      applyPastedRequest(text);
    } catch (_error) {
      return;
    }
  }

  return (
    <div className="request-panel">
      <div className="request-header-compact">
        <div className="method-url-group">
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
            placeholder="Enter request URL"
            onChange={event => applyUrlChange(event.currentTarget.value)}
            onPaste={event => {
              const pastedText = event.clipboardData.getData('text');
              if (!pastedText) return;
              event.preventDefault();
              applyPastedRequest(pastedText);
            }}
            onKeyDown={event => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
                event.preventDefault();
                void handleUrlShortcutPaste();
              }
            }}
            variant="filled"
          />
          <Button 
            size="sm" 
            variant="default" 
            leftSection={<IconPlus size={14} />} 
            onClick={() => props.onAddCase()}
            title="Create new case for this request"
            disabled={!allowCases}
          >
            Case
          </Button>
          <Button size="sm" leftSection={<IconPlayerPlay size={14} />} loading={props.isRunning} onClick={props.onRun}>
            Send
          </Button>
        </div>
      </div>

      {blockingDiagnostics.length > 0 || attentionDiagnostics.length > 0 ? (
        <div className="request-diagnostics-banner">
          {blockingDiagnostics.length > 0 ? (
            <Badge color="red" variant="filled">{blockingDiagnostics.length} blocking</Badge>
          ) : null}
          {attentionDiagnostics.length > 0 ? (
            <Badge color="orange" variant="light">{attentionDiagnostics.length} attention</Badge>
          ) : null}
          <Text size="sm" c="dimmed">
            {blockingDiagnostics[0]?.message || attentionDiagnostics[0]?.message}
          </Text>
        </div>
      ) : null}

      <Tabs value={props.activeTab} onChange={value => props.onTabChange(value as RequestTab)} className="request-tabs-ide">
        <Tabs.List>
          <Tabs.Tab value="query" leftSection={<IconVariable size={14} />}>Params</Tabs.Tab>
          <Tabs.Tab value="headers" leftSection={<IconListCheck size={14} />}>Headers</Tabs.Tab>
          <Tabs.Tab value="body" leftSection={<IconMessageCode size={14} />}>Body</Tabs.Tab>
          <Tabs.Tab value="auth" leftSection={<IconKey size={14} />}>Auth</Tabs.Tab>
          <Tabs.Tab value="checks" leftSection={<IconListCheck size={14} />} disabled={!allowCases}>Checks</Tabs.Tab>
          <Tabs.Tab value="scripts" leftSection={<IconSettings size={14} />} disabled={!allowCases}>Scripts</Tabs.Tab>
          <Tabs.Tab value="settings" leftSection={<IconAdjustments size={14} />}>Settings</Tabs.Tab>
          <Tabs.Tab value="preview" leftSection={<IconPlayerPlay size={14} />}>Preview</Tabs.Tab>
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
                  language={resolvedPreview.body.mode === 'json' ? 'json' : 'text'}
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
            ) : body.mode !== 'none' ? (
              <CodeEditor
                value={body.text || ''}
                language={body.mode === 'json' ? 'json' : 'text'}
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
                    data={[{ value: 'client_credentials', label: 'client_credentials' }]}
                    onChange={value => updateAuth({ ...auth, oauthFlow: (value as AuthConfig['oauthFlow']) || 'client_credentials' })}
                  />
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
                      const name = window.prompt('Auth profile name', seed)?.trim();
                      if (!name) return;
                      props.onSaveAuthProfile?.(name, auth);
                    }}
                  >
                    Save As Environment Profile
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
                          {check.type === 'status-equals' || check.type === 'body-contains' || check.type === 'body-regex' || check.type === 'response-time-lt' ? null : (
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
                          {check.type === 'json-exists' ? null : (
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
