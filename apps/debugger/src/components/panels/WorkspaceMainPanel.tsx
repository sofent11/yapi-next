import { useMemo, useRef } from 'react';
import { Badge, Button, Group, Select, Text, TextInput } from '@mantine/core';
import {
  IconAlertTriangle,
  IconApi,
  IconDeviceFloppy,
  IconPlus
} from '@tabler/icons-react';
import type {
  CaseDocument,
  CheckResult,
  EnvironmentDocument,
  ParameterRow,
  ProjectDocument,
  RequestDocument,
  ResolvedRequestInsight,
  ResolvedRequestPreview,
  ScriptLog,
  SendRequestResult,
  SessionSnapshot,
  WorkspaceIndex
} from '@yapi-debugger/schema';
import type { RequestTab, ResponseTab, SelectedNode } from '../../store/workspace-store';
import { CodeEditor } from '../editors/CodeEditor';
import { KeyValueEditor } from '../primitives/KeyValueEditor';
import { Resizer } from '../primitives/Resizer';
import { RequestPanel } from './RequestPanel';
import { ResponsePanel } from './ResponsePanel';
import type { GitStatusPayload } from '../../lib/desktop';
import { TabHeader } from '../layout/TabHeader';

function categoryLabel(path: string | null) {
  if (!path) return 'Project';
  return path.split('/').at(-1) || path;
}

function selectedCaseId(node: SelectedNode) {
  return node.kind === 'case' ? node.caseId : null;
}

function projectBreadcrumbs(project: ProjectDocument, selectedNode: SelectedNode, request: RequestDocument | null) {
  if (selectedNode.kind === 'project') return [project.name, 'Settings'];
  if (selectedNode.kind === 'category') return [project.name, categoryLabel(selectedNode.path)];
  if (selectedNode.kind === 'case') {
    return [project.name, request?.name || 'API', 'Case'];
  }
  return [project.name, request?.name || 'API'];
}

function projectCounts(workspace: WorkspaceIndex) {
  const categorySet = new Set([
    ...workspace.requests.map(item => item.folderSegments.join('/')).filter(Boolean),
    ...workspace.folders.map(item => item.path).filter(Boolean)
  ]);
  const caseTotal = workspace.requests.reduce((total, item) => total + item.cases.length, 0);
  return {
    categories: categorySet.size,
    requests: workspace.requests.length,
    cases: caseTotal
  };
}

