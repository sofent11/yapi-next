import { Badge, Button, Group, Select, Tabs, Text } from '@mantine/core';
import { IconPlayerPlay, IconAlertCircle } from '@tabler/icons-react';
import type { CheckResult, RequestDocument, ResolvedRequestPreview, ScriptLog, SendRequestResult } from '@yapi-debugger/schema';
import type { ResponseTab } from '../../store/workspace-store';
import { CodeEditor } from '../editors/CodeEditor';

function responseHeadersText(res: SendRequestResult | null) {
  if (!res) return '';
  return res.headers.map(h => `${h.name}: ${h.value}`).join('\n');
}

function responseBodyLanguage(body: string) {
  if (body.trim().startsWith('{') || body.trim().startsWith('[')) return 'json';
  return 'text';
}

export function ResponsePanel(props: {
  response: SendRequestResult | null;
  requestError: string | null;
  requestPreview: ResolvedRequestPreview | null;
  requestDocument: RequestDocument | null;
  checkResults: CheckResult[];
  scriptLogs: ScriptLog[];
  selectedExampleName: string | null;
  activeTab: ResponseTab;
  onTabChange: (tab: ResponseTab) => void;
  onSelectExample: (name: string | null) => void;
  onCopyBody: () => void;
  onCopyCurl: () => void;
  onSaveExample: () => void;
  onReplaceExample: () => void;
}) {
  const examples = props.requestDocument?.examples || [];
  const selectedExample = examples.find(item => item.name === props.selectedExampleName) || null;
  const displayBody = selectedExample?.text ?? props.response?.bodyText ?? '';
  const displayHeaders =
    selectedExample
      ? [`Status: ${selectedExample.status || 'n/a'}`, `Content-Type: ${selectedExample.mimeType || 'unknown'}`].join('\n')
      : responseHeadersText(props.response);

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

      <Tabs value={props.activeTab} onChange={value => props.onTabChange(value as ResponseTab)} className="response-tabs-ide">
        <Tabs.List>
          <Tabs.Tab value="body">Body</Tabs.Tab>
          <Tabs.Tab value="headers">Headers</Tabs.Tab>
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
              <Tabs.Panel value="headers">
                <CodeEditor value={displayHeaders} readOnly language="text" minHeight="400px" />
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
