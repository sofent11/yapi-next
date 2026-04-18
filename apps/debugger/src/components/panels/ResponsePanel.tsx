import { useMemo, useState } from 'react';
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

function exampleOptionLabel(name: string, role?: string) {
  return role === 'baseline' ? `${name} · Baseline` : name;
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
  onReplaceExample: () => void;
  onSaveAs?: () => void;
  onRefreshSession: () => void;
  onClearSession: () => void;
  onCreateCheck: (input: GeneratedCheckInput) => void;
  onCreateCaseFromResponse: () => void;
  onExtractValue?: (target: 'local' | 'runtime', input: { suggestedName: string; value: string }) => void;
}) {
  const [prettifyJson, setPrettifyJson] = useState(true);
  const examples = props.requestDocument?.examples || [];
  const selectedExample = examples.find(item => item.name === props.selectedExampleName) || null;
  const liveBody = props.response?.bodyText ?? '';
  const displayBody = selectedExample?.text ?? liveBody;
  const displayHeaders =
    selectedExample
      ? [`Status: ${selectedExample.status || 'n/a'}`, `Content-Type: ${selectedExample.mimeType || 'unknown'}`].join('\n')
      : responseHeadersText(props.response);
  const parsedJson = useMemo(() => safeJson(displayBody), [displayBody]);
  const prettyBody = useMemo(
    () => (parsedJson == null ? displayBody : JSON.stringify(parsedJson, null, 2)),
    [displayBody, parsedJson]
  );
  const bodyView = parsedJson != null && prettifyJson ? prettyBody : displayBody;
  const jsonRows = useMemo(() => flattenJsonPaths(parsedJson).slice(0, 80), [parsedJson]);
  const responseCookies = useMemo(() => parseSetCookies(props.response), [props.response]);
  const sessionCookies = props.sessionSnapshot?.cookies || [];

  return (
    <div className="response-panel">
      <div className="response-header-ide">
        <div className="response-status-group">
          <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            响应结果
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
            <Badge color="red" variant="filled" size="xs">请求失败</Badge>
          ) : null}
        </div>
        <Group gap="xs" wrap="wrap" className="response-header-actions">
          <Select
            size="xs"
            className="response-example-select"
            placeholder="查看实时响应"
            value={props.selectedExampleName || '__live__'}
            data={[
              { value: '__live__', label: '实时响应' },
              ...examples.map(example => ({ value: example.name, label: exampleOptionLabel(example.name, example.role) }))
            ]}
            onChange={value => props.onSelectExample(value === '__live__' ? null : value || null)}
          />
          {props.response && parsedJson != null ? (
            <Button
              size="xs"
              variant={prettifyJson ? 'filled' : 'default'}
              color={prettifyJson ? 'indigo' : 'gray'}
              onClick={() => setPrettifyJson(current => !current)}
            >
              {prettifyJson ? '已格式化' : '格式化 JSON'}
            </Button>
          ) : null}
          {props.response ? (
            <Group gap={6} wrap="wrap" className="response-header-actions-secondary">
              <Button size="xs" variant="default" onClick={props.onCopyBody} disabled={!displayBody}>复制响应</Button>
              <Button size="xs" variant="default" onClick={props.onCopyCurl} disabled={!props.requestPreview}>复制 cURL</Button>
              <Button size="xs" variant="filled" color="indigo" onClick={props.onSaveAs} disabled={!props.onSaveAs}>
                Save As
              </Button>
              <Button size="xs" variant="default" onClick={props.onReplaceExample} disabled={!selectedExample}>
                覆盖当前 Example
              </Button>
            </Group>
          ) : null}
        </Group>
      </div>

      {props.response ? (
        <div className="response-quick-actions response-results-toolbar">
          {props.requestPreview?.authState ? (
            <Text size="xs" c="dimmed">
              认证 {props.requestPreview.authState.type}
              {props.requestPreview.authState.profileName ? ` · ${props.requestPreview.authState.profileName}` : ''}
              {` · 注入${props.requestPreview.authState.tokenInjected ? '成功' : '未注入'} · 缓存 ${props.requestPreview.authState.cacheStatus}`}
            </Text>
          ) : null}
          <Button size="xs" variant="default" onClick={props.onSaveAs} disabled={!props.onSaveAs}>
            保存为资产
          </Button>
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
            生成状态校验
          </Button>
          <Button size="xs" variant="default" onClick={props.onCreateCaseFromResponse}>
            从当前响应生成 Case
          </Button>
          <Button size="xs" variant="subtle" onClick={props.onRefreshSession}>
            刷新会话
          </Button>
          <Button size="xs" variant="subtle" color="red" onClick={props.onClearSession}>
            清空会话
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
          <Tabs.Tab value="body">正文</Tabs.Tab>
          <Tabs.Tab value="json" leftSection={<IconBraces size={14} />}>JSON</Tabs.Tab>
          <Tabs.Tab value="headers">响应头</Tabs.Tab>
          <Tabs.Tab value="cookies" leftSection={<IconCookie size={14} />}>Cookies</Tabs.Tab>
          <Tabs.Tab value="compare" leftSection={<IconGitCompare size={14} />}>对比</Tabs.Tab>
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
                <Text fw={700} size="md">请求失败</Text>
                <Text size="sm" mt={4} style={{ maxWidth: 400, wordBreak: 'break-word', fontFamily: 'var(--font-mono)' }}>
                  {props.requestError}
                </Text>
              </div>
              <Text size="xs" c="dimmed" style={{ maxWidth: 300 }}>
                可能是网络异常、URL 无效，或服务端返回错误。请先检查请求配置与连接状态。
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
              <Text size="sm" fw={500}>准备发送</Text>
              <Text size="xs" style={{ maxWidth: 240, textAlign: 'center' }}>
                点击“发送请求”查看实时结果，或切换到已保存的 Example / Baseline 进行对比。
              </Text>
            </div>
          ) : (
            <>
              <Tabs.Panel value="body">
                <CodeEditor value={bodyView} readOnly language={responseBodyLanguage(bodyView)} minHeight="400px" />
              </Tabs.Panel>
              <Tabs.Panel value="json">
                {parsedJson == null ? (
                  <div className="empty-tab-state">当前响应不是有效 JSON，暂时无法进行结构化查看。</div>
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
                            路径存在
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
                            结果相等
                          </Button>
                          {props.onExtractValue ? (
                            <>
                              <Button
                                size="xs"
                                variant="subtle"
                                onClick={() => props.onExtractValue?.('runtime', { suggestedName: row.path.replace(/[^a-zA-Z0-9]+/g, '_'), value: row.value })}
                              >
                                提取到运行时
                              </Button>
                              <Button
                                size="xs"
                                variant="subtle"
                                onClick={() => props.onExtractValue?.('local', { suggestedName: row.path.replace(/[^a-zA-Z0-9]+/g, '_'), value: row.value })}
                              >
                                提取到本地环境
                              </Button>
                            </>
                          ) : null}
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
                        {props.onExtractValue ? (
                          <>
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={() => props.onExtractValue?.('runtime', { suggestedName: header.name, value: header.value })}
                            >
                              Runtime Var
                            </Button>
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={() => props.onExtractValue?.('local', { suggestedName: header.name, value: header.value })}
                            >
                              Local Var
                            </Button>
                          </>
                        ) : null}
                      </Group>
                    </div>
                  ))}
                  {!props.response?.headers.length ? (
                    <div className="empty-tab-state">当前没有采集到响应头。</div>
                  ) : null}
                  <CodeEditor value={displayHeaders} readOnly language="text" minHeight="180px" />
                </div>
              </Tabs.Panel>
              <Tabs.Panel value="cookies">
                <div className="response-cookie-grid">
                  <div className="check-card">
                    <Text fw={700}>响应 Set-Cookie</Text>
                    {responseCookies.length === 0 ? (
                      <div className="empty-tab-state">当前响应没有返回 Set-Cookie。</div>
                    ) : (
                      <div className="json-inspector-list">
                        {responseCookies.map(cookie => (
                          <div key={`${cookie.name}:${cookie.value}`} className="json-inspector-row">
                            <div className="json-inspector-copy">
                              <strong>{cookie.name}</strong>
                              <span>{cookie.value}</span>
                            </div>
                            {props.onExtractValue ? (
                              <Group gap={6}>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => props.onExtractValue?.('runtime', { suggestedName: cookie.name, value: cookie.value })}
                                >
                                  提取到运行时
                                </Button>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => props.onExtractValue?.('local', { suggestedName: cookie.name, value: cookie.value })}
                                >
                                  提取到本地环境
                                </Button>
                              </Group>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="check-card">
                    <Text fw={700}>当前会话 Cookies</Text>
                    {sessionCookies.length === 0 ? (
                      <div className="empty-tab-state">当前请求 URL 还没有可复用的会话 Cookie。</div>
                    ) : (
                      <div className="json-inspector-list">
                        {sessionCookies.map(cookie => (
                          <div key={`${cookie.name}:${cookie.value}`} className="json-inspector-row">
                            <div className="json-inspector-copy">
                              <strong>{cookie.name}</strong>
                              <span>{cookie.value}</span>
                            </div>
                            {props.onExtractValue ? (
                              <Group gap={6}>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => props.onExtractValue?.('runtime', { suggestedName: cookie.name, value: cookie.value })}
                                >
                                  提取到运行时
                                </Button>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => props.onExtractValue?.('local', { suggestedName: cookie.name, value: cookie.value })}
                                >
                                  提取到本地环境
                                </Button>
                              </Group>
                            ) : null}
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
                  <Text fw={700}>实时响应 vs 已保存结果</Text>
                  <Text size="sm" c="dimmed">
                    {selectedExample
                      ? compareSummary(liveBody, selectedExample.text || '')
                      : '选择一个已保存的 Example 或 Baseline，和最新响应做差异对比。'}
                  </Text>
                </div>
                <div className="response-compare-grid">
                  <div className="check-card">
                    <Text fw={700}>实时响应</Text>
                    <CodeEditor value={liveBody} readOnly language={responseBodyLanguage(liveBody)} minHeight="320px" />
                  </div>
                  <div className="check-card">
                    <Group justify="space-between">
                      <Text fw={700}>已选结果</Text>
                      {selectedExample?.role === 'baseline' ? (
                        <Badge color="indigo" variant="light">
                          Baseline
                        </Badge>
                      ) : null}
                    </Group>
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
