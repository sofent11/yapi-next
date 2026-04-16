import { Badge, Button, Group, Select, Tabs, Text } from '@mantine/core';
import type { CheckResult, RequestDocument, ResolvedRequestPreview, SendRequestResult } from '@yapi-debugger/schema';
import type { ResponseTab } from '../../store/workspace-store';
import { CodeEditor } from '../editors/CodeEditor';

function responseHeadersText(res: SendRequestResult | null) {
  return (res?.headers || []).map(item => `${item.name}: ${item.value}`).join('\n');
}

function responseBodyLanguage(value: string) {
  if (!value) return 'text';
  try {
    JSON.parse(value);
    return 'json';
  } catch (_err) {
    return 'text';
  }
}

export function ResponsePanel(props: {
  response: SendRequestResult | null;
  requestPreview: ResolvedRequestPreview | null;
  requestDocument: RequestDocument | null;
  checkResults: CheckResult[];
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
              <Badge color={props.response.ok ? 'green' : 'red'} variant="dot" size="sm">
                {props.response.status}
              </Badge>
              <Text size="xs" fw={500}>{props.response.durationMs} ms</Text>
              <Text size="xs" fw={500}>{props.response.sizeBytes} B</Text>
            </div>
          ) : null}
        </div>
        <Group gap="xs">
          <Select
            size="xs"
            placeholder="Live Response"
            value={props.selectedExampleName}
            data={[
              { value: '__live__', label: 'Live Response' },
              ...examples.map(example => ({ value: example.name, label: example.name }))
            ]}
            onChange={value => props.onSelectExample(value === '__live__' ? null : value || null)}
          />
          <Button size="xs" variant="default" onClick={props.onCopyBody} disabled={!displayBody}>Copy Body</Button>
          <Button size="xs" variant="default" onClick={props.onCopyCurl} disabled={!props.requestPreview}>Copy cURL</Button>
          <Button size="xs" variant="default" onClick={props.onSaveExample} disabled={!props.response}>Save As Example</Button>
          <Button size="xs" onClick={props.onReplaceExample} disabled={!props.response || !selectedExample}>Replace Example</Button>
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

      <Tabs value={props.activeTab} onChange={value => props.onTabChange(value as ResponseTab)} className="response-tabs-ide">
        <Tabs.List>
          <Tabs.Tab value="body">Body</Tabs.Tab>
          <Tabs.Tab value="headers">Headers</Tabs.Tab>
          <Tabs.Tab value="raw">Raw</Tabs.Tab>
        </Tabs.List>

        <div className="response-tab-content">
          {!props.response && !selectedExample ? (
            <div className="empty-response-state">
              <Text size="sm" c="dimmed">Send a request or select a saved example to inspect the response.</Text>
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
