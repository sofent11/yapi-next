import { create } from 'zustand';
import {
  createDefaultEnvironment,
  createEmptyCase,
  createEmptyRequest,
  type CaseDocument,
  type CheckResult,
  type EnvironmentDocument,
  type ImportAuth,
  type ImportResult,
  type ProjectDocument,
  type RequestDocument,
  type ScriptLog,
  type SendRequestResult,
  type WorkspaceIndex
} from '@yapi-debugger/schema';

export type SelectedNode =
  | { kind: 'project' }
  | { kind: 'category'; path: string }
  | { kind: 'request'; requestId: string }
  | { kind: 'case'; requestId: string; caseId: string };

export function nodeToId(node: SelectedNode): string {
  switch (node.kind) {
    case 'project':
      return 'project';
    case 'category':
      return `category:${node.path}`;
    case 'request':
      return `request:${node.requestId}`;
    case 'case':
      return `case:${node.requestId}:${node.caseId}`;
  }
}

export type RequestTab = 'query' | 'headers' | 'body' | 'auth' | 'checks' | 'scripts' | 'settings' | 'preview';
export type ResponseTab = 'preview' | 'body' | 'headers' | 'json' | 'cookies' | 'compare' | 'raw';

export type WorkspaceUiState = {
  treeWidth: number;
  isTreeCollapsed: boolean;
  mainSplitRatio: number;
  expandedRequestIds: string[];
  lastSelectedNode: SelectedNode;
  activeRequestTab: RequestTab;
  activeResponseTab: ResponseTab;
  openTabs: SelectedNode[];
};

export function defaultWorkspaceUiState(): WorkspaceUiState {
  return {
    treeWidth: 316,
    isTreeCollapsed: false,
    mainSplitRatio: 0.5,
    expandedRequestIds: [],
    lastSelectedNode: { kind: 'project' },
    activeRequestTab: 'query',
    activeResponseTab: 'body',
    openTabs: [{ kind: 'project' }]
  };
}

type WorkspaceStore = {
  workspace: WorkspaceIndex | null;
  selectedNode: SelectedNode;
  openTabs: SelectedNode[];
  activeEnvironmentName: string;
  recentRoots: string[];
  importPreview: ImportResult | null;
  importAuth: ImportAuth;
  response: SendRequestResult | null;
  checkResults: CheckResult[];
  scriptLogs: ScriptLog[];
  requestError: string | null;
  draftProject: ProjectDocument | null;
  draftRequest: RequestDocument | null;
  draftCases: CaseDocument[];
  isDirty: boolean;
  searchText: string;
  setWorkspace: (workspace: WorkspaceIndex | null) => void;
  setRecentRoots: (roots: string[]) => void;
  selectNode: (node: SelectedNode) => void;
  openTab: (node: SelectedNode) => void;
  closeTab: (nodeToClose: SelectedNode) => void;
  setActiveEnvironment: (name: string) => void;
  setImportPreview: (preview: ImportResult | null) => void;
  setImportAuth: (auth: ImportAuth) => void;
  updateProject: (project: ProjectDocument) => void;
  updateRequest: (request: RequestDocument) => void;
  updateCaseList: (cases: CaseDocument[]) => void;
  updateEnvironment: (name: string, updater: (environment: EnvironmentDocument) => EnvironmentDocument) => void;
  addDraftCase: () => void;
  setResponse: (response: SendRequestResult | null, checkResults?: CheckResult[], scriptLogs?: ScriptLog[]) => void;
  setError: (error: string | null) => void;
  setSearchText: (text: string) => void;
  setOpenTabs: (tabs: SelectedNode[]) => void;
};

function defaultImportAuth(): ImportAuth {
  return {
    mode: 'none',
    token: '',
    key: '',
    value: ''
  };
}

function findRecord(workspace: WorkspaceIndex | null, requestId: string | null) {
  if (!workspace || !requestId) return null;
  return workspace.requests.find(item => item.request.id === requestId) || null;
}

function categoryExists(workspace: WorkspaceIndex | null, path: string) {
  if (!workspace) return false;
  return workspace.requests.some(record => {
    const value = record.folderSegments.join('/');
    return value === path || value.startsWith(`${path}/`);
  });
}

function requestExists(workspace: WorkspaceIndex | null, requestId: string) {
  return Boolean(findRecord(workspace, requestId));
}

function caseExists(workspace: WorkspaceIndex | null, requestId: string, caseId: string) {
  const record = findRecord(workspace, requestId);
  return Boolean(record?.cases.some(item => item.id === caseId));
}

function normalizeSelection(workspace: WorkspaceIndex | null, node: SelectedNode | null | undefined): SelectedNode {
  if (!workspace) return { kind: 'project' };
  if (!node) return { kind: 'project' };

  switch (node.kind) {
    case 'project':
      return node;
    case 'category':
      return categoryExists(workspace, node.path) ? node : { kind: 'project' };
    case 'request':
      return requestExists(workspace, node.requestId) ? node : { kind: 'project' };
    case 'case':
      if (caseExists(workspace, node.requestId, node.caseId)) return node;
      if (requestExists(workspace, node.requestId)) {
        return { kind: 'request', requestId: node.requestId };
      }
      return { kind: 'project' };
    default:
      return { kind: 'project' };
  }
}

