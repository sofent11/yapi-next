import { useEffect, useState } from 'react';
import { Badge, Button, Checkbox, Code, Select, Text, TextInput, Textarea } from '@mantine/core';
import { IconPlayerPause, IconPlayerPlay, IconRefresh, IconRocket, IconTrash } from '@tabler/icons-react';
import type { WorkspaceIndex } from '@yapi-debugger/schema';
import type {
  BrowserTargetSummary,
  CaptureBrowserState,
  CaptureMode,
  CaptureRuntimeState,
  CapturedNetworkEntry
} from '../../lib/capture';

type CaptureSurfaceTab = 'setup' | 'review';
type CaptureInspectorTab = 'overview' | 'headers' | 'body' | 'promote';
type CapturePromoteIntent = 'requests' | 'collection' | null;

function displayTargetLabel(target: BrowserTargetSummary) {
  const label = target.title?.trim() || target.url || target.targetId;
  return label.length > 72 ? `${label.slice(0, 69)}...` : label;
}

function statusTone(status: number | null) {
  if (status == null) return 'gray';
  if (status >= 200 && status < 300) return 'teal';
  if (status >= 400) return 'red';
  return 'orange';
}

function compactTime(value: number) {
  return new Date(value).toLocaleTimeString();
}

function shortText(value: string, length = 88) {
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

function headerPreview(headers: Array<{ name: string; value: string }>, emptyMessage: string) {
  if (headers.length === 0) {
    return <div className="empty-tab-state">{emptyMessage}</div>;
  }

  return (
    <div className="capture-header-list">
      {headers.map(header => (
        <div key={`${header.name}:${header.value}`} className="capture-header-row">
          <strong>{header.name}</strong>
          <span>{header.value}</span>
        </div>
      ))}
    </div>
  );
}

function inspectorTabLabel(tab: CaptureInspectorTab, promoteIntent: CapturePromoteIntent) {
  if (tab !== 'promote') return tab;
  return promoteIntent === 'collection' ? 'promote collection' : 'save requests';
}

export function CapturePanel(props: {
  workspace: WorkspaceIndex;
  browser: CaptureBrowserState | null;
  runtime: CaptureRuntimeState | null;
  mode: CaptureMode;
  targets: BrowserTargetSummary[];
  selectedTargetId: string | null;
  filterText: string;
  entries: CapturedNetworkEntry[];
  visibleEntries: CapturedNetworkEntry[];
  selectedEntryId: string | null;
  selectedEntryIds: string[];
  selectedEntry: CapturedNetworkEntry | null;
  selectedVisibleCount: number;
  exportStrategy: 'append' | 'replace';
  collectionTargetMode: 'existing' | 'new';
  selectedCollectionId: string | null;
  newCollectionName: string;
  isAllVisibleSelected: boolean;
  isLaunching: boolean;
  isRefreshingTargets: boolean;
  isStarting: boolean;
  isStopping: boolean;
  isExporting: boolean;
  onLaunch: () => void;
  onRefreshTargets: () => void;
  onModeChange: (mode: CaptureMode) => void;
  onSelectTarget: (targetId: string | null) => void;
  onFilterTextChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onSelectEntry: (id: string) => void;
  onToggleEntry: (id: string) => void;
  onToggleAllVisible: () => void;
  onExportStrategyChange: (strategy: 'append' | 'replace') => void;
  onCollectionTargetModeChange: (mode: 'existing' | 'new') => void;
  onSelectCollection: (id: string | null) => void;
  onNewCollectionNameChange: (value: string) => void;
  onSaveRequests: () => void;
  onAddToCollection: () => void;
}) {
  const filterRuleCount = props.filterText
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean).length;
  const selectedTarget = props.targets.find(target => target.targetId === props.selectedTargetId) || null;
  const selectedCount = props.selectedEntryIds.length;
  const [surfaceTab, setSurfaceTab] = useState<CaptureSurfaceTab>(props.entries.length > 0 ? 'review' : 'setup');
  const [inspectorTab, setInspectorTab] = useState<CaptureInspectorTab>('overview');
  const [promoteIntent, setPromoteIntent] = useState<CapturePromoteIntent>(null);

  useEffect(() => {
    if (selectedCount === 0 && promoteIntent) {
      setPromoteIntent(null);
      setInspectorTab('overview');
    }
  }, [promoteIntent, selectedCount]);

  useEffect(() => {
    if (!props.selectedEntry && inspectorTab !== 'promote') {
      setInspectorTab('overview');
    }
  }, [inspectorTab, props.selectedEntry]);

  const openPromotePanel = (intent: Exclude<CapturePromoteIntent, null>) => {
    setSurfaceTab('review');
    setPromoteIntent(intent);
    setInspectorTab('promote');
  };

  const closePromotePanel = () => {
    setPromoteIntent(null);
    setInspectorTab('overview');
  };

  const showPromotePanel = promoteIntent !== null && selectedCount > 0;
  const canShowInspectorTabs = Boolean(props.selectedEntry) || showPromotePanel;
  const reviewSummaryText = filterRuleCount > 0
    ? `${props.visibleEntries.length} filtered from ${props.entries.length}`
    : `${props.visibleEntries.length} captured`;

  return (
    <section className="workspace-main capture-console">
      <header className="capture-console-head">
        <div className="capture-console-copy">
          <div className="capture-console-kicker">Browser Capture</div>
          <h2>Capture Console</h2>
          <p>Split setup from review so the request ledger stays large, readable, and ready for promotion only when you ask for it.</p>
        </div>

        <div className="capture-console-actions">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconRocket size={14} />}
            loading={props.isLaunching}
            onClick={props.onLaunch}
          >
            Launch Chrome
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconRefresh size={14} />}
            loading={props.isRefreshingTargets}
            onClick={props.onRefreshTargets}
            disabled={!props.browser}
          >
            Refresh Targets
          </Button>
          {props.runtime?.running ? (
            <Button
              size="xs"
              color="orange"
              leftSection={<IconPlayerPause size={14} />}
              loading={props.isStopping}
              onClick={props.onStop}
            >
              Stop
            </Button>
          ) : (
            <Button
              size="xs"
              leftSection={<IconPlayerPlay size={14} />}
              loading={props.isStarting}
              onClick={props.onStart}
              disabled={!props.browser || (props.mode === 'target' && !props.selectedTargetId)}
            >
              Start Capture
            </Button>
          )}
          <Button
            size="xs"
            variant="default"
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={props.onClear}
            disabled={props.entries.length === 0}
          >
            Clear
          </Button>
        </div>
      </header>

      <div className="capture-phase-switch">
        <div className="capture-phase-buttons" role="tablist" aria-label="Capture workspace tabs">
          <button
            type="button"
            className={surfaceTab === 'setup' ? 'is-active' : undefined}
            onClick={() => setSurfaceTab('setup')}
          >
            Prepare Capture
          </button>
          <button
            type="button"
            className={surfaceTab === 'review' ? 'is-active' : undefined}
            onClick={() => setSurfaceTab('review')}
          >
            Review Captures
          </button>
        </div>

        <div className="capture-phase-summary">
          <Badge variant="light" color={props.browser ? 'teal' : 'gray'}>
            {props.browser ? 'Connected' : 'No browser'}
          </Badge>
          <Badge variant="light" color={props.runtime?.running ? 'blue' : 'gray'}>
            {props.runtime?.running ? 'Live capture' : 'Stopped'}
          </Badge>
          <Badge variant="light" color="gray">
            {props.visibleEntries.length} visible
          </Badge>
          {filterRuleCount > 0 ? (
            <Badge variant="light" color="indigo">
              {filterRuleCount} host rules
            </Badge>
          ) : null}
        </div>
      </div>

      {surfaceTab === 'setup' ? (
        <div className="capture-setup-shell">
          <section className="capture-card capture-setup-status">
            <div className="capture-card-head">
              <div className="capture-card-copy">
                <span className="capture-ribbon-label">Session</span>
                <h3>Browser Link</h3>
                <p>Keep setup compact here, then move to the review tab for the large ledger.</p>
              </div>
              <Badge variant="light" color={props.browser ? 'teal' : 'gray'}>
                {props.browser ? 'Ready' : 'Idle'}
              </Badge>
            </div>

            <div className="capture-session-stack">
              <div className="capture-session-row">
                <span>Port</span>
                <strong>{props.browser?.port || '--'}</strong>
              </div>
              <div className="capture-session-row">
                <span>Runtime</span>
                <strong>{props.runtime?.running ? 'Listening' : 'Stopped'}</strong>
              </div>
              <div className="capture-session-row">
                <span>Entries</span>
                <strong>{props.entries.length}</strong>
              </div>
              <div className="capture-session-row is-block">
                <span>Socket</span>
                <strong title={props.browser?.websocketUrl || ''}>
                  {props.browser?.websocketUrl ? shortText(props.browser.websocketUrl, 92) : 'Launch a browser session first'}
                </strong>
              </div>
            </div>

            {props.runtime?.error ? <div className="empty-tab-state">{props.runtime.error}</div> : null}

            <div className="capture-setup-foot">
              <Text size="sm" c="dimmed">
                {props.entries.length > 0
                  ? 'The review tab already has captured requests ready to inspect.'
                  : 'Once requests arrive, the review tab becomes the main working surface.'}
              </Text>
              <Button
                size="xs"
                variant="default"
                onClick={() => setSurfaceTab('review')}
                disabled={props.entries.length === 0}
              >
                Open Review
              </Button>
            </div>
          </section>

          <section className="capture-card capture-setup-controls">
            <div className="capture-card-head">
              <div className="capture-card-copy">
                <span className="capture-ribbon-label">Scope</span>
                <h3>Capture Setup</h3>
                <p>Choose the listening scope and host rules here without taking height away from the results view.</p>
              </div>
              <div className="capture-card-badges">
                <Badge variant="light" color={props.mode === 'browser' ? 'blue' : 'gray'}>
                  {props.mode === 'browser' ? 'Whole browser' : 'Single target'}
                </Badge>
                <Badge variant="light" color={filterRuleCount > 0 ? 'indigo' : 'gray'}>
                  {filterRuleCount > 0 ? `${filterRuleCount} filters` : 'No filter'}
                </Badge>
              </div>
            </div>

            <div className="capture-control-grid">
              <Select
                label="Capture scope"
                value={props.mode}
                data={[
                  { value: 'target', label: 'Single Target' },
                  { value: 'browser', label: 'Whole Browser' }
                ]}
                onChange={value => value && props.onModeChange(value as CaptureMode)}
              />
              <Select
                label="Target"
                disabled={props.mode === 'browser'}
                placeholder={props.targets.length ? 'Select a page target' : 'Launch Chrome and refresh targets first'}
                value={props.selectedTargetId}
                data={props.targets.map(target => ({
                  value: target.targetId,
                  label: displayTargetLabel(target)
                }))}
                onChange={value => props.onSelectTarget(value)}
              />
              <Textarea
                label="Host filter"
                autosize
                minRows={3}
                maxRows={5}
                placeholder={'api.example.com\n.example.com'}
                description="Exact hosts or suffix hosts. Leave empty to keep the full session ledger."
                value={props.filterText}
                onChange={event => props.onFilterTextChange(event.currentTarget.value)}
              />
            </div>

            <div className="capture-setup-note">
              {props.mode === 'browser'
                ? 'Browser mode listens across attached page targets. Use it when the flow hops between tabs or pages.'
                : selectedTarget
                  ? `Target mode is locked to ${displayTargetLabel(selectedTarget)}.`
                  : 'Target mode captures just one selected page target.'}
            </div>
          </section>
        </div>
      ) : (
        <div className="capture-review-shell">
          <section className="capture-ledger">
            <div className="capture-ledger-toolbar">
              <div className="capture-ledger-identity">
                <span className="capture-ribbon-label">Captured Ledger</span>
                <h3>Request Stream</h3>
                <span className="capture-ledger-meta">
                  {reviewSummaryText}
                  {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
                </span>
              </div>

              <div className="capture-ledger-toolbar-actions">
                <Checkbox
                  checked={props.isAllVisibleSelected}
                  indeterminate={!props.isAllVisibleSelected && props.selectedVisibleCount > 0}
                  onChange={props.onToggleAllVisible}
                  label="Select visible"
                />
                <Badge variant="light" color={props.runtime?.running ? 'blue' : 'gray'}>
                  {props.runtime?.running ? 'Live' : 'Stopped'}
                </Badge>
                <Button size="xs" variant="default" onClick={() => setSurfaceTab('setup')}>
                  Settings
                </Button>
                {selectedCount > 0 ? (
                  <>
                    <Button size="xs" variant="default" onClick={() => openPromotePanel('requests')}>
                      Save
                    </Button>
                    <Button size="xs" onClick={() => openPromotePanel('collection')}>
                      Collection
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            {props.visibleEntries.length === 0 ? (
              <div className="capture-ledger-empty">
                <div className="empty-tab-state">
                  {props.entries.length === 0
                    ? 'No captured network requests yet. Launch Chrome, choose a scope, and start the session.'
                    : 'No captured requests match the current host filter.'}
                </div>
              </div>
            ) : (
              <div className="capture-ledger-body">
                <div className="capture-table-wrap">
                  <table className="capture-table">
                    <thead>
                      <tr>
                        <th />
                        <th>When</th>
                        <th>Kind</th>
                        <th>Request</th>
                        <th>Status</th>
                        <th>Target</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {props.visibleEntries.map(entry => {
                        const selected = props.selectedEntryIds.includes(entry.id);
                        const active = props.selectedEntryId === entry.id;
                        return (
                          <tr
                            key={entry.id}
                            className={active ? 'is-active' : undefined}
                            onClick={() => props.onSelectEntry(entry.id)}
                          >
                            <td className="capture-checkbox-cell" onClick={event => event.stopPropagation()}>
                              <Checkbox checked={selected} onChange={() => props.onToggleEntry(entry.id)} />
                            </td>
                            <td className="capture-time-cell">{compactTime(entry.startedAtMs)}</td>
                            <td>
                              <div className="capture-kind-stack">
                                <Badge variant="light" color={entry.type === 'fetch' ? 'violet' : 'blue'}>
                                  {entry.type}
                                </Badge>
                                <span>{entry.method.toUpperCase()}</span>
                              </div>
                            </td>
                            <td>
                              <div className="capture-request-cell">
                                <strong>{entry.host}</strong>
                                <span>{entry.path || entry.url}</span>
                              </div>
                            </td>
                            <td>
                              <Badge variant="light" color={statusTone(entry.status)}>
                                {entry.status ?? '--'}
                              </Badge>
                            </td>
                            <td className="capture-target-cell" title={entry.targetUrl || entry.targetTitle}>
                              <strong>{entry.targetTitle || entry.targetId}</strong>
                              <span>{entry.targetUrl || 'No target URL'}</span>
                            </td>
                            <td className="capture-duration-cell">{entry.durationMs != null ? `${entry.durationMs} ms` : '--'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <aside className="capture-sidecar">
            <section className="capture-card capture-detail-panel">
              <div className="capture-card-head">
                <div className="capture-card-copy">
                  <span className="capture-ribbon-label">{showPromotePanel ? 'Promote' : 'Inspector'}</span>
                  <h3>
                    {showPromotePanel
                      ? promoteIntent === 'collection'
                        ? 'Add to Collection'
                        : 'Save as Requests'
                      : 'Selected Request'}
                  </h3>
                  <p>
                    {showPromotePanel
                      ? `Materialize ${selectedCount} checked requests only when you confirm the action.`
                      : props.selectedEntry
                        ? 'Details stay compact behind tabs so the request list keeps most of the screen.'
                        : 'Select a request to inspect it, or select multiple rows and choose a promote action.'}
                  </p>
                </div>

                {showPromotePanel ? (
                  <Button size="xs" variant="default" onClick={closePromotePanel}>
                    Back to Detail
                  </Button>
                ) : props.selectedEntry ? (
                  <div className="capture-detail-summary">
                    <Badge variant="light" color={props.selectedEntry.type === 'fetch' ? 'violet' : 'blue'}>
                      {props.selectedEntry.type}
                    </Badge>
                    <Badge variant="light" color="gray">
                      {props.selectedEntry.method.toUpperCase()}
                    </Badge>
                    <Badge variant="light" color={statusTone(props.selectedEntry.status)}>
                      {props.selectedEntry.status ?? '--'}
                    </Badge>
                  </div>
                ) : null}
              </div>

              {!canShowInspectorTabs ? (
                <div className="empty-tab-state">Select a captured request to inspect it, or choose requests and click a promote action.</div>
              ) : (
                <>
                  <div className="capture-inspector-tabs" role="tablist" aria-label="Selected capture detail tabs">
                    {props.selectedEntry ? (
                      <>
                        <button
                          type="button"
                          className={inspectorTab === 'overview' ? 'is-active' : undefined}
                          onClick={() => setInspectorTab('overview')}
                        >
                          Overview
                        </button>
                        <button
                          type="button"
                          className={inspectorTab === 'headers' ? 'is-active' : undefined}
                          onClick={() => setInspectorTab('headers')}
                        >
                          Headers
                        </button>
                        <button
                          type="button"
                          className={inspectorTab === 'body' ? 'is-active' : undefined}
                          onClick={() => setInspectorTab('body')}
                        >
                          Body
                        </button>
                      </>
                    ) : null}
                    {showPromotePanel ? (
                      <button
                        type="button"
                        className={inspectorTab === 'promote' ? 'is-active' : undefined}
                        onClick={() => setInspectorTab('promote')}
                      >
                        {promoteIntent === 'collection' ? 'Collection' : 'Save'}
                      </button>
                    ) : null}
                  </div>

                  <div className="capture-inspector-body" data-tab={inspectorTabLabel(inspectorTab, promoteIntent)}>
                    {inspectorTab === 'promote' && showPromotePanel ? (
                      <div className="capture-promote-stack">
                        <div className="capture-promote-banner">
                          <strong>{selectedCount}</strong>
                          <span>
                            {promoteIntent === 'collection'
                              ? ' requests will be saved into the workspace, then appended to the chosen collection.'
                              : ' requests will be saved into workspace Requests.'}
                          </span>
                        </div>

                        <Select
                          label="Conflict strategy"
                          value={props.exportStrategy}
                          data={[
                            { value: 'append', label: 'Append parallel copies' },
                            { value: 'replace', label: 'Replace same-name requests' }
                          ]}
                          onChange={value => value && props.onExportStrategyChange(value as 'append' | 'replace')}
                        />

                        {promoteIntent === 'collection' ? (
                          <>
                            <Select
                              label="Collection target"
                              value={props.collectionTargetMode}
                              data={[
                                { value: 'existing', label: 'Append to existing Collection' },
                                { value: 'new', label: 'Create a new Collection' }
                              ]}
                              onChange={value => value && props.onCollectionTargetModeChange(value as 'existing' | 'new')}
                            />

                            {props.collectionTargetMode === 'existing' ? (
                              <Select
                                label="Existing collection"
                                placeholder="Choose a collection"
                                value={props.selectedCollectionId}
                                data={props.workspace.collections.map(item => ({
                                  value: item.document.id,
                                  label: item.document.name
                                }))}
                                onChange={value => props.onSelectCollection(value)}
                              />
                            ) : (
                              <TextInput
                                label="New collection name"
                                placeholder="Captured Flow"
                                value={props.newCollectionName}
                                onChange={event => props.onNewCollectionNameChange(event.currentTarget.value)}
                              />
                            )}
                          </>
                        ) : null}

                        <div className="capture-promote-actions">
                          <Button size="xs" variant="default" onClick={closePromotePanel}>
                            Cancel
                          </Button>
                          {promoteIntent === 'collection' ? (
                            <Button size="xs" loading={props.isExporting} onClick={props.onAddToCollection}>
                              Add to Collection
                            </Button>
                          ) : (
                            <Button size="xs" loading={props.isExporting} onClick={props.onSaveRequests}>
                              Save as Requests
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {inspectorTab === 'overview' && props.selectedEntry ? (
                      <div className="capture-detail-stack">
                        <div className="capture-detail-grid">
                          <div className="capture-detail-block">
                            <span className="capture-detail-label">Request</span>
                            <strong>{props.selectedEntry.method.toUpperCase()} {props.selectedEntry.path || '/'}</strong>
                            <span className="capture-detail-muted">{props.selectedEntry.host}</span>
                          </div>
                          <div className="capture-detail-block">
                            <span className="capture-detail-label">Captured at</span>
                            <strong>{new Date(props.selectedEntry.startedAtMs).toLocaleString()}</strong>
                            <span className="capture-detail-muted">
                              {props.selectedEntry.durationMs != null ? `${props.selectedEntry.durationMs} ms` : 'Pending'}
                            </span>
                          </div>
                        </div>

                        <div className="capture-detail-block">
                          <span className="capture-detail-label">Target</span>
                          <strong>{props.selectedEntry.targetTitle || props.selectedEntry.targetId}</strong>
                          <span className="capture-detail-muted">{props.selectedEntry.targetUrl || 'No target URL'}</span>
                        </div>

                        <div className="capture-detail-block is-url">
                          <span className="capture-detail-label">URL</span>
                          <Code block className="capture-code-block">
                            {props.selectedEntry.url}
                          </Code>
                        </div>
                      </div>
                    ) : null}

                    {inspectorTab === 'headers' && props.selectedEntry ? (
                      <div className="capture-detail-grid capture-detail-grid-headers">
                        <div className="capture-detail-block">
                          <span className="capture-detail-label">Request Headers</span>
                          {headerPreview(props.selectedEntry.requestHeaders, 'No request headers captured.')}
                        </div>
                        <div className="capture-detail-block">
                          <span className="capture-detail-label">Response Headers</span>
                          {headerPreview(props.selectedEntry.responseHeaders, 'No response headers captured.')}
                        </div>
                      </div>
                    ) : null}

                    {inspectorTab === 'body' && props.selectedEntry ? (
                      <div className="capture-detail-stack">
                        <div className="capture-detail-block">
                          <span className="capture-detail-label">Request Body</span>
                          <Code block className="capture-code-block">
                            {props.selectedEntry.requestBodyText || 'No request body captured'}
                          </Code>
                          {props.selectedEntry.requestBodyTruncated ? (
                            <Text size="xs" c="dimmed">Request body was truncated to keep the session responsive.</Text>
                          ) : null}
                        </div>

                        <div className="capture-detail-block">
                          <span className="capture-detail-label">Response Body</span>
                          <Code block className="capture-code-block">
                            {props.selectedEntry.responseBodyText || props.selectedEntry.errorText || 'No response body captured'}
                          </Code>
                          {props.selectedEntry.responseBodyTruncated ? (
                            <Text size="xs" c="dimmed">Response body was truncated at the 1 MB text cap.</Text>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}
