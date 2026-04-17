import { useMemo, useRef } from 'react';
import { Badge, Button, Select, Text, TextInput } from '@mantine/core';
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
  ProjectDocument,
  RequestDocument,
  ResolvedRequestPreview,
  ScriptLog,
  SendRequestResult,
  SessionSnapshot,
  WorkspaceIndex
} from '@yapi-debugger/schema';
import type { RequestTab, ResponseTab, SelectedNode } from '../../store/workspace-store';
import { KeyValueEditor } from '../primitives/KeyValueEditor';
import { Resizer } from '../primitives/Resizer';
import { RequestPanel } from './RequestPanel';
import { ResponsePanel } from './ResponsePanel';

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
  const categorySet = new Set(workspace.requests.map(item => item.folderSegments.join('/')).filter(Boolean));
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
  categoryRequests: WorkspaceIndex['requests'];
  draftProject: ProjectDocument | null;
  request: RequestDocument | null;
  response: SendRequestResult | null;
  requestError: string | null;
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
  onCopyToScratch: () => void;
  onRequestTabChange: (tab: RequestTab) => void;
  onResponseTabChange: (tab: ResponseTab | 'json' | 'cookies' | 'compare') => void;
  onSelectExample: (name: string | null) => void;
  onCopyBody: () => void;
  onCopyCurl: () => void;
  onSaveExample: () => void;
  onReplaceExample: () => void;
  onRefreshSession: () => void;
  onClearSession: () => void;
  onCreateCheck: (input: any) => void;
  onCreateCaseFromResponse: () => void;
  onMainSplitRatioChange: (ratio: number) => void;
}) {
  const splitRef = useRef<HTMLDivElement | null>(null);
  const counts = useMemo(() => projectCounts(props.workspace), [props.workspace]);
  const request = props.request;
  const caseId = selectedCaseId(props.selectedNode);
  const selectedCase = props.cases.find(item => item.id === caseId) || null;
  const breadcrumbs = projectBreadcrumbs(props.workspace.project, props.selectedNode, request);

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
          <Select
            size="xs"
            value={props.activeEnvironmentName}
            data={props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))}
            onChange={value => value && props.onEnvironmentChange(value)}
            style={{ width: 120 }}
          />
          {actions}
        </div>
      </div>
    );
  }

  if (props.selectedNode.kind === 'project' && props.draftProject) {
    const project = props.draftProject;
    return (
      <section className="workspace-main">
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
        {renderToolbar(
          <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={props.onCreateInterface}>
            New Request
          </Button>
        )}

        <div className="category-workbench">
          <div className="category-header">
            <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase' }}>Category</Text>
            <h1 className="section-title">{categoryLabel(props.selectedNode.path)}</h1>
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
            <h2 className="section-title" style={{ fontSize: '1.2rem', marginBottom: 8 }}>Select an API</h2>
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
      {renderToolbar(
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="xs" variant="default" onClick={props.onCopyToScratch}>
            Copy To Scratch
          </Button>
          <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => props.onAddCase()}>
            New Case
          </Button>
          <Button
            size="xs"
            variant="filled"
            leftSection={<IconDeviceFloppy size={14} />}
            onClick={props.onSave}
            disabled={!props.isDirty}
          >
            Save
          </Button>
        </div>
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
            selectedEnvironment={props.selectedEnvironment}
            request={request!}
            selectedCase={selectedCase}
            activeTab={props.activeRequestTab}
            isRunning={props.isRunning}
            isDirty={props.isDirty}
            cases={props.cases}
            onTabChange={props.onRequestTabChange}
            onRequestChange={props.onRequestChange}
            onCasesChange={props.onCasesChange}
            onAddCase={props.onAddCase}
            onRun={props.onRun}
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
            onSaveExample={props.onSaveExample}
            onReplaceExample={props.onReplaceExample}
            onRefreshSession={props.onRefreshSession}
            onClearSession={props.onClearSession}
            onCreateCheck={props.onCreateCheck}
            onCreateCaseFromResponse={props.onCreateCaseFromResponse}
          />
        </div>
      </div>
    </section>
  );
}
