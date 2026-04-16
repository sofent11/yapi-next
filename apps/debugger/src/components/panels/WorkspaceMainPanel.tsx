import { useMemo, useRef } from 'react';
import { Badge, Button, Select, Text, TextInput } from '@mantine/core';
import {
  IconAlertTriangle,
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
  SendRequestResult,
  WorkspaceIndex
} from '@yapi-debugger/schema';
import type { RequestTab, ResponseTab, SelectedNode } from '../../store/workspace-store';
import { KeyValueEditor } from '../primitives/KeyValueEditor';
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
  requestPreview: ResolvedRequestPreview | null;
  checkResults: CheckResult[];
  cases: CaseDocument[];
  activeEnvironmentName: string;
  selectedEnvironment: EnvironmentDocument | null;
  isRunning: boolean;
  isDirty: boolean;
  activeRequestTab: RequestTab;
  activeResponseTab: ResponseTab;
  selectedExampleName: string | null;
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
  onRequestTabChange: (tab: RequestTab) => void;
  onResponseTabChange: (tab: ResponseTab) => void;
  onSelectExample: (name: string | null) => void;
  onCopyBody: () => void;
  onCopyCurl: () => void;
  onSaveExample: () => void;
  onReplaceExample: () => void;
  onMainSplitRatioChange: (ratio: number) => void;
}) {
  const splitRef = useRef<HTMLDivElement | null>(null);
  const counts = useMemo(() => projectCounts(props.workspace), [props.workspace]);
  const request = props.request;
  const caseId = selectedCaseId(props.selectedNode);
  const selectedCase = props.cases.find(item => item.id === caseId) || null;
  const breadcrumbs = projectBreadcrumbs(props.workspace.project, props.selectedNode, request);

  function startMainSplitResize(event: React.MouseEvent<HTMLDivElement>) {
    const container = splitRef.current;
    if (!container) return;
    event.preventDefault();
    const bounds = container.getBoundingClientRect();

    function handleMove(moveEvent: MouseEvent) {
      const nextRatio = (moveEvent.clientX - bounds.left) / bounds.width;
      props.onMainSplitRatioChange(Math.max(0.3, Math.min(0.7, nextRatio)));
    }

    function handleUp() {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    }

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
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
          <Select
            size="xs"
            value={props.activeEnvironmentName}
            data={props.workspace.environments.map(item => ({ value: item.document.name, label: item.document.name }))}
            onChange={value => value && props.onEnvironmentChange(value)}
            variant="unstyled"
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
              <span>Cases</span>
              <strong>{counts.cases}</strong>
            </div>
          </div>

          <div className="inspector-section danger-section">
            <div className="danger-section-copy">
              <h3 className="section-title">Danger Zone</h3>
              <Text c="dimmed" size="sm">
                删除整个项目会移除当前 workspace 目录下的所有调试数据，包括分类、接口和用例。这是不可恢复操作。
              </Text>
            </div>
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconAlertTriangle size={14} />}
              onClick={props.onDeleteProject}
            >
              删除整个项目
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
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={props.onCreateInterface}>
            New Interface
          </Button>
        )}

        <div className="category-workbench">
          <div className="category-header">
            <h3 className="section-title">{categoryLabel(props.selectedNode.path)}</h3>
            <Text c="dimmed" size="xs">Overview of all endpoints in this category.</Text>
          </div>

          <div className="category-table">
            {props.categoryRequests.map(record => (
              <div
                key={record.request.id}
                className="category-row"
                onClick={() => props.onSelectRequest(record.request.id)}
              >
                <span className={`tree-method-pill method-${record.request.method.toLowerCase()}`}>{record.request.method}</span>
                <div className="tree-row-copy">
                  <strong>{record.request.name}</strong>
                  <span>{record.request.path || record.request.url || '/'}</span>
                </div>
                <span className="category-row-meta">{record.cases.length} cases</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!request) {
    return (
      <section className="workspace-main">
        <div className="empty-response-state" style={{ height: '100vh' }}>
          <div>
            <Text fw={600} ta="center">Select an endpoint to start debugging</Text>
            <Text c="dimmed" size="xs" ta="center">Endpoints and cases will be edited in this workbench.</Text>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-main">
      {renderToolbar(
        <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={props.onAddCase}>
          New Case
        </Button>
      )}

      <div
        ref={splitRef}
        className="workbench-split"
        style={{
          gridTemplateColumns: `minmax(0, ${props.mainSplitRatio}fr) 1px minmax(320px, ${1 - props.mainSplitRatio}fr)`
        }}
      >
        <div className="pane-surface">
          <RequestPanel
            workspace={props.workspace}
            selectedEnvironment={props.selectedEnvironment}
            request={request}
            selectedCase={selectedCase}
            activeTab={props.activeRequestTab}
            isRunning={props.isRunning}
            isDirty={props.isDirty}
            cases={props.cases}
            onTabChange={props.onRequestTabChange}
            onRequestChange={props.onRequestChange}
            onCasesChange={props.onCasesChange}
            onRun={props.onRun}
            onSave={props.onSave}
          />
        </div>

        <div className="pane-resizer" onMouseDown={startMainSplitResize} />

        <div className="pane-surface">
          <ResponsePanel
            response={props.response}
            requestPreview={props.requestPreview}
            requestDocument={request}
            checkResults={props.checkResults}
            selectedExampleName={props.selectedExampleName}
            activeTab={props.activeResponseTab}
            onTabChange={props.onResponseTabChange}
            onSelectExample={props.onSelectExample}
            onCopyBody={props.onCopyBody}
            onCopyCurl={props.onCopyCurl}
            onSaveExample={props.onSaveExample}
            onReplaceExample={props.onReplaceExample}
          />
        </div>
      </div>
    </section>
  );
}
