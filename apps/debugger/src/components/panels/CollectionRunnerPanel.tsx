import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Group, NumberInput, Select, Text, TextInput } from '@mantine/core';
import type { CollectionDocument, CollectionRunReport, WorkspaceIndex } from '@yapi-debugger/schema';
import { CodeEditor } from '../editors/CodeEditor';
import { KeyValueEditor } from '../primitives/KeyValueEditor';

function requestOptions(workspace: WorkspaceIndex) {
  return workspace.requests.map(record => ({
    value: record.request.id,
    label: `${record.request.name} (${record.request.method} ${record.request.path || record.request.url || '/'})`
  }));
}

function reportOptions(reports: CollectionRunReport[]) {
  return reports.map(report => ({
    value: report.id,
    label: `${report.collectionName} · ${report.status} · ${report.finishedAt}`
  }));
}

export function CollectionRunnerPanel(props: {
  workspace: WorkspaceIndex;
  selectedCollectionId: string | null;
  draftCollection: CollectionDocument | null;
  collectionDataText: string;
  reports: CollectionRunReport[];
  selectedReportId: string | null;
  selectedReportStepKey: string | null;
  onSelectCollection: (id: string | null) => void;
  onCollectionChange: (collection: CollectionDocument) => void;
  onCollectionDataChange: (text: string) => void;
  onCreateCollection: () => void;
  onDeleteCollection: () => void;
  onSaveCollection: () => void;
  onRunCollection: () => void;
  onRerunFailed: () => void;
  onClearReports: () => void;
  onSelectReport: (id: string | null) => void;
  onSelectReportStep: (stepKey: string | null) => void;
}) {
  const [reportFilter, setReportFilter] = useState('');
  const requestChoices = useMemo(() => requestOptions(props.workspace), [props.workspace]);
  const filteredReports = useMemo(() => {
    const normalized = reportFilter.trim().toLowerCase();
    if (!normalized) return props.reports;
    return props.reports.filter(report =>
      [report.collectionName, report.status, report.environmentName, report.finishedAt].join(' ').toLowerCase().includes(normalized)
    );
  }, [props.reports, reportFilter]);
  const selectedReport = filteredReports.find(report => report.id === props.selectedReportId) || filteredReports[0] || null;
  const draftCollection = props.draftCollection;
  const selectedStep =
    selectedReport?.iterations
      .flatMap(iteration => iteration.stepRuns)
      .find(step => step.stepKey === props.selectedReportStepKey) ||
    selectedReport?.iterations[0]?.stepRuns[0] ||
    null;

  return (
    <section className="workspace-main">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">Collections</span>
          <span className="breadcrumb-chip">{props.workspace.collections.length} total</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" onClick={props.onCreateCollection}>New Collection</Button>
          <Button size="xs" variant="default" color="red" onClick={props.onDeleteCollection} disabled={!draftCollection}>
            Delete
          </Button>
          <Button size="xs" onClick={props.onSaveCollection} disabled={!draftCollection}>Save</Button>
          <Button size="xs" color="dark" onClick={props.onRunCollection} disabled={!draftCollection}>
            Run
          </Button>
          <Button size="xs" variant="default" onClick={props.onRerunFailed} disabled={!selectedReport}>
            Rerun Failed
          </Button>
        </div>
      </div>

      <div className="environment-layout">
        <div className="environment-sidebar">
          <Text fw={700} size="sm">Collections</Text>
          <div className="environment-list">
            {props.workspace.collections.length === 0 ? (
              <div className="empty-tab-state">No collections yet. Create one to orchestrate multi-step flows.</div>
            ) : (
              props.workspace.collections.map(item => (
                <button
                  key={item.document.id}
                  type="button"
                  className={item.document.id === props.selectedCollectionId ? 'environment-item is-active' : 'environment-item'}
                  onClick={() => props.onSelectCollection(item.document.id)}
                >
                  <strong>{item.document.name}</strong>
                  <span>{item.document.steps.length} steps</span>
                </button>
              ))
            )}
          </div>

          <div className="inspector-section" style={{ marginTop: 12 }}>
            <div className="checks-head">
              <Text fw={700} size="sm">Reports</Text>
              <Button size="xs" variant="subtle" color="red" onClick={props.onClearReports}>
                Clear
              </Button>
            </div>
            <TextInput
              mt="sm"
              size="xs"
              placeholder="Filter reports"
              value={reportFilter}
              onChange={event => setReportFilter(event.currentTarget.value)}
            />
            <Select
              mt="sm"
              placeholder="Select report"
              data={reportOptions(filteredReports)}
              value={props.selectedReportId || selectedReport?.id || null}
              onChange={value => props.onSelectReport(value || null)}
            />
            {selectedReport ? (
              <div className="summary-grid" style={{ marginTop: 12 }}>
                <div className="summary-chip">
                  <span>Status</span>
                  <strong>{selectedReport.status}</strong>
                </div>
                <div className="summary-chip">
                  <span>Passed</span>
                  <strong>{selectedReport.passedSteps}</strong>
                </div>
                <div className="summary-chip">
                  <span>Failed</span>
                  <strong>{selectedReport.failedSteps}</strong>
                </div>
                <div className="summary-chip">
                  <span>Iterations</span>
                  <strong>{selectedReport.iterationCount}</strong>
                </div>
              </div>
            ) : (
              <div className="empty-tab-state" style={{ marginTop: 12 }}>No collection reports yet.</div>
            )}
          </div>
        </div>

        <div className="environment-main">
          {draftCollection ? (
            <>
              <div className="inspector-section">
                <h3 className="section-title">Collection Settings</h3>
                <div className="settings-grid">
                  <TextInput
                    label="Name"
                    value={draftCollection.name}
                    onChange={event =>
                      props.onCollectionChange({
                        ...draftCollection,
                        name: event.currentTarget.value
                      })
                    }
                  />
                  <Select
                    label="Default Environment"
                    value={draftCollection.defaultEnvironment}
                    data={props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))}
                    onChange={value =>
                      value &&
                      props.onCollectionChange({
                        ...draftCollection,
                        defaultEnvironment: value
                      })
                    }
                  />
                  <NumberInput
                    label="Iteration Count"
                    value={draftCollection.iterationCount}
                    min={1}
                    onChange={value =>
                      props.onCollectionChange({
                        ...draftCollection,
                        iterationCount: Number(value) || 1
                      })
                    }
                  />
                  <Checkbox
                    label="Stop On Failure"
                    checked={draftCollection.stopOnFailure}
                    onChange={event =>
                      props.onCollectionChange({
                        ...draftCollection,
                        stopOnFailure: event.currentTarget.checked
                      })
                    }
                  />
                  <Checkbox
                    label="Require 2xx"
                    checked={draftCollection.rules.requireSuccessStatus}
                    onChange={event =>
                      props.onCollectionChange({
                        ...draftCollection,
                        rules: {
                          ...draftCollection.rules,
                          requireSuccessStatus: event.currentTarget.checked
                        }
                      })
                    }
                  />
                  <NumberInput
                    label="Max Duration (ms)"
                    value={draftCollection.rules.maxDurationMs || ''}
                    onChange={value =>
                      props.onCollectionChange({
                        ...draftCollection,
                        rules: {
                          ...draftCollection.rules,
                          maxDurationMs: Number(value) > 0 ? Number(value) : undefined
                        }
                      })
                    }
                  />
                  <TextInput
                    label="Required JSON Paths"
                    placeholder="$.data.id, $.meta.traceId"
                    value={draftCollection.rules.requiredJsonPaths.join(', ')}
                    onChange={event =>
                      props.onCollectionChange({
                        ...draftCollection,
                        rules: {
                          ...draftCollection.rules,
                          requiredJsonPaths: event.currentTarget.value
                            .split(',')
                            .map(item => item.trim())
                            .filter(Boolean)
                        }
                      })
                    }
                  />
                </div>
              </div>

              <div className="inspector-section">
                <h3 className="section-title">Collection Variables</h3>
                <KeyValueEditor
                  rows={Object.entries(draftCollection.vars).map(([name, value]) => ({
                    name,
                    value,
                    enabled: true,
                    kind: 'text' as const
                  }))}
                  onChange={rows =>
                    props.onCollectionChange({
                      ...draftCollection,
                      vars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                    })
                  }
                />
              </div>

              <div className="inspector-section">
                <div className="checks-head">
                  <h3 className="section-title">Steps</h3>
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() =>
                      props.onCollectionChange({
                        ...draftCollection,
                        steps: [
                          ...draftCollection.steps,
                          {
                            key: `step_${draftCollection.steps.length + 1}`,
                            requestId: props.workspace.requests[0]?.request.id || '',
                            enabled: true,
                            name: `Step ${draftCollection.steps.length + 1}`
                          }
                        ]
                      })
                    }
                  >
                    Add Step
                  </Button>
                </div>

                <div className="checks-list">
                  {draftCollection.steps.map(step => {
                    const requestRecord = props.workspace.requests.find(record => record.request.id === step.requestId);
                    return (
                      <div key={step.key} className="check-card">
                        <div className="settings-grid">
                          <TextInput
                            label="Step Key"
                            value={step.key}
                            onChange={event =>
                              props.onCollectionChange({
                                ...draftCollection,
                                steps: draftCollection.steps.map(item =>
                                  item.key === step.key ? { ...item, key: event.currentTarget.value } : item
                                )
                              })
                            }
                          />
                          <TextInput
                            label="Step Name"
                            value={step.name || ''}
                            onChange={event =>
                              props.onCollectionChange({
                                ...draftCollection,
                                steps: draftCollection.steps.map(item =>
                                  item.key === step.key ? { ...item, name: event.currentTarget.value } : item
                                )
                              })
                            }
                          />
                          <Select
                            label="Request"
                            searchable
                            value={step.requestId}
                            data={requestChoices}
                            onChange={value =>
                              props.onCollectionChange({
                                ...draftCollection,
                                steps: draftCollection.steps.map(item =>
                                  item.key === step.key ? { ...item, requestId: value || '', caseId: undefined } : item
                                )
                              })
                            }
                          />
                          <Select
                            label="Case"
                            value={step.caseId || null}
                            data={(requestRecord?.cases || []).map(caseItem => ({ value: caseItem.id, label: caseItem.name }))}
                            onChange={value =>
                              props.onCollectionChange({
                                ...draftCollection,
                                steps: draftCollection.steps.map(item =>
                                  item.key === step.key ? { ...item, caseId: value || undefined } : item
                                )
                              })
                            }
                          />
                          <Checkbox
                            label="Enabled"
                            checked={step.enabled}
                            onChange={event =>
                              props.onCollectionChange({
                                ...draftCollection,
                                steps: draftCollection.steps.map(item =>
                                  item.key === step.key ? { ...item, enabled: event.currentTarget.checked } : item
                                )
                              })
                            }
                          />
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            onClick={() =>
                              props.onCollectionChange({
                                ...draftCollection,
                                steps: draftCollection.steps.filter(item => item.key !== step.key)
                              })
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {draftCollection.steps.length === 0 ? (
                    <div className="empty-tab-state">Add at least one enabled step to run this collection.</div>
                  ) : null}
                </div>
              </div>

              <div className="inspector-section">
                <h3 className="section-title">Data File</h3>
                <CodeEditor
                  value={props.collectionDataText}
                  language="json"
                  onChange={props.onCollectionDataChange}
                  minHeight="220px"
                />
              </div>
            </>
          ) : (
            <div className="empty-tab-state">Select a collection to edit it, or create a new one.</div>
          )}

          {selectedReport ? (
            <div className="inspector-section">
              <div className="checks-head">
                <h3 className="section-title">Latest Report Detail</h3>
                <Select
                  placeholder="Select step"
                  value={props.selectedReportStepKey || selectedStep?.stepKey || null}
                  data={selectedReport.iterations.flatMap(iteration =>
                    iteration.stepRuns.map(stepRun => ({
                      value: stepRun.stepKey,
                      label: `${iteration.dataLabel || `Iteration ${iteration.index + 1}`} · ${stepRun.stepKey}`
                    }))
                  )}
                  onChange={value => props.onSelectReportStep(value || null)}
                />
              </div>

              {selectedReport.failedSteps > 0 ? (
                <div className="check-card" style={{ marginBottom: 12 }}>
                  <Text fw={700}>Failure Summary</Text>
                  <Text size="sm" c="dimmed">
                    {selectedReport.iterations
                      .flatMap(iteration => iteration.stepRuns)
                      .filter(step => !step.ok && !step.skipped)
                      .map(step => `${step.stepName}: ${step.error || step.checkResults.find(result => !result.ok)?.message || 'Failed checks'}`)
                      .slice(0, 5)
                      .join(' | ')}
                  </Text>
                </div>
              ) : null}

              {selectedStep ? (
                <div className="checks-list">
                  <div className="check-card">
                    <Group justify="space-between">
                      <div>
                        <Text fw={700}>{selectedStep.stepName}</Text>
                        <Text size="sm" c="dimmed">{selectedStep.request?.method || 'N/A'} {selectedStep.request?.url || selectedStep.error || ''}</Text>
                      </div>
                      <Badge color={selectedStep.ok ? 'green' : selectedStep.skipped ? 'gray' : 'red'}>
                        {selectedStep.skipped ? 'SKIPPED' : selectedStep.ok ? 'PASS' : 'FAIL'}
                      </Badge>
                    </Group>
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Checks</Text>
                    <CodeEditor
                      value={
                        selectedStep.checkResults.length > 0
                          ? selectedStep.checkResults.map(result => `${result.ok ? 'PASS' : 'FAIL'} ${result.label}: ${result.message}`).join('\n')
                          : selectedStep.error || 'No checks recorded.'
                      }
                      readOnly
                      language="text"
                      minHeight="120px"
                    />
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Response Body</Text>
                    <CodeEditor
                      value={selectedStep.response?.bodyText || ''}
                      readOnly
                      language="json"
                      minHeight="220px"
                    />
                  </div>
                </div>
              ) : (
                <div className="empty-tab-state">Choose a step from the report to inspect the request and response.</div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
