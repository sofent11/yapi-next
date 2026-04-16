import { Badge, Button, Group, Text } from '@mantine/core';
import type { RunHistoryEntry } from '@yapi-debugger/schema';
import { CodeEditor } from '../editors/CodeEditor';

export function HistoryPanel(props: {
  entries: RunHistoryEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onReplay: (entry: RunHistoryEntry) => void;
  onDuplicateAsCase: (entry: RunHistoryEntry) => void;
  onClear: () => void;
}) {
  const selectedEntry = props.entries.find(item => item.id === props.selectedEntryId) || props.entries[0] || null;

  return (
    <section className="workspace-main history-center">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">History</span>
          <span className="breadcrumb-chip">{props.entries.length} runs</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" color="red" onClick={props.onClear}>Clear History</Button>
        </div>
      </div>

      <div className="environment-layout">
        <div className="environment-sidebar">
          <Text fw={700} size="sm">Recent Runs</Text>
          <div className="environment-list">
            {props.entries.length === 0 ? (
              <div className="empty-tab-state">No runs yet. Send a request and it will appear here.</div>
            ) : (
              props.entries.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  className={entry.id === selectedEntry?.id ? 'environment-item is-active' : 'environment-item'}
                  onClick={() => props.onSelectEntry(entry.id)}
                >
                  <strong>{entry.requestName}</strong>
                  <span>{entry.caseName ? `${entry.caseName} · ` : ''}{entry.response.status} · {entry.response.durationMs} ms</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="environment-main">
          {selectedEntry ? (
            <>
              <div className="request-preview-card">
                <div className="request-preview-head">
                  <div>
                    <Text size="xs" fw={700} c="dimmed">Selected Run</Text>
                    <Text size="sm">{selectedEntry.request.method} {selectedEntry.request.url}</Text>
                  </div>
                  <Group gap="xs">
                    <Badge color={selectedEntry.response.ok ? 'green' : 'red'}>{selectedEntry.response.status}</Badge>
                    <Badge variant="light" color="gray">{selectedEntry.response.durationMs} ms</Badge>
                    <Badge variant="light" color="indigo">{selectedEntry.environmentName || 'shared'}</Badge>
                  </Group>
                </div>
                <div className="panel-toolbar-actions">
                  <Button size="xs" variant="default" onClick={() => props.onReplay(selectedEntry)}>Replay</Button>
                  <Button size="xs" onClick={() => props.onDuplicateAsCase(selectedEntry)}>Duplicate As Case</Button>
                </div>
              </div>

              <div className="checks-list">
                <div className="check-card">
                  <Text fw={700}>Response Body</Text>
                  <CodeEditor value={selectedEntry.response.bodyText || ''} readOnly language="json" minHeight="220px" />
                </div>
                <div className="check-card">
                  <Text fw={700}>Check Results</Text>
                  {selectedEntry.checkResults.length === 0 ? (
                    <div className="empty-tab-state">No case checks were attached to this run.</div>
                  ) : (
                    <div className="checks-list">
                      {selectedEntry.checkResults.map(result => (
                        <div key={result.id} className="check-result-row">
                          <Badge color={result.ok ? 'green' : 'red'}>{result.ok ? 'PASS' : 'FAIL'}</Badge>
                          <div className="tree-row-copy">
                            <strong>{result.label}</strong>
                            <span>{result.message}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