export function WorkspaceMainPanel(props: {
  workspace: WorkspaceIndex;
  selectedNode: SelectedNode;
  openTabs: SelectedNode[];
  categoryRequests: WorkspaceIndex['requests'];
  categoryVariableRows: ParameterRow[];
  categoryVariablesDirty: boolean;
  draftProject: ProjectDocument | null;
  request: RequestDocument | null;
  response: SendRequestResult | null;
  requestError: string | null;
  requestInsight: ResolvedRequestInsight | null;
  requestPreview: ResolvedRequestPreview | null;
  checkResults: CheckResult[];
  scriptLogs: ScriptLog[];
  cases: CaseDocument[];
  activeEnvironmentName: string;
  selectedEnvironment: EnvironmentDocument | null;
  isRunning: boolean;
  isDirty: boolean;
  activeRequestTab: RequestTab;
  activeResponseTab: ResponseTab | 'json' | 'cookies' | 'compare';
  selectedExampleName: string | null;
  sessionSnapshot: SessionSnapshot | null;
  mainSplitRatio: number;
  gitStatus?: GitStatusPayload | null;
  selectedGitDiffFile?: string | null;
  gitDiffText?: string;
  gitDiffLoading?: boolean;
  gitDiffError?: string | null;
  onProjectChange: (project: ProjectDocument) => void;
  onDeleteProject: () => void;
  onEnvironmentChange: (name: string) => void;
  onEnvironmentUpdate: (name: string, updater: (environment: EnvironmentDocument) => EnvironmentDocument) => void;
  onRequestChange: (request: RequestDocument) => void;
  onCasesChange: (cases: CaseDocument[]) => void;
  onCaseSelect: (caseId: string | null) => void;
  onAddCase: () => void;
  onRun: () => void;
  onSave: () => void;
  onSelectRequest: (requestId: string) => void;
  onOpenImport: () => void;
  onCreateInterface: () => void;
  onCategoryVariablesChange: (rows: ParameterRow[]) => void;
  onSaveCategoryVariables: () => void;
  onCopyToScratch: () => void;
  onRequestTabChange: (tab: RequestTab) => void;
  onResponseTabChange: (tab: ResponseTab | 'json' | 'cookies' | 'compare') => void;
  onSelectExample: (name: string | null) => void;
  onCopyBody: () => void;
  onCopyCurl: () => void;
  onCopyBruno: () => void;
  onReplaceExample: () => void;
  onSaveAs?: () => void;
  onRefreshSession: () => void;
  onClearSession: () => void;
  onCreateCheck: (input: any) => void;
  onCreateCaseFromResponse: () => void;
  onAddToCollection: () => void;
  onMainSplitRatioChange: (ratio: number) => void;
  onSaveAuthProfile?: (name: string, auth: any) => void;
  onRefreshRequestAuth?: () => void;
  onExtractValue?: (target: 'local' | 'runtime', input: { suggestedName: string; value: string }) => void;
  onRefreshGitStatus?: () => void;
  onCopySuggestedCommitMessage?: () => void;
  onGitPull?: () => void;
  onGitPush?: () => void;
  onSelectGitDiff?: (path: string) => void;
  onOpenTerminal?: () => void;
  onTabSelect: (node: SelectedNode) => void;
  onTabClose: (node: SelectedNode) => void;
}) {
  const splitRef = useRef<HTMLDivElement | null>(null);
  const counts = useMemo(() => projectCounts(props.workspace), [props.workspace]);
  const request = props.request;
  const caseId = selectedCaseId(props.selectedNode);
  const selectedCase = props.cases.find(item => item.id === caseId) || null;
  const breadcrumbs = projectBreadcrumbs(props.workspace.project, props.selectedNode, request);

  function renderTabHeader() {
    return (
      <TabHeader
        workspace={props.workspace}
        tabs={props.openTabs}
        activeNode={props.selectedNode}
        onSelect={props.onTabSelect}
        onClose={props.onTabClose}
      />
    );
  }

  function renderToolbar(actions?: React.ReactNode) {
    return (
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          {breadcrumbs.map(item => (
            <span key={item} className="breadcrumb-chip">
              {item}
            </span>
          ))}
        </div>
        <div className="panel-toolbar-actions">
          {props.isDirty && <Badge color="orange" variant="filled" size="xs">Unsaved</Badge>}
          {actions}
        </div>
      </div>
    );
  }

  if (props.selectedNode.kind === 'project' && props.draftProject) {
    const project = props.draftProject;
    return (
      <section className="workspace-main">
        {renderTabHeader()}
        {renderToolbar(
          <Button size="xs" variant="filled" leftSection={<IconDeviceFloppy size={14} />} onClick={props.onSave}>
            Save Project
          </Button>
        )}

        <div className="project-inspector">
          <div className="inspector-section">
            <h3 className="section-title">Project Settings</h3>
            <div className="form-grid form-grid-2">
              <TextInput
                label="Project Name"
                value={project.name}
                onChange={event => props.onProjectChange({ ...project, name: event.currentTarget.value })}
              />
              <Select
                label="Default Environment"
                value={project.defaultEnvironment}
                data={props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))}
                onChange={value => value && props.onProjectChange({ ...project, defaultEnvironment: value })}
              />
            </div>
            <TextInput
              label="Base URL"
              value={project.runtime.baseUrl}
              placeholder="https://api.example.com"
              onChange={event =>
                props.onProjectChange({
                  ...project,
                  runtime: { ...project.runtime, baseUrl: event.currentTarget.value }
                })
              }
            />
          </div>

          <div className="inspector-section">
            <h3 className="section-title">Shared Variables</h3>
            <KeyValueEditor
              rows={Object.entries(project.runtime.vars).map(([name, value]) => ({ name, value, enabled: true, kind: 'text' as const }))}
              onChange={rows =>
                props.onProjectChange({
                  ...project,
                  runtime: {
                    ...project.runtime,
                    vars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                  }
                })
              }
            />
          </div>

          <div className="inspector-summary-grid">
            <div className="summary-tile">
              <span>Categories</span>
              <strong>{counts.categories}</strong>
            </div>
            <div className="summary-tile">
              <span>Endpoints</span>
              <strong>{counts.requests}</strong>
            </div>
            <div className="summary-tile">
              <span>Test Cases</span>
              <strong>{counts.cases}</strong>
            </div>
          </div>

          <div className="inspector-section">
            <div className="checks-head">
              <h3 className="section-title">Git Helper</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="xs" variant="default" onClick={props.onRefreshGitStatus}>Refresh</Button>
                <Button size="xs" variant="default" onClick={props.onOpenTerminal}>Open Terminal</Button>
                <Button size="xs" variant="default" onClick={props.onCopySuggestedCommitMessage}>
                  Copy Commit Message
                </Button>
                <Button size="xs" variant="default" onClick={props.onGitPull}>Pull</Button>
                <Button size="xs" variant="default" onClick={props.onGitPush}>Push</Button>
              </div>
            </div>
            {props.gitStatus?.isRepo ? (
              <>
                <div className="summary-grid" style={{ marginTop: 12 }}>
                  <div className="summary-chip">
                    <span>Branch</span>
                    <strong>{props.gitStatus.branch || 'detached'}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Dirty</span>
                    <strong>{props.gitStatus.dirty ? props.gitStatus.changedFiles.length : 0}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Ahead</span>
                    <strong>{props.gitStatus.ahead}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Behind</span>
                    <strong>{props.gitStatus.behind}</strong>
                  </div>
                </div>
                <div className="checks-list" style={{ marginTop: 12 }}>
                  {props.gitStatus.changedFiles.length > 0 ? (
                    props.gitStatus.changedFiles.slice(0, 12).map(file => (
                      <button
                        key={file}
                        type="button"
                        className="check-result-row"
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: '1px solid transparent',
                          background: props.selectedGitDiffFile === file ? 'var(--accent-soft)' : 'transparent',
                          borderRadius: 8,
                          cursor: 'pointer'
                        }}
                        onClick={() => props.onSelectGitDiff?.(file)}
                      >
                        <div className="tree-row-copy">
                          <strong>{file.split('/').at(-1)}</strong>
                          <span>{file}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="empty-tab-state">Working tree is clean.</div>
                  )}
                </div>
                {props.selectedGitDiffFile ? (
                  <div className="check-card" style={{ marginTop: 12 }}>
                    <Group justify="space-between">
                      <Text fw={700}>Visual Diff</Text>
                      <Badge variant="light" color="indigo">{props.selectedGitDiffFile}</Badge>
                    </Group>
                    {props.gitDiffError ? (
                      <div className="empty-tab-state">{props.gitDiffError}</div>
                    ) : (
                      <>
                        <Text size="xs" c="dimmed" mb={8}>
                          {props.gitDiffLoading ? 'Loading diff…' : 'Inspect the current diff without leaving the debugger.'}
                        </Text>
                        <CodeEditor
                          value={props.gitDiffText || ''}
                          readOnly
                          language="text"
                          minHeight="220px"
                        />
                      </>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-tab-state" style={{ marginTop: 12 }}>This workspace is not inside a Git repository.</div>
            )}
          </div>

          <div className="inspector-section danger-section" style={{ marginTop: 40 }}>
            <div className="danger-section-copy">
              <Text fw={700} c="red">Danger Zone</Text>
              <Text size="xs" c="dimmed">
                Deleting the project will remove all debug data from the current workspace directory, including categories, requests, and cases. This is irreversible.
              </Text>
            </div>
            <Button color="red" variant="light" leftSection={<IconAlertTriangle size={14} />} onClick={props.onDeleteProject}>
              Delete Project
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (props.selectedNode.kind === 'category') {
    return (
      <section className="workspace-main">
        {renderTabHeader()}
        {renderToolbar(
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              size="xs"
              variant="filled"
              leftSection={<IconDeviceFloppy size={14} />}
              onClick={props.onSaveCategoryVariables}
              disabled={!props.categoryVariablesDirty}
            >
              Save Variables
            </Button>
            <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={props.onCreateInterface}>
              New Request
            </Button>
          </div>
        )}

        <div className="category-workbench">
          <div className="category-header">
            <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase' }}>Category</Text>
            <h1 className="section-title">{categoryLabel(props.selectedNode.path)}</h1>
          </div>

          <div className="check-card">
            <Text fw={700}>Folder Variables</Text>
            <Text size="xs" c="dimmed">
              These variables apply to requests in this category and nested categories. Deeper categories override duplicate keys.
            </Text>
            <KeyValueEditor
              rows={props.categoryVariableRows}
              onChange={props.onCategoryVariablesChange}
              nameLabel="Variable"
              valueLabel="Value"
            />
          </div>

          <div className="category-table">
            {props.categoryRequests.length > 0 ? (
              props.categoryRequests.map(record => (
                <button
                  key={record.request.id}
                  className="category-row"
                  onClick={() => props.onSelectRequest(record.request.id)}
                >
                  <span className={`tree-method-pill method-${record.request.method.toLowerCase()}`}>
                    {record.request.method}
                  </span>
                  <div className="tree-row-copy">
                    <strong>{record.request.name}</strong>
                    <span className="category-row-meta">{record.request.path || record.request.url}</span>
                  </div>
                </button>
              ))
            ) : (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Text size="sm" c="dimmed">No requests in this category.</Text>
                <Button variant="subtle" size="xs" mt="md" onClick={props.onCreateInterface}>Create your first request</Button>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (!request) {
    return (
      <section className="workspace-main" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {renderTabHeader()}
        {renderToolbar()}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: 'var(--muted)',
          gap: 20
        }}>
          <div style={{ 
            width: 80, 
            height: 80, 
            borderRadius: '50%', 
            background: 'var(--accent-soft)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'var(--accent)'
          }}>
            <IconApi size={40} stroke={1.5} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h2 className="section-title" style={{ fontSize: '1.2rem', marginBottom: 8 }}>Select a Request</h2>
            <Text size="sm" style={{ maxWidth: 320 }}>
              Choose a request from the sidebar to start debugging, or create a new one to begin.
            </Text>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            leftSection={<IconPlus size={16} />}
            onClick={props.onCreateInterface}
          >
            Create New Request
          </Button>
        </div>
      </section>
    );
  }

  return (
      <section className="workspace-main">
        {renderTabHeader()}
        {renderToolbar(
          <Button size="xs" variant="default" onClick={props.onCopyToScratch}>
            Copy To Scratch
          </Button>
        )}

      <div
        ref={splitRef}
        className="workbench-split"
        style={{
          gridTemplateColumns: `minmax(0, ${props.mainSplitRatio}fr) auto minmax(320px, ${1 - props.mainSplitRatio}fr)`
        }}
      >
        <div className="pane-surface">
          <RequestPanel
            workspace={props.workspace}
            activeEnvironmentName={props.activeEnvironmentName}
            selectedEnvironment={props.selectedEnvironment}
            request={request!}
            selectedCase={selectedCase}
            requestInsight={props.requestInsight}
            sessionSnapshot={props.sessionSnapshot}
            activeTab={props.activeRequestTab}
            isRunning={props.isRunning}
            isDirty={props.isDirty}
            cases={props.cases}
            onCaseSelect={props.onCaseSelect}
            onTabChange={props.onRequestTabChange}
            onRequestChange={props.onRequestChange}
            onCasesChange={props.onCasesChange}
            onAddCase={props.onAddCase}
            onRun={props.onRun}
            onSave={props.onSave}
            latestResponseOk={Boolean(props.response?.ok)}
            onSaveAsCase={props.onCreateCaseFromResponse}
            onAddToCollection={props.onAddToCollection}
            onSaveAuthProfile={props.onSaveAuthProfile}
            onRefreshRequestAuth={props.onRefreshRequestAuth}
            onCopyText={() => undefined}
          />
        </div>

        <Resizer
          containerRef={splitRef}
          onResizeRatio={props.onMainSplitRatioChange}
          minRatio={0.3}
          maxRatio={0.7}
        />

        <div className="pane-surface">
          <ResponsePanel
            response={props.response}
            requestError={props.requestError}
            requestPreview={props.requestPreview}
            requestDocument={request}
            checkResults={props.checkResults}
            scriptLogs={props.scriptLogs}
            sessionSnapshot={props.sessionSnapshot}
            selectedExampleName={props.selectedExampleName}
            activeTab={props.activeResponseTab}
            onTabChange={props.onResponseTabChange}
            onSelectExample={props.onSelectExample}
            onCopyBody={props.onCopyBody}
            onCopyCurl={props.onCopyCurl}
            onCopyBruno={props.onCopyBruno}
            onReplaceExample={props.onReplaceExample}
            onSaveAs={props.onSaveAs}
            onRefreshSession={props.onRefreshSession}
            onClearSession={props.onClearSession}
            onCreateCheck={props.onCreateCheck}
            onCreateCaseFromResponse={props.onCreateCaseFromResponse}
            onExtractValue={props.onExtractValue}
          />
        </div>
      </div>
    </section>
  );
}
