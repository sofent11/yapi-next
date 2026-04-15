import { Card, Group, Stack, Text } from '@mantine/core';
import type { RequestDocument, SendRequestResult } from '@yapi-debugger/schema';
import { CodeEditor } from '../editors/CodeEditor';

function stringifyHeaders(headers: SendRequestResult['headers']) {
  return headers.map((header: SendRequestResult['headers'][number]) => `${header.name}: ${header.value}`).join('\n');
}

export function ResponsePanel(props: {
  response: SendRequestResult | null;
  request: RequestDocument | null;
}) {
  return (
    <aside className="response-panel">
      <div className="response-head">
        <div>
          <p className="eyebrow">Response</p>
          <h3>Execution Output</h3>
        </div>
      </div>

      {props.response ? (
        <Stack gap="md">
          <div className="stats-grid">
            <Card className="stat-card" withBorder>
              <Text size="xs" c="dimmed">
                Status
              </Text>
              <Text fw={700}>{props.response.status}</Text>
            </Card>
            <Card className="stat-card" withBorder>
              <Text size="xs" c="dimmed">
                Duration
              </Text>
              <Text fw={700}>{props.response.durationMs} ms</Text>
            </Card>
            <Card className="stat-card" withBorder>
              <Text size="xs" c="dimmed">
                Size
              </Text>
              <Text fw={700}>{props.response.sizeBytes} bytes</Text>
            </Card>
          </div>
          <div className="response-card">
            <Group justify="space-between">
              <Text fw={700}>Body</Text>
              <Text c="dimmed" size="sm">
                {props.response.url}
              </Text>
            </Group>
            <CodeEditor value={props.response.bodyText} language="json" readOnly minHeight="280px" />
          </div>
          <div className="response-card">
            <Text fw={700}>Headers</Text>
            <CodeEditor value={stringifyHeaders(props.response.headers)} language="text" readOnly minHeight="180px" />
          </div>
        </Stack>
      ) : (
        <div className="response-empty">
          <Text fw={700}>{props.request ? 'Run the selected request' : 'No request selected'}</Text>
          <Text c="dimmed">
            Response metadata, raw body and headers will appear here after the request is sent with the native desktop transport.
          </Text>
        </div>
      )}
    </aside>
  );
}
