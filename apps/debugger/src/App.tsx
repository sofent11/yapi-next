import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { ActionIcon, Badge, Drawer, Select, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { IconRefresh } from '@tabler/icons-react';
import { resolveRequest } from '@yapi-debugger/core';
import { createEmptyCase, type CollectionDocument, type CollectionRunReport, type RunHistoryEntry, slugify, type WorkspaceIndex } from '@yapi-debugger/schema';
import {
  chooseDirectory,
  chooseImportFile,
  deleteEntry,
  listenMenuActions,
  syncMenuState,
  unwatchWorkspace,
  watchWorkspace
} from './lib/desktop';
import {
  createCaseForRequest,
  createRequestInWorkspace,
  createWorkspace,
  buildImportPreviewSummary,
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
  runResolvedRequest,
  saveCollectionRecord,
  saveRunHistory,
  saveEnvironment,
  saveProject,
  saveRequestRecord
} from './lib/workspace';
import { AppRail, type AppRailView } from './components/panels/AppRail';
import { CollectionRunnerPanel } from './components/panels/CollectionRunnerPanel';
import { EnvironmentCenterPanel } from './components/panels/EnvironmentCenterPanel';
import { HistoryPanel } from './components/panels/HistoryPanel';
import { ImportPanel } from './components/panels/ImportPanel';
import { InterfaceTreePanel } from './components/panels/InterfaceTreePanel';
import { WelcomePanel } from './components/panels/WelcomePanel';
import { WorkspaceMainPanel } from './components/panels/WorkspaceMainPanel';
import { Resizer } from './components/primitives/Resizer';
import {
  defaultWorkspaceUiState,
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
      lastSelectedNode: parsed.lastSelectedNode || { kind: 'project' }
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

  const categoryRequests = useMemo(() => {
    if (!store.workspace || !categoryPath) return [];
    return store.workspace.requests.filter(record => {
      const value = record.folderSegments.join('/');
      return isSameOrChildPath(value, categoryPath);
    });
  }, [store.workspace, categoryPath]);

  const currentRequestPreview = useMemo(() => {
    if (!store.workspace || !requestId || !store.draftRequest) return null;
    try {
      return resolveRequest(
        store.workspace.project,
        store.draftRequest,
        store.draftCases.find(item => item.id === caseId),
        selectedEnvironment || undefined
      );
    } catch (_error) {
      return null;
    }
  }, [store.workspace, store.draftRequest, store.draftCases, caseId, selectedEnvironment, requestId]);

  const importPreviewInfo = useMemo(() => {
    if (!store.workspace || !store.importPreview) return null;
    return buildImportPreviewSummary(store.workspace, store.importPreview);
  }, [store.workspace, store.importPreview]);

  function applyWorkspaceState(workspace: WorkspaceIndex) {
    const nextUi = loadWorkspaceUiState(workspace.root);
    setUiState(nextUi);
    setSelectedExampleName(null);
    setSelectedCollectionId(workspace.collections[0]?.document.id || null);
    setDraftCollection(workspace.collections[0]?.document || null);
    setCollectionDataText(workspace.collections[0]?.dataText || '');
    store.setWorkspace(workspace);
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
      notifications.show({ color: 'teal', message: 'Changes saved' });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to save changes: ${(error as Error).message}` });
    }
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace || !requestId) return;
      return runResolvedRequest(store.workspace, requestId, caseId || undefined);
    },
    onSuccess: async result => {
      if (!result || !store.workspace || !requestId) return;
      store.setResponse(result.response, result.checkResults, result.scriptLogs);
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
      return createCaseForRequest(store.workspace.root, store.workspace, targetReqId);
    },
    onSuccess: ({ requestId: reqId, caseId: nextCaseId }) => {
      reloadWorkspace({ kind: 'case', requestId: reqId, caseId: nextCaseId });
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
      lastSelectedNode: store.selectedNode
    });
  }, [uiState, store.selectedNode, store.workspace?.root]);

  useEffect(() => {
    if (!store.workspace?.root) {
      setHistoryEntries([]);
      setSelectedHistoryId(null);
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

  async function handleAddCase(targetRequestId?: string) {
    const nextRequestId = targetRequestId || requestId;
    if (!nextRequestId) {
      notifications.show({ color: 'red', message: 'Please select a request first' });
      return;
    }
    addCaseMutation.mutate(nextRequestId);
  }

  async function handleRenameCategory(path: string) {
    if (!store.workspace) return;
    const nextPath = window.prompt('Enter new category path', path)?.trim();
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

  async function handleRenameRequest(targetRequestId: string) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === targetRequestId);
    if (!record) return;
    const nextName = window.prompt('Enter new request name', record.request.name)?.trim();
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

  async function handleRenameCase(targetRequestId: string, targetCaseId: string) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === targetRequestId);
    const caseItem = record?.cases.find(item => item.id === targetCaseId);
    if (!record || !caseItem) return;
    const nextName = window.prompt('Enter new case name', caseItem.name)?.trim();
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
    setActiveView('workspace');
    store.selectNode({ kind: 'request', requestId: entry.requestId });
    
    // Logic to apply history values to current draft
    const record = findRecord(store.workspace, entry.requestId);
    if (record) {
      store.updateRequest(record.request);
      if (entry.caseId) {
        const matchedCase = record.cases.find(c => c.id === entry.caseId);
        if (matchedCase) {
          store.updateCaseList(record.cases);
          store.selectNode({ kind: 'case', requestId: entry.requestId, caseId: entry.caseId });
        }
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

  async function handleClearHistory() {
    if (!store.workspace) return;
    await clearRunHistory(store.workspace.root);
    setHistoryEntries([]);
    setSelectedHistoryId(null);
    notifications.show({ color: 'teal', message: 'Run history cleared' });
  }

  async function handleSaveResponseAsExample(replaceExisting = false) {
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
              <Badge variant="dot" color={runMutation.isPending ? 'blue' : 'gray'} size="sm">
                {runMutation.isPending ? 'Running' : 'Idle'}
              </Badge>
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

            {activeView === 'history' ? (
              <HistoryPanel
                entries={historyEntries}
                selectedEntryId={selectedHistoryId}
                onSelectEntry={setSelectedHistoryId}
                onReplay={handleReplayHistory}
                onDuplicateAsCase={handleDuplicateHistoryAsCase}
                onClear={handleClearHistory}
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
                categoryRequests={categoryRequests}
                draftProject={store.draftProject}
                request={store.draftRequest}
                response={store.response}
                requestError={store.requestError}
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
                mainSplitRatio={uiState.mainSplitRatio}
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
                onRequestTabChange={tab => updateUiState(current => ({ ...current, activeRequestTab: tab }))}
                onResponseTabChange={tab => updateUiState(current => ({ ...current, activeResponseTab: tab }))}
                onSelectExample={setSelectedExampleName}
                onCopyBody={() => copyToClipboard(store.response?.bodyText || '', 'Body copied')}
                onCopyCurl={() => copyToClipboard(currentRequestPreview ? curlForPreview(currentRequestPreview) : '', 'cURL copied')}
                onSaveExample={() => handleSaveResponseAsExample(false)}
                onReplaceExample={() => handleSaveResponseAsExample(true)}
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