function draftStateForSelection(workspace: WorkspaceIndex | null, node: SelectedNode) {
  if (!workspace) {
    return {
      draftProject: null,
      draftRequest: null,
      draftCases: []
    };
  }

  if (node.kind === 'request' || node.kind === 'case') {
    const requestId = node.requestId;
    const record = findRecord(workspace, requestId);
    return {
      draftProject: workspace.project,
      draftRequest: record?.request || null,
      draftCases: record?.cases || []
    };
  }

  return {
    draftProject: workspace.project,
    draftRequest: null,
    draftCases: []
  };
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspace: null,
  selectedNode: { kind: 'project' },
  openTabs: [{ kind: 'project' }],
  activeEnvironmentName: 'shared',
  recentRoots: [],
  importPreview: null,
  importAuth: defaultImportAuth(),
  response: null,
  checkResults: [],
  scriptLogs: [],
  requestError: null,
  draftProject: null,
  draftRequest: null,
  draftCases: [],
  isDirty: false,
  searchText: '',
  setWorkspace(workspace) {
    const previousSelection = get().selectedNode;
    const previousEnvironment = get().activeEnvironmentName;
    const selectedNode = normalizeSelection(workspace, previousSelection);
    const draft = draftStateForSelection(workspace, selectedNode);
    const activeEnvironmentName =
      workspace?.environments.some(item => item.document.name === previousEnvironment)
        ? previousEnvironment
        : workspace?.project.defaultEnvironment || 'shared';

    set({
      workspace,
      selectedNode,
      openTabs: [selectedNode],
      activeEnvironmentName,
      draftProject: draft.draftProject,
      draftRequest: draft.draftRequest,
      draftCases: draft.draftCases,
      isDirty: false,
      response: null,
      checkResults: [],
      scriptLogs: [],
      requestError: null,
      searchText: ''
    });
  },
  setRecentRoots(roots) {
    set({ recentRoots: roots });
  },
  selectNode(node) {
    const workspace = get().workspace;
    const selectedNode = normalizeSelection(workspace, node);
    const draft = draftStateForSelection(workspace, selectedNode);
    const openTabs = get().openTabs;
    const alreadyOpen = openTabs.some(t => nodeToId(t) === nodeToId(selectedNode));
    
    set({
      selectedNode,
      openTabs: alreadyOpen ? openTabs : [...openTabs, selectedNode],
      draftProject: draft.draftProject,
      draftRequest: draft.draftRequest,
      draftCases: draft.draftCases,
      isDirty: false,
      response: null,
      checkResults: [],
      scriptLogs: [],
      requestError: null
    });
  },
  openTab(node) {
    get().selectNode(node);
  },
  closeTab(nodeToClose) {
    const openTabs = get().openTabs;
    const selectedNode = get().selectedNode;
    const nextTabs = openTabs.filter(t => nodeToId(t) !== nodeToId(nodeToClose));
    
    if (nextTabs.length === 0) {
      nextTabs.push({ kind: 'project' });
    }

    if (nodeToId(selectedNode) === nodeToId(nodeToClose)) {
      const closingIndex = openTabs.findIndex(t => nodeToId(t) === nodeToId(nodeToClose));
      const nextActive = nextTabs[closingIndex] || nextTabs[nextTabs.length - 1];
      get().selectNode(nextActive);
    }
    
    set({ openTabs: nextTabs });
  },
  setOpenTabs(tabs) {
    set({ openTabs: tabs });
  },
  setActiveEnvironment(name) {
    set({ activeEnvironmentName: name });
  },
  setImportPreview(preview) {
    set({ importPreview: preview });
  },
  setImportAuth(auth) {
    set({ importAuth: auth });
  },
  updateProject(project) {
    set({ draftProject: project, isDirty: true });
  },
  updateRequest(request) {
    set({ draftRequest: request, isDirty: true });
  },
  updateCaseList(cases) {
    set({ draftCases: cases, isDirty: true });
  },
  updateEnvironment(name, updater) {
    const workspace = get().workspace;
    if (!workspace) return;
    set({
      workspace: {
        ...workspace,
        environments: workspace.environments.map(item =>
          item.document.name === name
            ? {
                ...item,
                document: updater(item.document)
              }
            : item
        )
      },
      isDirty: true
    });
  },
  addDraftCase() {
    const request = get().draftRequest || createEmptyRequest();
    const nextCase = createEmptyCase(request.id, `Case ${get().draftCases.length + 1}`);
    set({
      draftCases: [...get().draftCases, nextCase],
      selectedNode: { kind: 'case', requestId: request.id, caseId: nextCase.id },
      isDirty: true
    });
  },
  setResponse(response, checkResults = [], scriptLogs = []) {
    set({ response, checkResults, scriptLogs, requestError: null });
  },
  setError(error) {
    set({ requestError: error, response: null, checkResults: [], scriptLogs: [] });
  },
  setSearchText(text) {
    set({ searchText: text });
  }
}));

export function ensureWorkspaceEnvironment(name: string, workspace: WorkspaceIndex | null) {
  return workspace?.environments.find(item => item.document.name === name)?.document || createDefaultEnvironment(name);
}
