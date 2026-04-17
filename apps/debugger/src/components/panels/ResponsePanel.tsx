import { useMemo } from 'react';
import { Badge, Button, Group, Select, Tabs, Text } from '@mantine/core';
import { IconAlertCircle, IconBraces, IconCookie, IconGitCompare, IconPlayerPlay } from '@tabler/icons-react';
import type {
  CheckResult,
  RequestDocument,
  ResolvedRequestPreview,
  ScriptLog,
  SendRequestResult,
  SessionSnapshot
} from '@yapi-debugger/schema';
import type { ResponseTab } from '../../store/workspace-store';
import { CodeEditor } from '../editors/CodeEditor';

type GeneratedCheckInput =
  | { type: 'status-equals'; label: string; expected: string }
  | { type: 'header-equals' | 'header-includes'; label: string; path: string; expected: string }
  | { type: 'json-exists'; label: string; path: string }
  | { type: 'json-equals'; label: string; path: string; expected: string };

function responseHeadersText(res: SendRequestResult | null) {
  if (!res) return '';
  return res.headers.map(h => `${h.name}: ${h.value}`).join('\n');
}

function responseBodyLanguage(body: string) {
  if (body.trim().startsWith('{') || body.trim().startsWith('[')) return 'json';
  return 'text';
}

function safeJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch (_error) {
    return null;
  }
}

function flattenJsonPaths(input: unknown, prefix = '$', rows: Array<{ path: string; value: string }> = []) {
  if (Array.isArray(input)) {
    input.forEach((item, index) => flattenJsonPaths(item, `${prefix}[${index}]`, rows));
    return rows;
  }
  if (input && typeof input === 'object') {
    Object.entries(input).forEach(([key, value]) => flattenJsonPaths(value, `${prefix}.${key}`, rows));
    return rows;
  }

  rows.push({
    path: prefix,
    value: typeof input === 'string' ? input : JSON.stringify(input)
  });
  return rows;
}

function parseSetCookies(response: SendRequestResult | null) {
  if (!response) return [] as Array<{ name: string; value: string; source: string }>;
  return response.headers
    .filter(header => header.name.toLowerCase() === 'set-cookie')
    .map(header => {
      const [firstPart] = header.value.split(';');
      const [name, ...rest] = firstPart.split('=');
      return {
        name: name?.trim() || 'cookie',
        value: rest.join('=').trim(),
        source: 'response'
      };
    });
}

function compareSummary(left: string, right: string) {
  if (!left && !right) return 'No content to compare yet.';
  if (left === right) return 'The live response matches the selected example.';
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const changed = Math.abs(leftLines.length - rightLines.length);
  return `The bodies differ. Live lines: ${leftLines.length}, example lines: ${rightLines.length}, line delta: ${changed}.`;
}

