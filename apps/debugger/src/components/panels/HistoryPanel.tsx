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

function runLabel(entry: RunHistoryEntry) {
  return entry.requestName || entry.request.url || 'Unknown request';
}

function runSource(entry: RunHistoryEntry) {
  if (entry.sourceCollectionName) {
    return `${entry.sourceCollectionName} / ${entry.sourceStepKey || 'step'}`;
  }
  return 'Manual request run';
}

export function HistoryPanel(props: {
  entries: RunHistoryEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onReplay: (entry: RunHistoryEntry) => void;
  onOpenInScratch: (entry: RunHistoryEntry) => void;
  onOpenCollectionSource?: (entry: RunHistoryEntry) => void;
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
      [entry.requestName, entry.caseName, entry.response.status, entry.environmentName, entry.request.url, entry.sourceCollectionName]
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
    <div className="history-center">
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
          <Button size="xs" variant="default" color="red" onClick={props.onClear}>
            Clear History
          </Button>
        </div>
      </div>

      <div className="environment-layout">
        <aside className="environment-sidebar">
          <div className="sidebar-section-head">
            <Text fw={700} size="sm">Recent Runs</Text>
            <Text size="xs" c="dimmed">Pick a run to inspect its outcome and choose the next path.</Text>
          </div>
          <div className="environment-list history-run-list">
            {filteredEntries.length === 0 ? (
              <div className="empty-tab-state">
                No runs yet. Send a request or run a collection, then come back here to replay and reuse the result.
              </div>
            ) : (
              filteredEntries.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  className={entry.id === selectedEntry?.id ? 'environment-item history-run-item is-active' : 'environment-item history-run-item'}
                  onClick={() => props.onSelectEntry(entry.id)}
                >
                  <div className="history-run-item-head">
                    <strong>{runLabel(entry)}</strong>
                    <Badge color={entry.response.ok ? 'green' : 'red'} variant="light">
                      {entry.response.status}
                    </Badge>
                  </div>
                  <span>{entry.caseName ? `${entry.caseName} · ` : ''}{entry.environmentName || 'shared'} · {entry.response.durationMs} ms</span>
                  <span>{runSource(entry)}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="environment-main">
          {selectedEntry ? (
            <>
              <section className="inspector-section">
                <div className="checks-head">
                  <h3 className="section-title">Run Summary</h3>
                </div>
                <div className="summary-grid">
                  <div className="summary-chip">
                    <span>Request</span>
                    <strong>{runLabel(selectedEntry)}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Case</span>
                    <strong>{selectedEntry.caseName || 'Base Request'}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Environment</span>
                    <strong>{selectedEntry.environmentName || 'shared'}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Source</span>
                    <strong>{selectedEntry.sourceCollectionName ? 'Collection' : 'Manual'}</strong>
                  </div>
                </div>
                <div className="check-card" style={{ marginTop: 12 }}>
                  <div className="history-summary-head">
                    <div>
                      <Text fw={700}>{selectedEntry.request.method} {selectedEntry.request.url}</Text>
                      <Text size="sm" c="dimmed">{runSource(selectedEntry)}</Text>
                    </div>
                    <Group gap="xs">
                      <Badge color={selectedEntry.response.ok ? 'green' : 'red'}>{selectedEntry.response.status}</Badge>
                      <Badge variant="light" color="gray">{selectedEntry.response.durationMs} ms</Badge>
                    </Group>
                  </div>
                  <div className="history-action-grid">
                    <Button size="xs" variant="filled" onClick={() => props.onReplay(selectedEntry)}>Replay</Button>
                    <Button size="xs" variant="default" onClick={() => props.onOpenInScratch(selectedEntry)}>Open In Scratch</Button>
                    <Button size="xs" variant="default" onClick={() => props.onDuplicateAsCase(selectedEntry)}>Duplicate As Case</Button>
                    <Button size="xs" variant="default" onClick={() => props.onPinAsBaseline(selectedEntry)}>Set Baseline</Button>
                  </div>
                  <div className="history-action-grid secondary">
                    <Button size="xs" variant="subtle" onClick={() => props.onSaveAsExample(selectedEntry)}>Save Example</Button>
                    <Button size="xs" variant="subtle" onClick={() => props.onGenerateDiffChecks(selectedEntry, compareEntry)}>Diff To Checks</Button>
                    {selectedEntry.sourceCollectionId && props.onOpenCollectionSource ? (
                      <Button size="xs" variant="subtle" onClick={() => props.onOpenCollectionSource?.(selectedEntry)}>
                        Open Collection
                      </Button>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <h3 className="section-title">Compare</h3>
                  <Select
                    size="xs"
                    placeholder="Select another run"
                    value={compareEntry?.id || null}
                    data={filteredEntries
                      .filter(entry => entry.id !== selectedEntry.id)
                      .map(entry => ({
                        value: entry.id,
                        label: `${runLabel(entry)} · ${entry.response.status} · ${entry.response.durationMs} ms`
                      }))}
                    onChange={value => setCompareEntryId(value || null)}
                  />
                </div>
                <Text size="sm" c="dimmed" mt="sm">
                  {compareEntry ? compareSummary(selectedEntry, compareEntry) : 'Pick another run to compare status, latency, and body output.'}
                </Text>
                <div className="response-compare-grid" style={{ marginTop: 12 }}>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Selected Response</Text>
                    <CodeEditor value={selectedEntry.response.bodyText || ''} readOnly language="json" minHeight="220px" />
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Compared Response</Text>
                    <CodeEditor value={compareEntry?.response.bodyText || ''} readOnly language="json" minHeight="220px" />
                  </div>
                </div>
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <h3 className="section-title">Details</h3>
                </div>
                <div className="checks-list" style={{ marginTop: 12 }}>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Check Results</Text>
                    {selectedCheckResults.length === 0 ? (
                      <div className="empty-tab-state">This run did not carry reusable checks. Duplicate it as a Case if you want to keep this state.</div>
                    ) : (
                      <div className="checks-list" style={{ marginTop: 12 }}>
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

                  <div className="check-card" style={{ margin: 0 }}>
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
              </section>
            </>
          ) : (
            <div className="empty-tab-state">No run selected. Send a request or run a collection to start building replayable history.</div>
          )}
        </div>
      </div>
    </div>
  );
}
