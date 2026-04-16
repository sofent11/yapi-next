import { useMemo } from 'react';
import { Badge, Button, Select, Tabs, TextInput, Textarea, Text } from '@mantine/core';
import { IconDeviceFloppy, IconPlayerPlay } from '@tabler/icons-react';
import type {
  CaseDocument,
  ParameterRow,
  RequestDocument,
  RequestBody,
  WorkspaceIndex,
  EnvironmentDocument
} from '@yapi-debugger/schema';
import { applyProjectVariables } from '@yapi-debugger/core';
import type { RequestTab } from '../../store/workspace-store';
import { CodeEditor } from '../editors/CodeEditor';
import { KeyValueEditor } from '../primitives/KeyValueEditor';

const REQUEST_METHODS: RequestDocument['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

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
  onRun: () => void;
  onSave: () => void;
  cases: CaseDocument[];
}) {
  const { request: requestDocument, selectedCase, selectedEnvironment, workspace } = props;

  const effectiveMethod = selectedCase?.overrides.method || requestDocument.method;
  const rawUrl = selectedCase?.overrides.url || requestDocument.url;
  const effectiveUrl = rawUrl;
  const effectivePath = selectedCase?.overrides.path || requestDocument.path;
  const queryRows = selectedCase?.overrides.query ?? requestDocument.query;
  const pathRows = selectedCase?.overrides.pathParams ?? requestDocument.pathParams;
  const headerRows = selectedCase?.overrides.headers ?? requestDocument.headers;
  const body = selectedCase?.overrides.body || requestDocument.body;

  const resolvedUrl = useMemo(() => {
    const url = applyProjectVariables(rawUrl, workspace.project, selectedEnvironment || undefined);
    const path = applyProjectVariables(effectivePath || '', workspace.project, selectedEnvironment || undefined);
    
    if (!url || (!url.includes('://') && !rawUrl.startsWith('{{'))) {
      const baseUrl = selectedEnvironment?.vars.baseUrl || workspace.project.runtime.baseUrl || '';
      return `${baseUrl}${url || path || ''}`;
    }
    return url;
  }, [rawUrl, effectivePath, workspace.project, selectedEnvironment]);

  function updateSelectedCase(updater: (current: CaseDocument) => CaseDocument) {
    if (!selectedCase) return;
    const nextCases = props.cases.map(item => (item.id === selectedCase.id ? updater(item) : item));
    props.onCasesChange(nextCases);
  }

  function setMethod(method: RequestDocument['method']) {
    if (!selectedCase) {
      props.onRequestChange({ ...requestDocument, method });
    } else {
      updateSelectedCase(current => ({
        ...current,
        overrides: { ...current.overrides, method }
      }));
    }
  }

  function setUrl(url: string) {
    if (!selectedCase) {
      props.onRequestChange({ ...requestDocument, url });
    } else {
      updateSelectedCase(current => ({
        ...current,
        overrides: { ...current.overrides, url }
      }));
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
            data={REQUEST_METHODS.map(m => ({ value: m, label: m }))}
            onChange={val => val && setMethod(val as RequestDocument['method'])}
            variant="filled"
          />
          <TextInput
            size="sm"
            className="url-input-ide"
            value={effectiveUrl}
            placeholder="Enter request URL"
            onChange={e => setUrl(e.currentTarget.value)}
            variant="filled"
          />
          <Button
            size="sm"
            leftSection={<IconPlayerPlay size={14} />}
            loading={props.isRunning}
            onClick={props.onRun}
            className="send-button-ide"
          >
            Send
          </Button>
          <Button
            size="sm"
            variant="default"
            leftSection={<IconDeviceFloppy size={14} />}
            onClick={props.onSave}
          >
            Save
          </Button>
        </div>
        {resolvedUrl !== effectiveUrl && (
          <Text size="xs" c="dimmed" mt={4} style={{ paddingLeft: 94, fontFamily: 'var(--font-mono)' }}>
            Resolved: {resolvedUrl}
          </Text>
        )}
      </div>

      <Tabs value={props.activeTab} onChange={val => props.onTabChange(val as RequestTab)} className="request-tabs-ide">
        <Tabs.List>
          <Tabs.Tab value="query">Params</Tabs.Tab>
          <Tabs.Tab value="headers">Headers</Tabs.Tab>
          <Tabs.Tab value="body">Body</Tabs.Tab>
          <Tabs.Tab value="auth">Auth</Tabs.Tab>
          <Tabs.Tab value="settings">Settings</Tabs.Tab>
        </Tabs.List>

        <div className="request-tab-content">
          <Tabs.Panel value="query">
            <div className="inspector-section">
              <h4 className="compact-section-title">Query Parameters</h4>
              <KeyValueEditor
                rows={queryRows}
                onChange={rows => {
                  if (selectedCase) {
                    updateSelectedCase(c => ({ ...c, overrides: { ...c.overrides, query: rows } }));
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
                    updateSelectedCase(c => ({ ...c, overrides: { ...c.overrides, pathParams: rows } }));
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
                    updateSelectedCase(c => ({ ...c, overrides: { ...c.overrides, headers: rows } }));
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
                data={[
                  { value: 'none', label: 'none' },
                  { value: 'form', label: 'form-data' },
                  { value: 'json', label: 'json' },
                  { value: 'text', label: 'raw' }
                ]}
                onChange={val => {
                  const nextBody = { ...body, mode: val as RequestBody['mode'] };
                  if (selectedCase) {
                    updateSelectedCase(c => ({ ...c, overrides: { ...c.overrides, body: nextBody } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, body: nextBody });
                  }
                }}
                variant="unstyled"
                className="body-mode-select"
              />
            </div>
            {body.mode === 'form' ? (
              <KeyValueEditor
                rows={body.fields || []}
                onChange={rows => {
                  const nextBody = { ...body, fields: rows };
                  if (selectedCase) {
                    updateSelectedCase(c => ({ ...c, overrides: { ...c.overrides, body: nextBody } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, body: nextBody });
                  }
                }}
              />
            ) : body.mode !== 'none' ? (
              <CodeEditor
                value={body.text || ''}
                language={body.mode === 'json' ? 'json' : 'text'}
                onChange={val => {
                  const nextBody = { ...body, text: val };
                  if (selectedCase) {
                    updateSelectedCase(c => ({ ...c, overrides: { ...c.overrides, body: nextBody } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, body: nextBody });
                  }
                }}
                minHeight="300px"
              />
            ) : (
              <div className="empty-body-msg">This request does not have a body.</div>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="auth">
            <div className="empty-tab-state">Authentication settings coming soon. Use Headers for now.</div>
          </Tabs.Panel>

          <Tabs.Panel value="settings">
            <div className="settings-grid">
              <TextInput
                label="Name"
                value={requestDocument.name}
                onChange={e => props.onRequestChange({ ...requestDocument, name: e.currentTarget.value })}
              />
              <TextInput
                label="Path"
                value={effectivePath}
                onChange={e => {
                  const val = e.currentTarget.value;
                  if (selectedCase) {
                    updateSelectedCase(c => ({ ...c, overrides: { ...c.overrides, path: val } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, path: val });
                  }
                }}
              />
              <Textarea
                label="Description"
                value={requestDocument.description}
                onChange={e => props.onRequestChange({ ...requestDocument, description: e.currentTarget.value })}
                minRows={3}
              />
            </div>
          </Tabs.Panel>
        </div>
      </Tabs>
    </div>
  );
}
