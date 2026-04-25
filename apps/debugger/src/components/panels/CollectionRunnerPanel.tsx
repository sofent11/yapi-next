import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Group, NumberInput, Select, Text, TextInput } from '@mantine/core';
import { inspectCollectionDataText } from '@yapi-debugger/core';
import { createCollectionStep, createId, type CollectionDocument, type CollectionRunReport, type WorkspaceIndex } from '@yapi-debugger/schema';
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

function safeJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch (_error) {
    return null;
  }
}

function flattenJsonLeaves(input: unknown, prefix = '$', rows: Array<{ path: string; value: string }> = []) {
  if (Array.isArray(input)) {
    input.forEach((item, index) => flattenJsonLeaves(item, `${prefix}[${index}]`, rows));
    return rows;
  }
  if (input && typeof input === 'object') {
    Object.entries(input).forEach(([key, value]) => flattenJsonLeaves(value, `${prefix}.${key}`, rows));
    return rows;
  }
  rows.push({
    path: prefix,
    value: typeof input === 'string' ? input : JSON.stringify(input)
  });
  return rows;
}

function compareSummary(left: string, right: string) {
  if (!left && !right) return 'No content to compare yet.';
  if (left === right) return 'The latest step output matches the baseline example.';
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  return `The step output differs from baseline. Live lines: ${leftLines.length}, baseline lines: ${rightLines.length}.`;
}

function stepSelectionValue(iterationIndex: number, stepKey: string) {
  return `${iterationIndex}:${stepKey}`;
}

