import { Badge, Tabs, Text, ScrollArea } from '@mantine/core';
import type { SendRequestResult } from '@yapi-debugger/schema';
import type { ResponseTab } from '../../store/workspace-store';
import { CodeEditor } from '../editors/CodeEditor';

export function ResponsePanel(props: {
  response: SendRequestResult | null;
  activeTab: ResponseTab;
  onTabChange: (tab: ResponseTab) => void;
}) {
  const { response } = props;

  function statsFromResponse(res: SendRequestResult | null) {
    if (!res) return null;
    return {
      status: res.status,
      ok: res.ok,
      duration: `${res.durationMs} ms`,
      size: `${res.sizeBytes} B`
    };
  }

  const stats = statsFromResponse(response);

  function responseHeadersText(res: SendRequestResult | null) {
    return (res?.headers || []).map(item => `${item.name}: ${item.value}`).join('\n');
  }

  function responseBodyLanguage(res: SendRequestResult | null) {
    if (!res?.bodyText) return 'text';
    try {
      JSON.parse(res.bodyText);
      return 'json';
    } catch (_err) {
      return 'text';
    }
  }

  return (
    <div className="response-panel">
      <div className="response-header-ide">
        <div className="response-status-group">
          <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Response
          </Text>
          {stats && (
            <div className="response-metrics">
              <Badge color={stats.ok ? 'green' : 'red'} variant="dot" size="sm">
                {stats.status}
              </Badge>
              <Text size="xs" fw={500}>{stats.duration}</Text>
              <Text size="xs" fw={500}>{stats.size}</Text>
            </div>
          )}
        </div>
      </div>

      <Tabs value={props.activeTab} onChange={val => props.onTabChange(val as ResponseTab)} className="response-tabs-ide">
        <Tabs.List>
          <Tabs.Tab value="body">Body</Tabs.Tab>
          <Tabs.Tab value="headers">Headers</Tabs.Tab>
          <Tabs.Tab value="raw">Raw</Tabs.Tab>
        </Tabs.List>

        <div className="response-tab-content">
          {!response ? (
            <div className="empty-response-state">
              <Text size="sm" c="dimmed">Send a request to see the response here.</Text>
            </div>
          ) : (
            <>
              <Tabs.Panel value="body">
                <CodeEditor
                  value={response.bodyText || ''}
                  readOnly
                  language={responseBodyLanguage(response)}
                  minHeight="400px"
                />
              </Tabs.Panel>
              <Tabs.Panel value="headers">
                <CodeEditor
                  value={responseHeadersText(response)}
                  readOnly
                  language="text"
                  minHeight="400px"
                />
              </Tabs.Panel>
              <Tabs.Panel value="raw">
                <CodeEditor
                  value={response.bodyText || ''}
                  readOnly
                  language="text"
                  minHeight="400px"
                />
              </Tabs.Panel>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}