export function ResponsePanel(props: {
  response: SendRequestResult | null;
  requestError: string | null;
  requestPreview: ResolvedRequestPreview | null;
  requestDocument: RequestDocument | null;
  checkResults: CheckResult[];
  scriptLogs: ScriptLog[];
  sessionSnapshot: SessionSnapshot | null;
  selectedExampleName: string | null;
  activeTab: ResponseTab | 'json' | 'cookies' | 'compare';
  onTabChange: (tab: ResponseTab | 'json' | 'cookies' | 'compare') => void;
  onSelectExample: (name: string | null) => void;
  onCopyBody: () => void;
  onCopyCurl: () => void;
  onSaveExample: () => void;
  onReplaceExample: () => void;
  onRefreshSession: () => void;
  onClearSession: () => void;
  onCreateCheck: (input: GeneratedCheckInput) => void;
  onCreateCaseFromResponse: () => void;
}) {
  const examples = props.requestDocument?.examples || [];
  const selectedExample = examples.find(item => item.name === props.selectedExampleName) || null;
  const liveBody = props.response?.bodyText ?? '';
  const displayBody = selectedExample?.text ?? liveBody;
  const displayHeaders =
    selectedExample
      ? [`Status: ${selectedExample.status || 'n/a'}`, `Content-Type: ${selectedExample.mimeType || 'unknown'}`].join('\n')
      : responseHeadersText(props.response);
  const parsedJson = useMemo(() => safeJson(displayBody), [displayBody]);
  const jsonRows = useMemo(() => flattenJsonPaths(parsedJson).slice(0, 80), [parsedJson]);
  const responseCookies = useMemo(() => parseSetCookies(props.response), [props.response]);
  const sessionCookies = props.sessionSnapshot?.cookies || [];

  return (
    <div className="response-panel">
      <div className="response-header-ide">
        <div className="response-status-group">
          <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Response
          </Text>
          {props.response ? (
            <div className="response-metrics">
              <Badge color={props.response.ok ? 'green' : 'red'} variant="light" size="sm">
                {props.response.status} {props.response.statusText}
              </Badge>
              <Text size="xs" fw={600} c="dimmed">{props.response.durationMs}ms</Text>
              <Text size="xs" fw={600} c="dimmed">{props.response.sizeBytes}B</Text>
            </div>
          ) : props.requestError ? (
            <Badge color="red" variant="filled" size="xs">ERROR</Badge>
          ) : null}
        </div>
        <Group gap="xs" style={{ flexShrink: 0 }}>
          <Select
            size="xs"
            className="response-example-select"
            placeholder="Live Response"
            value={props.selectedExampleName || '__live__'}
            data={[
              { value: '__live__', label: 'Live Response' },
              ...examples.map(example => ({ value: example.name, label: example.name }))
            ]}
            onChange={value => props.onSelectExample(value === '__live__' ? null : value || null)}
          />
          <Button size="xs" variant="default" onClick={props.onCopyBody} disabled={!displayBody}>Copy</Button>
          <Button size="xs" variant="default" onClick={props.onCopyCurl} disabled={!props.requestPreview}>cURL</Button>
          <Button size="xs" variant="default" onClick={props.onSaveExample} disabled={!props.response}>Save</Button>
          <Button size="xs" variant="filled" color="indigo" onClick={props.onReplaceExample} disabled={!props.response || !selectedExample}>Update</Button>
        </Group>
      </div>

      {props.response ? (
        <div className="response-quick-actions">
          <Button
            size="xs"
            variant="light"
            onClick={() =>
              props.onCreateCheck({
                type: 'status-equals',
                label: 'Status equals current response',
                expected: String(props.response?.status || 200)
              })
            }
          >
            Add Status Check
          </Button>
          <Button size="xs" variant="default" onClick={props.onCreateCaseFromResponse}>
            Create Case From Response
          </Button>
          <Button size="xs" variant="subtle" onClick={props.onRefreshSession}>
            Refresh Session
          </Button>
          <Button size="xs" variant="subtle" color="red" onClick={props.onClearSession}>
            Clear Session
          </Button>
        </div>
      ) : null}

      {props.checkResults.length > 0 ? (
        <div className="check-results-banner">
          {props.checkResults.map(result => (
            <div key={result.id} className="check-result-row">
              <Badge color={result.ok ? 'green' : 'red'}>{result.ok ? 'PASS' : 'FAIL'}</Badge>
              <div className="tree-row-copy">
                <strong>{result.label}</strong>
                <span>{result.message}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {props.scriptLogs.length > 0 ? (
        <div className="check-results-banner">
          {props.scriptLogs.map((log, index) => (
            <div key={`${log.phase}-${index}`} className="check-result-row">
              <Badge color={log.level === 'error' ? 'red' : 'blue'}>{log.phase}</Badge>
              <div className="tree-row-copy">
                <strong>{log.level === 'error' ? 'Script Error' : 'Script Log'}</strong>
                <span>{log.message}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Tabs value={props.activeTab} onChange={value => props.onTabChange(value as ResponseTab | 'json' | 'cookies' | 'compare')} className="response-tabs-ide">
        <Tabs.List>
          <Tabs.Tab value="body">Body</Tabs.Tab>
          <Tabs.Tab value="json" leftSection={<IconBraces size={14} />}>JSON</Tabs.Tab>
          <Tabs.Tab value="headers">Headers</Tabs.Tab>
          <Tabs.Tab value="cookies" leftSection={<IconCookie size={14} />}>Cookies</Tabs.Tab>
          <Tabs.Tab value="compare" leftSection={<IconGitCompare size={14} />}>Compare</Tabs.Tab>
          <Tabs.Tab value="raw">Raw</Tabs.Tab>
        </Tabs.List>

        <div className="response-tab-content">
          {props.requestError ? (
            <div className="error-response-state" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '400px',
              color: 'var(--red)',
              gap: 16,
              padding: 24,
              textAlign: 'center'
            }}>
              <IconAlertCircle size={48} stroke={1.5} />
              <div>
                <Text fw={700} size="md">Request Failed</Text>
                <Text size="sm" mt={4} style={{ maxWidth: 400, wordBreak: 'break-word', fontFamily: 'var(--font-mono)' }}>
                  {props.requestError}
                </Text>
              </div>
              <Text size="xs" c="dimmed" style={{ maxWidth: 300 }}>
                This could be due to network issues, an invalid URL, or a server-side error. Check the console or your connection and try again.
              </Text>
            </div>
          ) : !props.response && !selectedExample ? (
            <div className="empty-response-state" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '400px',
              color: 'var(--muted)',
              gap: 12
            }}>
              <IconPlayerPlay size={48} stroke={1.5} opacity={0.2} />
              <Text size="sm" fw={500}>Ready to Send</Text>
              <Text size="xs" style={{ maxWidth: 240, textAlign: 'center' }}>
                Hit the Send button to execute the request or select a saved example to inspect.
              </Text>
            </div>
          ) : (
            <>
              <Tabs.Panel value="body">
                <CodeEditor value={displayBody} readOnly language={responseBodyLanguage(displayBody)} minHeight="400px" />
              </Tabs.Panel>
              <Tabs.Panel value="json">
                {parsedJson == null ? (
                  <div className="empty-tab-state">The current body is not valid JSON, so structured inspection is unavailable.</div>
                ) : (
                  <div className="json-inspector-list">
                    {jsonRows.map(row => (
                      <div key={row.path} className="json-inspector-row">
                        <div className="json-inspector-copy">
                          <strong>{row.path}</strong>
                          <span>{row.value}</span>
                        </div>
                        <Group gap={6}>
                          <Button
                            size="xs"
                            variant="default"
                            onClick={() =>
                              props.onCreateCheck({
                                type: 'json-exists',
                                label: `JSON path exists: ${row.path}`,
                                path: row.path
                              })
                            }
                          >
                            Exists
                          </Button>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() =>
                              props.onCreateCheck({
                                type: 'json-equals',
                                label: `JSON equals: ${row.path}`,
                                path: row.path,
                                expected: row.value
                              })
                            }
                          >
                            Equals
                          </Button>
                        </Group>
                      </div>
                    ))}
                  </div>
                )}
              </Tabs.Panel>
              <Tabs.Panel value="headers">
                <div className="json-inspector-list">
                  {(props.response?.headers || []).map(header => (
                    <div key={`${header.name}:${header.value}`} className="json-inspector-row">
                      <div className="json-inspector-copy">
                        <strong>{header.name}</strong>
                        <span>{header.value}</span>
                      </div>
                      <Group gap={6}>
                        <Button
                          size="xs"
                          variant="default"
                          onClick={() =>
                            props.onCreateCheck({
                              type: 'header-equals',
                              label: `Header equals: ${header.name}`,
                              path: header.name.toLowerCase(),
                              expected: header.value
                            })
                          }
                        >
                          Equals
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() =>
                            props.onCreateCheck({
                              type: 'header-includes',
                              label: `Header includes: ${header.name}`,
                              path: header.name.toLowerCase(),
                              expected: header.value
                            })
                          }
                        >
                          Includes
                        </Button>
                      </Group>
                    </div>
                  ))}
                  {!props.response?.headers.length ? (
                    <div className="empty-tab-state">No response headers were captured.</div>
                  ) : null}
                  <CodeEditor value={displayHeaders} readOnly language="text" minHeight="180px" />
                </div>
              </Tabs.Panel>
              <Tabs.Panel value="cookies">
                <div className="response-cookie-grid">
                  <div className="check-card">
                    <Text fw={700}>Response Set-Cookie</Text>
                    {responseCookies.length === 0 ? (
                      <div className="empty-tab-state">No Set-Cookie headers were returned by this response.</div>
                    ) : (
                      <div className="json-inspector-list">
                        {responseCookies.map(cookie => (
                          <div key={`${cookie.name}:${cookie.value}`} className="json-inspector-row">
                            <div className="json-inspector-copy">
                              <strong>{cookie.name}</strong>
                              <span>{cookie.value}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Session Cookies</Text>
                    {sessionCookies.length === 0 ? (
                      <div className="empty-tab-state">No active session cookies are available for the current request URL.</div>
                    ) : (
                      <div className="json-inspector-list">
                        {sessionCookies.map(cookie => (
                          <div key={`${cookie.name}:${cookie.value}`} className="json-inspector-row">
                            <div className="json-inspector-copy">
                              <strong>{cookie.name}</strong>
                              <span>{cookie.value}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <CodeEditor value={props.sessionSnapshot?.cookieHeader || ''} readOnly language="text" minHeight="96px" />
                  </div>
                </div>
              </Tabs.Panel>
              <Tabs.Panel value="compare">
                <div className="compare-summary-card">
                  <Text fw={700}>Live vs Example</Text>
                  <Text size="sm" c="dimmed">
                    {selectedExample
                      ? compareSummary(liveBody, selectedExample.text || '')
                      : 'Select a saved example to compare it with the latest live response.'}
                  </Text>
                </div>
                <div className="response-compare-grid">
                  <div className="check-card">
                    <Text fw={700}>Live Response</Text>
                    <CodeEditor value={liveBody} readOnly language={responseBodyLanguage(liveBody)} minHeight="320px" />
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Selected Example</Text>
                    <CodeEditor
                      value={selectedExample?.text || ''}
                      readOnly
                      language={responseBodyLanguage(selectedExample?.text || '')}
                      minHeight="320px"
                    />
                  </div>
                </div>
              </Tabs.Panel>
              <Tabs.Panel value="raw">
                <CodeEditor value={displayBody} readOnly language="text" minHeight="400px" />
              </Tabs.Panel>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}
