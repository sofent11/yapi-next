import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { ActionIcon, Badge, Drawer, Select, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { IconRefresh } from '@tabler/icons-react';
import { createEmptyCheck, createNamedTemplateSource, inspectResolvedRequest } from '@yapi-debugger/core';
import { createEmptyCase, createEmptyRequest, type AuthConfig, type CollectionDocument, type CollectionRunReport, type RunHistoryEntry, type SessionSnapshot, slugify, type WorkspaceIndex } from '@yapi-debugger/schema';
import {
  chooseDirectory,
  chooseImportFile,
  clearSession,
  deleteEntry,
  gitPull,
  gitPush,
  gitStatus,
  inspectSession,
  listenMenuActions,
  openTerminal,
  syncMenuState,
  unwatchWorkspace,
  watchWorkspace,
  type GitStatusPayload
} from './lib/desktop';
import {
  createCaseForRequest,
  createRequestInWorkspace,
  createWorkspace,
  buildImportPreviewSummary,
  appendRunHistoryEntry,
  clearCollectionRunReports,
  clearRunHistory,
  collectionReportSeed,
  createCollectionInWorkspace,
  curlForPreview,
  deleteCaseInWorkspace,
  deleteCategoryInWorkspace,
  deleteCollectionInWorkspace,
  deleteRequestInWorkspace,
  duplicateCaseInWorkspace,
  duplicateRequestInWorkspace,
  loadCollectionRunReports,
  loadRunHistory,
  importFromFile,
  importFromUrl,
  importIntoWorkspace,
  openWorkspace,
  renameCaseInWorkspace,
  renameCategoryInWorkspace,
  renameRequestInWorkspace,
  rerunFailedStepKeys,
  runCollection,
  runPreparedRequest,
  runResolvedRequest,
  saveCollectionRecord,
  saveRunHistory,
  saveEnvironment,
  saveProject,
  saveRequestRecord,
  saveScratchRequestToWorkspace
} from './lib/workspace';
import { AppRail, type AppRailView } from './components/panels/AppRail';
import { CollectionRunnerPanel } from './components/panels/CollectionRunnerPanel';
import { EnvironmentCenterPanel } from './components/panels/EnvironmentCenterPanel';
import { HistoryPanel } from './components/panels/HistoryPanel';
import { ImportPanel } from './components/panels/ImportPanel';
import { InterfaceTreePanel } from './components/panels/InterfaceTreePanel';
import { SessionCenterPanel } from './components/panels/SessionCenterPanel';
import { ScratchPadPanel } from './components/panels/ScratchPadPanel';
import { WelcomePanel } from './components/panels/WelcomePanel';
import { WorkspaceMainPanel } from './components/panels/WorkspaceMainPanel';
import { Resizer } from './components/primitives/Resizer';
import { createScratchSession, loadScratchSessions, normalizeScratchTitle, saveScratchSessions, type ScratchSession } from './lib/scratch';
import {
  defaultWorkspaceUiState,
  ensureWorkspaceEnvironment,
  type SelectedNode,
  type WorkspaceUiState,
  useWorkspaceStore
} from './store/workspace-store';

const RECENT_STORAGE_KEY = 'yapi-debugger.recent-roots';
const UI_STORAGE_KEY_PREFIX = 'yapi-debugger.ui';

function loadRecentRoots() {
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch (_err) {
    return [];
  }
}

function saveRecentRoots(roots: string[]) {
  window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(roots.slice(0, 6)));
}

function uiStorageKey(root: string) {
  return `${UI_STORAGE_KEY_PREFIX}:${root}`;
}

function loadWorkspaceUiState(root: string): WorkspaceUiState {
  try {
    const raw = window.localStorage.getItem(uiStorageKey(root));
    if (!raw) return defaultWorkspaceUiState();
    const parsed = JSON.parse(raw) as Partial<WorkspaceUiState>;
    return {
      ...defaultWorkspaceUiState(),
      ...parsed,
      expandedRequestIds: Array.isArray(parsed.expandedRequestIds) ? parsed.expandedRequestIds : [],
      lastSelectedNode: parsed.lastSelectedNode || { kind: 'project' },
      openTabs: Array.isArray(parsed.openTabs) ? parsed.openTabs : [{ kind: 'project' }]
    };
  } catch (_err) {
    return defaultWorkspaceUiState();
  }
}

function saveWorkspaceUiState(root: string, state: WorkspaceUiState) {
  window.localStorage.setItem(uiStorageKey(root), JSON.stringify(state));
}

function selectedRequestId(node: SelectedNode) {
  return node.kind === 'request' || node.kind === 'case' ? node.requestId : null;
}

function selectedCaseId(node: SelectedNode) {
  return node.kind === 'case' ? node.caseId : null;
}

function selectedCategoryPath(node: SelectedNode, workspace: WorkspaceIndex | null) {
  if (node.kind === 'category') return node.path;
  if (node.kind === 'request' || node.kind === 'case') {
    const record = workspace?.requests.find(item => item.request.id === node.requestId);
    return record?.folderSegments.join('/') || null;
  }
  return null;
}

function isSameOrChildPath(path: string, target: string) {
  return path === target || path.startsWith(`${target}/`);
}

function findRecord(workspace: WorkspaceIndex | null, requestId: string | null) {
  if (!workspace || !requestId) return null;
  return workspace.requests.find(item => item.request.id === requestId) || null;
}

function requestSlugExists(workspace: WorkspaceIndex, name: string, ignoreId: string, folderPath: string) {
  return workspace.requests.some(r => 
    r.request.id !== ignoreId && 
    r.request.name === name && 
    r.folderSegments.join('/') === folderPath
  );
}

function caseSlugExists(record: WorkspaceIndex['requests'][number], name: string, ignoreId: string) {
  return record.cases.some(c => c.id !== ignoreId && c.name === name);
}

function normalizeVariableName(seed: string) {
  return String(seed || 'value')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part, index) => (index === 0 ? part.toLowerCase() : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join('') || 'value';
}

function uniqueOrigins(urls: Array<string | null | undefined>) {
  const output = new Set<string>();
  urls.forEach(value => {
    if (!value) return;
    try {
      output.add(new URL(value).origin);
    } catch (_error) {
      return;
    }
  });
  return [...output];
}

