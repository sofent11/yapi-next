import { useMemo, useState } from 'react';
import { Badge, Button, Group, Select, Text, TextInput } from '@mantine/core';
import type { RunHistoryEntry } from '@yapi-debugger/schema';
import { CodeEditor } from '../editors/CodeEditor';

function compareSummary(left: RunHistoryEntry, right: RunHistoryEntry) {
  const statusChanged = left.response.status !== right.response.status;
  const durationDelta = left.response.durationMs - right.response.durationMs;
  const bodyChanged = left.response.bodyText !== right.response.bodyText;
  return [
    statusChanged ? `Status changed: ${left.response.status} -> ${right.response.status}` : 'Status is identical.',
    durationDelta === 0 ? 'Duration is identical.' : `Duration delta: ${durationDelta} ms`,
    bodyChanged ? 'Response bodies differ.' : 'Response bodies match.'
  ].join(' ');
}

export function HistoryPanel(props: {
  entries: RunHistoryEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onReplay: (entry: RunHistoryEntry) => void;
  onOpenInScratch: (entry: RunHistoryEntry) => void;
  onDuplicateAsCase: (entry: RunHistoryEntry) => void;
  onSaveAsExample: (entry: RunHistoryEntry) => void;
  onPinAsBaseline: (entry: RunHistoryEntry) => void;
  onGenerateDiffChecks: (selectedEntry: RunHistoryEntry, compareEntry: RunHistoryEntry | null) => void;
  onClear: () => void;
}) {
  const [searchText, setSearchText] = useState('');
  const [compareEntryId, setCompareEntryId] = useState<string | null>(null);
  const filteredEntries = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    if (!normalized) return props.entries;
    return props.entries.filter(entry =>
      [entry.requestName, entry.caseName, entry.response.status, entry.environmentName, entry.request.url]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    );
  }, [props.entries, searchText]);
  const selectedEntry = filteredEntries.find(item => item.id === props.selectedEntryId) || filteredEntries[0] || null;
  const compareEntry =
    filteredEntries.find(item => item.id === compareEntryId) ||
    filteredEntries.find(item => selectedEntry && item.id !== selectedEntry.id) ||
    null;
  const selectedCheckResults = Array.isArray(selectedEntry?.checkResults) ? selectedEntry.checkResults : [];
  const selectedScriptLogs = Array.isArray(selectedEntry?.scriptLogs) ? selectedEntry.scriptLogs : [];

  return (
    <div className="history-center" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">History</span>
          <span className="breadcrumb-chip">{filteredEntries.length} runs</span>
        </div>
        <div className="panel-toolbar-actions">
          <TextInput
            size="xs"
            placeholder="Filter runs"
            value={searchText}
            onChange={event => setSearchText(event.currentTarget.value)}
          />
          <Button size="xs" variant="default" color="red" onClick={props.onClear}>Clear History</Button>
        </div>
      </div>

      <div className="environment-layout">
        <div className="environment-sidebar">
          <Text fw={700} size="sm">Recent Runs</Text>
          <div className="environment-list">
            {filteredEntries.length === 0 ? (
              <div className="empty-tab-state">No runs match the current filter. Send a request and it will appear here.</div>
            ) : (
              filteredEntries.map(entry => (
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
                    {selectedEntry.sourceCollectionName ? (
                      <Text size="xs" c="dimmed">
                        From {selectedEntry.sourceCollectionName} / {selectedEntry.sourceStepKey || 'step'}
                      </Text>
                    ) : null}
                  </div>
                  <Group gap="xs">
                    <Badge color={selectedEntry.response.ok ? 'green' : 'red'}>{selectedEntry.response.status}</Badge>
                    <Badge variant="light" color="gray">{selectedEntry.response.durationMs} ms</Badge>
                    <Badge variant="light" color="indigo">{selectedEntry.environmentName || 'shared'}</Badge>
                  </Group>
                </div>
                <div className="panel-toolbar-actions">
                  <Button size="xs" variant="default" onClick={() => props.onReplay(selectedEntry)}>Replay</Button>
                  <Button size="xs" variant="default" onClick={() => props.onOpenInScratch(selectedEntry)}>Open In Scratch</Button>
                  <Button size="xs" variant="default" onClick={() => props.onSaveAsExample(selectedEntry)}>Save Example</Button>
                  <Button size="xs" onClick={() => props.onDuplicateAsCase(selectedEntry)}>Duplicate As Case</Button>
                  <Button size="xs" variant="default" onClick={() => props.onPinAsBaseline(selectedEntry)}>Set Baseline</Button>
                  <Button size="xs" variant="default" onClick={() => props.onGenerateDiffChecks(selectedEntry, compareEntry)}>Diff To Checks</Button>
                </div>
              </div>

              <div className="check-card">
                <Group justify="space-between">
                  <Text fw={700}>Compare Runs</Text>
                  <Select
                    size="xs"
                    placeholder="Select another run"
                    value={compareEntry?.id || null}
                    data={filteredEntries
                      .filter(entry => !selectedEntry || entry.id !== selectedEntry.id)
                      .map(entry => ({
                        value: entry.id,
                        label: `${entry.requestName} · ${entry.response.status} · ${entry.response.durationMs} ms`
                      }))}
                    onChange={value => setCompareEntryId(value || null)}
                  />
                </Group>
                <Text size="sm" c="dimmed" mt={8}>
                  {compareEntry ? compareSummary(selectedEntry, compareEntry) : 'Pick another run to compare status, latency, and body output.'}
                </Text>
              </div>

              <div className="response-compare-grid">
                <div className="check-card">
                  <Text fw={700}>Selected Response</Text>
                  <CodeEditor value={selectedEntry.response.bodyText || ''} readOnly language="json" minHeight="220px" />
                </div>
                <div className="check-card">
                  <Text fw={700}>Compared Response</Text>
                  <CodeEditor value={compareEntry?.response.bodyText || ''} readOnly language="json" minHeight="220px" />
                </div>
              </div>

              <div className="checks-list">
                <div className="check-card">
                  <Text fw={700}>Check Results</Text>
                  {selectedCheckResults.length === 0 ? (
                    <div className="empty-tab-state">No case checks were attached to this run.</div>
                  ) : (
                    <div className="checks-list">
                      {selectedCheckResults.map(result => (
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
                <div className="check-card">
                  <Text fw={700}>Script Logs</Text>
                  {selectedScriptLogs.length === 0 ? (
                    <div className="empty-tab-state">No script logs were recorded for this run.</div>
                  ) : (
                    <CodeEditor
                      value={selectedScriptLogs.map(log => `[${log.phase}] ${log.message}`).join('\n')}
                      readOnly
                      language="text"
                      minHeight="180px"
                    />
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