function parseTagList(text: string) {
  return text
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function CollectionRunnerPanel(props: {
  workspace: WorkspaceIndex;
  selectedCollectionId: string | null;
  draftCollection: CollectionDocument | null;
  collectionDataText: string;
  preferredTab?: 'design' | 'data' | 'reports' | null;
  reports: CollectionRunReport[];
  selectedReportId: string | null;
  selectedReportStepKey: string | null;
  currentSelection?: {
    requestId: string | null;
    requestName: string | null;
    caseId?: string | null;
    caseName?: string | null;
  } | null;
  onSelectCollection: (id: string | null) => void;
  onCollectionChange: (collection: CollectionDocument) => void;
  onCollectionDataChange: (text: string) => void;
  onCreateCollection: () => void;
  onAddCurrentSelection?: () => void;
  onDeleteCollection: () => void;
  onSaveCollection: () => void;
  onRunCollection: (options?: { tags?: string[]; environmentName?: string; stepKeys?: string[]; failFast?: boolean }) => void;
  onRerunFailed: () => void;
  onClearReports: () => void;
  onSelectReport: (id: string | null) => void;
  onSelectReportStep: (stepKey: string | null) => void;
  onOpenRequest?: (requestId: string) => void;
  onOpenCase?: (requestId: string, caseId: string) => void;
  onExtractValue?: (target: 'local' | 'runtime' | 'collection', input: { suggestedName: string; value: string }) => void;
  onExportReport?: (format: 'json' | 'html' | 'junit') => void;
  onExportBruno?: (format: 'folder' | 'json') => void;
  onExportOpenCollection?: () => void;
  onCopyText?: (value: string, successMessage: string) => void;
}) {
  const [reportFilter, setReportFilter] = useState('');
  const [activeStudioTab, setActiveStudioTab] = useState<'design' | 'data' | 'reports'>('design');
  const [runTagText, setRunTagText] = useState('');
  const requestChoices = useMemo(() => requestOptions(props.workspace), [props.workspace]);
  const dataInspection = useMemo(() => {
    if (!props.collectionDataText.trim()) {
      return {
        format: 'empty',
        rows: [] as Array<Record<string, unknown>>,
        columns: [] as string[],
        error: null as string | null
      };
    }
    try {
      const inspection = inspectCollectionDataText(props.collectionDataText);
      return {
        ...inspection,
        error: null as string | null
      };
    } catch (error) {
      return {
        format: 'invalid',
        rows: [] as Array<Record<string, unknown>>,
        columns: [] as string[],
        error: (error as Error).message
      };
    }
  }, [props.collectionDataText]);
  const filteredReports = useMemo(() => {
    const normalized = reportFilter.trim().toLowerCase();
    if (!normalized) return props.reports;
    return props.reports.filter(report =>
      [report.collectionName, report.status, report.environmentName, report.finishedAt].join(' ').toLowerCase().includes(normalized)
    );
  }, [props.reports, reportFilter]);
  const selectedReport = filteredReports.find(report => report.id === props.selectedReportId) || filteredReports[0] || null;
  const draftCollection = props.draftCollection;
  const selectedStep = useMemo(() => {
    if (!selectedReport) return null;
    const pointer = props.selectedReportStepKey || '';
    const [rawIterationIndex, rawStepKey] = pointer.split(':');
    const parsedIterationIndex = Number(rawIterationIndex);
    if (!Number.isNaN(parsedIterationIndex) && rawStepKey) {
      const exactIteration = selectedReport.iterations[parsedIterationIndex];
      const exactStep = exactIteration?.stepRuns.find(step => step.stepKey === rawStepKey);
      if (exactStep) return { iterationIndex: parsedIterationIndex, step: exactStep };
    }
    for (const iteration of selectedReport.iterations) {
      const match = iteration.stepRuns.find(step => step.stepKey === props.selectedReportStepKey);
      if (match) return { iterationIndex: iteration.index, step: match };
    }
    const fallbackStep = selectedReport.iterations[0]?.stepRuns[0];
    return fallbackStep ? { iterationIndex: selectedReport.iterations[0]?.index || 0, step: fallbackStep } : null;
  }, [props.selectedReportStepKey, selectedReport]);
  const selectedJson = useMemo(() => safeJson(selectedStep?.step.response?.bodyText || ''), [selectedStep?.step.response?.bodyText]);
  const selectedJsonRows = useMemo(() => (selectedJson == null ? [] : flattenJsonLeaves(selectedJson).slice(0, 60)), [selectedJson]);
  const selectedResponseHeaders = selectedStep?.step.response?.headers || [];
  const selectedRequestRecord = selectedStep ? props.workspace.requests.find(record => record.request.id === selectedStep.step.requestId) || null : null;
  const selectedBaselineExample =
    selectedRequestRecord?.request.examples.find(example => example.role === 'baseline') ||
    selectedRequestRecord?.request.examples.find(example => example.name.toLowerCase().includes('baseline')) ||
    null;
  const selectedBaselineSummary = selectedBaselineExample
    ? compareSummary(selectedStep?.step.response?.bodyText || '', selectedBaselineExample.text || '')
    : null;
  const failureGroups = useMemo(() => {
    const output = new Map<string, number>();
    filteredReports.forEach(report => {
      report.iterations.forEach(iteration => {
        iteration.stepRuns
          .filter(step => !step.ok && !step.skipped)
          .forEach(step => {
            output.set(step.stepKey, (output.get(step.stepKey) || 0) + 1);
          });
      });
    });
    return [...output.entries()].sort((left: [string, number], right: [string, number]) => right[1] - left[1]).slice(0, 8);
  }, [filteredReports]);
  const previousStepRefs = useMemo(() => {
    if (!selectedReport || !selectedStep) return [] as string[];
    const iteration = selectedReport.iterations.find(item => item.index === selectedStep.iterationIndex);
    if (!iteration) return [];
    return iteration.stepRuns
      .filter(step => step.stepKey !== selectedStep.step.stepKey)
      .map(step => [
        `{{steps.${step.stepKey}.response.status}}`,
        `{{steps.${step.stepKey}.response.body}}`,
        `{{steps.${step.stepKey}.response.headers.content-type}}`
      ])
      .flat()
      .slice(0, 9);
  }, [selectedReport, selectedStep]);
  const showDesignView = activeStudioTab === 'design';
  const showDataView = activeStudioTab === 'data';
  const showReportsView = activeStudioTab === 'reports';
  const enabledReporters = draftCollection?.reporters || ['json', 'html'];
  const selectedCollectionReportCount = useMemo(() => {
    if (!draftCollection) return 0;
    return props.reports.filter(report => report.collectionId === draftCollection.id).length;
  }, [draftCollection, props.reports]);
  const firstFailedStepPointer = useMemo(() => {
    if (!selectedReport) return null;
    for (const iteration of selectedReport.iterations) {
      const failedStep = iteration.stepRuns.find(step => !step.ok && !step.skipped);
      if (failedStep) return stepSelectionValue(iteration.index, failedStep.stepKey);
    }
    return null;
  }, [selectedReport]);

  useEffect(() => {
    if (props.preferredTab) {
      setActiveStudioTab(props.preferredTab);
    }
  }, [props.preferredTab]);

  useEffect(() => {
    setRunTagText((props.draftCollection?.runnerTags || []).join(', '));
  }, [props.draftCollection?.id]);

  const runTags = parseTagList(runTagText);

  return (
    <section className="workspace-main">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">Collections</span>
          <span className="breadcrumb-chip">{props.workspace.collections.length} total</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant={activeStudioTab === 'design' ? 'filled' : 'default'} onClick={() => setActiveStudioTab('design')}>
            Design
          </Button>
          <Button size="xs" variant={activeStudioTab === 'data' ? 'filled' : 'default'} onClick={() => setActiveStudioTab('data')}>
            Data
          </Button>
          <Button size="xs" variant={activeStudioTab === 'reports' ? 'filled' : 'default'} onClick={() => setActiveStudioTab('reports')}>
            Reports
          </Button>
          <Button size="xs" variant="default" onClick={props.onCreateCollection}>New Collection</Button>
          {(showDesignView || showDataView) ? (
            <Button size="xs" onClick={props.onSaveCollection} disabled={!draftCollection}>Save</Button>
          ) : null}
          {showDesignView ? (
            <Button size="xs" variant="default" color="red" onClick={props.onDeleteCollection} disabled={!draftCollection}>
              Delete
            </Button>
          ) : null}
          <Button size="xs" color="dark" onClick={() => props.onRunCollection({ tags: runTags })} disabled={!draftCollection}>
            Run
          </Button>
          {showReportsView ? (
            <Button size="xs" variant="default" onClick={props.onRerunFailed} disabled={!selectedReport}>
              Rerun Failed
            </Button>
          ) : null}
        </div>
      </div>

      <div className="center-intro">
        <Text size="sm" c="dimmed">
          Collections turn individual requests into repeatable flows. Switch between design, data, and reports so each step of that workflow stays focused.
        </Text>
      </div>

      <div className="environment-layout">
        <div className="environment-sidebar">
          <div className="sidebar-section-head">
            <Text fw={700} size="sm">{showReportsView ? 'Reports First' : 'Collections First'}</Text>
            <Text size="xs" c="dimmed">
              {showReportsView
                ? 'Pick a recent run and inspect where the flow failed or what values should be extracted.'
                : 'Pick a collection to edit its steps, environment defaults, and reusable variables.'}
            </Text>
          </div>
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

          <div className={showReportsView ? 'inspector-section collection-sidebar-section is-primary' : 'inspector-section collection-sidebar-section'} style={{ marginTop: 12 }}>
            <div className="checks-head">
              <Text fw={700} size="sm">Reports</Text>
              <Group gap={6}>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => props.onExportReport?.('json')}
                  disabled={!selectedReport || !enabledReporters.includes('json')}
                >
                  JSON
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => props.onExportReport?.('html')}
                  disabled={!selectedReport || !enabledReporters.includes('html')}
                >
                  HTML
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => props.onExportReport?.('junit')}
                  disabled={!selectedReport || !enabledReporters.includes('junit')}
                >
                  JUnit
                </Button>
                <Button size="xs" variant="subtle" color="red" onClick={props.onClearReports}>
                  Clear
                </Button>
              </Group>
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
              onChange={value => {
                setActiveStudioTab('reports');
                props.onSelectReport(value || null);
              }}
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
                <div className="summary-chip">
                  <span>Tag Filter</span>
                  <strong>{selectedReport.filters.tags.length > 0 ? selectedReport.filters.tags.join(', ') : 'none'}</strong>
                </div>
              </div>
            ) : (
              <div className="empty-tab-state" style={{ marginTop: 12 }}>
                No collection reports yet. Run a collection to inspect failures, drift, and extracted values here.
              </div>
            )}
          </div>
        </div>

        <div className="environment-main">
          {draftCollection && showDesignView ? (
            <>
              <div className={activeStudioTab === 'design' ? 'inspector-section collection-stage is-active' : 'inspector-section collection-stage'}>
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Design</Text>
                    <h3 className="section-title">Collection settings and run policy</h3>
                  </div>
                  <Group gap={6}>
                    <Button size="xs" variant="default" onClick={() => props.onExportBruno?.('folder')} disabled={!props.onExportBruno}>
                      Export Bruno folder
                    </Button>
                    <Button size="xs" variant="subtle" onClick={() => props.onExportBruno?.('json')} disabled={!props.onExportBruno}>
                      Export JSON
                    </Button>
                    <Button size="xs" variant="subtle" onClick={props.onExportOpenCollection} disabled={!props.onExportOpenCollection}>
                      Export OpenCollection
                    </Button>
                    <Badge variant="light" color="gray">
                      {draftCollection.steps.length} steps · {selectedCollectionReportCount} reports
                    </Badge>
                  </Group>
                </div>
                <Text size="sm" c="dimmed" mb={12}>
                  Define the reusable flow here: environment defaults, retries, required paths, and the execution rules that should travel with the collection.
                </Text>
                {runTags.length > 0 ? (
                  <div className="repair-tag-list" style={{ marginBottom: 12 }}>
                    <span>Run filter</span>
                    {runTags.map(tag => (
                      <Badge key={tag} variant="light" color="indigo">{tag}</Badge>
                    ))}
                  </div>
                ) : null}
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
                  <TextInput
                    label="Tags"
                    placeholder="smoke, nightly"
                    value={(draftCollection.tags || []).join(', ')}
                    onChange={event =>
                      props.onCollectionChange({
                        ...draftCollection,
                        tags: parseTagList(event.currentTarget.value)
                      })
                    }
                  />
                  <TextInput
                    label="Run Tags"
                    placeholder="smoke, contract"
                    value={runTagText}
                    onChange={event => {
                      const nextText = event.currentTarget.value;
                      setRunTagText(nextText);
                      props.onCollectionChange({
                        ...draftCollection,
                        runnerTags: parseTagList(nextText)
                      });
                    }}
                  />
                  <TextInput
                    label="Environment Matrix"
                    placeholder="shared, staging"
                    value={(draftCollection.envMatrix || []).join(', ')}
                    onChange={event =>
                      props.onCollectionChange({
                        ...draftCollection,
                        envMatrix: parseTagList(event.currentTarget.value)
                      })
                    }
                  />
                  <NumberInput
                    label="Default Retry Count"
                    value={draftCollection.defaultRetry?.count || 0}
                    min={0}
                    onChange={value =>
                      props.onCollectionChange({
                        ...draftCollection,
                        defaultRetry: {
                          ...draftCollection.defaultRetry,
                          count: Number(value) || 0
                        }
                      })
                    }
                  />
                  <NumberInput
                    label="Default Retry Delay (ms)"
                    value={draftCollection.defaultRetry?.delayMs || 0}
                    min={0}
                    step={100}
                    onChange={value =>
                      props.onCollectionChange({
                        ...draftCollection,
                        defaultRetry: {
                          ...draftCollection.defaultRetry,
                          delayMs: Number(value) || 0
                        }
                      })
                    }
                  />
                  <Checkbox
                    label="Continue On Failure"
                    checked={draftCollection.continueOnFailure}
                    onChange={event =>
                      props.onCollectionChange({
                        ...draftCollection,
                        continueOnFailure: event.currentTarget.checked
                      })
                    }
                  />
                </div>
                <Group gap={8} mt={12}>
                  <Checkbox
                    label="JSON Reporter"
                    checked={draftCollection.reporters.includes('json')}
                    onChange={event =>
                      props.onCollectionChange({
                        ...draftCollection,
                        reporters: event.currentTarget.checked
                          ? Array.from(new Set([...draftCollection.reporters, 'json']))
                          : draftCollection.reporters.filter(item => item !== 'json')
                      })
                    }
                  />
                  <Checkbox
                    label="HTML Reporter"
                    checked={draftCollection.reporters.includes('html')}
                    onChange={event =>
                      props.onCollectionChange({
                        ...draftCollection,
                        reporters: event.currentTarget.checked
                          ? Array.from(new Set([...draftCollection.reporters, 'html']))
                          : draftCollection.reporters.filter(item => item !== 'html')
                      })
                    }
                  />
                  <Checkbox
                    label="JUnit Reporter"
                    checked={draftCollection.reporters.includes('junit')}
                    onChange={event =>
                      props.onCollectionChange({
                        ...draftCollection,
                        reporters: event.currentTarget.checked
                          ? Array.from(new Set([...draftCollection.reporters, 'junit']))
                          : draftCollection.reporters.filter(item => item !== 'junit')
                      })
                    }
                  />
                </Group>
              </div>

              <div className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Run Presets</Text>
                    <h3 className="section-title">Reusable launch profiles</h3>
                  </div>
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() =>
                      props.onCollectionChange({
                        ...draftCollection,
                        runPresets: [
                          ...(draftCollection.runPresets || []),
                          {
                            id: createId('preset'),
                            name: `Preset ${draftCollection.runPresets.length + 1}`,
                            environmentName: draftCollection.defaultEnvironment || undefined,
                            tags: [...(draftCollection.runnerTags || [])],
                            stepKeys: [],
                            failFast: false
                          }
                        ]
                      })
                    }
                  >
                    Add Preset
                  </Button>
                </div>
                <Text size="sm" c="dimmed" mb={12}>
                  Save the run filters you actually use so you can relaunch smoke, nightly, or focused subsets without retyping tags and step keys each time.
                </Text>
                {draftCollection.runPresets.length === 0 ? (
                  <div className="empty-tab-state">No run preset yet. Add one to persist environment, tags, selected steps, and fail-fast behavior.</div>
                ) : (
                  <div className="checks-list">
                    {draftCollection.runPresets.map(preset => (
                      <div key={preset.id} className="check-card">
                        <div className="settings-grid">
                          <TextInput
                            label="Preset Name"
                            value={preset.name}
                            onChange={event =>
                              props.onCollectionChange({
                                ...draftCollection,
                                runPresets: draftCollection.runPresets.map(item =>
                                  item.id === preset.id ? { ...item, name: event.currentTarget.value } : item
                                )
                              })
                            }
                          />
                          <Select
                            label="Environment Override"
                            value={preset.environmentName || ''}
                            data={[
                              { value: '', label: 'Use active/default environment' },
                              ...props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))
                            ]}
                            onChange={value =>
                              props.onCollectionChange({
                                ...draftCollection,
                                runPresets: draftCollection.runPresets.map(item =>
                                  item.id === preset.id ? { ...item, environmentName: value || undefined } : item
                                )
                              })
                            }
                          />
                          <TextInput
                            label="Tags"
                            placeholder="smoke, nightly"
                            value={(preset.tags || []).join(', ')}
                            onChange={event =>
                              props.onCollectionChange({
                                ...draftCollection,
                                runPresets: draftCollection.runPresets.map(item =>
                                  item.id === preset.id ? { ...item, tags: parseTagList(event.currentTarget.value) } : item
                                )
                              })
                            }
                          />
                          <TextInput
                            label="Step Keys"
                            placeholder="setup:login, health"
                            value={(preset.stepKeys || []).join(', ')}
                            onChange={event =>
                              props.onCollectionChange({
                                ...draftCollection,
                                runPresets: draftCollection.runPresets.map(item =>
                                  item.id === preset.id ? { ...item, stepKeys: parseTagList(event.currentTarget.value) } : item
                                )
                              })
                            }
                          />
                          <Checkbox
                            label="Fail Fast"
                            checked={preset.failFast}
                            onChange={event =>
                              props.onCollectionChange({
                                ...draftCollection,
                                runPresets: draftCollection.runPresets.map(item =>
                                  item.id === preset.id ? { ...item, failFast: event.currentTarget.checked } : item
                                )
                              })
                            }
                          />
                        </div>
                        <Group gap={8} mt={12}>
                          <Button
                            size="xs"
                            onClick={() =>
                              props.onRunCollection({
                                environmentName: preset.environmentName,
                                tags: preset.tags,
                                stepKeys: preset.stepKeys,
                                failFast: preset.failFast
                              })
                            }
                          >
                            Run Preset
                          </Button>
                          <Button
                            size="xs"
                            variant="default"
                            color="red"
                            onClick={() =>
                              props.onCollectionChange({
                                ...draftCollection,
                                runPresets: draftCollection.runPresets.filter(item => item.id !== preset.id)
                              })
                            }
                          >
                            Remove
                          </Button>
                        </Group>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="inspector-section">
                <Text className="section-kicker">Variables</Text>
                <h3 className="section-title">Reusable inputs for this flow</h3>
                <Text size="sm" c="dimmed" mb={12}>
                  Keep collection-level values here when multiple steps should reference the same placeholder without moving that data into an external file.
                </Text>
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
                <Text className="section-kicker">Scripts</Text>
                <h3 className="section-title">Collection-level runtime hooks</h3>
                <Text size="sm" c="dimmed" mb={12}>
                  These hooks wrap every runnable step in the collection: pre-request runs before request and case scripts, while post-response and tests run before request-level response hooks.
                </Text>
                <div className="checks-list">
                  <div className="check-card">
                    <Text fw={700}>Collection Pre-request Script</Text>
                    <CodeEditor
                      value={draftCollection.scripts.preRequest || ''}
                      language="text"
                      onChange={value =>
                        props.onCollectionChange({
                          ...draftCollection,
                          scripts: {
                            ...draftCollection.scripts,
                            preRequest: value
                          }
                        })
                      }
                      minHeight="160px"
                    />
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Collection Post-response Script</Text>
                    <CodeEditor
                      value={draftCollection.scripts.postResponse || ''}
                      language="text"
                      onChange={value =>
                        props.onCollectionChange({
                          ...draftCollection,
                          scripts: {
                            ...draftCollection.scripts,
                            postResponse: value
                          }
                        })
                      }
                      minHeight="180px"
                    />
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Collection Tests</Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Assertions here are evaluated for every executed step and feed the same report/check pipeline as request-level tests.
                    </Text>
                    <CodeEditor
                      value={draftCollection.scripts.tests || ''}
                      language="text"
                      onChange={value =>
                        props.onCollectionChange({
                          ...draftCollection,
                          scripts: {
                            ...draftCollection.scripts,
                            tests: value
                          }
                        })
                      }
                      minHeight="160px"
                    />
                  </div>
                </div>
              </div>

              <div className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Steps</Text>
                    <h3 className="section-title">Arrange requests into a repeatable sequence</h3>
                  </div>
                  <Group gap={8}>
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() =>
                        props.onCollectionChange({
                          ...draftCollection,
                          steps: [
                            ...draftCollection.steps,
                            createCollectionStep({
                              key: `step_${draftCollection.steps.length + 1}`,
                              requestId: props.workspace.requests[0]?.request.id || '',
                              name: `Step ${draftCollection.steps.length + 1}`
                            })
                          ]
                        })
                      }
                    >
                      Add Step
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={props.onAddCurrentSelection}
                      disabled={!props.currentSelection?.requestId}
                    >
                      Add Current Request
                    </Button>
                  </Group>
                </div>
                <Text size="sm" c="dimmed" mb={12}>
                  Each step should answer one job in the flow. Add the current request directly from Workbench, or map an existing request and Case into the run order.
                </Text>
                {props.currentSelection?.requestId ? (
                  <Text size="sm" c="dimmed" mb={12}>
                    Current selection: {props.currentSelection.requestName}
                    {props.currentSelection.caseName ? ` · ${props.currentSelection.caseName}` : ''}
                  </Text>
                ) : null}

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
                          <TextInput
                            label="Tags"
                            placeholder="login, smoke"
                            value={(step.tags || []).join(', ')}
                            onChange={event =>
                              props.onCollectionChange({
                                ...draftCollection,
                                steps: draftCollection.steps.map(item =>
                                  item.key === step.key
                                    ? {
                                        ...item,
                                        tags: parseTagList(event.currentTarget.value)
                                      }
                                    : item
                                )
                              })
                            }
                          />
                          <NumberInput
                            label="Timeout Override (ms)"
                            value={step.timeoutMs || ''}
                            min={0}
                            onChange={value =>
                              props.onCollectionChange({
                                ...draftCollection,
                                steps: draftCollection.steps.map(item =>
                                  item.key === step.key
                                    ? { ...item, timeoutMs: Number(value) > 0 ? Number(value) : undefined }
                                    : item
                                )
                              })
                            }
                          />
                          <NumberInput
                            label="Retry Count"
                            value={step.retry?.count || 0}
                            min={0}
                            onChange={value =>
                              props.onCollectionChange({
                                ...draftCollection,
                                steps: draftCollection.steps.map(item =>
                                  item.key === step.key
                                    ? {
                                        ...item,
                                        retry: {
                                          ...item.retry,
                                          count: Number(value) || 0,
                                          delayMs: item.retry?.delayMs || 0,
                                          when: item.retry?.when || ['network-error', '5xx', 'assertion-failed']
                                        }
                                      }
                                    : item
                                )
                              })
                            }
                          />
                          <Checkbox
                            label="Continue On Failure"
                            checked={step.continueOnFailure || false}
                            onChange={event =>
                              props.onCollectionChange({
                                ...draftCollection,
                                steps: draftCollection.steps.map(item =>
                                  item.key === step.key ? { ...item, continueOnFailure: event.currentTarget.checked } : item
                                )
                              })
                            }
                          />
                          <TextInput
                            label="Skip If"
                            placeholder="{{skipLogin}}"
                            value={step.skipIf || ''}
                            onChange={event =>
                              props.onCollectionChange({
                                ...draftCollection,
                                steps: draftCollection.steps.map(item =>
                                  item.key === step.key ? { ...item, skipIf: event.currentTarget.value } : item
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
            </>
          ) : null}

          {draftCollection && showDataView ? (
            <div className="inspector-section collection-stage is-active">
              <div className="checks-head">
                <div>
                  <Text className="section-kicker">Data</Text>
                  <h3 className="section-title">Data file and input quality</h3>
                </div>
              </div>
              <Text size="sm" c="dimmed">
                Use this tab only for iteration data: validate shape, inspect columns, and edit the file without the step editor competing for attention.
              </Text>
              <div className="summary-grid" style={{ marginTop: 12, marginBottom: 12 }}>
                <div className="summary-chip">
                  <span>Format</span>
                  <strong>{String(dataInspection.format).toUpperCase()}</strong>
                </div>
                <div className="summary-chip">
                  <span>Rows</span>
                  <strong>{dataInspection.rows.length}</strong>
                </div>
                <div className="summary-chip">
                  <span>Columns</span>
                  <strong>{dataInspection.columns.length}</strong>
                </div>
              </div>
              {dataInspection.error ? (
                <div className="check-card" style={{ margin: 0, marginBottom: 12 }}>
                  <Text fw={700}>Validation</Text>
                  <Text size="sm" c="dimmed">{dataInspection.error}</Text>
                </div>
              ) : dataInspection.rows.length > 0 ? (
                <div className="check-card" style={{ margin: 0, marginBottom: 12 }}>
                  <Text fw={700}>Preview</Text>
                  <Text size="sm" c="dimmed">
                    Columns: {dataInspection.columns.join(', ')}
                  </Text>
                  <CodeEditor
                    value={JSON.stringify(dataInspection.rows.slice(0, 3), null, 2)}
                    readOnly
                    language="json"
                    minHeight="120px"
                  />
                </div>
              ) : (
                <div className="empty-tab-state" style={{ marginBottom: 12 }}>
                  No data rows yet. Add JSON, YAML, or CSV rows here when this collection should iterate over multiple cases.
                </div>
              )}
              <CodeEditor
                value={props.collectionDataText}
                language={dataInspection.format === 'json' ? 'json' : 'text'}
                onChange={props.onCollectionDataChange}
                minHeight="320px"
              />
            </div>
          ) : null}

          {!draftCollection ? (
            <div className="empty-tab-state">Select a collection to edit its design, attach data, or inspect reports.</div>
          ) : null}

          {showReportsView ? (
            selectedReport ? (
            <div className="inspector-section collection-stage is-active">
              <div className="checks-head">
                <div>
                  <Text className="section-kicker">Reports</Text>
                  <h3 className="section-title">Run output, failures, and extracted values</h3>
                </div>
                <Badge variant="light" color={selectedReport.status === 'passed' ? 'teal' : selectedReport.status === 'failed' ? 'red' : 'gray'}>
                  {selectedReport.status}
                </Badge>
                <Select
                  placeholder="Select step"
                  value={
                    props.selectedReportStepKey?.includes(':')
                      ? props.selectedReportStepKey
                      : selectedStep
                        ? stepSelectionValue(selectedStep.iterationIndex, selectedStep.step.stepKey)
                        : null
                  }
                  data={selectedReport.iterations.flatMap(iteration =>
                    iteration.stepRuns.map(stepRun => ({
                      value: stepSelectionValue(iteration.index, stepRun.stepKey),
                      label: `${iteration.dataLabel || `Iteration ${iteration.index + 1}`} · ${stepRun.stepKey}`
                    }))
                  )}
                  onChange={value => props.onSelectReportStep(value || null)}
                />
              </div>
              <Text size="sm" c="dimmed" mb={12}>
                Stay in this tab to inspect what happened during a run: identify the failed step, compare drift against the baseline, and extract reusable values without reopening the editor.
              </Text>

              <div className="summary-grid" style={{ marginBottom: 12 }}>
                <div className="summary-chip">
                  <span>Collection</span>
                  <strong>{selectedReport.collectionName}</strong>
                </div>
                <div className="summary-chip">
                  <span>Environment</span>
                  <strong>{selectedReport.environmentName || 'shared'}</strong>
                </div>
                <div className="summary-chip">
                  <span>Finished</span>
                  <strong>{selectedReport.finishedAt}</strong>
                </div>
                <div className="summary-chip">
                  <span>Iterations</span>
                  <strong>{selectedReport.iterationCount}</strong>
                </div>
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
                  {failureGroups.length > 0 ? (
                    <div className="repair-tag-list" style={{ marginTop: 12 }}>
                      {failureGroups.map(([stepKey, count]: [string, number]) => (
                        <Button
                          key={stepKey}
                          size="xs"
                          variant="light"
                          color="orange"
                          onClick={() => {
                            const failedMatch = selectedReport.iterations.find(iteration =>
                              iteration.stepRuns.some(step => step.stepKey === stepKey && !step.ok && !step.skipped)
                            );
                            if (!failedMatch) return;
                            const matchedStep = failedMatch.stepRuns.find(step => step.stepKey === stepKey && !step.ok && !step.skipped);
                            if (!matchedStep) return;
                            props.onSelectReportStep(stepSelectionValue(failedMatch.index, matchedStep.stepKey));
                          }}
                        >
                          {stepKey} · {count}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedStep ? (
                <div className="checks-list">
                  <div className="check-card">
                    <Group justify="space-between">
                      <div>
                        <Text fw={700}>{selectedStep.step.stepName}</Text>
                        <Text size="sm" c="dimmed">
                          {selectedStep.step.request?.method || 'N/A'} {selectedStep.step.request?.url || selectedStep.step.error || ''}
                        </Text>
                      </div>
                      <Group gap="xs">
                        <Badge color={selectedStep.step.ok ? 'green' : selectedStep.step.skipped ? 'gray' : 'red'}>
                          {selectedStep.step.skipped ? 'SKIPPED' : selectedStep.step.ok ? 'PASS' : 'FAIL'}
                        </Badge>
                        {props.onOpenCase && selectedStep.step.caseId ? (
                          <Button
                            size="xs"
                            variant="default"
                            onClick={() => props.onOpenCase?.(selectedStep.step.requestId, selectedStep.step.caseId!)}
                          >
                            Open Case
                          </Button>
                        ) : props.onOpenRequest ? (
                          <Button
                            size="xs"
                            variant="default"
                            onClick={() => props.onOpenRequest?.(selectedStep.step.requestId)}
                          >
                            Open Request
                          </Button>
                        ) : null}
                      </Group>
                    </Group>
                    {firstFailedStepPointer && props.selectedReportStepKey !== firstFailedStepPointer ? (
                      <Group gap="xs" mt="md">
                        <Button size="xs" variant="subtle" color="orange" onClick={() => props.onSelectReportStep(firstFailedStepPointer)}>
                          Jump To First Failure
                        </Button>
                      </Group>
                    ) : null}
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Checks</Text>
                    <CodeEditor
                      value={
                        selectedStep.step.checkResults.length > 0
                          ? selectedStep.step.checkResults.map(result => `${result.ok ? 'PASS' : 'FAIL'} ${result.label}: ${result.message}`).join('\n')
                          : selectedStep.step.error || 'No checks recorded.'
                      }
                      readOnly
                      language="text"
                      minHeight="120px"
                    />
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Attempts</Text>
                    <CodeEditor
                      value={
                        selectedStep.step.attempts.length > 0
                          ? selectedStep.step.attempts
                              .map(attempt => `#${attempt.attempt} ${attempt.ok ? 'PASS' : 'FAIL'} ${attempt.failureType || ''} ${attempt.error || ''}`.trim())
                              .join('\n')
                          : 'No retries were recorded.'
                      }
                      readOnly
                      language="text"
                      minHeight="96px"
                    />
                  </div>
                  <div className="check-card">
                    <Group justify="space-between">
                      <Text fw={700}>Step Bindings</Text>
                      {previousStepRefs.length > 0 && props.onCopyText ? (
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => props.onCopyText?.(previousStepRefs.join('\n'), 'Step bindings copied')}
                        >
                          Copy Bindings
                        </Button>
                      ) : null}
                    </Group>
                    {previousStepRefs.length > 0 ? (
                      <CodeEditor value={previousStepRefs.join('\n')} readOnly language="text" minHeight="96px" />
                    ) : (
                      <div className="empty-tab-state">This is the first resolved step in the iteration, so there are no previous step bindings yet.</div>
                    )}
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Response Body</Text>
                    <CodeEditor
                      value={selectedStep.step.response?.bodyText || ''}
                      readOnly
                      language="json"
                      minHeight="220px"
                    />
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Baseline Drift</Text>
                    {selectedBaselineExample ? (
                      <>
                        <Text size="sm" c="dimmed">
                          Baseline example: {selectedBaselineExample.name}
                        </Text>
                        <Text size="sm" c="dimmed" mt={8}>
                          {selectedBaselineSummary}
                        </Text>
                      </>
                    ) : (
                      <div className="empty-tab-state">No baseline example found for this request yet. Save one from History or Response to enable drift comparison.</div>
                    )}
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Extract JSON Values</Text>
                    {selectedJsonRows.length ? (
                      <div className="json-inspector-list" style={{ marginTop: 12 }}>
                        {selectedJsonRows.map(row => (
                          <div key={row.path} className="json-inspector-row">
                            <div className="json-inspector-copy">
                              <strong>{row.path}</strong>
                              <span>{row.value}</span>
                            </div>
                            {props.onExtractValue ? (
                              <Group gap={6}>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() =>
                                    props.onExtractValue?.('runtime', {
                                      suggestedName: row.path.replace(/[^a-zA-Z0-9]+/g, '_'),
                                      value: row.value
                                    })
                                  }
                                >
                                  Runtime
                                </Button>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() =>
                                    props.onExtractValue?.('local', {
                                      suggestedName: row.path.replace(/[^a-zA-Z0-9]+/g, '_'),
                                      value: row.value
                                    })
                                  }
                                >
                                  Local
                                </Button>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() =>
                                    props.onExtractValue?.('collection', {
                                      suggestedName: row.path.replace(/[^a-zA-Z0-9]+/g, '_'),
                                      value: row.value
                                    })
                                  }
                                >
                                  Collection
                                </Button>
                              </Group>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-tab-state" style={{ marginTop: 12 }}>
                        This step body is not valid JSON, so structured extraction is unavailable.
                      </div>
                    )}
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Extract Headers</Text>
                    {selectedResponseHeaders.length ? (
                      <div className="json-inspector-list" style={{ marginTop: 12 }}>
                        {selectedResponseHeaders.map(header => (
                          <div key={`${header.name}:${header.value}`} className="json-inspector-row">
                            <div className="json-inspector-copy">
                              <strong>{header.name}</strong>
                              <span>{header.value}</span>
                            </div>
                            {props.onExtractValue ? (
                              <Group gap={6}>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => props.onExtractValue?.('runtime', { suggestedName: header.name, value: header.value })}
                                >
                                  Runtime
                                </Button>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => props.onExtractValue?.('local', { suggestedName: header.name, value: header.value })}
                                >
                                  Local
                                </Button>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => props.onExtractValue?.('collection', { suggestedName: header.name, value: header.value })}
                                >
                                  Collection
                                </Button>
                              </Group>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-tab-state" style={{ marginTop: 12 }}>No response headers were captured for this step.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="empty-tab-state">Choose a step from the report to inspect the request and response.</div>
              )}
            </div>
            ) : (
              <div className="empty-tab-state">No report selected yet. Run a collection, then use this tab to inspect failures, drift, and step output.</div>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