function suggestedCommitMessage(input: GitStatusPayload | null) {
  if (!input?.dirty) return 'chore(debugger): refresh workspace state';
  const debuggerFiles = input.changedFiles.filter(file => file.includes('requests/') || file.includes('environments/') || file.includes('collections/'));
  if (debuggerFiles.length === 0) return 'chore(debugger): update workspace metadata';
  const requestChanges = debuggerFiles.filter(file => file.includes('.request.yaml')).length;
  const envChanges = debuggerFiles.filter(file => file.includes('environments/')).length;
  const collectionChanges = debuggerFiles.filter(file => file.includes('.collection.yaml')).length;
  const parts = [];
  if (requestChanges) parts.push(`${requestChanges} request${requestChanges > 1 ? 's' : ''}`);
  if (envChanges) parts.push(`${envChanges} environment${envChanges > 1 ? 's' : ''}`);
  if (collectionChanges) parts.push(`${collectionChanges} collection${collectionChanges > 1 ? 's' : ''}`);
  return `chore(debugger): update ${parts.join(', ')}`;
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

async function loadHostSessionSnapshots(root: string, urls: Array<string | null | undefined>) {
  const origins = uniqueOrigins(urls).slice(0, 8);
  if (origins.length === 0) return [] as Array<{ host: string; snapshot: SessionSnapshot }>;
  return Promise.all(
    origins.map(async host => ({
      host,
      snapshot: await inspectSession(root, host)
    }))
  );
}

function updateScratchSession(
  sessions: ScratchSession[],
  sessionId: string,
  updater: (session: ScratchSession) => ScratchSession
) {
  return sessions.map(session => (session.id === sessionId ? updater(session) : session));
}

function scratchSessionFromHistory(entry: RunHistoryEntry) {
  const request = createEmptyRequest(entry.requestName || 'Scratch Request');
  request.id = entry.requestId;
  request.method = entry.request.method;
  request.url = entry.request.url;
  request.path = entry.request.requestPath || entry.request.url;
  request.headers = entry.request.headers;
  request.query = entry.request.query;
  request.body = entry.request.body;
  return createScratchSession({
    title: `${entry.request.method} ${entry.request.requestPath || entry.request.url}`,
    request,
    response: entry.response,
    requestError: null,
    checkResults: entry.checkResults,
    scriptLogs: entry.scriptLogs
  });
}

export function App() {
  const store = useWorkspaceStore();
  const gridRef = useRef<HTMLDivElement>(null);
  const [projectName, setProjectName] = useState('New API Workspace');
  const [importUrl, setImportUrl] = useState('');
  const [importOpened, setImportOpened] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [uiState, setUiState] = useState<WorkspaceUiState>(defaultWorkspaceUiState());
  const [activeView, setActiveView] = useState<AppRailView>('workspace');
  const [historyEntries, setHistoryEntries] = useState<RunHistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedExampleName, setSelectedExampleName] = useState<string | null>(null);
  const [importStrategy, setImportStrategy] = useState<'append' | 'replace'>('append');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [draftCollection, setDraftCollection] = useState<CollectionDocument | null>(null);
  const [collectionDataText, setCollectionDataText] = useState('');
  const [collectionReports, setCollectionReports] = useState<CollectionRunReport[]>([]);
  const [selectedCollectionReportId, setSelectedCollectionReportId] = useState<string | null>(null);
  const [selectedCollectionStepKey, setSelectedCollectionStepKey] = useState<string | null>(null);
  const [scratchSessions, setScratchSessions] = useState<ScratchSession[]>(() => loadScratchSessions());
  const [selectedScratchId, setSelectedScratchId] = useState<string | null>(null);
  const [scratchRequestTab, setScratchRequestTab] = useState<WorkspaceUiState['activeRequestTab']>('query');
  const [scratchResponseTab, setScratchResponseTab] = useState<WorkspaceUiState['activeResponseTab']>('body');
  const [scratchMainSplitRatio, setScratchMainSplitRatio] = useState(0.5);
  const [sessionSnapshot, setSessionSnapshot] = useState<SessionSnapshot | null>(null);
  const [runtimeVariables, setRuntimeVariables] = useState<Record<string, string>>({});
  const [hostSessionSnapshots, setHostSessionSnapshots] = useState<Array<{ host: string; snapshot: SessionSnapshot }>>([]);
  const [gitInfo, setGitInfo] = useState<GitStatusPayload | null>(null);

  const requestId = selectedRequestId(store.selectedNode);
  const caseId = selectedCaseId(store.selectedNode);
  const categoryPath = selectedCategoryPath(store.selectedNode, store.workspace);

  const selectedEnvironment = store.workspace?.environments.find(
    item => item.document.name === store.activeEnvironmentName
  )?.document || null;

  const selectedCollectionRecord = useMemo(() => {
    if (!store.workspace || !selectedCollectionId) return null;
    return store.workspace.collections.find(item => item.document.id === selectedCollectionId) || null;
  }, [store.workspace, selectedCollectionId]);

  const currentScratch = useMemo(() => {
    return scratchSessions.find(session => session.id === selectedScratchId) || scratchSessions[0] || null;
  }, [scratchSessions, selectedScratchId]);

  const categoryRequests = useMemo(() => {
    if (!store.workspace || !categoryPath) return [];
    return store.workspace.requests.filter(record => {
      const value = record.folderSegments.join('/');
      return isSameOrChildPath(value, categoryPath);
    });
  }, [store.workspace, categoryPath]);

  const namedRuntimeSource = useMemo(
    () => createNamedTemplateSource('runtime variables', runtimeVariables, 'runtime'),
    [runtimeVariables]
  );

  const currentRequestInsight = useMemo(() => {
    if (!store.workspace || !requestId || !store.draftRequest) return null;
    try {
      return inspectResolvedRequest(
        store.workspace.project,
        store.draftRequest,
        store.draftCases.find(item => item.id === caseId),
        selectedEnvironment || undefined,
        [namedRuntimeSource]
      );
    } catch (_error) {
      return null;
    }
  }, [store.workspace, store.draftRequest, store.draftCases, caseId, selectedEnvironment, requestId, namedRuntimeSource]);

  const currentRequestPreview = currentRequestInsight?.preview || null;

  const currentScratchInsight = useMemo(() => {
    if (!store.workspace || !currentScratch) return null;
    try {
      return inspectResolvedRequest(
        store.workspace.project,
        currentScratch.request,
        undefined,
        selectedEnvironment || undefined,
        [namedRuntimeSource]
      );
    } catch (_error) {
      return null;
    }
  }, [store.workspace, currentScratch, selectedEnvironment, namedRuntimeSource]);

  const currentScratchPreview = currentScratchInsight?.preview || null;
  const sessionTargetUrl =
    (activeView === 'scratch' ? currentScratchPreview?.url : currentRequestPreview?.url) ||
    currentRequestPreview?.url ||
    currentScratchPreview?.url ||
    null;

  const importPreviewInfo = useMemo(() => {
    if (!store.workspace || !store.importPreview) return null;
    return buildImportPreviewSummary(store.workspace, store.importPreview);
  }, [store.workspace, store.importPreview]);

  function applyWorkspaceState(workspace: WorkspaceIndex) {
    const nextUi = loadWorkspaceUiState(workspace.root);
    setUiState(nextUi);
    setSelectedExampleName(null);
    setRuntimeVariables({});
    setSessionSnapshot(null);
    setHostSessionSnapshots([]);
    setGitInfo(null);
    setSelectedCollectionId(workspace.collections[0]?.document.id || null);
    setDraftCollection(workspace.collections[0]?.document || null);
    setCollectionDataText(workspace.collections[0]?.dataText || '');
    if (workspace.requests.length === 0) {
      setActiveView('scratch');
    }
    store.setWorkspace(workspace);
    store.setOpenTabs(nextUi.openTabs);
    store.selectNode(nextUi.lastSelectedNode);
  }

  function updateUiState(updater: (current: WorkspaceUiState) => WorkspaceUiState) {
    setUiState(current => updater(current));
  }

  const reloadWorkspace = async (nodeToSelect?: SelectedNode) => {
    if (!store.workspace?.root) return;
    const workspace = await openWorkspace(store.workspace.root);
    store.setWorkspace(workspace);
    const nextCollection =
      workspace.collections.find(item => item.document.id === selectedCollectionId) ||
      workspace.collections[0] ||
      null;
    setSelectedCollectionId(nextCollection?.document.id || null);
    setDraftCollection(nextCollection?.document || null);
    setCollectionDataText(nextCollection?.dataText || '');
    if (nodeToSelect) store.selectNode(nodeToSelect);
  };

  const openMutation = useMutation({
    mutationFn: (root: string) => openWorkspace(root),
    onSuccess: workspace => {
      const nextRoots = [workspace.root, ...store.recentRoots.filter(r => r !== workspace.root)];
      store.setRecentRoots(nextRoots);
      saveRecentRoots(nextRoots);
      applyWorkspaceState(workspace);
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to open workspace: ${(error as Error).message}` });
    }
  });

  const createMutation = useMutation({
    mutationFn: (root: string) => createWorkspace(root, projectName),
    onSuccess: workspace => {
      const nextRoots = [workspace.root, ...store.recentRoots.filter(r => r !== workspace.root)];
      store.setRecentRoots(nextRoots);
      saveRecentRoots(nextRoots);
      applyWorkspaceState(workspace);
      notifications.show({ color: 'teal', message: 'Workspace created successfully' });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to create workspace: ${(error as Error).message}` });
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace) return;
      if (store.draftProject) await saveProject(store.workspace.root, store.draftProject);
      await Promise.all(store.workspace.environments.map(item => saveEnvironment(store.workspace!.root, item.document)));
      if (store.draftRequest) {
        const record = findRecord(store.workspace, store.draftRequest.id);
        await saveRequestRecord(
          store.workspace.root,
          store.draftRequest,
          store.draftCases,
          record?.resourceDirPath || '',
          record?.requestFilePath || '',
          record?.folderSegments || []
        );
      }
      if (draftCollection) {
        const currentRecord = store.workspace.collections.find(item => item.document.id === draftCollection.id);
        await saveCollectionRecord(
          store.workspace.root,
          draftCollection,
          collectionDataText,
          currentRecord?.filePath,
          currentRecord?.dataFilePath
        );
      }
    },
    onSuccess: () => {
      reloadWorkspace(store.selectedNode);
      handleRefreshGitStatus().catch(() => undefined);
      notifications.show({ color: 'teal', message: 'Changes saved' });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to save changes: ${(error as Error).message}` });
    }
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace || !requestId) return;
      return runResolvedRequest(store.workspace, requestId, caseId || undefined, {
        state: {
          variables: runtimeVariables,
          environment: ensureWorkspaceEnvironment(store.activeEnvironmentName, store.workspace)
        }
      });
    },
    onSuccess: async result => {
      if (!result || !store.workspace || !requestId) return;
      store.setResponse(result.response, result.checkResults, result.scriptLogs);
      setRuntimeVariables({ ...result.state.variables });
      inspectSession(store.workspace.root, result.preview.url).then(setSessionSnapshot).catch(() => setSessionSnapshot(null));
      await saveRunHistory(
        store.workspace,
        requestId,
        caseId || undefined,
        result.preview,
        result.response,
        result.checkResults,
        result.scriptLogs
      );
      loadRunHistory(store.workspace.root).then(setHistoryEntries);
    },
    onError: error => {
      const message = (error as any).message || String(error) || 'Unknown network error';
      store.setError(message);
      notifications.show({ color: 'red', message: `Request failed: ${message}` });
    }
  });

  const scratchRunMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace || !currentScratch) return null;
      const environment = ensureWorkspaceEnvironment(store.activeEnvironmentName, store.workspace);
      return runPreparedRequest(store.workspace, {
        request: currentScratch.request,
        sessionId: store.workspace.root,
        context: {
          state: {
            variables: runtimeVariables,
            environment
          }
        }
      });
    },
    onSuccess: async result => {
      if (!result || !store.workspace || !currentScratch) return;
      setRuntimeVariables({ ...result.state.variables });
      setScratchSessions(current =>
        updateScratchSession(current, currentScratch.id, session => ({
          ...session,
          response: result.response,
          requestError: null,
          checkResults: result.checkResults,
          scriptLogs: result.scriptLogs,
          updatedAt: new Date().toISOString()
        }))
      );
      await appendRunHistoryEntry(
        store.workspace.root,
        {
          requestId: currentScratch.request.id,
          requestName: currentScratch.request.name || currentScratch.title
        },
        result.preview,
        result.response,
        result.checkResults,
        result.scriptLogs
      );
      loadRunHistory(store.workspace.root).then(setHistoryEntries);
      inspectSession(store.workspace.root, result.preview.url).then(setSessionSnapshot).catch(() => setSessionSnapshot(null));
    },
    onError: error => {
      const message = (error as any).message || String(error) || 'Unknown network error';
      if (currentScratch) {
        setScratchSessions(current =>
          updateScratchSession(current, currentScratch.id, session => ({
            ...session,
            requestError: message,
            response: null,
            checkResults: [],
            scriptLogs: [],
            updatedAt: new Date().toISOString()
          }))
        );
      }
      notifications.show({ color: 'red', message: `Scratch request failed: ${message}` });
    }
  });

  const importFileMutation = useMutation({
    mutationFn: async () => {
      const filePath = await chooseImportFile();
      if (!filePath) return;
      return importFromFile(filePath);
    },
    onSuccess: data => {
      if (data) store.setImportPreview(data.result);
    }
  });

  const importUrlMutation = useMutation({
    mutationFn: () => importFromUrl(importUrl, store.importAuth),
    onSuccess: data => store.setImportPreview(data.result)
  });

  const applyImportMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace || !store.importPreview) return;
      return importIntoWorkspace(store.workspace, store.importPreview, importStrategy);
    },
    onSuccess: () => {
      setImportOpened(false);
      store.setImportPreview(null);
      reloadWorkspace();
      handleRefreshGitStatus().catch(() => undefined);
      notifications.show({ color: 'teal', message: 'Import successful' });
    }
  });

  const addRequestMutation = useMutation({
    mutationFn: (targetCategory: string | null) => {
      if (!store.workspace) throw new Error('No workspace');
      return createRequestInWorkspace(store.workspace.root, targetCategory);
    },
    onSuccess: nextRequestId => {
      reloadWorkspace({ kind: 'request', requestId: nextRequestId });
    }
  });

  const addCaseMutation = useMutation({
    mutationFn: (targetReqId: string) => {
      if (!store.workspace) throw new Error('No workspace');
      return createCaseForRequest(store.workspace.root, targetReqId);
    },
    onSuccess: ({ requestId: reqId, caseId: nextCaseId }) => {
      reloadWorkspace({ kind: 'case', requestId: reqId, caseId: nextCaseId });
      notifications.show({ color: 'teal', message: 'New test case created' });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to create case: ${(error as Error).message}` });
    }
  });

  const addCollectionMutation = useMutation({
    mutationFn: (targetRequestId?: string) => {
      if (!store.workspace) throw new Error('No workspace');
      return createCollectionInWorkspace(store.workspace.root, store.workspace, targetRequestId);
    },
    onSuccess: async nextId => {
      await reloadWorkspace();
      setSelectedCollectionId(nextId);
      setActiveView('collections');
      notifications.show({ color: 'teal', message: 'Collection created' });
    }
  });

  const runCollectionMutation = useMutation({
    mutationFn: async (options?: { stepKeys?: string[]; seedReport?: CollectionRunReport | null }) => {
      if (!store.workspace || !selectedCollectionId) throw new Error('No collection selected');
      return runCollection(store.workspace, selectedCollectionId, {
        environmentName: store.activeEnvironmentName,
        stepKeys: options?.stepKeys,
        seedReport: options?.seedReport
      });
    },
    onSuccess: async report => {
      if (!store.workspace) return;
      setCollectionReports(current => [report, ...current]);
      setSelectedCollectionReportId(report.id);
      setSelectedCollectionStepKey(report.iterations[0]?.stepRuns[0]?.stepKey || null);
      notifications.show({ color: report.failedSteps > 0 ? 'orange' : 'teal', message: `Collection run ${report.status}` });
      const firstRun = report.iterations[0]?.stepRuns.find(step => step.request && step.response);
      if (firstRun?.request && firstRun.response) {
        store.setResponse(firstRun.response, firstRun.checkResults, firstRun.scriptLogs);
      }
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Collection run failed: ${(error as Error).message}` });
    }
  });

  const renameCategoryMutation = useMutation({
    mutationFn: ({ oldPath, nextPath }: { oldPath: string; nextPath: string }) => {
      if (!store.workspace) throw new Error('No workspace');
      return renameCategoryInWorkspace(store.workspace.root, store.workspace, oldPath, nextPath);
    },
    onSuccess: (_, { nextPath }) => {
      reloadWorkspace({ kind: 'category', path: nextPath });
    }
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (path: string) => {
      if (!store.workspace) throw new Error('No workspace');
      return deleteCategoryInWorkspace(store.workspace, path);
    },
    onSuccess: () => reloadWorkspace({ kind: 'project' })
  });

  const renameRequestMutation = useMutation({
    mutationFn: ({ requestId, nextName }: { requestId: string; nextName: string }) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, requestId);
      if (!record) throw new Error('Request not found');
      return renameRequestInWorkspace(store.workspace.root, record, nextName);
    },
    onSuccess: (_, { requestId }) => reloadWorkspace({ kind: 'request', requestId })
  });

  const duplicateRequestMutation = useMutation({
    mutationFn: (reqId: string) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, reqId);
      if (!record) throw new Error('Request not found');
      const siblingNames = store.workspace.requests
        .filter(item => item.folderSegments.join('/') === record.folderSegments.join('/'))
        .map(item => item.request.name);
      return duplicateRequestInWorkspace(store.workspace.root, record, siblingNames);
    },
    onSuccess: nextId => reloadWorkspace({ kind: 'request', requestId: nextId })
  });

  const deleteRequestMutation = useMutation({
    mutationFn: (reqId: string) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, reqId);
      if (!record) throw new Error('Request not found');
      return deleteRequestInWorkspace(record);
    },
    onSuccess: () => reloadWorkspace({ kind: 'project' })
  });

  const renameCaseMutation = useMutation({
    mutationFn: ({ requestId, caseId, nextName }: { requestId: string; caseId: string; nextName: string }) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, requestId);
      if (!record) throw new Error('Request not found');
      return renameCaseInWorkspace(store.workspace.root, record, caseId, nextName);
    },
    onSuccess: (_, { requestId, caseId }) => reloadWorkspace({ kind: 'case', requestId, caseId })
  });

  const duplicateCaseMutation = useMutation({
    mutationFn: ({ requestId, caseId }: { requestId: string; caseId: string }) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, requestId);
      if (!record) throw new Error('Request not found');
      return duplicateCaseInWorkspace(store.workspace.root, record, caseId);
    },
    onSuccess: (nextCaseId, { requestId }) => reloadWorkspace({ kind: 'case', requestId, caseId: nextCaseId })
  });

  const deleteCaseMutation = useMutation({
    mutationFn: ({ requestId, caseId }: { requestId: string; caseId: string }) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, requestId);
      if (!record) throw new Error('Request not found');
      return deleteCaseInWorkspace(store.workspace.root, record, caseId);
    },
    onSuccess: (_, { requestId }) => reloadWorkspace({ kind: 'request', requestId })
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace) return;
      const root = store.workspace.root;
      await unwatchWorkspace(root).catch(() => undefined);
      await deleteEntry(root, true);
      const nextRecentRoots = store.recentRoots.filter(item => item !== root);
      store.setRecentRoots(nextRecentRoots);
      saveRecentRoots(nextRecentRoots);
      setUiState(defaultWorkspaceUiState());
      setImportOpened(false);
      store.setWorkspace(null);
    }
  });

  useEffect(() => {
    const roots = loadRecentRoots();
    store.setRecentRoots(roots);
  }, []);

  useEffect(() => {
    syncMenuState(store.recentRoots, Boolean(store.workspace)).catch(() => undefined);
  }, [store.recentRoots, store.workspace?.root]);

  useEffect(() => {
    if (!store.workspace?.root) return;
    saveWorkspaceUiState(store.workspace.root, {
      ...uiState,
      lastSelectedNode: store.selectedNode,
      openTabs: store.openTabs
    });
  }, [uiState, store.selectedNode, store.openTabs, store.workspace?.root]);

  useEffect(() => {
    saveScratchSessions(
      scratchSessions.map(session => ({
        ...session,
        title: normalizeScratchTitle(session.request)
      }))
    );
  }, [scratchSessions]);

  useEffect(() => {
    if (!scratchSessions.length) {
      const fallback = createScratchSession();
      setScratchSessions([fallback]);
      setSelectedScratchId(fallback.id);
      return;
    }
    if (!scratchSessions.some(session => session.id === selectedScratchId)) {
      setSelectedScratchId(scratchSessions[0]?.id || null);
    }
  }, [scratchSessions, selectedScratchId]);

  useEffect(() => {
    if (!store.workspace?.root) {
      setHistoryEntries([]);
      setSelectedHistoryId(null);
      setRuntimeVariables({});
      setSessionSnapshot(null);
      return;
    }
    loadRunHistory(store.workspace.root)
      .then(entries => {
        setHistoryEntries(entries);
        setSelectedHistoryId(entries[0]?.id || null);
      })
      .catch(() => undefined);
  }, [store.workspace?.root]);

  useEffect(() => {
    if (!store.workspace?.root || !sessionTargetUrl) {
      setSessionSnapshot(null);
      return;
    }
    inspectSession(store.workspace.root, sessionTargetUrl)
      .then(setSessionSnapshot)
      .catch(() => setSessionSnapshot(null));
  }, [store.workspace?.root, sessionTargetUrl]);

  useEffect(() => {
    if (!store.workspace?.root) {
      setGitInfo(null);
      return;
    }
    gitStatus(store.workspace.root)
      .then(setGitInfo)
      .catch(() => setGitInfo(null));
  }, [store.workspace?.root]);

  useEffect(() => {
    if (!store.workspace?.root) {
      setHostSessionSnapshots([]);
      return;
    }
    loadHostSessionSnapshots(store.workspace.root, [
      sessionTargetUrl,
      ...historyEntries.map(entry => entry.request.url),
      ...historyEntries.map(entry => entry.response.url)
    ])
      .then(setHostSessionSnapshots)
      .catch(() => setHostSessionSnapshots([]));
  }, [store.workspace?.root, sessionTargetUrl, historyEntries]);

  useEffect(() => {
    if (!store.workspace?.root) {
      setCollectionReports([]);
      setSelectedCollectionReportId(null);
      return;
    }
    loadCollectionRunReports(store.workspace.root)
      .then(reports => {
        setCollectionReports(reports);
        setSelectedCollectionReportId(reports[0]?.id || null);
      })
      .catch(() => undefined);
  }, [store.workspace?.root]);

  useEffect(() => {
    if (!store.workspace) return;
    const nextCollection =
      store.workspace.collections.find(item => item.document.id === selectedCollectionId) ||
      store.workspace.collections[0] ||
      null;
    setDraftCollection(nextCollection?.document || null);
    setCollectionDataText(nextCollection?.dataText || '');
  }, [store.workspace, selectedCollectionId]);

  useEffect(() => {
    const unlistenPromise = listenMenuActions(payload => {
      if (payload.action === 'open-project') {
        handleOpenDirectory();
        return;
      }
      if (payload.action === 'new-project') {
        handleCreateWorkspace();
        return;
      }
      if (payload.action === 'import-project') {
        if (store.workspace) setImportOpened(true);
        return;
      }
      if (payload.action === 'close-workspace') {
        setUiState(defaultWorkspaceUiState());
        store.setWorkspace(null);
        return;
      }
      if (payload.action === 'open-recent' && payload.root) {
        openExistingWorkspace(payload.root);
      }
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten()).catch(() => undefined);
    };
  }, [store.workspace, projectName]);

  useEffect(() => {
    if (!store.workspace?.root) return;
    let unlisten: (() => void) | undefined;

    watchWorkspace(store.workspace.root, async () => {
      const workspace = await openWorkspace(store.workspace!.root);
      applyWorkspaceState(workspace);
    }).then(listener => {
      unlisten = listener;
    });

    return () => {
      if (unlisten) unlisten();
      unwatchWorkspace(store.workspace!.root).catch(() => undefined);
    };
  }, [store.workspace?.root]);

  function openExistingWorkspace(root: string) {
    openMutation.mutate(root);
  }

  async function handleOpenDirectory() {
    const root = await chooseDirectory();
    if (root) openExistingWorkspace(root);
  }

  async function handleCreateWorkspace() {
    const root = await chooseDirectory();
    if (root) createMutation.mutate(root);
  }

  function handleConfirmCreateCategory() {
    const seed = categoryDraft.trim();
    if (!seed) return;
    const nextPath = categoryPath ? `${categoryPath}/${seed}` : seed;
    handleSelectCategory(nextPath);
    setCategoryDraft('');
    setCreatingCategory(false);
    notifications.show({ color: 'teal', message: `Category ${nextPath} is ready. Create an interface inside it.` });
  }

  async function handleAddEnvironment() {
    if (!store.workspace) return;
    const nextName = window.prompt('Enter new environment name', 'staging')?.trim();
    if (!nextName) return;
    if (store.workspace.environments.some(item => item.document.name === nextName)) {
      notifications.show({ color: 'red', message: 'Environment name already exists' });
      return;
    }
    await saveEnvironment(store.workspace.root, {
      schemaVersion: 1,
      name: nextName,
      vars: {},
      headers: [],
      authProfiles: []
    });
    reloadWorkspace();
  }

  function handleCreateScratch(seed?: Partial<ScratchSession>) {
    const nextScratch = createScratchSession(seed);
    setScratchSessions(current => [nextScratch, ...current].slice(0, 6));
    setSelectedScratchId(nextScratch.id);
    setActiveView('scratch');
  }

  function handleUpdateScratchRequest(request: ScratchSession['request']) {
    if (!currentScratch) return;
    setScratchSessions(current =>
      updateScratchSession(current, currentScratch.id, session => ({
        ...session,
        request,
        title: normalizeScratchTitle(request),
        updatedAt: new Date().toISOString()
      }))
    );
  }

  function handleSetScratchResponseState(
    updater: (session: ScratchSession) => ScratchSession
  ) {
    if (!currentScratch) return;
    setScratchSessions(current => updateScratchSession(current, currentScratch.id, updater));
  }

  function handleCopyCurrentRequestToScratch() {
    if (!store.draftRequest) return;
    handleCreateScratch({
      title: normalizeScratchTitle(store.draftRequest),
      request: structuredClone(store.draftRequest)
    });
  }

  async function handleSaveScratchToWorkspace() {
    if (!store.workspace || !currentScratch) return;
    const nextId = await saveScratchRequestToWorkspace(store.workspace, currentScratch.request, categoryPath);
    notifications.show({ color: 'teal', message: 'Scratch request saved to workspace' });
    await reloadWorkspace({ kind: 'request', requestId: nextId });
    setActiveView('workspace');
  }

  function handleOpenHistoryInScratch(entry: RunHistoryEntry) {
    handleCreateScratch(scratchSessionFromHistory(entry));
  }

  function handleOpenImportPreviewInScratch() {
    const imported = store.importPreview?.requests[0];
    if (!imported) {
      notifications.show({ color: 'blue', message: 'Preview an import first to open it in Scratch' });
      return;
    }
    handleCreateScratch({
      title: normalizeScratchTitle(imported.request),
      request: structuredClone(imported.request)
    });
  }

  async function handleRefreshSession() {
    if (!store.workspace) return;
    try {
      const [snapshot, hostSnapshots] = await Promise.all([
        inspectSession(store.workspace.root, sessionTargetUrl || undefined),
        loadHostSessionSnapshots(store.workspace.root, [
          sessionTargetUrl,
          ...historyEntries.map(entry => entry.request.url),
          ...historyEntries.map(entry => entry.response.url)
        ])
      ]);
      setSessionSnapshot(snapshot);
      setHostSessionSnapshots(hostSnapshots);
      notifications.show({ color: 'teal', message: 'Session snapshot refreshed' });
    } catch (error) {
      notifications.show({ color: 'red', message: `Failed to inspect session: ${(error as Error).message}` });
    }
  }

  async function handleClearSessionCookies() {
    if (!store.workspace) return;
    try {
      await clearSession(store.workspace.root);
      const hostSnapshots = await loadHostSessionSnapshots(store.workspace.root, [
        sessionTargetUrl,
        ...historyEntries.map(entry => entry.request.url),
        ...historyEntries.map(entry => entry.response.url)
      ]);
      setSessionSnapshot(sessionTargetUrl ? await inspectSession(store.workspace.root, sessionTargetUrl) : null);
      setHostSessionSnapshots(hostSnapshots);
      notifications.show({ color: 'teal', message: 'Workspace session cleared' });
    } catch (error) {
      notifications.show({ color: 'red', message: `Failed to clear session: ${(error as Error).message}` });
    }
  }

  function handleSaveAuthProfile(name: string, auth: AuthConfig) {
    if (!selectedEnvironment) return;
    store.updateEnvironment(selectedEnvironment.name, environment => ({
      ...environment,
      authProfiles: [
        ...environment.authProfiles.filter(item => item.name !== name),
        {
          name,
          auth
        }
      ]
    }));
    notifications.show({ color: 'teal', message: `Auth profile "${name}" saved` });
  }

  function handleExtractResponseValue(target: 'local' | 'runtime', input: { suggestedName: string; value: string }) {
    const variableName = window.prompt('Variable name', normalizeVariableName(input.suggestedName))?.trim();
    if (!variableName) return;
    if (target === 'runtime') {
      setRuntimeVariables(current => ({
        ...current,
        [variableName]: input.value
      }));
      notifications.show({ color: 'teal', message: `Runtime variable "${variableName}" updated` });
      return;
    }
    if (!selectedEnvironment) {
      notifications.show({ color: 'red', message: 'Select an environment before extracting to a local secret.' });
      return;
    }
    store.updateEnvironment(selectedEnvironment.name, environment => {
      const sharedVars = environment.sharedVars || environment.vars || {};
      const sharedHeaders = environment.sharedHeaders || environment.headers || [];
      const localVars = {
        ...(environment.localVars || {}),
        [variableName]: input.value
      };
      return {
        ...environment,
        sharedVars,
        sharedHeaders,
        localVars,
        vars: {
          ...sharedVars,
          ...localVars
        },
        headers: [...sharedHeaders],
        overlayMode: 'overlay'
      };
    });
    notifications.show({ color: 'teal', message: `Local secret "${variableName}" saved to environment overlay` });
  }

  function handleExtractCollectionReportValue(target: 'local' | 'runtime' | 'collection', input: { suggestedName: string; value: string }) {
    if (target === 'local' || target === 'runtime') {
      handleExtractResponseValue(target, input);
      return;
    }
    const variableName = window.prompt('Collection variable name', normalizeVariableName(input.suggestedName))?.trim();
    if (!variableName) return;
    if (!draftCollection) {
      notifications.show({ color: 'red', message: 'Select a collection before extracting collection variables.' });
      return;
    }
    setDraftCollection(current =>
      current
        ? {
            ...current,
            vars: {
              ...current.vars,
              [variableName]: input.value
            }
          }
        : current
    );
    notifications.show({ color: 'teal', message: `Collection variable "${variableName}" updated` });
  }

  async function handleRefreshGitStatus() {
    if (!store.workspace) return;
    try {
      setGitInfo(await gitStatus(store.workspace.root));
    } catch (error) {
      notifications.show({ color: 'red', message: `Failed to read git status: ${(error as Error).message}` });
    }
  }

  async function handleGitPull() {
    if (!store.workspace) return;
    try {
      const output = await gitPull(store.workspace.root);
      await handleRefreshGitStatus();
      notifications.show({ color: 'teal', message: output || 'Git pull completed' });
    } catch (error) {
      notifications.show({ color: 'red', message: `Git pull failed: ${(error as Error).message}` });
    }
  }

  async function handleGitPush() {
    if (!store.workspace) return;
    try {
      const output = await gitPush(store.workspace.root);
      await handleRefreshGitStatus();
      notifications.show({ color: 'teal', message: output || 'Git push completed' });
    } catch (error) {
      notifications.show({ color: 'red', message: `Git push failed: ${(error as Error).message}` });
    }
  }

  async function handleCreateCheckFromResponse(input: {
    type: 'status-equals' | 'header-equals' | 'header-includes' | 'json-exists' | 'json-equals';
    label: string;
    path?: string;
    expected?: string;
  }) {
    if (!store.workspace || !store.draftRequest || !requestId) return;
    const record = findRecord(store.workspace, requestId);
    if (!record) return;
    const check = {
      ...createEmptyCheck(input.type),
      label: input.label,
      path: input.path || createEmptyCheck(input.type).path,
      expected: input.expected || createEmptyCheck(input.type).expected
    };

    let targetCaseId = caseId;
    let nextCases = record.cases;
    if (!targetCaseId) {
      const nextCase = createEmptyCase(record.request.id, `Response Check ${record.cases.length + 1}`);
      nextCase.environment = store.activeEnvironmentName;
      nextCase.checks = [check];
      nextCases = [...record.cases, nextCase];
      targetCaseId = nextCase.id;
    } else {
      nextCases = record.cases.map(item =>
        item.id === targetCaseId
          ? {
              ...item,
              checks: [...(item.checks || []), check]
            }
          : item
      );
    }

    await saveRequestRecord(
      store.workspace.root,
      record.request,
      nextCases,
      record.resourceDirPath,
      record.requestFilePath,
      record.folderSegments
    );
    await reloadWorkspace({ kind: 'case', requestId: record.request.id, caseId: targetCaseId });
    notifications.show({ color: 'teal', message: 'Check created from current response' });
  }

  async function handleCreateCaseFromCurrentResponse() {
    if (!store.workspace) return;
    if (activeView === 'scratch') {
      notifications.show({ color: 'blue', message: 'Save the Scratch request to the workspace before creating a reusable case.' });
      return;
    }

    if (!store.response || !store.draftRequest || !requestId || !currentRequestPreview) return;
    const record = findRecord(store.workspace, requestId);
    if (!record) return;
    const nextCase = createEmptyCase(record.request.id, `${record.request.name} Replay ${record.cases.length + 1}`);
    nextCase.environment = store.activeEnvironmentName;
    nextCase.overrides = {
      method: currentRequestPreview.method,
      url: currentRequestPreview.url,
      path: currentRequestPreview.requestPath,
      headers: currentRequestPreview.headers,
      query: currentRequestPreview.query,
      body: currentRequestPreview.body,
      runtime: {
        timeoutMs: currentRequestPreview.timeoutMs,
        followRedirects: currentRequestPreview.followRedirects
      }
    };
    nextCase.checks = [
      {
        ...createEmptyCheck('status-equals'),
        label: 'Status equals current response',
        expected: String(store.response.status)
      }
    ];
    await saveRequestRecord(
      store.workspace.root,
      record.request,
      [...record.cases, nextCase],
      record.resourceDirPath,
      record.requestFilePath,
      record.folderSegments
    );
    await reloadWorkspace({ kind: 'case', requestId: record.request.id, caseId: nextCase.id });
    notifications.show({ color: 'teal', message: 'Case created from the current response' });
  }

  function handleSelectCollection(id: string | null) {
    setSelectedCollectionId(id);
    setSelectedCollectionReportId(null);
    setSelectedCollectionStepKey(null);
  }

  function handleCreateCollection() {
    addCollectionMutation.mutate(requestId || undefined);
  }

  async function handleDeleteCollection() {
    if (!store.workspace || !selectedCollectionRecord) return;
    if (!window.confirm(`Delete collection "${selectedCollectionRecord.document.name}"?`)) return;
    await deleteCollectionInWorkspace(selectedCollectionRecord);
    notifications.show({ color: 'teal', message: 'Collection deleted' });
    reloadWorkspace();
  }

  async function handleSaveCollection() {
    if (!store.workspace || !draftCollection) return;
    const currentRecord = store.workspace.collections.find(item => item.document.id === draftCollection.id);
    await saveCollectionRecord(
      store.workspace.root,
      draftCollection,
      collectionDataText,
      currentRecord?.filePath,
      currentRecord?.dataFilePath
    );
    notifications.show({ color: 'teal', message: 'Collection saved' });
    reloadWorkspace();
  }

  function handleRunCollection() {
    runCollectionMutation.mutate(undefined);
  }

  function handleRerunFailedCollectionSteps() {
    const selectedReport = collectionReports.find(report => report.id === selectedCollectionReportId) || collectionReports[0];
    if (!selectedReport) return;
    const stepKeys = rerunFailedStepKeys(selectedReport);
    if (stepKeys.length === 0) {
      notifications.show({ color: 'blue', message: 'No failed steps to rerun' });
      return;
    }
    runCollectionMutation.mutate({
      stepKeys,
      seedReport: collectionReportSeed(selectedReport)
    });
  }

  async function handleClearCollectionReports() {
    if (!store.workspace) return;
    await clearCollectionRunReports(store.workspace.root);
    setCollectionReports([]);
    setSelectedCollectionReportId(null);
    setSelectedCollectionStepKey(null);
    notifications.show({ color: 'teal', message: 'Collection reports cleared' });
  }

  function handleSelectProject() {
    store.selectNode({ kind: 'project' });
  }

  function handleSelectCategory(path: string) {
    store.selectNode({ kind: 'category', path });
  }

  function handleSelectRequest(requestIdToSelect: string) {
    store.selectNode({ kind: 'request', requestId: requestIdToSelect });
  }

  function handleSelectCase(requestIdOfCase: string, caseIdToSelect: string) {
    store.selectNode({ kind: 'case', requestId: requestIdOfCase, caseId: caseIdToSelect });
  }

  function handleCreateInterface(targetCategoryPath?: string | null) {
    addRequestMutation.mutate(targetCategoryPath ?? categoryPath ?? null);
  }

  async function handleAddCase(targetRequestId?: string | ReactMouseEvent) {
    // If called directly from onClick, the first arg is an event object. Ignore it.
    const actualId = typeof targetRequestId === 'string' ? targetRequestId : requestId;
    
    if (!actualId) {
      notifications.show({ color: 'red', message: 'Please select a request first' });
      return;
    }
    addCaseMutation.mutate(actualId);
  }

  async function handleRenameCategory(path: string, nextPath: string) {
    if (!store.workspace) return;
    if (!nextPath || nextPath === path) return;
    if (isSameOrChildPath(nextPath, path)) {
      notifications.show({ color: 'red', message: 'Cannot rename category into its own sub-category' });
      return;
    }

    const hasConflict = store.workspace.requests.some(record => {
      const value = record.folderSegments.join('/');
      return isSameOrChildPath(value, nextPath);
    });
    if (hasConflict) {
      notifications.show({ color: 'red', message: 'Target category path already exists' });
      return;
    }

    renameCategoryMutation.mutate({ oldPath: path, nextPath });
    notifications.show({ color: 'teal', message: 'Category renamed' });
  }

  async function handleDeleteCategory(path: string) {
    if (!store.workspace) return;
    const total = store.workspace.requests.filter(record => isSameOrChildPath(record.folderSegments.join('/'), path)).length;
    if (!window.confirm(`Delete category "${path}" and its ${total} requests?`)) return;
    deleteCategoryMutation.mutate(path);
    notifications.show({ color: 'teal', message: 'Category deleted' });
  }

  async function handleRenameRequest(targetRequestId: string, nextName: string) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === targetRequestId);
    if (!record) return;
    if (!nextName || nextName === record.request.name) return;
    if (requestSlugExists(store.workspace, nextName, record.request.id, record.folderSegments.join('/'))) {
      notifications.show({ color: 'red', message: 'Another request with the same name already exists in this folder' });
      return;
    }
    renameRequestMutation.mutate({ requestId: targetRequestId, nextName });
    notifications.show({ color: 'teal', message: 'Request renamed' });
  }

  async function handleDuplicateRequest(targetRequestId: string) {
    duplicateRequestMutation.mutate(targetRequestId);
    notifications.show({ color: 'teal', message: 'Request duplicated' });
  }

  async function handleDeleteRequest(targetRequestId: string) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === targetRequestId);
    if (!record) return;
    if (!window.confirm(`Delete request "${record.request.name}"?`)) return;
    deleteRequestMutation.mutate(targetRequestId);
    notifications.show({ color: 'teal', message: 'Request deleted' });
  }

  async function handleRenameCase(targetRequestId: string, targetCaseId: string, nextName: string) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === targetRequestId);
    const caseItem = record?.cases.find(item => item.id === targetCaseId);
    if (!record || !caseItem) return;
    if (!nextName || nextName === caseItem.name) return;
    if (caseSlugExists(record, nextName, caseItem.id)) {
      notifications.show({ color: 'red', message: 'Another case with the same name already exists for this request' });
      return;
    }
    renameCaseMutation.mutate({ requestId: targetRequestId, caseId: targetCaseId, nextName });
    notifications.show({ color: 'teal', message: 'Case renamed' });
  }

  async function handleDuplicateCase(targetRequestId: string, targetCaseId: string) {
    duplicateCaseMutation.mutate({ requestId: targetRequestId, caseId: targetCaseId });
    notifications.show({ color: 'teal', message: 'Case duplicated' });
  }

  async function handleDeleteCase(targetRequestId: string, targetCaseId: string) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === targetRequestId);
    const caseItem = record?.cases.find(item => item.id === targetCaseId);
    if (!record || !caseItem) return;
    if (!window.confirm(`Delete case "${caseItem.name}"?`)) return;
    deleteCaseMutation.mutate({ requestId: targetRequestId, caseId: targetCaseId });
    notifications.show({ color: 'teal', message: 'Case deleted' });
  }

  function handleDeleteProject() {
    if (!store.workspace || !store.draftProject) return;
    const projectTitle = store.draftProject.name;
    let typedProjectName = '';

    modals.openConfirmModal({
      title: 'Delete Entire Project',
      centered: true,
      labels: { confirm: 'Proceed with Deletion', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      children: (
        <div style={{ display: 'grid', gap: 12 }}>
          <Text size="sm">
            This is a high-risk operation. It will delete the entire debugger workspace directory and all its categories, requests, and cases. This cannot be undone.
          </Text>
          <Text size="sm" c="dimmed">
            Please type the project name <strong>{projectTitle}</strong> to confirm deletion.
          </Text>
          <TextInput
            placeholder={projectTitle}
            onChange={event => {
              typedProjectName = event.currentTarget.value.trim();
            }}
          />
        </div>
      ),
      onConfirm: async () => {
        if (!typedProjectName) {
          notifications.show({ color: 'red', message: 'Project name is required' });
          return;
        }
        if (typedProjectName !== projectTitle) {
          notifications.show({ color: 'red', message: 'Project name does not match, deletion cancelled' });
          return;
        }
        deleteProjectMutation.mutate();
        notifications.show({ color: 'teal', message: `Project ${projectTitle} deleted` });
      }
    });
  }

  async function handleReplayHistory(entry: RunHistoryEntry) {
    if (!store.workspace) return;
    const record = findRecord(store.workspace, entry.requestId);
    if (!record) {
      handleOpenHistoryInScratch(entry);
      return;
    }
    setActiveView('workspace');
    store.selectNode({ kind: 'request', requestId: entry.requestId });
    store.updateRequest(record.request);
    if (entry.caseId) {
      const matchedCase = record.cases.find(c => c.id === entry.caseId);
      if (matchedCase) {
        store.updateCaseList(record.cases);
        store.selectNode({ kind: 'case', requestId: entry.requestId, caseId: entry.caseId });
      }
    }
    store.setResponse(entry.response, entry.checkResults, entry.scriptLogs);
  }

  async function handleDuplicateHistoryAsCase(entry: RunHistoryEntry) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === entry.requestId);
    if (!record) {
      notifications.show({ color: 'red', message: 'Source request not found, cannot duplicate as case' });
      return;
    }

    const nextCase = createEmptyCase(record.request.id, `${entry.caseName || 'Replay'} ${historyEntries.length + 1}`);
    nextCase.environment = entry.environmentName;
    nextCase.origin = {
      type: 'history',
      runId: entry.id,
      collectionId: entry.sourceCollectionId,
      stepKey: entry.sourceStepKey
    };
    nextCase.overrides = {
      method: entry.request.method,
      url: entry.request.url,
      path: record.request.path,
      headers: entry.request.headers,
      query: entry.request.query,
      body: entry.request.body,
      runtime: {
        timeoutMs: entry.request.timeoutMs,
        followRedirects: entry.request.followRedirects
      }
    };

    const recordWithNewCase = { ...record, cases: [...record.cases, nextCase] };
    await saveRequestRecord(
      store.workspace.root,
      record.request,
      recordWithNewCase.cases,
      record.resourceDirPath,
      record.requestFilePath,
      record.folderSegments
    );
    await reloadWorkspace({ kind: 'case', requestId: record.request.id, caseId: nextCase.id });
    notifications.show({ color: 'teal', message: 'Case created from history' });
  }

  async function handlePinHistoryAsBaseline(entry: RunHistoryEntry) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === entry.requestId);
    if (!record) {
      notifications.show({ color: 'red', message: 'Source request not found, cannot save baseline example' });
      return;
    }
    const exampleName = window.prompt('Baseline example name', `${entry.environmentName || 'baseline'}-baseline`)?.trim();
    if (!exampleName) return;
    const nextExamples = [
      ...(record.request.examples || []).filter(example => example.name !== exampleName),
      {
        name: exampleName,
        status: entry.response.status,
        mimeType: entry.response.headers.find(header => header.name.toLowerCase() === 'content-type')?.value || 'application/json',
        text: entry.response.bodyText
      }
    ];
    await saveRequestRecord(
      store.workspace.root,
      {
        ...record.request,
        examples: nextExamples
      },
      record.cases,
      record.resourceDirPath,
      record.requestFilePath,
      record.folderSegments
    );
    await reloadWorkspace({ kind: 'request', requestId: record.request.id });
    notifications.show({ color: 'teal', message: `Saved "${exampleName}" as baseline example` });
  }

  async function handleGenerateHistoryDiffChecks(selectedEntry: RunHistoryEntry, compareEntry: RunHistoryEntry | null) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === selectedEntry.requestId);
    if (!record) {
      notifications.show({ color: 'red', message: 'Source request not found, cannot generate checks' });
      return;
    }
    const selectedJson = safeJson(selectedEntry.response.bodyText);
    const compareJson = compareEntry ? safeJson(compareEntry.response.bodyText) : null;
    const selectedLeaves = flattenJsonLeaves(selectedJson);
    const compareMap = new Map(flattenJsonLeaves(compareJson).map(item => [item.path, item.value]));
    const changedLeaves = selectedLeaves.filter(item => compareMap.get(item.path) !== item.value).slice(0, 12);
    const nextChecks = [];
    nextChecks.push({
      ...createEmptyCheck('status-equals'),
      label: `Status equals ${selectedEntry.response.status}`,
      expected: String(selectedEntry.response.status)
    });
    changedLeaves.forEach(item => {
      nextChecks.push({
        ...createEmptyCheck('json-equals'),
        label: `History diff guard: ${item.path}`,
        path: item.path,
        expected: item.value
      });
    });
    const nextCase = createEmptyCase(record.request.id, `History Diff Guard ${record.cases.length + 1}`);
    nextCase.environment = selectedEntry.environmentName;
    nextCase.origin = {
      type: 'history',
      runId: selectedEntry.id,
      collectionId: selectedEntry.sourceCollectionId,
      stepKey: selectedEntry.sourceStepKey
    };
    nextCase.checks = nextChecks;
    await saveRequestRecord(
      store.workspace.root,
      record.request,
      [...record.cases, nextCase],
      record.resourceDirPath,
      record.requestFilePath,
      record.folderSegments
    );
    await reloadWorkspace({ kind: 'case', requestId: record.request.id, caseId: nextCase.id });
    notifications.show({
      color: 'teal',
      message: `Generated ${nextChecks.length} checks from history${compareEntry ? ' diff' : ''}`
    });
  }

  async function handleClearHistory() {
    if (!store.workspace) return;
    await clearRunHistory(store.workspace.root);
    setHistoryEntries([]);
    setSelectedHistoryId(null);
    notifications.show({ color: 'teal', message: 'Run history cleared' });
  }

  async function handleSaveResponseAsExample(replaceExisting = false) {
    if (activeView === 'scratch') {
      if (!currentScratch || !currentScratch.response) return;
      const nextName =
        replaceExisting && currentScratch.selectedExampleName
          ? currentScratch.selectedExampleName
          : window.prompt('Enter example name', 'Scratch Response');
      if (!nextName) return;
      const nextExamples = replaceExisting
        ? (currentScratch.request.examples || []).map(ex =>
            ex.name === nextName
              ? { ...ex, status: currentScratch.response!.status, text: currentScratch.response!.bodyText }
              : ex
          )
        : [
            ...(currentScratch.request.examples || []),
            {
              name: nextName,
              status: currentScratch.response.status,
              mimeType: 'application/json',
              text: currentScratch.response.bodyText
            }
          ];
      handleSetScratchResponseState(session => ({
        ...session,
        request: { ...session.request, examples: nextExamples },
        selectedExampleName: nextName,
        updatedAt: new Date().toISOString()
      }));
      notifications.show({ color: 'teal', message: 'Example saved to Scratch tab' });
      return;
    }

    if (!store.draftRequest || !store.response) return;
    const nextName = replaceExisting && selectedExampleName ? selectedExampleName : window.prompt('Enter example name', 'Success Response');
    if (!nextName) return;

    const nextExamples = replaceExisting
      ? (store.draftRequest.examples || []).map(ex => 
          ex.name === nextName 
            ? { ...ex, status: store.response!.status, text: store.response!.bodyText } 
            : ex
        )
      : [
          ...(store.draftRequest.examples || []),
          {
            name: nextName,
            status: store.response.status,
            mimeType: 'application/json',
            text: store.response.bodyText
          }
        ];
    store.updateRequest({ ...store.draftRequest, examples: nextExamples });
    setSelectedExampleName(nextName);
    saveMutation.mutate();
  }

  if (!store.workspace) {
    return (
      <WelcomePanel
        recentRoots={store.recentRoots}
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onOpenDirectory={handleOpenDirectory}
        onCreateWorkspace={handleCreateWorkspace}
        onSelectRecent={openExistingWorkspace}
      />
    );
  }

  return (
    <>
      <div className="app-shell-native">
        <div className="workspace-frame">
          <div className="workspace-contextbar">
            <div className="workspace-context-copy">
              <span className="workspace-context-label">Debugger</span>
              <strong className="workspace-context-title">{store.workspace.project.name}</strong>
            </div>

            <div className="workspace-context-actions">
              {activeView === 'scratch' ? (
                <Select
                  size="xs"
                  className="compact-select"
                  value={currentScratch?.id || null}
                  data={scratchSessions.map(session => ({
                    value: session.id,
                    label: session.title
                  }))}
                  onChange={value => value && setSelectedScratchId(value)}
                  style={{ width: 220 }}
                />
              ) : null}
              <Select
                size="xs"
                className="compact-select"
                value={store.activeEnvironmentName}
                data={store.workspace.environments.map(item => ({
                  value: item.document.name,
                  label: item.document.name
                }))}
                onChange={value => value && store.setActiveEnvironment(value)}
                style={{ width: 120 }}
              />
              <Badge variant="dot" color={runMutation.isPending || scratchRunMutation.isPending ? 'blue' : 'gray'} size="sm">
                {runMutation.isPending || scratchRunMutation.isPending ? 'Running' : 'Idle'}
              </Badge>
              {gitInfo?.isRepo ? (
                <Badge variant="light" color={gitInfo.dirty ? 'orange' : 'teal'} size="sm">
                  {gitInfo.branch || 'git'}{gitInfo.dirty ? ` · ${gitInfo.changedFiles.length} dirty` : ' · clean'}
                </Badge>
              ) : null}
              <ActionIcon variant="subtle" color="gray" onClick={() => openMutation.mutate(store.workspace!.root)}>
                <IconRefresh size={16} />
              </ActionIcon>
            </div>
          </div>

          <main
            ref={gridRef}
            className="workspace-grid"
            style={
              {
                '--tree-width': `${uiState.treeWidth}px`
              } as CSSProperties
            }
          >
            <AppRail
              workspaceName={store.workspace.project.name}
              isDirty={store.isDirty}
              activeView={activeView}
              onChangeView={view => {
                setActiveView(view);
                if (view === 'settings') {
                  store.selectNode({ kind: 'project' });
                }
              }}
            />

            <InterfaceTreePanel
              workspace={store.workspace}
              selectedNode={store.selectedNode}
              gitStatus={gitInfo}
              searchText={store.searchText}
              categoryDraft={categoryDraft}
              creatingCategory={creatingCategory}
              expandedRequestIds={uiState.expandedRequestIds}
              onSearchChange={value => store.setSearchText(value)}
              onSelectProject={handleSelectProject}
              onSelectCategory={handleSelectCategory}
              onSelectRequest={handleSelectRequest}
              onSelectCase={handleSelectCase}
              onOpenImport={() => setImportOpened(true)}
              onCreateInterface={handleCreateInterface}
              onAddCase={handleAddCase}
              onRenameCategory={handleRenameCategory}
              onDeleteCategory={handleDeleteCategory}
              onRenameRequest={handleRenameRequest}
              onDuplicateRequest={handleDuplicateRequest}
              onDeleteRequest={handleDeleteRequest}
              onRenameCase={handleRenameCase}
              onDuplicateCase={handleDuplicateCase}
              onDeleteCase={handleDeleteCase}
              onToggleCategoryDraft={() => setCreatingCategory(current => !current)}
              onCategoryDraftChange={setCategoryDraft}
              onConfirmCreateCategory={handleConfirmCreateCategory}
              onToggleRequest={requestIdToToggle =>
                updateUiState(current => ({
                  ...current,
                  expandedRequestIds: current.expandedRequestIds.includes(requestIdToToggle)
                    ? current.expandedRequestIds.filter(item => item !== requestIdToToggle)
                    : [...current.expandedRequestIds, requestIdToToggle]
                }))
              }
            />

            <Resizer
              containerRef={gridRef}
              onResize={nextWidth => updateUiState(current => ({ ...current, treeWidth: Math.round(nextWidth) }))}
              min={260}
              max={420}
            />

            {activeView === 'scratch' && currentScratch ? (
              <ScratchPadPanel
                workspace={store.workspace}
                request={currentScratch.request}
                response={currentScratch.response}
                requestError={currentScratch.requestError}
                requestInsight={currentScratchInsight}
                requestPreview={currentScratchPreview}
                checkResults={currentScratch.checkResults}
                scriptLogs={currentScratch.scriptLogs}
                sessionSnapshot={sessionSnapshot}
                selectedEnvironment={selectedEnvironment}
                selectedExampleName={currentScratch.selectedExampleName}
                activeRequestTab={scratchRequestTab}
                activeResponseTab={scratchResponseTab}
                mainSplitRatio={scratchMainSplitRatio}
                isRunning={scratchRunMutation.isPending}
                isDirty
                onRequestChange={handleUpdateScratchRequest}
                onRun={() => scratchRunMutation.mutate()}
                onSaveToWorkspace={handleSaveScratchToWorkspace}
                onNewScratch={() => handleCreateScratch()}
                onRequestTabChange={setScratchRequestTab}
                onResponseTabChange={setScratchResponseTab}
                onSelectExample={name =>
                  handleSetScratchResponseState(session => ({
                    ...session,
                    selectedExampleName: name
                  }))
                }
                onSaveExample={() => handleSaveResponseAsExample(false)}
                onReplaceExample={() => handleSaveResponseAsExample(true)}
                onCopyBody={() => copyToClipboard(currentScratch.response?.bodyText || '', 'Body copied')}
                onCopyCurl={() => copyToClipboard(currentScratchPreview ? curlForPreview(currentScratchPreview) : '', 'cURL copied')}
                onRefreshSession={handleRefreshSession}
                onClearSession={handleClearSessionCookies}
                onCreateCaseFromResponse={handleCreateCaseFromCurrentResponse}
                onCreateCheck={() =>
                  notifications.show({ color: 'blue', message: 'Save the Scratch request to the workspace before creating reusable checks.' })
                }
                onSaveAuthProfile={handleSaveAuthProfile}
                onExtractValue={handleExtractResponseValue}
                onMainSplitRatioChange={setScratchMainSplitRatio}
              />
            ) : activeView === 'history' ? (
              <HistoryPanel
                entries={historyEntries}
                selectedEntryId={selectedHistoryId}
                onSelectEntry={setSelectedHistoryId}
                onReplay={handleReplayHistory}
                onOpenInScratch={handleOpenHistoryInScratch}
                onDuplicateAsCase={handleDuplicateHistoryAsCase}
                onPinAsBaseline={handlePinHistoryAsBaseline}
                onGenerateDiffChecks={handleGenerateHistoryDiffChecks}
                onClear={handleClearHistory}
              />
            ) : activeView === 'sessions' ? (
              <SessionCenterPanel
                workspace={store.workspace}
                activeEnvironmentName={store.activeEnvironmentName}
                runtimeVariables={runtimeVariables}
                sessionSnapshot={sessionSnapshot}
                hostSnapshots={hostSessionSnapshots}
                targetUrl={sessionTargetUrl}
                onRefresh={handleRefreshSession}
                onClearSession={handleClearSessionCookies}
                onClearRuntimeVars={() => setRuntimeVariables({})}
              />
            ) : activeView === 'collections' ? (
              <CollectionRunnerPanel
                workspace={store.workspace}
                selectedCollectionId={selectedCollectionId}
                draftCollection={draftCollection}
                collectionDataText={collectionDataText}
                reports={collectionReports}
                selectedReportId={selectedCollectionReportId}
                selectedReportStepKey={selectedCollectionStepKey}
                onSelectCollection={handleSelectCollection}
                onCollectionChange={collection => setDraftCollection(collection)}
                onCollectionDataChange={setCollectionDataText}
                onCreateCollection={handleCreateCollection}
                onDeleteCollection={handleDeleteCollection}
                onSaveCollection={handleSaveCollection}
                onRunCollection={handleRunCollection}
                onRerunFailed={handleRerunFailedCollectionSteps}
                onClearReports={handleClearCollectionReports}
                onSelectReport={setSelectedCollectionReportId}
                onSelectReportStep={setSelectedCollectionStepKey}
                onExtractValue={handleExtractCollectionReportValue}
              />
            ) : activeView === 'environments' ? (
              <EnvironmentCenterPanel
                workspace={store.workspace}
                draftProject={store.draftProject}
                activeEnvironmentName={store.activeEnvironmentName}
                selectedEnvironment={selectedEnvironment}
                onEnvironmentChange={name => store.setActiveEnvironment(name)}
                onProjectChange={project => store.updateProject(project)}
                onEnvironmentUpdate={(name, updater) => store.updateEnvironment(name, updater)}
                onAddEnvironment={handleAddEnvironment}
                onSave={() => saveMutation.mutate()}
              />
            ) : (
              <WorkspaceMainPanel
                workspace={store.workspace}
                selectedNode={store.selectedNode}
                openTabs={store.openTabs}
                onTabSelect={store.selectNode}
                onTabClose={store.closeTab}
                categoryRequests={categoryRequests}
                draftProject={store.draftProject}
                request={store.draftRequest}
                response={store.response}
                requestError={store.requestError}
                requestInsight={currentRequestInsight}
                requestPreview={currentRequestPreview}
                checkResults={store.checkResults}
                scriptLogs={store.scriptLogs}
                cases={store.draftCases}
                activeEnvironmentName={store.activeEnvironmentName}
                selectedEnvironment={selectedEnvironment}
                isRunning={runMutation.isPending}
                isDirty={store.isDirty}
                activeRequestTab={uiState.activeRequestTab}
                activeResponseTab={uiState.activeResponseTab}
                selectedExampleName={selectedExampleName}
                sessionSnapshot={sessionSnapshot}
                mainSplitRatio={uiState.mainSplitRatio}
                gitStatus={gitInfo}
                onProjectChange={project => store.updateProject(project)}
                onDeleteProject={handleDeleteProject}
                onEnvironmentChange={name => store.setActiveEnvironment(name)}
                onEnvironmentUpdate={(name, updater) => store.updateEnvironment(name, updater)}
                onRequestChange={request => store.updateRequest(request)}
                onCasesChange={cases => store.updateCaseList(cases)}
                onCaseSelect={id => id && handleSelectCase(requestId!, id)}
                onAddCase={handleAddCase}
                onRun={() => runMutation.mutate()}
                onSave={() => saveMutation.mutate()}
                onSelectRequest={handleSelectRequest}
                onOpenImport={() => setImportOpened(true)}
                onCreateInterface={handleCreateInterface}
                onCopyToScratch={handleCopyCurrentRequestToScratch}
                onRequestTabChange={tab => updateUiState(current => ({ ...current, activeRequestTab: tab }))}
                onResponseTabChange={tab => updateUiState(current => ({ ...current, activeResponseTab: tab }))}
                onSelectExample={setSelectedExampleName}
                onCopyBody={() => copyToClipboard(store.response?.bodyText || '', 'Body copied')}
                onCopyCurl={() => copyToClipboard(currentRequestPreview ? curlForPreview(currentRequestPreview) : '', 'cURL copied')}
                onSaveExample={() => handleSaveResponseAsExample(false)}
                onReplaceExample={() => handleSaveResponseAsExample(true)}
                onRefreshSession={handleRefreshSession}
                onClearSession={handleClearSessionCookies}
                onCreateCheck={handleCreateCheckFromResponse}
                onCreateCaseFromResponse={handleCreateCaseFromCurrentResponse}
                onSaveAuthProfile={handleSaveAuthProfile}
                onExtractValue={handleExtractResponseValue}
                onRefreshGitStatus={handleRefreshGitStatus}
                onCopySuggestedCommitMessage={() =>
                  copyToClipboard(suggestedCommitMessage(gitInfo), 'Suggested commit message copied')
                }
                onGitPull={handleGitPull}
                onGitPush={handleGitPush}
                onOpenTerminal={() =>
                  store.workspace &&
                  openTerminal(store.workspace.root).catch(error => {
                    notifications.show({ color: 'red', message: `Failed to open terminal: ${(error as Error).message}` });
                  })
                }
                onMainSplitRatioChange={ratio =>
                  updateUiState(current => ({
                    ...current,
                    mainSplitRatio: ratio
                  }))
                }
              />
            )}
          </main>
        </div>
      </div>

      <Drawer opened={importOpened} onClose={() => setImportOpened(false)} title="Import API Specification" position="right" size="lg">
        <ImportPanel
          workspace={store.workspace}
          importUrl={importUrl}
          importStrategy={importStrategy}
          importAuth={store.importAuth}
          importPreviewInfo={importPreviewInfo}
          warnings={store.importPreview?.warnings || []}
          onImportUrlChange={setImportUrl}
          onImportStrategyChange={setImportStrategy}
          onImportAuthChange={auth => store.setImportAuth(auth)}
          onChooseFile={() => importFileMutation.mutate()}
          onPreviewUrl={() => importUrlMutation.mutate()}
          onConfirmImport={() => applyImportMutation.mutate()}
          onOpenScratchFromImport={handleOpenImportPreviewInScratch}
        />
      </Drawer>
    </>
  );
}

async function copyToClipboard(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    notifications.show({ color: 'teal', message: successMessage });
  } catch (_err) {
    notifications.show({ color: 'red', message: 'Failed to copy to clipboard' });
  }
}
